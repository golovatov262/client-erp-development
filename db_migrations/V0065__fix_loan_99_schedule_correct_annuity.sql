-- Исправление графика договора 99 (Кузьмин Д.С., 100-000001625082025)
-- Причина: баг в коде — пересчёт графика срабатывал при любой переплате (даже 1 коп.)
-- После 8 платежей накопилась погрешность и monthly_payment упал с 19633.69 до 18655.33
-- Правильный баланс после платежа №8: 252210.94 руб., ставка 32.5%, осталось 16 периодов
-- Аннуитет = 19633.69 руб. (исходный платёж)

-- Перезаписываем 16 неверных pending-строк правильными значениями
-- payment_no 9: 2026-05-31, interest=252210.94*0.02708333=6831.88, principal=19633.69-6831.88=12801.81
UPDATE loan_schedule SET payment_no=9, payment_date='2026-05-31', payment_amount=19633.69, principal_amount=12801.81, interest_amount=6831.88, balance_after=239409.13, status='pending', paid_amount=0, paid_date=NULL WHERE id=144603;

-- payment_no 10: 2026-06-30, interest=239409.13*0.02708333=6484.58, principal=13149.11
UPDATE loan_schedule SET payment_no=10, payment_date='2026-06-30', payment_amount=19633.69, principal_amount=13149.11, interest_amount=6484.58, balance_after=226260.02, status='pending', paid_amount=0, paid_date=NULL WHERE id=144604;

-- payment_no 11: 2026-07-31, interest=226260.02*0.02708333=6128.29, principal=13505.40
UPDATE loan_schedule SET payment_no=11, payment_date='2026-07-31', payment_amount=19633.69, principal_amount=13505.40, interest_amount=6128.29, balance_after=212754.62, status='pending', paid_amount=0, paid_date=NULL WHERE id=144605;

-- payment_no 12: 2026-08-31, interest=212754.62*0.02708333=5762.06, principal=13871.63
UPDATE loan_schedule SET payment_no=12, payment_date='2026-08-31', payment_amount=19633.69, principal_amount=13871.63, interest_amount=5762.06, balance_after=198882.99, status='pending', paid_amount=0, paid_date=NULL WHERE id=144606;

-- payment_no 13: 2026-09-30, interest=198882.99*0.02708333=5387.24, principal=14246.45
UPDATE loan_schedule SET payment_no=13, payment_date='2026-09-30', payment_amount=19633.69, principal_amount=14246.45, interest_amount=5387.24, balance_after=184636.54, status='pending', paid_amount=0, paid_date=NULL WHERE id=144607;

-- payment_no 14: 2026-10-31, interest=184636.54*0.02708333=5000.57, principal=14633.12
UPDATE loan_schedule SET payment_no=14, payment_date='2026-10-31', payment_amount=19633.69, principal_amount=14633.12, interest_amount=5000.57, balance_after=170003.42, status='pending', paid_amount=0, paid_date=NULL WHERE id=144608;

-- payment_no 15: 2026-11-30, interest=170003.42*0.02708333=4604.26, principal=15029.43
UPDATE loan_schedule SET payment_no=15, payment_date='2026-11-30', payment_amount=19633.69, principal_amount=15029.43, interest_amount=4604.26, balance_after=154973.99, status='pending', paid_amount=0, paid_date=NULL WHERE id=144609;

-- payment_no 16: 2026-12-31, interest=154973.99*0.02708333=4197.59, principal=15436.10
UPDATE loan_schedule SET payment_no=16, payment_date='2026-12-31', payment_amount=19633.69, principal_amount=15436.10, interest_amount=4197.59, balance_after=139537.89, status='pending', paid_amount=0, paid_date=NULL WHERE id=144610;

-- payment_no 17: 2027-01-31, interest=139537.89*0.02708333=3780.44, principal=15853.25
UPDATE loan_schedule SET payment_no=17, payment_date='2027-01-31', payment_amount=19633.69, principal_amount=15853.25, interest_amount=3780.44, balance_after=123684.64, status='pending', paid_amount=0, paid_date=NULL WHERE id=144611;

-- payment_no 18: 2027-02-28, interest=123684.64*0.02708333=3349.79, principal=16283.90
UPDATE loan_schedule SET payment_no=18, payment_date='2027-02-28', payment_amount=19633.69, principal_amount=16283.90, interest_amount=3349.79, balance_after=107400.74, status='pending', paid_amount=0, paid_date=NULL WHERE id=144612;

-- payment_no 19: 2027-03-31, interest=107400.74*0.02708333=2909.27, principal=16724.42
UPDATE loan_schedule SET payment_no=19, payment_date='2027-03-31', payment_amount=19633.69, principal_amount=16724.42, interest_amount=2909.27, balance_after=90676.32, status='pending', paid_amount=0, paid_date=NULL WHERE id=144613;

-- payment_no 20: 2027-04-30, interest=90676.32*0.02708333=2456.82, principal=17176.87
UPDATE loan_schedule SET payment_no=20, payment_date='2027-04-30', payment_amount=19633.69, principal_amount=17176.87, interest_amount=2456.82, balance_after=73499.45, status='pending', paid_amount=0, paid_date=NULL WHERE id=144614;

-- payment_no 21: 2027-05-31, interest=73499.45*0.02708333=1990.19, principal=17643.50
UPDATE loan_schedule SET payment_no=21, payment_date='2027-05-31', payment_amount=19633.69, principal_amount=17643.50, interest_amount=1990.19, balance_after=55855.95, status='pending', paid_amount=0, paid_date=NULL WHERE id=144615;

-- payment_no 22: 2027-06-30, interest=55855.95*0.02708333=1512.72, principal=18120.97
UPDATE loan_schedule SET payment_no=22, payment_date='2027-06-30', payment_amount=19633.69, principal_amount=18120.97, interest_amount=1512.72, balance_after=37734.98, status='pending', paid_amount=0, paid_date=NULL WHERE id=144616;

-- payment_no 23: 2027-07-31, interest=37734.98*0.02708333=1022.07, principal=18611.62
UPDATE loan_schedule SET payment_no=23, payment_date='2027-07-31', payment_amount=19633.69, principal_amount=18611.62, interest_amount=1022.07, balance_after=19123.36, status='pending', paid_amount=0, paid_date=NULL WHERE id=144617;

-- payment_no 24 (последний): 2027-08-25, interest=19123.36*0.02708333=518.05, principal=19123.36 (весь остаток)
UPDATE loan_schedule SET payment_no=24, payment_date='2027-08-25', payment_amount=19641.41, principal_amount=19123.36, interest_amount=518.05, balance_after=0.00, status='pending', paid_amount=0, paid_date=NULL WHERE id=144618;

-- Восстанавливаем правильный monthly_payment и balance в договоре
UPDATE loans SET monthly_payment=19633.69, balance=252210.94, updated_at=NOW() WHERE id=99;