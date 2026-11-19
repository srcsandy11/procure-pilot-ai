"""Two readers of the same fictional order: a portable fixture and PostgreSQL."""

import json
import os
from pathlib import Path

from .decision import instant

ROOT = Path(__file__).resolve().parents[1]


def fixture():
    return json.loads((ROOT / "data/demo.json").read_text())


def fixture_snapshot(order_id, as_of):
    data = fixture()
    order = next((row for row in data["orders"] if row["id"] == order_id), None)
    if order is None:
        raise ValueError(f"Unknown order {order_id}")
    plans = {p["id"]: p["legs"] for p in data["plans"] if p["order_id"] == order_id}
    decisions = [r for r in data["split_decisions"] if r["order_id"] == order_id and instant(r["recorded_at"]) <= as_of]
    split = max(decisions, key=lambda r: instant(r["recorded_at"]), default=None)
    offers = {}
    for row in sorted(data["offers"], key=lambda r: r["revision"]):
        if instant(row["recorded_at"]) <= as_of:
            offers[row["source"]] = row
    return order, plans, offers, split


def connection():
    if not os.environ.get("DATABASE_URL"):
        raise ValueError("Set DATABASE_URL to a dedicated PostgreSQL demo database.")
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        raise ValueError("Install requirements.txt to enable PostgreSQL.") from None
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def init_db():
    from psycopg import sql

    data = fixture()
    plans = data["plans"]
    data["plan_legs"] = [dict(plan_id=p["id"], **leg) for p in plans for leg in p["legs"]]
    data["plans"] = [{"id": p["id"], "order_id": p["order_id"]} for p in plans]
    with connection() as db:
        db.execute((ROOT / "sql/001_baseline.sql").read_text())
        for table in ("orders", "split_decisions", "plans", "plan_legs", "offers"):
            for row in data[table]:
                statement = sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING").format(
                    sql.Identifier(table),
                    sql.SQL(", ").join(map(sql.Identifier, row)),
                    sql.SQL(", ").join(sql.Placeholder() for _ in row),
                )
                db.execute(statement, list(row.values()))


def postgres_snapshot(order_id, as_of):
    with connection() as db:
        db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        db.execute("SET LOCAL search_path = procure_pilot")
        order = db.execute("SELECT * FROM orders WHERE id = %s", (order_id,)).fetchone()
        if order is None:
            raise ValueError(f"Unknown order {order_id}")
        legs = db.execute("""
            SELECT p.id, l.source, l.quantity FROM plans p JOIN plan_legs l ON l.plan_id = p.id
            WHERE p.order_id = %s ORDER BY p.id, l.source
        """, (order_id,)).fetchall()
        offers = db.execute("""
            SELECT DISTINCT ON (o.source) o.* FROM offers o
            JOIN plan_legs l ON l.source = o.source JOIN plans p ON p.id = l.plan_id
            WHERE p.order_id = %s AND o.recorded_at <= %s ORDER BY o.source, o.revision DESC
        """, (order_id, as_of)).fetchall()
        split = db.execute("""
            SELECT * FROM split_decisions WHERE order_id = %s AND recorded_at <= %s
            ORDER BY recorded_at DESC LIMIT 1
        """, (order_id, as_of)).fetchone()
    plans = {}
    for leg in legs:
        plans.setdefault(leg["id"], []).append(leg)
    return order, plans, {r["source"]: r for r in offers}, split
