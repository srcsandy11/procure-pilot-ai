"""Run labelled fictional decision cases, including five fixed acceptance cases."""
import json
from pathlib import Path

from .__main__ import STAGES
from .decision import evaluate, instant
from .store import fixture_snapshot


def measure():
    cases = json.loads((Path(__file__).resolve().parents[1] / "data" / "decision_cases.json").read_text())
    rows = []
    for case in cases:
        at = instant(STAGES[case["stage"]])
        order, plans, offers, split = fixture_snapshot("SO-1001", at)
        legs = plans[case["plan"]]
        for source, fields in case.get("offers", {}).items():
            if fields is None:
                del offers[source]
            else:
                offers[source].update(fields)
        if "split" in case:
            split = case["split"]
        order.update(case.get("order", {}))
        result = evaluate(order, legs, offers, split, at)
        decisive = [finding.evidence for finding in result.findings] or result.evidence
        owners = [finding.owner for finding in result.findings] or ["Sales"]
        rows.append({
            "case": case["name"], "partition": case["partition"], "expected": case["verdict"],
            "actual": result.verdict, "evidence_correct": case["evidence"] in decisive,
            "owner_correct": case["owner"] in owners,
        })
    return {
        "cases": rows,
        "verdicts_correct": sum(row["actual"] == row["expected"] for row in rows),
        "false_feasible": sum(row["actual"] == "feasible" and row["expected"] != "feasible" for row in rows),
        "feasible_identified": sum(row["actual"] == row["expected"] == "feasible" for row in rows),
        "evidence_correct": sum(row["evidence_correct"] for row in rows),
        "owners_correct": sum(row["owner_correct"] for row in rows),
    }


if __name__ == "__main__":
    print(json.dumps(measure(), indent=2))
