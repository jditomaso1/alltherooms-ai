# Apify Airbnb ingestion

## Record grain

Each input row is one Airbnb listing observed during one scrape. Stable listing
attributes are stored separately from time-varying price, availability, and
rating snapshots. Images and amenities are child records rather than hundreds
of repeated columns.

## Flow

1. Apify writes the original export to private object storage.
2. The importer validates required fields, IDs, timestamps, coordinates, and
   typed values.
3. Normalized JSON Lines files are staged for loading.
4. PostgreSQL upserts listings by `(provider, provider_listing_id)` and inserts
   one snapshot per listing and ingestion run.
5. The application queries PostgreSQL; it never searches the raw CSV.

## Current Rincón sample

The 2026-08-04 test export contains 25 unique listings and 1,426 flattened
columns. It is useful for pipeline development, not yet a statistically complete
view of the Rincón market. Prices reflect the search dates embedded in each
Airbnb URL and must not be presented as universal nightly rates.

## Production setup

Use a Vercel Marketplace PostgreSQL integration (Neon is the recommended first
choice). Apply `database/migrations/001_apify_airbnb_ingestion.sql`, store the
connection string only as a Vercel environment variable, and keep raw exports in
private storage. Never commit credentials or source exports.

