"""Read-only readiness of all eligible CRM events using the exporter checks.

XML is validated in memory, never saved, signed or dispatched.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
def report(cur, org_id: int) -> dict:
    from backend.nbki_event23_xml import event_readiness_report
    return event_readiness_report(cur, org_id)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--org-id', type=int, default=2)
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            print(json.dumps(report(cur, args.org_id), ensure_ascii=False, indent=2))
            conn.rollback()


if __name__ == '__main__':
    main()
