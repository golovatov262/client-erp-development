INSERT INTO t_p25513958_client_erp_developme.system_settings(key, value, updated_at)
VALUES ('savings_auto_accrual', 'off', NOW())
ON CONFLICT(key) DO UPDATE SET value='off', updated_at=NOW();

INSERT INTO t_p25513958_client_erp_developme.system_settings(key, value, updated_at)
VALUES ('savings_accrual_stop_date', '2026-06-21', NOW())
ON CONFLICT(key) DO UPDATE SET value='2026-06-21', updated_at=NOW();
