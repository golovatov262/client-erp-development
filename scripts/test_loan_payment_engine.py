import os
import sys
from datetime import date
from decimal import Decimal

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from loan_payment_engine import post_loan_payment


def make_loan(cur, suffix):
    cur.execute("SELECT id FROM members ORDER BY id LIMIT 1")
    member_id = cur.fetchone()[0]
    cur.execute("""INSERT INTO loans(contract_no,member_id,amount,rate,term_months,schedule_type,
        start_date,end_date,monthly_payment,balance,status)
        VALUES(%s,%s,300,12,3,'annuity','2026-08-31','2026-11-30',110,300,'active') RETURNING id""",
        ('ENGINE-TEST-' + suffix, member_id))
    loan_id = cur.fetchone()[0]
    for no, due, after in ((1, '2026-09-30', 200), (2, '2026-10-31', 100), (3, '2026-11-30', 0)):
        cur.execute("""INSERT INTO loan_schedule(loan_id,payment_no,payment_date,payment_amount,
            principal_amount,interest_amount,balance_after,status,paid_amount,penalty_amount)
            VALUES(%s,%s,%s,110,100,10,%s,'pending',0,7)""", (loan_id, no, due, after))
    return loan_id


def make_long_loan(cur, suffix):
    cur.execute("SELECT id FROM members ORDER BY id LIMIT 1")
    member_id = cur.fetchone()[0]
    cur.execute("""INSERT INTO loans(contract_no,member_id,amount,rate,term_months,schedule_type,
        start_date,end_date,monthly_payment,balance,status)
        VALUES(%s,%s,600,12,6,'annuity','2026-08-31','2027-02-28',110,600,'active') RETURNING id""",
        ('ENGINE-TEST-' + suffix, member_id))
    loan_id = cur.fetchone()[0]
    dues = ('2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28')
    for no, due in enumerate(dues, 1):
        cur.execute("""INSERT INTO loan_schedule(loan_id,payment_no,payment_date,payment_amount,
            principal_amount,interest_amount,balance_after,status,paid_amount,penalty_amount)
            VALUES(%s,%s,%s,110,100,10,%s,'pending',0,0)""",
            (loan_id, no, due, 600 - no * 100))
    return loan_id


conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

# Недоплата: сначала проценты двух доступных периодов, основной долг не меняется.
loan = make_loan(cur, 'UNDER')
r = post_loan_payment(cur, loan, 15, date(2026, 10, 7), source='bank', source_ref='test-under')
assert r['interest_part'] == 15.0 and r['principal_part'] == 0.0 and r['new_balance'] == 300.0, r

# Переплата: проценты -> плановый ОД -> досрочный ОД; даты и число строк сохраняются.
loan = make_loan(cur, 'OVER')
cur.execute("SELECT array_agg(payment_date ORDER BY payment_no),count(*) FROM loan_schedule WHERE loan_id=%s", (loan,))
dates_before, count_before = cur.fetchone()
r = post_loan_payment(cur, loan, 230, date(2026, 10, 7), source='bank', source_ref='test-over')
assert (r['interest_part'], r['principal_part'], r['early_principal'], r['new_balance']) == (20.0, 210.0, 10.0, 90.0), r
cur.execute("SELECT array_agg(payment_date ORDER BY payment_no),count(*) FROM loan_schedule WHERE loan_id=%s", (loan,))
dates_after, count_after = cur.fetchone()
assert dates_before == dates_after and count_before == count_after
cur.execute("SELECT sum(penalty_part) FROM loan_payments WHERE loan_id=%s", (loan,))
assert cur.fetchone()[0] == 0

# Идемпотентность банковской операции.
again = post_loan_payment(cur, loan, 230, date(2026, 10, 7), source='bank', source_ref='test-over')
assert again.get('duplicate') is True
cur.execute("SELECT count(*) FROM loan_payments WHERE loan_id=%s", (loan,))
assert cur.fetchone()[0] == 1

# Принудительное распределение сохраняется точно и не портит следующий автоплатёж.
loan = make_loan(cur, 'FORCED')
r = post_loan_payment(cur, loan, 30, date(2026, 10, 7), source='manual',
                      forced={'interest': 0, 'principal': 25, 'penalty': 5})
assert (r['principal_part'], r['interest_part'], r['penalty_part']) == (25.0, 0.0, 5.0), r
r2 = post_loan_payment(cur, loan, 20, date(2026, 10, 8), source='manual')
assert r2['interest_part'] == 20.0, r2

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
r = post_loan_payment(cur, loan, 320, date(2026, 10, 7), source='manual', early_strategy='reduce_term')
assert r['new_balance'] == 0.0 and r['unapplied'] == 0.0, r
cur.execute("SELECT status,end_date FROM loans WHERE id=%s", (loan,))
assert cur.fetchone() == ('closed', date(2026, 10, 7))
cur.execute("SELECT count(*) FROM loan_schedule WHERE loan_id=%s AND payment_date>'2026-10-31'", (loan,))
assert cur.fetchone()[0] == 0

conn.rollback()
conn.close()
print('OK: unified loan payment engine scenarios passed')
