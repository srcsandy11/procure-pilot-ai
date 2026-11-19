import os
import unittest

from procure_pilot.__main__ import STAGES
from procure_pilot.decision import evaluate, instant
from procure_pilot.store import fixture_snapshot, postgres_snapshot


def scenario(stage="confirmed", plan="SPLIT-B", reader=fixture_snapshot):
    as_of = instant(STAGES[stage])
    order, plans, offers, split = reader("SO-1001", as_of)
    return order, plans[plan], offers, split, as_of


class Decisions(unittest.TestCase):
    def test_original_order_needs_two_confirmations(self):
        decision = evaluate(*scenario("initial"))
        self.assertEqual(decision.verdict, "needs confirmation")
        self.assertEqual({f.owner for f in decision.findings}, {"Procurement", "Sales"})

    def test_dispatch_alone_cannot_establish_arrival(self):
        self.assertEqual(evaluate(*scenario(plan="DIRECT-A")).verdict, "needs confirmation")

    def test_confirmed_split_is_feasible(self):
        result = evaluate(*scenario())
        self.assertEqual(result.verdict, "feasible")
        self.assertIn("CUSTOMER-ACK-1", result.evidence)
        self.assertIn("QUOTE-B v1", result.evidence)

    def test_revision_affects_80_units(self):
        result = evaluate(*scenario("revised"))
        self.assertEqual(result.verdict, "infeasible")
        self.assertEqual(len(result.findings), 1)
        self.assertIn("80 units", result.findings[0].action)
        self.assertEqual(result.findings[0].evidence, "QUOTE-B v2")

    def test_missing_certificate(self):
        order, legs, offers, split, time = scenario()
        offers["QUOTE-B"]["certificate"] = None
        self.assertEqual(evaluate(order, legs, offers, split, time).verdict, "needs confirmation")

    def test_rejected_split(self):
        order, legs, offers, split, time = scenario()
        split["allowed"] = False
        self.assertEqual(evaluate(order, legs, offers, split, time).verdict, "infeasible")

    def test_insufficient_stock(self):
        order, legs, offers, split, time = scenario()
        offers["WH-1"]["available"] = 19
        res = evaluate(order, legs, offers, split, time)
        self.assertEqual(res.verdict, "infeasible")
        self.assertIn("shortfall of 1", res.findings[0].action)

    def test_duplicate_allocation_rejected(self):
        order, legs, offers, split, time = scenario()
        with self.assertRaises(ValueError):
            evaluate(order, legs + [legs[0]], offers, split, time)

    def test_missing_quote_cannot_qualify(self):
        order, legs, offers, split, time = scenario()
        del offers["WH-1"]
        self.assertEqual(evaluate(order, legs, offers, split, time).verdict, "needs confirmation")

    def test_expiry_requires_refresh(self):
        order, legs, offers, split, time = scenario()
        offers["QUOTE-B"]["valid_until"] = "2026-11-20T01:00:00+05:30"
        self.assertEqual(evaluate(order, legs, offers, split, time).verdict, "needs confirmation")

    def test_wrong_sku_is_infeasible(self):
        order, legs, offers, split, time = scenario()
        offers["QUOTE-B"]["sku"] = "T20-H"
        self.assertEqual(evaluate(order, legs, offers, split, time).verdict, "infeasible")

    def test_exact_cutoff_and_one_minute_late(self):
        order, legs, offers, split, time = scenario()
        for arrival, verdict in [
            ("2026-11-27T11:30:00+00:00", "feasible"),
            ("2026-11-27T11:31:00+00:00", "infeasible"),
        ]:
            with self.subTest(arrival=arrival):
                offers["WH-1"]["arrival"] = arrival
                self.assertEqual(evaluate(order, legs, offers, split, time).verdict, verdict)

    def test_dispatch_after_deadline_rules_out_candidate(self):
        order, legs, offers, split, time = scenario(plan="DIRECT-A")
        offers["QUOTE-A"]["dispatch"] = "2026-11-28T09:00:00+05:30"
        self.assertEqual(evaluate(order, legs, offers, split, time).verdict, "infeasible")

    def test_different_unit_and_destination(self):
        for field, value in [("unit", "box"), ("destination", "Cuttack")]:
            with self.subTest(field=field):
                order, legs, offers, split, time = scenario()
                offers["QUOTE-B"][field] = value
                self.assertEqual(evaluate(order, legs, offers, split, time).verdict, "infeasible")

    @unittest.skipUnless(os.environ.get("PROCURE_TEST_POSTGRES") == "1", "requires seeded PostgreSQL")
    def test_postgres_matches_fixture(self):
        for stage in STAGES:
            for plan in ("DIRECT-A", "SPLIT-B"):
                expected = evaluate(*scenario(stage, plan))
                actual = evaluate(*scenario(stage, plan, postgres_snapshot))
                self.assertEqual(actual.verdict, expected.verdict)
                self.assertEqual(actual.evidence, expected.evidence)
                self.assertEqual([(f.status, f.evidence, f.owner) for f in actual.findings],
                                 [(f.status, f.evidence, f.owner) for f in expected.findings])
