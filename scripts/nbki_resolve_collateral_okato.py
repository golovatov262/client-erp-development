"""Resolve missing BKI collateral OKATO codes from official FIAS records.

Only a unique exact normalized FIAS address match is applied automatically.
Ambiguous and non-exact results are left for manual review.
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from fias_api import resolve_unique_building_okato  # noqa: E402


def main() -> int:
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn:
            with conn.cursor() as cur:
                encryption_key = os.environ.get('APP_ENCRYPTION_KEY', '')
                if not encryption_key:
                    raise RuntimeError('APP_ENCRYPTION_KEY is not configured')
                cur.execute("""SELECT pgp_sym_decrypt(encrypted_value,%s)
                    FROM integration_secrets WHERE key='FIAS_MASTER_TOKEN'""",
                    (encryption_key,))
                token_row = cur.fetchone()
                if not token_row or not token_row[0]:
                    raise RuntimeError('FIAS_MASTER_TOKEN is not configured')
                token = token_row[0]

                cur.execute("""SELECT lc.id,l.contract_no,lc.nbki_location_address,lc.nbki_location
                    FROM loan_collateral lc JOIN loans l ON l.id=lc.loan_id
                    WHERE l.bki_enabled IS TRUE AND l.status IN ('active','overdue','holiday')
                      AND lc.collateral_type IN ('Залог недвижимого имущества','Залог движимого имущества')
                      AND length(btrim(lc.nbki_location_address))>0
                      AND (lc.nbki_location IS NULL OR lc.nbki_location !~ '^[0-9]{11}$')
                    ORDER BY lc.nbki_location_address,l.contract_no,lc.id""")
                rows = cur.fetchall()

                by_address = defaultdict(list)
                for collateral_id, contract_no, address, existing_okato in rows:
                    by_address[address.strip()].append((collateral_id, contract_no, existing_okato))

                updated = 0
                ambiguous = 0
                failed = 0
                addresses = list(by_address.items())
                for index, (address, records) in enumerate(addresses, start=1):
                    try:
                        match = resolve_unique_building_okato(address, token)
                    except Exception as exc:
                        failed += 1
                        print(f'FIAS error for address #{index}: {type(exc).__name__}', flush=True)
                        continue

                    if not match:
                        ambiguous += len(records)
                        continue

                    okato = match['okato']
                    for collateral_id, contract_no, old_okato in records:
                        cur.execute("""UPDATE loan_collateral SET nbki_location=%s,updated_at=NOW()
                            WHERE id=%s AND (nbki_location IS NULL OR nbki_location !~ '^[0-9]{11}$')""",
                            (okato, collateral_id))
                        if cur.rowcount:
                            cur.execute("""UPDATE nbki_collateral_autofill_audit
                                SET before_values=before_values || jsonb_build_object('nbki_location',%s),
                                    after_values=after_values || jsonb_build_object('nbki_location',%s)
                                WHERE collateral_id=%s""", (old_okato, okato, collateral_id))
                            cur.execute("""INSERT INTO audit_log
                                (user_id,user_name,user_role,action,entity,entity_id,entity_label,details,ip)
                                VALUES(NULL,'Система','system','update','loan_collateral',%s,%s,
                                'ОКАТО определён по точному адресу из ФИАС','')""",
                                (collateral_id, contract_no))
                            updated += 1

                    if index % 10 == 0:
                        print(f'Processed {index}/{len(addresses)} unique addresses', flush=True)

                print(f'FIAS address groups: {len(addresses)}; OKATO assigned: {updated}; '
                      f'manual review: {ambiguous}; lookup errors: {failed}', flush=True)
        return 0
    finally:
        conn.close()


if __name__ == '__main__':
    raise SystemExit(main())
