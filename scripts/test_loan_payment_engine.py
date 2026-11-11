import os
import sys
from datetime import date
from decimal import Decimal

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from loan_payment_engine import post_loan_payment


def make_loan(cur, suffix):
    cur.execute("SELECT member_id,org_id FROM loans WHERE org_id IS NOT NULL ORDER BY id LIMIT 1")
    member_id, org_id = cur.fetchone()
    cur.execute("""INSERT INTO loans(contract_no,member_id,amount,rate,term_months,schedule_type,
        start_date,end_date,monthly_payment,balance,status)
        VALUES(%s,%s,300,12,3,'annuity','2026-08-31','2026-11-30',110,300,'active') RETURNING id""",
        ('ENGINE-TEST-' + suffix, member_id))
    loan_id = cur.fetchone()[0]
    cur.execute("UPDATE loans SET org_id=%s WHERE id=%s", (org_id, loan_id))
    for no, due, after in ((1, '2026-09-30', 200), (2, '2026-10-31', 100), (3, '2026-11-30', 0)):
        cur.execute("""INSERT INTO loan_schedule(loan_id,payment_no,payment_date,payment_amount,
            principal_amount,interest_amount,balance_after,status,paid_amount,penalty_amount)
            VALUES(%s,%s,%s,110,100,10,%s,'pending',0,7)""", (loan_id, no, due, after))
    return loan_id


def make_long_loan(cur, suffix):
    cur.execute("SELECT member_id,org_id FROM loans WHERE org_id IS NOT NULL ORDER BY id LIMIT 1")
    member_id, org_id = cur.fetchone()
    cur.execute("""INSERT INTO loans(contract_no,member_id,amount,rate,term_months,schedule_type,
        start_date,end_date,monthly_payment,balance,status)
        VALUES(%s,%s,600,12,6,'annuity','2026-08-31','2027-02-28',110,600,'active') RETURNING id""",
        ('ENGINE-TEST-' + suffix, member_id))
    loan_id = cur.fetchone()[0]
    cur.execute("UPDATE loans SET org_id=%s WHERE id=%s", (org_id, loan_id))
    dues = ('2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28')
    for no, due in enumerate(dues, 1):
        cur.execute("""INSERT INTO loan_schedule(loan_id,payment_no,payment_date,payment_amount,
            principal_amount,interest_amount,balance_after,status,paid_amount,penalty_amount)
            VALUES(%s,%s,%s,110,100,10,%s,'pending',0,0)""",
            (loan_id, no, due, 600 - no * 100))
    return loan_id


conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

# При просрочке текущий период не затрагивается: проценты, затем просроченный ОД.
loan = make_loan(cur, 'UNDER')
r = post_loan_payment(cur, loan, 15, date(2026, 10, 7), source='bank', source_ref='test-under')
assert r['interest_part'] == 10.0 and r['principal_part'] == 5.0 and r['new_balance'] == 295.0, r

# Переплата: проценты -> плановый ОД -> досрочный ОД; даты и число строк сохраняются.
loan = make_loan(cur, 'OVER')
cur.execute("SELECT array_agg(payment_date ORDER BY payment_no),count(*) FROM loan_schedule WHERE loan_id=%s", (loan,))
dates_before, count_before = cur.fetchone()
r = post_loan_payment(cur, loan, 230, date(2026, 10, 7), source='bank', source_ref='test-over')
assert (r['interest_part'], r['principal_part'], r['early_principal'], r['new_balance']) == (10.0, 220.0, 120.0, 80.0), r
cur.execute("SELECT array_agg(payment_date ORDER BY payment_no),count(*) FROM loan_schedule WHERE loan_id=%s", (loan,))
dates_after, count_after = cur.fetchone()
assert dates_before == dates_after and count_before == count_after
cur.execute("SELECT sum(penalty_part) FROM loan_payments WHERE loan_id=%s", (loan,))
assert cur.fetchone()[0] == 0

# В последнем периоде автоматический платёж покрывает начисленную пеню
# после процентов, до основного долга; исторические строки не меняются.
loan = make_loan(cur, 'FINAL-PENALTY')
cur.execute("UPDATE loan_schedule SET status='paid',paid_amount=110 WHERE loan_id=%s AND payment_no<3", (loan,))
cur.execute("UPDATE loans SET balance=100 WHERE id=%s", (loan,))
r = post_loan_payment(cur, loan, 131, date(2026, 11, 30), source='bank', source_ref='final-penalty')
assert (r['interest_part'], r['penalty_part'], r['principal_part'], r['new_balance']) == (10.0, 21.0, 100.0, 0.0), r
cur.execute("SELECT paid_amount,status FROM loan_schedule WHERE loan_id=%s AND payment_no=3", (loan,))
assert cur.fetchone() == (Decimal('110.00'), 'paid')
cur.execute("SELECT evidence->'after'->>'paid_penalty_to_date' FROM nbki_payment_posting_snapshots WHERE payment_id=%s", (r['payment_id'],))
assert cur.fetchone()[0] == '21.00'

# Идемпотентность банковской операции: повтор относится к исходному займу.
cur.execute("SELECT loan_id,id FROM loan_payments WHERE source='bank' AND source_ref='test-over'")
duplicate_loan, duplicate_id = cur.fetchone()
again = post_loan_payment(cur, duplicate_loan, 230, date(2026, 10, 7), source='bank', source_ref='test-over')
assert again.get('duplicate') is True and again['payment_id'] == duplicate_id
cur.execute("SELECT count(*) FROM loan_payments WHERE loan_id=%s", (duplicate_loan,))
assert cur.fetchone()[0] == 1

# Принудительное распределение сохраняется точно и не портит следующий автоплатёж.
loan = make_loan(cur, 'FORCED')
r = post_loan_payment(cur, loan, 30, date(2026, 10, 7), source='manual',
                      forced={'interest': 0, 'principal': 25, 'penalty': 5},
                      event_time_msk='10:30:15')
assert (r['principal_part'], r['interest_part'], r['penalty_part']) == (25.0, 0.0, 5.0), r
cur.execute("""SELECT nbki_event_occurred_at AT TIME ZONE 'Europe/Moscow',
    nbki_event_time_basis,nbki_recorded_at IS NOT NULL
    FROM loan_payments WHERE id=%s""", (r['payment_id'],))
event_time, event_basis, recorded = cur.fetchone()
assert str(event_time) == '2026-10-07 10:30:15' and event_basis == 'operator_entered' and recorded
cur.execute("""SELECT evidence_sha256,evidence->'before'->'loan'->>'balance',
    evidence->'after'->'loan'->>'balance' FROM nbki_payment_posting_snapshots
    WHERE payment_id=%s""", (r['payment_id'],))
evidence_hash, balance_before, balance_after = cur.fetchone()
assert len(evidence_hash) == 64 and balance_before == '300.00' and balance_after == '275.00'
r2 = post_loan_payment(cur, loan, 20, date(2026, 10, 8), source='manual')
assert r2['interest_part'] == 10.0 and r2['principal_part'] == 10.0, r2
cur.execute("SELECT nbki_event_occurred_at,nbki_recorded_at IS NOT NULL FROM loan_payments WHERE id=%s", (r2['payment_id'],))
assert cur.fetchone() == (None, True)

# Досрочное погашение с сохранением срока уменьшает платёж и сохраняет строки/даты.
loan = make_loan(cur, 'EARLY-PAYMENT')
cur.execute("SELECT array_agg(payment_date ORDER BY payment_no),count(*) FROM loan_schedule WHERE loan_id=%s", (loan,))
dates_before, count_before = cur.fetchone()
r = post_loan_payment(cur, loan, 230, date(2026, 10, 7), source='manual', early_strategy='reduce_payment')
assert r['schedule_recalculated'] and 0 < r['new_monthly'] < 110 and r['new_term'] is None, r
cur.execute("SELECT array_agg(payment_date ORDER BY payment_no),count(*) FROM loan_schedule WHERE loan_id=%s", (loan,))
assert cur.fetchone() == (dates_before, count_before)

# Досрочное погашение с сохранением платежа удаляет лишние будущие периоды.
loan = make_long_loan(cur, 'EARLY-TERM')
r = post_loan_payment(cur, loan, 280, date(2026, 9, 7), source='manual', early_strategy='reduce_term')
assert r['schedule_recalculated'] and r['new_monthly'] == 110.0 and r['new_term'] < 6, r
cur.execute("SELECT count(*),max(payment_no),max(payment_date) FROM loan_schedule WHERE loan_id=%s", (loan,))
row_count, max_no, max_date = cur.fetchone()
assert row_count == max_no == r['new_term'] and str(max_date) < '2027-02-28'

# Полное досрочное погашение закрывает договор и убирает ненаступившие периоды.
loan = make_loan(cur, 'EARLY-FULL')
r = post_loan_payment(cur, loan, 310, date(2026, 10, 7), source='manual', early_strategy='reduce_term')
assert r['new_balance'] == 0.0 and r['unapplied'] == 0.0, r
cur.execute("SELECT status,end_date FROM loans WHERE id=%s", (loan,))
assert cur.fetchone() == ('closed', date(2026, 10, 7))
cur.execute("SELECT count(*) FROM loan_schedule WHERE loan_id=%s AND payment_date>'2026-10-31'", (loan,))
assert cur.fetchone()[0] == 0

# Фактические дни разрешены только при полном погашении.
loan = make_long_loan(cur, 'ACTUAL-DAYS-FULL')
cur.execute("UPDATE loan_schedule SET status='paid',paid_amount=110,paid_date='2026-09-30' WHERE loan_id=%s AND payment_no=1", (loan,))
cur.execute("UPDATE loans SET balance=500 WHERE id=%s", (loan,))
cur.execute('SAVEPOINT reject_partial_actual_days')
try:
    post_loan_payment(cur, loan, 280, date(2026, 10, 20), interest_basis='actual_days')
except ValueError as exc:
    assert 'полном погашении' in str(exc), exc
else:
    raise AssertionError('Partial repayment accepted actual days')
cur.execute('ROLLBACK TO SAVEPOINT reject_partial_actual_days')
cur.execute('RELEASE SAVEPOINT reject_partial_actual_days')
expected_interest = (Decimal('500') * Decimal('0.12') * Decimal('20') / Decimal('365')).quantize(Decimal('0.01'))
r = post_loan_payment(cur, loan, Decimal('500') + expected_interest, date(2026, 10, 20), interest_basis='actual_days')
assert (r['interest_part'], r['principal_part'], r['new_balance'], r['unapplied']) == (float(expected_interest), 500, 0, 0), r

loan = make_loan(cur, 'OVERDUE-PRIORITY')
r = post_loan_payment(cur, loan, 150, date(2026, 10, 7), source='bank', source_ref='overdue-priority')
assert (r['interest_part'], r['principal_part'], r['early_principal']) == (10.0, 140.0, 40.0), r
cur.execute("SELECT status,paid_amount,overdue_days FROM loan_schedule WHERE loan_id=%s AND payment_no=1", (loan,))
assert cur.fetchone() == ('paid', Decimal('110.00'), 7)
cur.execute("SELECT status,paid_amount FROM loan_schedule WHERE loan_id=%s AND payment_no=2", (loan,))
assert cur.fetchone() == ('pending', Decimal('0.00'))

# Обычная переплата не меняет проценты периода независимо от размера/источника.
for source in ('bank', 'manual'):
    for amount in (Decimal('110.01'), Decimal('280.00')):
        loan = make_long_loan(cur, f'SCHEDULE-{source}-{amount}')
        cur.execute("UPDATE loan_schedule SET status='paid',paid_amount=110 WHERE loan_id=%s AND payment_no=1", (loan,))
        cur.execute("UPDATE loans SET balance=500 WHERE id=%s", (loan,))
        r = post_loan_payment(cur, loan, amount, date(2026, 10, 20), source=source)
        assert r['interest_part'] == 10.0 and r['early_principal'] == float(amount - 110), r
        cur.execute("SELECT payment_amount,interest_amount,paid_amount FROM loan_schedule WHERE loan_id=%s AND payment_no=2", (loan,))
        assert cur.fetchone() == (Decimal('110'), Decimal('10'), Decimal('110'))
        # Повторный перевод в уже оплаченный месяц не начисляет проценты повторно.
        r2 = post_loan_payment(cur, loan, 5, date(2026, 10, 21), source=source)
        assert (r2['interest_part'], r2['principal_part'], r2['early_principal']) == (0, 5, 5), r2

# Разделённая оплата текущего периода: проценты учитываются ровно один раз.
loan = make_long_loan(cur, 'SPLIT-CURRENT')
cur.execute("UPDATE loan_schedule SET status='paid',paid_amount=110 WHERE loan_id=%s AND payment_no=1", (loan,))
cur.execute("UPDATE loans SET balance=500 WHERE id=%s", (loan,))
r1 = post_loan_payment(cur, loan, 5, date(2026, 10, 10), source='bank')
r2 = post_loan_payment(cur, loan, 106, date(2026, 10, 11), source='bank')
assert (r1['interest_part'], r1['principal_part']) == (5, 0), r1
assert (r2['interest_part'], r2['principal_part'], r2['early_principal']) == (5, 101, 1), r2

# Банковский импорт не может включить модель фактических дней.
try:
    post_loan_payment(cur, loan, 1, date(2026, 10, 12), source='bank', interest_basis='actual_days')
except ValueError:
    pass
else:
    raise AssertionError('Bank payment accepted actual_days')

# Регрессия Петрова: 155,85 сверх графика идут только в досрочный ОД.
loan = make_long_loan(cur, 'PETROV')
cur.execute("UPDATE loans SET amount=2010400.09,balance=2010400.09,rate=21 WHERE id=%s", (loan,))
cur.execute("UPDATE loan_schedule SET status='paid',paid_amount=110 WHERE loan_id=%s AND payment_no<3", (loan,))
cur.execute("UPDATE loan_schedule SET payment_amount=37844.15,principal_amount=2662.15,interest_amount=35182.00 WHERE loan_id=%s AND payment_no=3", (loan,))
r = post_loan_payment(cur, loan, 38000, date(2026, 11, 10), source='bank')
assert (r['interest_part'], r['principal_part'], r['early_principal'], r['new_balance']) == (35182.00, 2818.00, 155.85, 2007582.09), r
cur.execute("SELECT payment_amount,interest_amount,paid_amount,status FROM loan_schedule WHERE loan_id=%s AND payment_no=3", (loan,))
assert cur.fetchone() == (Decimal('37844.15'), Decimal('35182.00'), Decimal('37844.15'), 'paid')
cur.execute("SELECT SUM(principal_amount) FROM loan_schedule WHERE loan_id=%s AND payment_no>3", (loan,))
assert cur.fetchone()[0] == Decimal('2007582.09')

# Реальные API preview/проведение выбирают одну модель для обоих вариантов срока.
from api.index import handle_loans

class NoCommit:
    def commit(self):
        pass  # Все тестовые операции остаются в общей откатываемой транзакции.

for strategy in ('reduce_payment', 'reduce_term'):
    for full in (False, True):
        loan = make_long_loan(cur, f'API-{strategy}-{full}')
        cur.execute("UPDATE loan_schedule SET status='paid',paid_amount=110,paid_date='2026-09-30' WHERE loan_id=%s AND payment_no=1", (loan,))
        cur.execute("UPDATE loans SET balance=500 WHERE id=%s", (loan,))
        preview = handle_loans('POST', {}, {
            'action': 'early_repayment_preview', 'loan_id': loan,
            'payment_date': '2026-10-20', 'repayment_type': strategy,
            'mode': 'full' if full else 'partial', 'amount': 280,
        }, cur, NoCommit())
        assert preview['interest_part'] == (float(expected_interest) if full else 10), preview
        cur.execute("SELECT count(*) FROM loan_payments WHERE loan_id=%s", (loan,))
        assert cur.fetchone()[0] == 0, 'Preview wrote a payment'
        result = handle_loans('POST', {}, {
            'action': 'early_repayment', 'loan_id': loan,
            'payment_date': '2026-10-20', 'repayment_type': strategy,
            'full_repayment': full, 'amount': preview['amount'],
            'expected_preview': preview,
        }, cur, NoCommit())
        for field in ('interest_part', 'principal_part', 'new_balance'):
            assert result[field] == preview[field], (field, result, preview)
        assert (result['new_balance'] == 0) == full

conn.rollback()
conn.close()
print('OK: unified loan payment engine scenarios passed')
