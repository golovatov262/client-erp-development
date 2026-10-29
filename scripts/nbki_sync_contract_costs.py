"""Import source-attributed PSK candidates from the 1C event register."""

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from nbki_contract_costs import sync_cost_facts  # noqa: E402


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--org-id', type=int, default=2)
    cli.add_argument('--apply', action='store_true', help='Insert candidates after review')
    args = cli.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            result = sync_cost_facts(cur, args.org_id, args.apply)
        if not args.apply:
            conn.rollback()
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))


if __name__ == '__main__':
    main()
