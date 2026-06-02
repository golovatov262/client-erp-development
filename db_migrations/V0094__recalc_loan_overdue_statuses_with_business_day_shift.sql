-- Пересчёт статусов всех договоров займа с учётом переноса срока на рабочий день.
-- Эффективная дата = ближайший рабочий день >= плановой даты (не сб/вс и не праздник РФ).

-- Предрасчёт эффективной даты для всех неоплаченных/просроченных периодов
WITH eff AS (
    SELECT ls.id AS sid,
           (SELECT MIN(g::date)
            FROM generate_series(ls.payment_date, ls.payment_date + 14, '1 day') g
            WHERE extract(dow from g) NOT IN (0,6)
              AND to_char(g, 'MM-DD') NOT IN ('01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08',
                                              '02-23','03-08','05-01','05-09','06-12','11-04')
           ) AS eff_date
    FROM t_p25513958_client_erp_developme.loan_schedule ls
    JOIN t_p25513958_client_erp_developme.loans l ON l.id = ls.loan_id
    WHERE l.status <> 'closed'
      AND ls.status IN ('pending','partial','overdue')
)
SELECT 1;

-- 1) Не оплаченные pending/partial с прошедшей эффективной датой -> overdue
UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET status = 'overdue',
    overdue_days = (CURRENT_DATE - (
        SELECT MIN(g::date)
        FROM generate_series(ls.payment_date, ls.payment_date + 14, '1 day') g
        WHERE extract(dow from g) NOT IN (0,6)
          AND to_char(g, 'MM-DD') NOT IN ('01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08',
                                          '02-23','03-08','05-01','05-09','06-12','11-04')
    ))
FROM t_p25513958_client_erp_developme.loans l
WHERE ls.loan_id = l.id
  AND l.status <> 'closed'
  AND ls.status IN ('pending','partial')
  AND COALESCE(ls.paid_amount,0) < ls.payment_amount
  AND (
        SELECT MIN(g::date)
        FROM generate_series(ls.payment_date, ls.payment_date + 14, '1 day') g
        WHERE extract(dow from g) NOT IN (0,6)
          AND to_char(g, 'MM-DD') NOT IN ('01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08',
                                          '02-23','03-08','05-01','05-09','06-12','11-04')
      ) < CURRENT_DATE
  AND NOT (l.holiday_start IS NOT NULL AND l.holiday_end IS NOT NULL
           AND ls.payment_date >= l.holiday_start AND ls.payment_date < l.holiday_end);

-- 2) Ошибочно overdue, но эффективная дата ещё не наступила -> pending
UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET status = 'pending',
    overdue_days = 0
FROM t_p25513958_client_erp_developme.loans l
WHERE ls.loan_id = l.id
  AND l.status <> 'closed'
  AND ls.status = 'overdue'
  AND (
        SELECT MIN(g::date)
        FROM generate_series(ls.payment_date, ls.payment_date + 14, '1 day') g
        WHERE extract(dow from g) NOT IN (0,6)
          AND to_char(g, 'MM-DD') NOT IN ('01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08',
                                          '02-23','03-08','05-01','05-09','06-12','11-04')
      ) >= CURRENT_DATE;

-- 3) Актуализация overdue_days у просроченных периодов
UPDATE t_p25513958_client_erp_developme.loan_schedule ls
SET overdue_days = (CURRENT_DATE - (
        SELECT MIN(g::date)
        FROM generate_series(ls.payment_date, ls.payment_date + 14, '1 day') g
        WHERE extract(dow from g) NOT IN (0,6)
          AND to_char(g, 'MM-DD') NOT IN ('01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08',
                                          '02-23','03-08','05-01','05-09','06-12','11-04')
    ))
FROM t_p25513958_client_erp_developme.loans l
WHERE ls.loan_id = l.id
  AND l.status <> 'closed'
  AND ls.status = 'overdue'
  AND (
        SELECT MIN(g::date)
        FROM generate_series(ls.payment_date, ls.payment_date + 14, '1 day') g
        WHERE extract(dow from g) NOT IN (0,6)
          AND to_char(g, 'MM-DD') NOT IN ('01-01','01-02','01-03','01-04','01-05','01-06','01-07','01-08',
                                          '02-23','03-08','05-01','05-09','06-12','11-04')
      ) < CURRENT_DATE;

-- 4) Займы с реально просроченными периодами -> overdue
UPDATE t_p25513958_client_erp_developme.loans l
SET status = 'overdue', updated_at = NOW()
WHERE l.status = 'active'
  AND EXISTS (
      SELECT 1 FROM t_p25513958_client_erp_developme.loan_schedule ls
      WHERE ls.loan_id = l.id
        AND ls.status = 'overdue'
        AND COALESCE(ls.paid_amount,0) < ls.payment_amount
  );

-- 5) Займы без просроченных периодов -> active (holiday не трогаем)
UPDATE t_p25513958_client_erp_developme.loans l
SET status = 'active', updated_at = NOW()
WHERE l.status = 'overdue'
  AND NOT EXISTS (
      SELECT 1 FROM t_p25513958_client_erp_developme.loan_schedule ls
      WHERE ls.loan_id = l.id
        AND ls.status = 'overdue'
        AND COALESCE(ls.paid_amount,0) < ls.payment_amount
  );
