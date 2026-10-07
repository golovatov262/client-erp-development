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
