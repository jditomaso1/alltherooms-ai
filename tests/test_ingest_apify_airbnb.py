import json
import tempfile
import unittest
from pathlib import Path

from scripts.ingest_apify_airbnb import run


class IngestionTest(unittest.TestCase):
    def test_normalizes_flattened_export(self):
        fixture = Path(__file__).parent / "fixtures" / "apify_airbnb_minimal.csv"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            report = run(fixture, output)
            self.assertEqual(report["valid_listings"], 1)
            self.assertEqual(report["errors"], [])
            snapshot = json.loads((output / "listing_snapshots.jsonl").read_text())
            self.assertEqual(snapshot["quoted_price"], "1250.00")
            self.assertEqual(snapshot["currency"], "USD")
            self.assertEqual(report["images"], 1)
            self.assertEqual(report["listing_amenities"], 1)


if __name__ == "__main__":
    unittest.main()

