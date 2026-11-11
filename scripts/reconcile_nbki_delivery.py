"""Backfill event delivery links from visible uploaded files; dry-run by default."""
import argparse
import os
import psycopg2
from backend.nbki_delivery import import_delivery_payloads
import gzip

parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
try:
    with conn.cursor() as cur:
        cur.execute('SELECT org_id,xml_gzip FROM nbki_source_files WHERE archived_at IS NULL ORDER BY document_time,id')
        for org_id, packed in cur.fetchall():
            import_delivery_payloads(conn, [gzip.decompress(bytes(packed))], [], org_id)
        cur.execute('SELECT status,count(*) FROM nbki_crm_events GROUP BY status ORDER BY status')
        print(dict(cur.fetchall()))
    if args.apply:
        conn.commit()
    else:
        conn.rollback()
finally:
    conn.close()
