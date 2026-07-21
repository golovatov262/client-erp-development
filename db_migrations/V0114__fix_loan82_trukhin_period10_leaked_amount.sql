UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 28300.36, status = 'partial', payment_id = 2226, paid_date = '2026-07-17'
WHERE loan_id = 82 AND payment_no = 10;

INSERT INTO t_p25513958_client_erp_developme.audit_log (user_id, user_name, user_role, action, entity, entity_id, entity_label, details, ip)
VALUES (NULL, 'Юра (АИ)', 'system', 'fix_schedule_status', 'loan', 82, '300-000000116012024', 'Ручная коррекция периода №10 (июль 2026): восстановлены не учтённые ранее 28300.36 руб. из платежей от 19.06.2026 и 17.07.2026, которые не были засчитаны в график из-за правила запрета частичного закрытия будущих периодов. Статус периода изменён с pending на partial.', '');