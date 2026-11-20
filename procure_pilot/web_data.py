"""Regenerate the dashboard's fixture and dated decisions from Python."""
from collections import defaultdict
import json
from pathlib import Path

from .__main__ import STAGES, replay
from .intelligence import load_corpus
from .store import fixture_snapshot

ROOT = Path(__file__).resolve().parents[1]


def render():
    fixture = json.loads((ROOT / "data" / "demo.json").read_text())
    stages = defaultdict(list)
    for order in fixture["orders"]:
        for decision in replay(fixture_snapshot, order["id"], STAGES):
            stages[decision["stage"]].append(decision)
    data = {"fixture": fixture, "stages": stages, "documents": load_corpus()}
    return "window.PPData = " + json.dumps(data, indent=2) + ";\n"


if __name__ == "__main__":
    (ROOT / "site" / "dist" / "data.js").write_text(render())
