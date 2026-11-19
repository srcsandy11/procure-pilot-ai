import argparse
import sys
from dataclasses import asdict
import json
from .decision import evaluate, instant
from .store import fixture_snapshot, init_db, postgres_snapshot

STAGES = {
    "initial": "2026-11-19T12:00:00+05:30",
    "confirmed": "2026-11-20T12:00:00+05:30",
    "revised": "2026-11-21T12:00:00+05:30",
}


def main():
    parser = argparse.ArgumentParser(description="Evaluate dated supply evidence for a fictional order")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db", help="Create and seed a dedicated PostgreSQL demo database schema")
    demo = sub.add_parser("demo")
    demo.add_argument("--store", choices=("fixture", "postgres"), default="fixture")
    demo.add_argument("--order", default="SO-1001")
    demo.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    demo.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.command == "init-db":
        try:
            init_db()
        except ModuleNotFoundError as exc:
            if exc.name != "psycopg":
                raise
            raise ValueError("Install requirements.txt to enable PostgreSQL.") from None
        print("PostgreSQL demo schema and seed are ready.")
        return
    read = postgres_snapshot if args.store == "postgres" else fixture_snapshot
    stages = STAGES if args.stage == "all" else {args.stage: STAGES[args.stage]}
    rows = []
    for stage, timestamp in stages.items():
        as_of = instant(timestamp)
        order, plans, offers, split = read(args.order, as_of)
        for plan, legs in plans.items():
            decision = evaluate(order, legs, offers, split, as_of)
            rows.append(dict(stage=stage, order=args.order, plan=plan, as_of=timestamp, **asdict(decision)))
    if args.json:
        print(json.dumps(rows, indent=2))
        return
    for row in rows:
        print(f"\n{row['stage']} | {row['order']} | {row['plan']} | {row['verdict']}")
        print("  Evidence:", ", ".join(row["evidence"]))
        for finding in row["findings"]:
            print(f"  {finding['owner']} ({finding['evidence']}): {finding['action']}")
        if not row["findings"]:
            print("  Sales: submit this plan for human approval.")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        sys.exit(str(error))
