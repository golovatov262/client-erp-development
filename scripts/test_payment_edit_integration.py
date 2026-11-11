"""Exercise payment edits inside a rolled-back transaction (no persistent edits)."""
import os
from datetime import date
from decimal import Decimal
import psycopg2
from backend.api.index import handle_loans


class NoCommit:
    def commit(self):
        pass


def main():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM loans WHERE id=16 FOR UPDATE')
            cur.execute('SELECT payment_date,amount,principal_part,interest_part,penalty_part FROM loan_payments WHERE id=2730 FOR UPDATE')
            old = cur.fetchone()
            cur.execute('SELECT jsonb_agg(a ORDER BY id) FROM loan_payment_allocations a WHERE payment_id=2730')
            allocations_before = cur.fetchone()[0]
            cur.execute('SELECT evidence_sha256 FROM nbki_payment_posting_snapshots WHERE payment_id=2730')
            sha_before = cur.fetchone()[0]
            body = dict(action='update_payment', payment_id=2730, payment_date=str(old[0]),
                        amount=str(old[1]), principal_part=str(old[2]), interest_part=str(old[3]),
                        penalty_part=str(old[4]), manual_distribution=True)
            cur.execute('SAVEPOINT payment_edit_test')
            result = handle_loans('POST', {}, {**body, 'payment_date': '2026-11-03'}, cur, NoCommit())
            assert 'error' in result and 'время' in result['error'], result
            result = handle_loans('POST', {}, {**body, 'event_time_msk': '25:00'}, cur, NoCommit())
            assert 'error' in result, result
            result = handle_loans('POST', {}, {**body, 'event_time_msk': '12:00:15'}, cur, NoCommit())
            assert result == {'success': True}, result
            cur.execute("SELECT p.nbki_event_occurred_at AT TIME ZONE 'Europe/Moscow',p.nbki_event_time_basis,e.event_occurred_at=p.nbki_event_occurred_at FROM loan_payments p JOIN nbki_crm_events e ON e.source_type='loan_payment' AND e.source_id=p.id WHERE p.id=2730")
            at,basis,matched=cur.fetchone()
            assert at.isoformat() == '2026-11-02T12:00:15' and basis == 'operator_entered' and matched
            cur.execute('SELECT jsonb_agg(a ORDER BY id) FROM loan_payment_allocations a WHERE payment_id=2730')
            assert cur.fetchone()[0] == allocations_before, 'Time-only edit changed allocations'
            cur.execute('SELECT evidence_sha256 FROM nbki_payment_posting_snapshots WHERE payment_id=2730')
            assert cur.fetchone()[0] == sha_before, 'Time-only edit rewrote evidence'
            result = handle_loans('POST', {}, {**body, 'event_time_msk': '12:00:15',
                'amount': str(old[1]+Decimal('1')), 'penalty_part': str(old[4]+Decimal('1'))}, cur, NoCommit())
            assert result == {'success': True}, result
            cur.execute("SELECT SUM(amount),SUM(amount) FILTER(WHERE component='penalty') FROM loan_payment_allocations WHERE payment_id=2730")
            total,penalty=cur.fetchone()
            assert total == old[1]+1 and penalty == old[4]+1, (total,penalty)
            # Re-edit must not subtract a penalty from schedule paid_amount.
            cur.execute('ROLLBACK TO SAVEPOINT payment_edit_test')
            print('OK: timestamp synchronization, invalid inputs, time-only preservation and penalty allocation; rolled back')
    finally:
        conn.rollback()
        conn.close()


if __name__ == '__main__':
    main()
