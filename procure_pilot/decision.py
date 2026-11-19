"""Evaluate a proposed allocation using evidence available at the decision time."""

from dataclasses import dataclass
from datetime import datetime


def instant(value):
    result = datetime.fromisoformat(value) if isinstance(value, str) else value
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError("Timestamp must include its UTC offset")
    return result


@dataclass(frozen=True)
class Finding:
    status: str
    evidence: str
    owner: str
    action: str


@dataclass(frozen=True)
class Decision:
    verdict: str
    findings: list[Finding]
    evidence: list[str]


def evaluate(order, legs, offers, split, as_of):
    """Evaluate explicit legs. Every source may be allocated only once per plan."""
    findings = []
    evidence = [order["id"]]
    sources = [leg["source"] for leg in legs]
    if len(sources) != len(set(sources)) or any(leg["quantity"] <= 0 for leg in legs):
        raise ValueError("Allocations must be positive and use distinct sources")

    def issue(status, ref, owner, action):
        findings.append(Finding(status, ref, owner, action))

    if sum(leg["quantity"] for leg in legs) != order["quantity"]:
        issue("contradicted", order["id"], "Procurement", "Correct the allocation total to match the requested quantity.")
    if len(legs) > 1:
        if split:
            evidence.append(split["evidence"])
        if split is None:
            issue("unknown", order["id"], "Sales", "Ask the customer to confirm split delivery.")
        elif not split["allowed"]:
            issue("contradicted", split["evidence"], "Sales", "Find an option with one delivery or obtain revised terms.")

    for leg in legs:
        source = leg["source"]
        offer = offers.get(source)
        if offer is None:
            issue("unknown", source, "Procurement", "Obtain a supply record for this source.")
            continue
        ref = f"{source} v{offer['revision']}"
        evidence.append(ref)
        if instant(offer["valid_until"]) < as_of:
            issue("unknown", ref, "Procurement", "Refresh the expired supply terms.")
            continue
        for field in ("sku", "unit", "destination"):
            if offer[field] != order[field]:
                issue("contradicted", ref, "Procurement", f"Find a source matching the requested {field} ({order[field]}).")
        if offer["available"] < leg["quantity"]:
            issue("contradicted", ref, "Procurement", f"Cover the shortfall of {leg['quantity'] - offer['available']} units.")
        if order["certificate_required"] and offer["certificate"] is not True:
            status = "unknown" if offer["certificate"] is None else "contradicted"
            issue(status, ref, "Procurement", "Obtain confirmation of the required certificate or find a certified source.")
        if offer["arrival"] is None:
            if offer["dispatch"] and instant(offer["dispatch"]) > instant(order["deadline"]):
                issue("contradicted", ref, "Procurement", f"Find earlier supply for {leg['quantity']} units. Dispatch falls after the arrival deadline.")
            else:
                issue("unknown", ref, "Procurement", f"Confirm arrival of {leg['quantity']} units in {order['destination']} by {order['deadline']}.")
        elif instant(offer["arrival"]) > instant(order["deadline"]):
            issue("contradicted", ref, "Procurement", f"Find earlier supply for {leg['quantity']} units. Arrival is {offer['arrival']}.")
    if any(f.status == "contradicted" for f in findings):
        verdict = "infeasible"
    elif findings:
        verdict = "needs confirmation"
    else:
        verdict = "feasible"
    return Decision(verdict, findings, evidence)
