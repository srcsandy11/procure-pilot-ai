"""Human review, reservations and delivery observations for the seeded scenario.

The default store is process-local. PostgresWorkflow serializes mutations under
one database row lock, rechecks supply while holding table locks, and commits the
review, reservation and inbox event together. This intentionally favors a small,
correct demo over throughput. No external messages are sent.
"""
import argparse
import copy
import hashlib
import json
from dataclasses import asdict
from uuid import uuid4

from .decision import evaluate, instant
from .store import ROOT, connection, fixture_snapshot, postgres_snapshot


def _evidence_version(order, legs, offers, split):
    payload = [order, legs, {l["source"]: offers.get(l["source"]) for l in legs}, split]
    encoded = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


class Workflow:
    def __init__(self, reader=fixture_snapshot, state=None):
        self.reader = reader
        self.state = state if state is not None else {"reviews": {}, "actions": {}, "events": [], "observations": []}

    def submit(self, order_id, plan_id, as_of, submission_key=None):
        at = instant(as_of)
        submissions = self.state.setdefault("submissions", {})
        signature = [order_id, plan_id, at.isoformat()]
        if submission_key is not None:
            if not isinstance(submission_key, str) or not submission_key.strip():
                raise ValueError("Submission key must be a nonempty string")
            prior = submissions.get(submission_key)
            if prior:
                if prior["signature"] != signature:
                    raise ValueError("Submission key already used for a different request")
                return self.resume(prior["review_id"])
        order, plans, offers, split = self.reader(order_id, at)
        if plan_id not in plans:
            raise ValueError("Unknown plan")
        legs = plans[plan_id]
        decision = evaluate(order, legs, offers, split, at)
        review_id = str(uuid4())
        row = dict(id=review_id, order_id=order_id, plan_id=plan_id, status="pending",
                   submitted_at=at.isoformat(), decision=asdict(decision),
                   evidence_version=_evidence_version(order, legs, offers, split),
                   revisions={leg["source"]: offers.get(leg["source"], {}).get("revision") for leg in legs},
                   legs=copy.deepcopy(legs), reviewer=None, reviewed_at=None)
        self.state["reviews"][review_id] = row
        if submission_key is not None:
            submissions[submission_key] = dict(signature=signature, review_id=review_id)
        return copy.deepcopy(row)

    def review(self, review_id, action, reviewer, action_key, as_of):
        at = instant(as_of)
        if action not in ("approve", "reject") or not reviewer.strip() or not action_key.strip():
            raise ValueError("Supply approve/reject, a named reviewer and an action key")
        signature = [review_id, action, reviewer]
        previous = self.state["actions"].get(action_key)
        if previous:
            if previous["signature"] != signature:
                raise ValueError("Action key already used for a different action")
            return copy.deepcopy(previous["result"])
        row = self.state["reviews"].get(review_id)
        if row is None or row["status"] != "pending":
            raise ValueError("Review must exist and be pending")
        if at < instant(row["submitted_at"]):
            raise ValueError("Review cannot predate submission")
        status = "rejected"
        reason = "Human reviewer rejected the plan"
        if action == "approve":
            order, plans, offers, split = self.reader(row["order_id"], at)
            decision = evaluate(order, plans[row["plan_id"]], offers, split, at)
            revisions = {leg["source"]: offers.get(leg["source"], {}).get("revision") for leg in row["legs"]}
            changed = (revisions != row["revisions"] or
                       _evidence_version(order, plans[row["plan_id"]], offers, split) != row["evidence_version"])
            reserved = {}
            for other in self.state["reviews"].values():
                if other["status"] == "approved":
                    for leg in other["legs"]:
                        reserved[leg["source"]] = reserved.get(leg["source"], 0) + leg["quantity"]
            duplicate = any(r["status"] == "approved" and r["order_id"] == row["order_id"] for r in self.state["reviews"].values())
            short = any(offers.get(l["source"], {}).get("available", 0) - reserved.get(l["source"], 0) < l["quantity"] for l in row["legs"])
            if changed or decision.verdict != "feasible":
                status, reason = "stale", "Evidence changed or constraints require a new review"
            elif duplicate or short:
                status, reason = "blocked", "Order already committed or insufficient unreserved supply"
            else:
                status, reason = "approved", "Current evidence rechecked and supply reserved"
        row.update(status=status, reviewer=reviewer, reviewed_at=at.isoformat(), reason=reason)
        event = dict(id=str(uuid4()), review_id=review_id, owner="Sales" if status == "approved" else "Procurement",
                     kind=status, recorded_at=at.isoformat(), message=reason)
        self.state["events"].append(event)
        result = copy.deepcopy(row)
        self.state["actions"][action_key] = dict(signature=signature, result=result)
        return result

    def observe(self, review_id, source, kind, quantity, evidence, as_of):
        at = instant(as_of)
        if kind not in ("shipped", "warehouse_received", "customer_reported", "customer_received", "purchase_ordered"):
            raise ValueError("Unknown observation kind")
        if type(quantity) is not int or quantity <= 0 or not evidence.strip():
            raise ValueError("Positive integer quantity and evidence required")
        row = self.state["reviews"].get(review_id)
        if row is None or row["status"] != "approved":
            raise ValueError("Delivery observations require an approved commitment")
        if at < instant(row["reviewed_at"]):
            raise ValueError("Observation cannot predate approval")
        leg = next((l for l in row["legs"] if l["source"] == source), None)
        if leg is None:
            raise ValueError("Source is not reserved for this commitment")
        observations = self.state["observations"]
        prior = next((o for o in observations if o["review_id"] == review_id and o["kind"] == kind and o["evidence"] == evidence), None)
        if prior:
            if prior["source"] != source or prior["quantity"] != quantity:
                raise ValueError("Evidence already records a different observation")
            return copy.deepcopy(prior)
        total = sum(o["quantity"] for o in observations if o["review_id"] == review_id and o["source"] == source and o["kind"] == kind)
        if total + quantity > leg["quantity"]:
            raise ValueError("Observation exceeds reserved quantity")
        result = dict(id=str(uuid4()), review_id=review_id, source=source, kind=kind, quantity=quantity,
                      evidence=evidence, recorded_at=at.isoformat())
        observations.append(result)
        return copy.deepcopy(result)

    def resume(self, review_id):
        row = self.state["reviews"].get(review_id)
        if row is None:
            raise ValueError("Unknown review")
        return copy.deepcopy(row)

    def open_case(self, review_id, description, evidence, as_of):
        at = instant(as_of)
        row = self.resume(review_id)
        if row["status"] != "approved" or not description.strip() or not evidence.strip():
            raise ValueError("Support requires approved commitment, description and evidence")
        cases = self.state.setdefault("support_cases", {})
        prior = next((c for c in cases.values() if c["review_id"] == review_id and c["evidence"] == evidence), None)
        if prior:
            return copy.deepcopy(prior)
        case = dict(id=str(uuid4()), review_id=review_id, status="open", description=description,
                    evidence=evidence, opened_at=at.isoformat(), owner="Support")
        cases[case["id"]] = case
        return copy.deepcopy(case)

    def close_case(self, case_id, reviewer, resolution_evidence, as_of):
        at = instant(as_of)
        case = self.state.setdefault("support_cases", {}).get(case_id)
        if case is None or not reviewer.strip() or not resolution_evidence.strip():
            raise ValueError("Known case, named reviewer and resolution evidence required")
        if case["status"] == "closed":
            if case["reviewer"] != reviewer or case["resolution_evidence"] != resolution_evidence:
                raise ValueError("Case already closed with different evidence")
            return copy.deepcopy(case)
        row = self.resume(case["review_id"])
        confirmed = sum(o["quantity"] for o in self.state["observations"]
                        if o["review_id"] == row["id"] and o["kind"] == "customer_received"
                        and instant(o["recorded_at"]) <= at)
        if at < instant(case["opened_at"]) or confirmed != sum(l["quantity"] for l in row["legs"]):
            raise ValueError("Closure requires explicit customer receipt of all committed units")
        case.update(status="closed", reviewer=reviewer, resolution_evidence=resolution_evidence, closed_at=at.isoformat())
        return copy.deepcopy(case)

    def reconcile(self, as_of):
        """Persist impact tasks once per evidence version; retain approval history."""
        at = instant(as_of)
        impacts = self.state.setdefault("impacts", {})
        messages = self.state.setdefault("messages", {})
        created = []
        for row in self.state["reviews"].values():
            if row["status"] != "approved" or instant(row["reviewed_at"]) > at:
                continue
            outstanding = {}
            for leg in row["legs"]:
                received = sum(o["quantity"] for o in self.state["observations"]
                    if o["review_id"] == row["id"] and o["source"] == leg["source"]
                    and o["kind"] == "customer_received" and instant(o["recorded_at"]) <= at)
                outstanding[leg["source"]] = leg["quantity"] - received
            if not any(outstanding.values()):
                continue
            order, plans, offers, split = self.reader(row["order_id"], at)
            version = _evidence_version(order, row["legs"], offers, split)
            decision = evaluate(order, row["legs"], offers, split, at)
            key = row["id"] + ":" + version
            if key in impacts or decision.verdict == "feasible":
                continue
            findings = [asdict(f) for f in decision.findings]
            affected = []
            for leg in row["legs"]:
                source = leg["source"]
                relevant = [f for f in findings if f["evidence"] == source or f["evidence"].startswith(source + " v")]
                global_findings = [f for f in findings if not any(f["evidence"] == l["source"] or f["evidence"].startswith(l["source"] + " v") for l in row["legs"])]
                if outstanding[source] and (relevant or global_findings):
                    affected.append(dict(source=source, quantity=outstanding[source], revision=offers.get(source, {}).get("revision")))
            if not affected:
                continue
            impact = dict(id=str(uuid4()), review_id=row["id"], order_id=row["order_id"],
                status="reopened", evidence_version=version, recorded_at=at.isoformat(),
                affected=affected, affected_units=sum(a["quantity"] for a in affected), findings=findings)
            impacts[key] = impact
            created.append(copy.deepcopy(impact))
            for owner in ("Sales", "Procurement"):
                text = (f"Order {row['order_id']}: {impact['affected_units']} outstanding units require review. "
                    + ("Confirm revised customer expectations after procurement confirms recovery. " if owner == "Sales" else "Obtain earlier supply or verified recovery terms. ")
                    + " ".join(f["action"] for f in findings))
                message = dict(id=str(uuid4()), impact_id=impact["id"], review_id=row["id"], owner=owner,
                    status="draft", text=text, evidence_version=version, created_at=at.isoformat(), reviewer=None)
                messages[message["id"]] = message
                self.state["events"].append(dict(id=str(uuid4()), review_id=row["id"], impact_id=impact["id"],
                    owner=owner, kind="commitment_reopened", recorded_at=at.isoformat(),
                    affected=copy.deepcopy(affected), message=text, message_id=message["id"]))
        return created

    def review_message(self, message_id, reviewer, text, as_of):
        """Edit and approve an internal draft; this does not transmit a message."""
        at = instant(as_of)
        message = self.state.setdefault("messages", {}).get(message_id)
        if message is None or not reviewer.strip() or not text.strip():
            raise ValueError("Known draft, named reviewer and message text required")
        if message["status"] == "approved":
            if message["reviewer"] != reviewer or message["text"] != text:
                raise ValueError("Approved message is immutable; create a new draft")
            return copy.deepcopy(message)
        if at < instant(message["created_at"]):
            raise ValueError("Message review cannot predate draft")
        row = self.resume(message["review_id"])
        order, plans, offers, split = self.reader(row["order_id"], at)
        if _evidence_version(order, row["legs"], offers, split) != message["evidence_version"]:
            raise ValueError("Draft evidence changed; reconcile current facts before review")
        message.update(status="approved", text=text, reviewer=reviewer, reviewed_at=at.isoformat())
        return copy.deepcopy(message)

    def role_view(self, role):
        if role not in ("Sales", "Procurement", "Support", "BI"):
            raise ValueError("Unknown role")
        # Presentation scopes only; callers must authenticate role separately.
        return copy.deepcopy(dict(role=role,
            reviews=list(self.state["reviews"].values()) if role in ("Sales", "Procurement") else [],
            inbox=[e for e in self.state["events"] if e["owner"] == role],
            messages=[m for m in self.state.get("messages", {}).values() if m["owner"] == role],
            impacts=list(self.state.get("impacts", {}).values()) if role in ("Sales", "Procurement", "BI") else [],
            observations=self.state["observations"] if role in ("Support", "BI") else [],
            support_cases=list(self.state.get("support_cases", {}).values()) if role == "Support" else []))

    def metrics(self, as_of):
        at = instant(as_of)
        reviews = [r for r in self.state["reviews"].values() if instant(r["submitted_at"]) <= at]
        # This is a current-state operational report, not a historical reconstruction.
        committed = [r for r in reviews if r["status"] == "approved"]
        risks = []
        for row in committed:
            delivered = sum(o["quantity"] for o in self.state["observations"] if o["review_id"] == row["id"]
                            and o["kind"] == "customer_received" and instant(o["recorded_at"]) <= at)
            if delivered >= sum(l["quantity"] for l in row["legs"]):
                continue
            order, plans, offers, split = self.reader(row["order_id"], at)
            decision = evaluate(order, row["legs"], offers, split, at)
            if decision.verdict != "feasible":
                risks.append(dict(review_id=row["id"], order_id=row["order_id"], verdict=decision.verdict,
                                  findings=[asdict(f) for f in decision.findings]))
        return dict(report="current commitments evaluated at supplied evidence time", as_of=at.isoformat(),
                    reviews=len(reviews), pending=sum(r["status"] == "pending" for r in reviews),
                    approved=len(committed), reserved_units=sum(l["quantity"] for r in committed for l in r["legs"]),
                    observations={kind: sum(o["quantity"] for o in self.state["observations"] if o["kind"] == kind and instant(o["recorded_at"]) <= at)
                                  for kind in ("shipped", "warehouse_received", "customer_reported", "customer_received", "purchase_ordered")}, at_risk=risks)


class PostgresWorkflow:
    """Durable version of Workflow. Initialize baseline DB before constructing."""
    def __init__(self):
        with connection() as db:
            db.execute((ROOT / "sql/002_workflow.sql").read_text())

    def _call(self, method, *args, **kwargs):
        from psycopg.types.json import Jsonb
        with connection() as db:
            db.execute("SET LOCAL search_path = procure_pilot")
            # Prevent supply/plan edits until live recheck and state commit complete.
            db.execute("LOCK TABLE orders, plans, plan_legs, offers, split_decisions IN SHARE MODE")
            state = db.execute("SELECT state FROM workflow_state WHERE id = 1 FOR UPDATE").fetchone()["state"]
            workflow = Workflow(postgres_snapshot, state)
            result = getattr(workflow, method)(*args, **kwargs)
            db.execute("UPDATE workflow_state SET state = %s WHERE id = 1", (Jsonb(state),))
            return result

    def submit(self, *args, **kwargs):
        return self._call("submit", *args, **kwargs)

    def review(self, *args, **kwargs):
        return self._call("review", *args, **kwargs)

    def observe(self, *args, **kwargs):
        return self._call("observe", *args, **kwargs)

    def metrics(self, *args, **kwargs):
        return self._call("metrics", *args, **kwargs)

    def resume(self, *args, **kwargs):
        return self._call("resume", *args, **kwargs)

    def open_case(self, *args, **kwargs):
        return self._call("open_case", *args, **kwargs)

    def close_case(self, *args, **kwargs):
        return self._call("close_case", *args, **kwargs)

    def role_view(self, *args, **kwargs):
        return self._call("role_view", *args, **kwargs)

    def reconcile(self, *args, **kwargs):
        return self._call("reconcile", *args, **kwargs)

    def review_message(self, *args, **kwargs):
        return self._call("review_message", *args, **kwargs)


def main():
    parser = argparse.ArgumentParser(description="Run a review, reservation and partial delivery demonstration")
    parser.add_argument("--store", choices=("memory", "postgres"), default="memory")
    args = parser.parse_args()
    workflow = PostgresWorkflow() if args.store == "postgres" else Workflow()
    submitted = workflow.submit("SO-1001", "SPLIT-B", "2026-11-20T12:00:00+05:30")
    reviewed = workflow.review(submitted["id"], "approve", "Demo reviewer", submitted["id"], "2026-11-20T12:05:00+05:30")
    if reviewed["status"] == "approved":
        workflow.observe(reviewed["id"], "QUOTE-B", "purchase_ordered", 80, "DEMO-PO-1", "2026-11-20T12:10:00+05:30")
        workflow.observe(reviewed["id"], "WH-1", "shipped", 20, "DEMO-WH-SHIP-1", "2026-11-20T13:00:00+05:30")
        workflow.observe(reviewed["id"], "QUOTE-B", "shipped", 80, "DEMO-SHIP-1", "2026-11-20T13:00:00+05:30")
        workflow.observe(reviewed["id"], "QUOTE-B", "customer_reported", 60, "DEMO-REPORT-1", "2026-11-20T14:00:00+05:30")
    impacts = workflow.reconcile("2026-11-21T12:00:00+05:30")
    drafts = workflow.role_view("Sales")["messages"]
    approved_message = None
    if drafts:
        approved_message = workflow.review_message(drafts[-1]["id"], "Demo sales reviewer", drafts[-1]["text"], "2026-11-21T12:05:00+05:30")
    before_receipt = workflow.metrics("2026-11-21T12:00:00+05:30")
    support = None
    if reviewed["status"] == "approved":
        support = workflow.open_case(reviewed["id"], "Customer reports only 60 of 100 units", "DEMO-DISPUTE-1", "2026-11-20T14:01:00+05:30")
        workflow.observe(reviewed["id"], "QUOTE-B", "warehouse_received", 80, "DEMO-WH-1", "2026-11-20T14:05:00+05:30")
        workflow.observe(reviewed["id"], "QUOTE-B", "customer_received", 80, "DEMO-CUSTOMER-ACK-B", "2026-11-20T15:00:00+05:30")
        workflow.observe(reviewed["id"], "WH-1", "customer_received", 20, "DEMO-CUSTOMER-ACK-WH", "2026-11-20T15:00:00+05:30")
        support = workflow.close_case(support["id"], "Demo support reviewer", "DEMO-CUSTOMER-RESOLUTION", "2026-11-20T15:05:00+05:30")
    print(json.dumps(dict(review=reviewed, impacts=impacts, approved_message=approved_message, support=support, before_receipt=before_receipt, metrics=workflow.metrics("2026-11-21T12:00:00+05:30")), indent=2))


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        parser_message = str(exc)
        raise SystemExit(parser_message)
