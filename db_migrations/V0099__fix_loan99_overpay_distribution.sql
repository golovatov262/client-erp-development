-- Исправление зависшего разнесения платежа 2039 по займу 99 (Кузьмин Д.С.)
-- Остаток 9.31 руб. сверх планового платежа №9 ошибочно ушёл в период №10 как 'partial'
-- и в interest_part платежа. По логике он должен уменьшать основной долг.

-- 1. Возвращаем период №10 в исходное состояние (pending)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET status='pending', paid_amount=0, paid_date=NULL, payment_id=NULL
WHERE loan_id=99 AND payment_no=10;

-- 2. Переносим 9.31 руб. из процентов в основной долг платежа 2039
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = principal_part + 9.31,
    interest_part  = interest_part  - 9.31
WHERE id=2039;

-- 3. Пересчитываем остаток основного долга займа = первоначальная сумма - сумма погашенного ОД
UPDATE t_p25513958_client_erp_developme.loans l
SET balance = GREATEST(l.amount - COALESCE((
        SELECT SUM(principal_part) FROM t_p25513958_client_erp_developme.loan_payments p
        WHERE p.loan_id = l.id), 0), 0),
    updated_at = NOW()
WHERE l.id=99;