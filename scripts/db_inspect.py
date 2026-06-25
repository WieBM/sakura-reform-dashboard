"""
Sakura Reform Dashboard — DB Inspection Utility
Usage:
  python scripts/db_inspect.py                   # summary of all tables
  python scripts/db_inspect.py --query "SELECT * FROM projects WHERE status='完了'"
  python scripts/db_inspect.py --table employees
"""

import argparse
import sqlite3
import os
import sys
sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "sakura.db")
TABLES = ["employees", "customers", "projects", "estimates", "invoices", "services"]


def print_table(rows, headers):
    if not rows:
        print("  (empty)")
        return
    widths = [max(len(str(h)), max(len(str(r[i])) for r in rows)) for i, h in enumerate(headers)]
    sep = "+-" + "-+-".join("-" * w for w in widths) + "-+"
    row_fmt = "| " + " | ".join(f"{{:<{w}}}" for w in widths) + " |"
    print(sep)
    print(row_fmt.format(*headers))
    print(sep)
    for r in rows:
        print(row_fmt.format(*[str(v) if v is not None else "" for v in r]))
    print(sep)


def summary(conn):
    for table in TABLES:
        cur = conn.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        print(f"  {table:<12} {count:>5} rows")


def show_table(conn, table, limit=20):
    cur = conn.execute(f"SELECT * FROM {table} LIMIT {limit}")
    headers = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"\n{table} (first {limit} rows):")
    print_table(rows, headers)


def run_query(conn, sql):
    cur = conn.execute(sql)
    headers = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"\nQuery: {sql}")
    print_table(rows, headers)
    print(f"  {len(rows)} row(s) returned")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", "-q", help="Raw SQL to execute")
    parser.add_argument("--table", "-t", choices=TABLES, help="Show first 20 rows of a table")
    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"DB not found: {DB_PATH}")
        print("Start the server once (npm start) to initialize the database.")
        raise SystemExit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    if args.query:
        run_query(conn, args.query)
    elif args.table:
        show_table(conn, args.table)
    else:
        print("=== sakura.db -- table summary ===")
        summary(conn)
        print("\nOptions: --table <name>  or  --query \"<SQL>\"")

    conn.close()
