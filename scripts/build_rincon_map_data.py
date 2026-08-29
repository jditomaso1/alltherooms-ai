#!/usr/bin/env python3
"""Build the compact public dataset used by the Rincón Competitive Map."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DETAILS_DIR = ROOT / "data" / "public" / "rincon-details"
DIRECT_WEBSITES_PATH = ROOT / "data" / "public" / "rincon-direct-websites.json"
OUTPUT_PATH = ROOT / "data" / "public" / "rincon-map-listings.json"


def first_plausible(text: str, pattern: str, maximum: float) -> float:
    for match in re.finditer(pattern, text, flags=re.IGNORECASE):
        value = float(match.group(1))
        if 0 < value <= maximum:
            return value
    return 0


def caption_max(images: list[dict], pattern: str, maximum: float) -> float:
    values = []
    for image in images:
        match = re.search(pattern, str(image.get("caption") or ""), flags=re.IGNORECASE)
        if match:
            value = float(match.group(1))
            if value <= maximum:
                values.append(value)
    return max(values, default=0)


def stay_nights(row: dict) -> int:
    try:
        start = date.fromisoformat(str(row.get("checkIn")))
        end = date.fromisoformat(str(row.get("checkOut")))
        return max(1, (end - start).days)
    except (TypeError, ValueError):
        return 1


def property_group(value: str) -> str:
    normalized = value.lower()
    if "private room" in normalized or "shared room" in normalized:
        return "room"
    if any(word in normalized for word in ("apartment", "rental unit", "condo", "loft")):
        return "apartment"
    if any(word in normalized for word in ("home", "house", "villa", "townhouse", "cottage", "bungalow")):
        return "home"
    return "other"


def amenity_features(amenities: list[str]) -> list[str]:
    text = " | ".join(amenities).lower()
    patterns = {
        "pool": r"\bpool\b",
        "hot-tub": r"hot tub|jacuzzi|spa",
        "beach": r"beach access|beachfront|waterfront|oceanfront",
        "wifi": r"\bwifi\b|wi-fi",
        "parking": r"\bparking\b|garage",
        "pets": r"pets allowed|pet-friendly",
        "air-conditioning": r"air conditioning|\ba/c\b",
    }
    return [key for key, pattern in patterns.items() if re.search(pattern, text)]


def build_record(row: dict, direct_websites: dict[str, str]) -> dict | None:
    try:
        latitude = float(row["latitude"])
        longitude = float(row["longitude"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None

    description = str(row.get("description") or "")
    images = row.get("images") or []
    bedrooms = first_plausible(description, r"\b(\d+)\s*(?:-| )\s*bedrooms?\b", 30) or caption_max(images, r"\bbedroom\s+(\d+)\b", 30)
    bathrooms = first_plausible(description, r"\b(\d+(?:\.\d+)?)\s*(?:-| )\s*(?:full\s+)?bathrooms?\b", 30) or caption_max(images, r"\b(?:full\s+)?bathroom\s+(\d+)\b", 30)
    nights = stay_nights(row)
    total_price = round(float(row.get("quotedPrice") or 0))
    property_type = str(row.get("propertyType") or row.get("roomType") or "Stay")
    listing_id = str(row.get("id") or "")

    return {
        "id": listing_id,
        "title": str(row.get("title") or "Rincón stay"),
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "nightlyPrice": round(total_price / nights),
        "totalPrice": total_price,
        "currency": str(row.get("currency") or "USD"),
        "capacity": int(row.get("capacity") or 0),
        "rating": float(row.get("rating") or 0),
        "reviews": int(row.get("reviews") or 0),
        "propertyType": property_type,
        "propertyGroup": property_group(property_type),
        "bedrooms": int(bedrooms) if bedrooms else 0,
        "bathrooms": bathrooms,
        "features": amenity_features(row.get("amenities") or []),
        "hasDirectWebsite": listing_id in direct_websites,
        "image": str(row.get("image") or (images[0].get("url") if images else "")),
    }


def main() -> None:
    direct_websites = json.loads(DIRECT_WEBSITES_PATH.read_text(encoding="utf-8"))
    records = []
    for path in sorted(DETAILS_DIR.glob("*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            record = build_record(row, direct_websites)
            if record:
                records.append(record)

    records.sort(key=lambda row: (row["title"].casefold(), row["id"]))
    OUTPUT_PATH.write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(records):,} records to {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
