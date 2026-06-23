-- Таблица глобальных системных настроек (key-value)
CREATE TABLE IF NOT EXISTS t_p25513958_client_erp_developme.system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value VARCHAR(500) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Флаг автоматического начисления процентов по сбережениям.
-- 'off' = автоначисление по вкладам отключено. Ставим off по запросу.
INSERT INTO t_p25513958_client_erp_developme.system_settings (key, value)
VALUES ('savings_auto_accrual', 'off')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();