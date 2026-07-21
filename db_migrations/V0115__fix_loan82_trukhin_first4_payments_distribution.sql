UPDATE t_p25513958_client_erp_developme.loan_payments SET manual_distribution=true, interest_part=32074.36, penalty_part=102.86, principal_part=1603.79 WHERE id=1218;
UPDATE t_p25513958_client_erp_developme.loan_payments SET manual_distribution=true, interest_part=32048.46, penalty_part=78.65, principal_part=1653.90 WHERE id=1219;
UPDATE t_p25513958_client_erp_developme.loan_payments SET manual_distribution=true, interest_part=32022.13, penalty_part=52.72, principal_part=1780.47 WHERE id=1220;
UPDATE t_p25513958_client_erp_developme.loan_payments SET manual_distribution=true, interest_part=31995.35, penalty_part=25.91, principal_part=1759.74 WHERE id=1229;

INSERT INTO t_p25513958_client_erp_developme.audit_log (user_id, user_name, user_role, action, entity, entity_id, entity_label, details, ip)
VALUES (NULL, 'Юра (АИ)', 'system', 'fix_payment_distribution', 'loan', 82, '300-000000116012024', 'Ручная коррекция разнесения платежей #1218,1219,1220,1229 (ноябрь-февраль): из-за бага блокировки просрочкой они были разнесены на 100% в проценты. Восстановлено корректное разнесение (проценты+пеня своего периода, остаток 6797.90 руб. в основной долг).', '');