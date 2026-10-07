#!/bin/bash
set -euo pipefail

EXPECTED_IP="109.73.192.20"
ROOT_IP="$(dig @1.1.1.1 +short A mykpk.ru 2>/dev/null | tail -1 || true)"
WWW_IP="$(dig @1.1.1.1 +short A www.mykpk.ru 2>/dev/null | tail -1 || true)"

if [[ "$ROOT_IP" != "$EXPECTED_IP" || "$WWW_IP" != "$EXPECTED_IP" ]]; then
    exit 0
fi

if [[ ! -f /etc/letsencrypt/live/mykpk.ru/fullchain.pem ]]; then
    certbot certonly --webroot -w /opt/client-erp/dist \
        -d mykpk.ru -d www.mykpk.ru --non-interactive --agree-tos
fi

install -o root -g root -m 0644 /usr/local/lib/client-erp-domain-ssl.conf \
    /etc/nginx/sites-available/client-erp-domain
nginx -t
systemctl reload nginx
systemctl disable --now client-erp-domain-tls.timer || true
