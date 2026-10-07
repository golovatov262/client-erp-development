import os
from pathlib import Path
import psycopg2

root = Path(__file__).resolve().parents[1]
conn = psycopg2.connect(os.environ["DATABASE_URL"])
conn.autocommit = False
with conn.cursor() as cur:
    cur.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    conn.commit()
    for path in sorted((root / "db_migrations").glob("V*.sql")):
        cur.execute("SELECT 1 FROM schema_migrations WHERE version=%s", (path.name,))
        if cur.fetchone():
            continue
        print("apply", path.name, flush=True)
        try:
            cur.execute(path.read_text(encoding="utf-8"))
            cur.execute("INSERT INTO schema_migrations(version) VALUES(%s)", (path.name,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
conn.close()
