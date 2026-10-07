import csv
import ast
import io
import json
import os
import sys
import zipfile
from pathlib import Path

import psycopg2
from psycopg2 import sql

SCHEMA = "t_p25513958_client_erp_developme"
archive = Path(sys.argv[1])
conn = psycopg2.connect(os.environ.get("DATABASE_URL", "dbname=client_erp"))

with zipfile.ZipFile(archive) as zf, conn:
    files = sorted(n for n in zf.namelist() if n.lower().endswith("_export.csv"))
    datasets = []
    with conn.cursor() as cur:
        cur.execute("SET LOCAL session_replication_role = replica")
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=%s", (SCHEMA,))
        existing = {r[0] for r in cur.fetchall()}
        for name in files:
            table = Path(name).name.removesuffix("_export.csv")
            if table not in existing:
                print("skip missing table", table, flush=True)
                continue
            raw = zf.read(name)
            text = raw.decode("utf-8-sig")
            reader = csv.reader(io.StringIO(text, newline=""))
            header = next(reader, [])
            cur.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema=%s AND table_name=%s", (SCHEMA, table))
            metadata = {r[0]: (r[1], r[2] == 'YES') for r in cur.fetchall()}
            columns = set(metadata)
            unknown = set(header) - columns
            if unknown:
                raise RuntimeError(f"{table}: unknown columns: {sorted(unknown)}")
            rows = list(reader)
            normalized = io.StringIO(newline="")
            writer = csv.writer(normalized, lineterminator="\n")
            writer.writerow(header)
            text_types = {'character varying', 'character', 'text'}
            for row in rows:
                output = []
                for column, value in zip(header, row):
                    data_type, nullable = metadata[column]
                    if value and data_type in {'json', 'jsonb'}:
                        try:
                            json.loads(value)
                        except json.JSONDecodeError:
                            value = json.dumps(ast.literal_eval(value), ensure_ascii=False)
                    if value and data_type == 'ARRAY' and value.startswith('['):
                        value = '{' + ','.join(str(v) for v in json.loads(value)) + '}'
                    output.append('\\N' if value == '' and (nullable or data_type not in text_types) else value)
                writer.writerow(output)
            datasets.append((table, header, normalized.getvalue(), len(rows)))

        targets = sql.SQL(",").join(sql.Identifier(SCHEMA, d[0]) for d in datasets)
        cur.execute(sql.SQL("TRUNCATE {} RESTART IDENTITY CASCADE").format(targets))
        for table, header, text, expected in datasets:
            command = sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '\\N')").format(
                sql.Identifier(SCHEMA, table), sql.SQL(",").join(map(sql.Identifier, header)))
            cur.copy_expert(command.as_string(conn), io.StringIO(text, newline=""))
            cur.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(SCHEMA, table)))
            actual = cur.fetchone()[0]
            if actual != expected:
                raise RuntimeError(f"{table}: expected {expected}, imported {actual}")
            print(f"imported {table}: {actual}", flush=True)

        cur.execute("""
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema=%s AND column_default LIKE 'nextval(%%'
        """, (SCHEMA,))
        for table, column in cur.fetchall():
            cur.execute("SELECT pg_get_serial_sequence(%s,%s)", (f'{SCHEMA}.{table}', column))
            sequence = cur.fetchone()[0]
            if sequence:
                cur.execute(sql.SQL("SELECT setval(%s, COALESCE((SELECT MAX({}) FROM {}), 1), COALESCE((SELECT MAX({}) FROM {}),0)>0)").format(
                    sql.Identifier(column), sql.Identifier(SCHEMA, table), sql.Identifier(column), sql.Identifier(SCHEMA, table)), (sequence,))

print("CSV import committed", flush=True)
