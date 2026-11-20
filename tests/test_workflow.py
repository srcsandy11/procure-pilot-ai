import unittest
import os
from concurrent.futures import ThreadPoolExecutor
from procure_pilot.workflow import Workflow, PostgresWorkflow
from procure_pilot.store import fixture_snapshot

T = "2026-11-20T12:00:00+05:30"
LATER = "2026-11-21T12:00:00+05:30"


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.workflow = Workflow()

    def submit(self, plan="SPLIT-B"):
        return self.workflow.submit("SO-1001", plan, T)["id"]

    def approve(self, identifier=None, key="approve-1", at=T):
        return self.workflow.review(identifier or self.submit(), "approve", "Reviewer", key, at)

    def test_submission_key_resumes_same_review(self):
        first = self.workflow.submit("SO-1001", "SPLIT-B", T, submission_key="thread-1")
        second = self.workflow.submit("SO-1001", "SPLIT-B", T, submission_key="thread-1")
        self.assertEqual(first, second)
        self.approve(first["id"])
        self.assertEqual(self.workflow.submit("SO-1001", "SPLIT-B", T, submission_key="thread-1")["status"], "approved")
        with self.assertRaises(ValueError):
            self.workflow.submit("SO-1001", "DIRECT-A", T, submission_key="thread-1")

    def test_approval_retries_are_idempotent(self):
        identifier = self.submit()
        first = self.approve(identifier)
        self.assertEqual(first, self.approve(identifier))
        self.assertEqual(first["status"], "approved")
        self.assertEqual(len(self.workflow.state["events"]), 1)
        self.assertEqual(self.workflow.metrics(T)["reserved_units"], 100)

    def test_action_key_cannot_be_reused_for_other_action(self):
        first, second = self.submit(), self.submit()
        self.approve(first)
        with self.assertRaises(ValueError):
            self.approve(second)

    def test_second_commitment_blocked(self):
        self.approve()
        second = self.approve(key="approve-2")
        self.assertEqual(second["status"], "blocked")
        self.assertEqual(self.workflow.metrics(T)["reserved_units"], 100)

    def test_stock_is_shared_between_distinct_orders(self):
        def reader(order_id, at):
            order, plans, offers, split = fixture_snapshot("SO-1001", at)
            order["id"] = order_id
            return order, plans, offers, split
        w = Workflow(reader)
        first = w.submit("ORDER-A", "SPLIT-B", T)
        second = w.submit("ORDER-B", "SPLIT-B", T)
        self.assertEqual(w.review(first["id"], "approve", "Reviewer", "A", T)["status"], "approved")
        self.assertEqual(w.review(second["id"], "approve", "Reviewer", "B", T)["status"], "blocked")

    def test_changed_order_requires_fresh_review_even_if_feasible(self):
        changed = False
        def reader(order_id, at):
            order, plans, offers, split = fixture_snapshot(order_id, at)
            if changed:
                order["deadline"] = "2026-11-28T17:00:00+05:30"
            return order, plans, offers, split
        w = Workflow(reader)
        row = w.submit("SO-1001", "SPLIT-B", T)
        changed = True
        self.assertEqual(w.review(row["id"], "approve", "Reviewer", "A", T)["status"], "stale")

    def test_updated_evidence_prevents_approval(self):
        row = self.approve(self.submit(), at=LATER)
        self.assertEqual(row["status"], "stale")
        self.assertEqual(self.workflow.metrics(LATER)["reserved_units"], 0)

    def test_unknown_arrival_prevents_approval(self):
        self.assertEqual(self.approve(self.submit("DIRECT-A"))["status"], "stale")

    def test_rejection_does_not_reserve(self):
        row = self.workflow.review(self.submit(), "reject", "Reviewer", "reject-1", T)
        self.assertEqual(row["status"], "rejected")
        self.assertEqual(self.workflow.metrics(T)["reserved_units"], 0)

    def test_risk_after_supplier_revision(self):
        self.approve()
        metrics = self.workflow.metrics(LATER)
        self.assertEqual(len(metrics["at_risk"]), 1)
        self.assertEqual(metrics["at_risk"][0]["verdict"], "infeasible")
        self.assertIn("80 units", metrics["at_risk"][0]["findings"][0]["action"])

    def test_observation_sources_remain_separate(self):
        identifier = self.approve()["id"]
        w = self.workflow
        w.observe(identifier, "QUOTE-B", "shipped", 80, "SHIP-1", T)
        w.observe(identifier, "QUOTE-B", "customer_reported", 60, "CUSTOMER-1", T)
        first = w.observe(identifier, "QUOTE-B", "warehouse_received", 50, "RECEIPT-1", T)
        self.assertEqual(first, w.observe(identifier, "QUOTE-B", "warehouse_received", 50, "RECEIPT-1", T))
        self.assertEqual(w.metrics(T)["observations"], {"shipped": 80, "warehouse_received": 50, "customer_reported": 60, "customer_received": 0, "purchase_ordered": 0})
        with self.assertRaises(ValueError):
            w.observe(identifier, "QUOTE-B", "warehouse_received", 31, "RECEIPT-2", T)

    def test_invalid_delivery_does_not_mutate(self):
        identifier = self.submit()
        with self.assertRaises(ValueError):
            self.workflow.observe(identifier, "QUOTE-B", "shipped", 1, "SHIP-1", T)
        self.assertEqual(self.workflow.state["observations"], [])

    def test_returned_review_cannot_mutate_reservation(self):
        row = self.approve()
        row["legs"][0]["quantity"] = 999
        self.assertEqual(self.workflow.metrics(T)["reserved_units"], 100)


class SupportTests(unittest.TestCase):
    def setUp(self):
        self.workflow = Workflow()

    def approve(self):
        row = self.workflow.submit("SO-1001", "SPLIT-B", T)
        return self.workflow.review(row["id"], "approve", "Reviewer", "A", T)

    def test_support_closure_requires_actual_customer_receipt(self):
        identifier = self.approve()["id"]
        case = self.workflow.open_case(identifier, "Only 60 arrived", "CALL-1", T)
        self.workflow.observe(identifier, "QUOTE-B", "warehouse_received", 80, "WH-1", T)
        self.workflow.observe(identifier, "QUOTE-B", "customer_reported", 60, "CUSTOMER-1", T)
        with self.assertRaises(ValueError):
            self.workflow.close_case(case["id"], "Support reviewer", "ACK-1", T)
        for source, quantity in [("QUOTE-B", 80), ("WH-1", 20)]:
            self.workflow.observe(identifier, source, "customer_received", quantity, source + "-ACK", T)
        closed = self.workflow.close_case(case["id"], "Support reviewer", "ACK-1", T)
        self.assertEqual(closed["status"], "closed")
        self.assertEqual(self.workflow.metrics(LATER)["at_risk"], [])
        self.assertEqual(self.workflow.role_view("Sales")["observations"], [])
        self.assertEqual(len(self.workflow.role_view("Support")["support_cases"]), 1)


@unittest.skipUnless(os.environ.get("PROCURE_TEST_POSTGRES") == "1" and os.environ.get("PROCURE_TEST_WORKFLOW_RESET") == "1", "requires dedicated PostgreSQL and explicit workflow reset opt-in")
class PostgresWorkflowTests(unittest.TestCase):
    def setUp(self):
        from procure_pilot.store import connection
        self.workflow = PostgresWorkflow()
        # Explicit opt-in test database: clears workflow aggregate only.
        with connection() as db:
            db.execute("UPDATE procure_pilot.workflow_state SET state = %s::jsonb WHERE id = 1",
                       ('{"reviews":{},"actions":{},"events":[],"observations":[]}',))

    def test_restart_retry_and_concurrent_approval(self):
        first = self.workflow.submit("SO-1001", "SPLIT-B", T)
        second = self.workflow.submit("SO-1001", "SPLIT-B", T)
        resumed = PostgresWorkflow()
        self.assertEqual(resumed.resume(first["id"])["status"], "pending")
        def approve(row):
            return resumed.review(row["id"], "approve", "Reviewer", row["id"], T)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(approve, [first, second]))
        self.assertEqual(sorted(r["status"] for r in results), ["approved", "blocked"])
        approved = next(r for r in results if r["status"] == "approved")
        self.assertEqual(resumed.review(approved["id"], "approve", "Reviewer", approved["id"], T), approved)
        self.assertEqual(resumed.metrics(T)["reserved_units"], 100)
        self.assertEqual(len(resumed.role_view("Sales")["inbox"]), 1)
