# Production and deployment

- The production CRM runs on **RU_VPS** at `root@109.73.192.20`.
- The production application directory is `/opt/client-erp`.
- Nginx serves the frontend from `/opt/client-erp/dist`.
- The API is managed by `client-erp.service` and listens on `127.0.0.1:8110`.
- Production changes must be deployed to RU_VPS as well as committed and pushed to the GitHub repository `golovatov262/client-erp-development`.
- GitHub is the source of truth going forward; do not deploy through the old poehali.dev function URLs.
- Never overwrite or delete `/opt/client-erp/.env`, `/opt/client-erp/data`, `/opt/client-erp/import`, or `/opt/client-erp/.venv` during deployment.
- Frontend-only changes require rebuilding and synchronizing `dist`; they do not require restarting `client-erp.service`.
- Backend changes require migration application where applicable, followed by a restart and health check of `client-erp.service`.
- Before enabling a deployment from GitHub, ensure `main` contains the current production source so an older checkout cannot overwrite RU_VPS.

# NBKI accounting source rule (confirmed 2026-11-12)

- A payment event is created from a payment posted in CRM, including a payment manually reviewed and entered by a manager. A bank-statement row alone is not a payment event.
- Missing, unmatched, unposted or unidentified bank-statement rows must not block NBKI event creation or XML generation. Do not require successful bank import, statement coverage or all statement rows to be matched as an NBKI prerequisite.
- Debt amounts and event dates come from CRM accounting and frozen operation evidence. Preserve the loan transaction lock and financial/XSD checks; never infer a payment from an unposted statement row.
- Debt-change reporting (event 2.3), payment reporting, and bank-import status are distinct concerns. Do not describe debt snapshots as new payments or as confirmed NBKI acceptance.

# NBKI reporting frequency (confirmed 2026-11-12)

- Do not create outgoing daily debt snapshots merely because daily interest grows. The scheduler observes dates and CRM state; observations are not export events.
- Report accrued debt together with an actual posted CRM payment, at a contractual payment due date, on new arrears (including the over-90-day indicator transition), and at least once in 31 calendar days for continuing obligations.
- Keep aggregated accrual and the payment/due event as separate 2.3 groups and include the pending pair in the same XML. Keep their real timestamps; distinguish receipt outcomes without invented seconds.
- Preserve existing prepared/exported files and initial snapshots authorized when the archive is unavailable. Payment and lifecycle accounting validations remain mandatory.
