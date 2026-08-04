#!/usr/bin/env python3
"""Validate and normalize a flattened Apify Airbnb CSV export."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import parse_qs, urlparse


REQUIRED = (
    "id", "url", "title", "timestamp", "coordinates/latitude",
    "coordinates/longitude", "propertyType", "roomType",
)


def money(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", value)
    try:
        return str(Decimal(cleaned).quantize(Decimal("0.01"))) if cleaned else None
    except InvalidOperation:
        return None


def number(value: str | None, cast=float):
    if value in (None, ""):
        return None
    try:
        return cast(value)
    except (TypeError, ValueError):
        return None


def boolean(value: str | None) -> bool | None:
    if not value:
        return None
    return value.strip().lower() in {"true", "1", "yes"}


def iso_timestamp(value: str) -> str:
    datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def canonical_url(value: str) -> str:
    parsed = urlparse(value)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def search_context(value: str) -> tuple[str | None, str | None, str]:
    query = parse_qs(urlparse(value).query)
    return (
        query.get("check_in", [None])[0],
        query.get("check_out", [None])[0],
        query.get("currency", ["USD"])[0][:3].upper(),
    )


def stable_key(provider_id: str) -> str:
    return hashlib.sha256(f"airbnb:{provider_id}".encode()).hexdigest()[:32]


def extract_images(row: dict[str, str], listing_key: str) -> list[dict]:
    pattern = re.compile(r"^images/(\d+)/imageUrl$")
    images = []
    for field, value in row.items():
        match = pattern.match(field)
        if not match or not value:
            continue
        position = int(match.group(1))
        images.append({
            "listing_key": listing_key,
            "position": position,
            "image_url": value,
            "caption": row.get(f"images/{position}/caption") or None,
            "orientation": row.get(f"images/{position}/orientation") or None,
        })
    return sorted(images, key=lambda item: item["position"])


def extract_amenities(row: dict[str, str], listing_key: str) -> list[dict]:
    pattern = re.compile(r"^amenities/(\d+)/values/(\d+)/title$")
    found: dict[str, dict] = {}
    for field, title in row.items():
        match = pattern.match(field)
        if not match or not title:
            continue
        group, item = match.groups()
        normalized = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        found.setdefault(normalized, {
            "listing_key": listing_key,
            "normalized_name": normalized,
            "display_name": title,
            "available": boolean(row.get(f"amenities/{group}/values/{item}/available")),
            "group_name": row.get(f"amenities/{group}/title") or None,
            "subtitle": row.get(f"amenities/{group}/values/{item}/subtitle") or None,
        })
    return list(found.values())


def transform(row: dict[str, str]) -> tuple[dict, dict, list[dict], list[dict]]:
    provider_id = row["id"].strip()
    listing_key = stable_key(provider_id)
    observed_at = iso_timestamp(row["timestamp"])
    latitude = number(row.get("coordinates/latitude"))
    longitude = number(row.get("coordinates/longitude"))
    if latitude is None or not -90 <= latitude <= 90:
        raise ValueError(f"invalid latitude for listing {provider_id}")
    if longitude is None or not -180 <= longitude <= 180:
        raise ValueError(f"invalid longitude for listing {provider_id}")
    check_in, check_out, currency = search_context(row["url"])
    listing = {
        "listing_key": listing_key,
        "provider": "airbnb",
        "provider_listing_id": provider_id,
        "canonical_url": canonical_url(row["url"]),
        "title": row.get("title") or None,
        "property_type": row.get("propertyType") or None,
        "room_type": row.get("roomType") or None,
        "latitude": latitude,
        "longitude": longitude,
        "location_label": row.get("locationSubtitle") or None,
        "first_seen_at": observed_at,
        "last_seen_at": observed_at,
    }
    snapshot = {
        "listing_key": listing_key,
        "observed_at": observed_at,
        "check_in": check_in,
        "check_out": check_out,
        "currency": currency,
        "quoted_price": money(row.get("price/price")),
        "original_price": money(row.get("price/originalPrice")),
        "discounted_price": money(row.get("price/discountedPrice")),
        "available": boolean(row.get("isAvailable")),
        "person_capacity": number(row.get("personCapacity"), int),
        "guest_rating": number(row.get("rating/guestSatisfaction")),
        "review_count": number(row.get("rating/reviewsCount"), int),
        "accuracy_rating": number(row.get("rating/accuracy")),
        "checkin_rating": number(row.get("rating/checking")),
        "cleanliness_rating": number(row.get("rating/cleanliness")),
        "communication_rating": number(row.get("rating/communication")),
        "location_rating": number(row.get("rating/location")),
        "value_rating": number(row.get("rating/value")),
    }
    return listing, snapshot, extract_images(row, listing_key), extract_amenities(row, listing_key)


def write_jsonl(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


def run(input_path: Path, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    with input_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [field for field in REQUIRED if field not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"missing required columns: {', '.join(missing)}")
        rows = list(reader)

    listings, snapshots, images, amenities = [], [], [], []
    errors = []
    seen_ids = Counter(row.get("id") for row in rows)
    for line, row in enumerate(rows, start=2):
        try:
            listing, snapshot, row_images, row_amenities = transform(row)
            listings.append(listing)
            snapshots.append(snapshot)
            images.extend(row_images)
            amenities.extend(row_amenities)
        except (KeyError, ValueError) as exc:
            errors.append({"line": line, "error": str(exc)})

    write_jsonl(output_dir / "listings.jsonl", listings)
    write_jsonl(output_dir / "listing_snapshots.jsonl", snapshots)
    write_jsonl(output_dir / "listing_images.jsonl", images)
    write_jsonl(output_dir / "listing_amenities.jsonl", amenities)
    prices = [Decimal(item["quoted_price"]) for item in snapshots if item["quoted_price"]]
    report = {
        "source_file": input_path.name,
        "source_columns": len(rows[0]) if rows else 0,
        "source_rows": len(rows),
        "valid_listings": len(listings),
        "unique_provider_ids": len(seen_ids),
        "duplicate_provider_ids": sorted(key for key, count in seen_ids.items() if key and count > 1),
        "images": len(images),
        "listing_amenities": len(amenities),
        "quoted_price_min": str(min(prices)) if prices else None,
        "quoted_price_max": str(max(prices)) if prices else None,
        "errors": errors,
    }
    (output_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    report = run(args.input, args.output)
    print(json.dumps(report, indent=2))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

