# ATR.AI data handling

Raw Apify exports do **not** belong in this public repository. Keep them in a
private object store (or locally during development), then load their normalized
contents into PostgreSQL.

The importer accepts the original flattened Airbnb CSV and produces validated
JSON Lines files for the database tables defined in `database/migrations`.

```sh
python3 scripts/ingest_apify_airbnb.py \
  --input /path/to/dataset_airbnb-scraper.csv \
  --output data/normalized/rincon-2026-08-04
```

The `data/normalized` directory is ignored by Git. Review `report.json` before
loading the files into the database.

