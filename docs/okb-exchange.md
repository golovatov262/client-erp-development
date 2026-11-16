# Обмен с ОКБ

Основание: предоставленные пользователем Инструкция подключения v3.14 (17.06.2026),
CFB API v1.15 (21.10.2026) и external_CFB_API.yml, ЕФКИ ТТ5.1 с примерами,
Описание извещений v5.0 (15.07.2026), Регламент ЭДО №6 (05.03.2024).
PDF с UUID совпадает по тексту с описанием извещений из архива ЕФКИ.
Публичные сертификаты из обоих архивов сохранены в backend/okb_certificates;
catalog.json содержит отпечатки и сроки. Доверие на Windows автоматически не меняется.

Общая схема XML — существующая ЦБ 5.1. Отдельные профиль источника SIN, имя CHP/EFK,
реестры okb_* и агент. Общие финансовые снимки nbki_crm_events не дублируются и их
статус NBKI не меняется при ответах ОКБ. Генератор и связанные пары событий принимают
явный параметр bureau; значение по умолчанию nbki сохраняет прежнее поведение.
Общий флаг bki_enabled определяет включённые займы. Пользователь явно выбирает период.

Рабочий транспорт CFB /file/inbox/bureaufile: multipart file, X-Auth-Subscriber,
X-Auth-Group, X-Auth-Username, X-Auth-Password. Пароль хранится только в Windows DPAPI.
Секреты curl передаются через stdin-конфигурацию, не через командную строку/файл.
HTTP/TLS проверка и пиннинг сертификата подписанта извещений обязательны.
Имя и размер подтверждения CFB должны совпасть с отправленным файлом.

Упаковка отличается от НБКИ: XML → ZIP → attached CAdES-T (полная цепочка)
→ Base64 signed CMS → encrypted CMS → Base64. Расширение .zip.pem.pem.
CryptoPro Options=1 включает полную цепочку:
https://docs.cryptopro.ru/cades/plugin/plugin-methods
Входящий архив: после расшифровки и проверки внешней подписи проверяется также
откреплённая подпись XML. Никакой подстановки незаверенных данных при ошибке криптографии.

Состояния: queued → processing → sending → sent → completed.
Обрыв sending → delivery_unknown, автоматический повтор запрещён.
Извещение №1 с отказом завершает пакет, положительное разрешает обработку №2.
Счётчики и номера/UID/время ошибок сверяются с замороженным XML. Неоднозначный ответ
не изменяет принятие событий. Неизменённое отклонённое событие не выгружается повторно.
Повтор receipt идемпотентен. mark-downloaded выполняется после коммита CRM, очередь
подтверждений сохраняется даже после завершения пакета. НБКИ не затрагивается.

Первый запуск требует SIN/группы/логина/пароля, регистрации личного сертификата в ОКБ,
настройки Windows и первого реального обмена с двумя извещениями. До этого enabled=false.
Реальные данные не передаются на UAT; тестовые CHT/CHZ требуют отдельного синтетического
набора и сертификата «Тестовый пользователь», которых в приложении пользователя нет.
Архив передач ОКБ вне CRM не считается пустым автоматически и пока не импортируется.
Лимит приложения 100 событий/пакет, защищённый файл до 25 МБ (ниже лимита CFB 1 ГБ).

Проверки: scripts/test_okb_exchange.py, scripts/test_okb_agent.ps1; интеграция на реальных
снимках CRM в откатываемой транзакции без внешней отправки; регрессия scripts/test_nbki*.
Живую GOST/CAdES/TSP совместимость и ответы сервера подтверждает только Windows запуск.

## Windows transport 1.1 (2026-11-16)

CFB renegotiation fails with Windows curl/Schannel (SEC_E_DECRYPT_FAILURE) on the
reported Windows 10 19045 / CSP 5.0.13003 workstation; csptest -cpsspi succeeds.
The 1.1 agent uses unmodified CryptoPro stunnel-msspi 5.78-msspi-0.84, pinned
SHA256, with a short-lived loopback listener. It verifies listener ownership
before transmitting credentials. Fixed destination/SNI/checkHost cfb.bki-okb.com,
verifyChain=yes, normal revocation verification. curl handles HTTP framing only,
proxy disabled; no external plaintext connection, TLS bypass, or transport retry.
Tunnel configuration contains no password. Process and temporary files are cleaned
on both success and failure. A separately started agent killed forcibly can leave
a child process; do not kill a running upload, retain delivery_unknown handling.

-CheckConnection uses heartbeat and authenticated GET listing only (no poll/claim,
upload, receipt save, mark-downloaded). Failure exits nonzero. -CheckOnly remains
a local/CRM check. Update-OkbAgent.ps1 preserves credentials/receipts, backs up
files and stops the scheduled task; resume only after the connection check.
Backend accepts protocol-compatible versions 1.0 and 1.1. NBKI is unchanged.
Vendor binary source including submodules and licenses is distributed alongside it.
Live Windows validation of the new bridge and authenticated CFB is still required.

## Mandatory FL_22 and rejected-event retry (2026-11-16)

OKB receipt guidance v5.0 requires FL_22 for consumerExist_1 and openDate >=
2014-07-01. Its payment/debt/lifecycle serializer must not inherit a false
include_total_cost flag from NBKI historical files. Use verified CRM PSK; missing
or unverified PSK blocks generation. Guarantor events remain non-consumer.
NBKI serialization is unchanged. Existing packages and snapshots remain immutable.

Package 1/order 21 (CRM event 30, contract 100-000000311062026) was rejected for
missing FL_22. Verified CRM values: 35.952 percent, 35416.11 RUB, 2026-06-11.
Read-only production-data verification: corrected single-event XML passes XSD;
all 22 accepted events are refused by the delivery gate. Queue for 2026-10-30
contains exactly event 30 ready for retry. Operator selects that date range and
prepares a new package through the ordinary send action; no status resets or
receipt deletion. The corrected XML passes the changed-rejected-event gate.
