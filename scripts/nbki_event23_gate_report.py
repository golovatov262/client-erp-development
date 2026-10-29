"""Read-only event 2.3 generation gate for active, UID-matched CRM loans.

This reports evidence and blockers; it never creates an outgoing XML. A valid
XSD reference example is not a substitute for verified CRM event amounts.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.nbki_payment_candidates import list_payment_candidates


def gate_row(candidate: dict) -> dict:
    event = candidate['event23_readiness']
    interest = candidate['interest_candidate']
    debt = candidate['debt_preview']
    blockers = list(event['blockers'])
    blockers.extend(f'Проценты: {item}' for item in interest['issues'])
    blockers.extend(f'Задолженность: {item}' for item in debt['issues'])
    # The queue does not authorize XML even if all diagnostic subchecks happen
    # to pass; event code, conditional blocks and accounting still need approval.
    can_generate = (candidate['xml_ready'] is True and
                    event['xml_ready'] is True and not blockers)
    return {
        'loan_id': candidate['loan_id'],
        'contract_no': candidate['contract_no'],
        'payment_id': candidate['payment_id'],
        'event_date': candidate['payment_date'],
        'event_time_msk': candidate['event_occurred_at_msk'],
        'uid_matched': bool(candidate['uid']),
        'payment_amount_crm': candidate['amount'],
        'principal_after_crm': candidate['accounting_snapshot']['principal_after'],
        'principal_status': candidate['accounting_snapshot']['status'],
        'interest_status': interest['status'],
        'interest_candidate': interest['remaining_interest_candidate'],
        'debt_status': debt['status'],
        'complete_debt_candidate': debt['total_candidate'],
        'posting_snapshot': bool(candidate['posting_snapshot_sha256']),
        'blockers': blockers,
        'can_generate_xml': can_generate,
    }


def report(cur, org_id: int) -> dict:
    candidates = list_payment_candidates(cur, org_id)
    rows = [gate_row(candidate) for candidate in candidates['rows']]
    return {'org_id': org_id, 'candidate_count': len(rows),
            'can_generate_count': sum(row['can_generate_xml'] for row in rows),
            'rows': rows,
            'note': 'CRM-only diagnostic; no XML, signature or dispatch produced.'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--org-id', type=int, default=2)
    args = parser.parse_args()
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            print(json.dumps(report(cur, args.org_id), ensure_ascii=False, indent=2))
            conn.rollback()


if __name__ == '__main__':
    main()
