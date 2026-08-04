CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  region text,
  country_code char(2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  source_filename text,
  market_id uuid REFERENCES markets(id),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_listing_id text NOT NULL,
  canonical_url text NOT NULL,
  title text,
  property_type text,
  room_type text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_label text,
  market_id uuid REFERENCES markets(id),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_listing_id),
  CHECK (latitude BETWEEN -90 AND 90),
  CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS listing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  ingestion_run_id uuid NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  check_in date,
  check_out date,
  currency char(3),
  quoted_price numeric(12,2),
  original_price numeric(12,2),
  discounted_price numeric(12,2),
  available boolean,
  person_capacity integer,
  guest_rating numeric(3,2),
  review_count integer,
  accuracy_rating numeric(3,2),
  checkin_rating numeric(3,2),
  cleanliness_rating numeric(3,2),
  communication_rating numeric(3,2),
  location_rating numeric(3,2),
  value_rating numeric(3,2),
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (listing_id, ingestion_run_id)
);

CREATE TABLE IF NOT EXISTS listing_images (
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  position integer NOT NULL,
  image_url text NOT NULL,
  caption text,
  orientation text,
  PRIMARY KEY (listing_id, position)
);

CREATE TABLE IF NOT EXISTS amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL UNIQUE,
  display_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_amenities (
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  amenity_id uuid NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  available boolean,
  group_name text,
  subtitle text,
  PRIMARY KEY (listing_id, amenity_id)
);

CREATE INDEX IF NOT EXISTS listings_market_idx ON listings (market_id);
CREATE INDEX IF NOT EXISTS snapshots_observed_idx ON listing_snapshots (observed_at DESC);
CREATE INDEX IF NOT EXISTS snapshots_price_idx ON listing_snapshots (quoted_price);

