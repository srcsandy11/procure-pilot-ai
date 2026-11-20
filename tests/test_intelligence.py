import unittest
from procure_pilot.intelligence import retrieve, extract, draft


class IntelligenceTests(unittest.TestCase):
    def test_retrieval_is_order_scoped_and_empty_when_unmatched(self):
        docs = [{"id": "a", "order_id": "SO-1", "title": "Arrival", "text": "Arrival tomorrow", "model": "T20", "roles": ["procurement"]},
                {"id": "b", "order_id": "SO-2", "title": "Arrival", "text": "Arrival tomorrow", "model": "T20", "roles": ["procurement"]}]
        self.assertEqual([d['id'] for d in retrieve('arrival', 'SO-1', docs)], ['a'])
        self.assertEqual(retrieve('arrival', 'SO-3', docs), [])
        self.assertEqual(retrieve('unrelated', 'SO-1', docs), [])

    def test_held_out_queries_find_relevant_sources(self):
        cases = [("customer split approval", "CUSTOMER-ACK-1"), ("warehouse arrival confirmation", "WH-1-v2"), ("direct dispatch arrival", "QUOTE-A-v1"), ("revised supplier arrival", "QUOTE-B-v2")]
        for query, expected in cases:
            with self.subTest(query=query):
                self.assertIn(expected, [d["id"] for d in retrieve(query, "SO-1001")])

    def test_evidence_revision_window(self):
        def documents_at(when):
            return {doc["id"]: doc["text"] for doc in retrieve("arrival", "SO-1001", limit=20, as_of=when)}
        initial = documents_at("2026-11-19T12:00:00+05:30")
        self.assertNotIn("WH-1-v2", initial)
        confirmed = documents_at("2026-11-20T12:00:00+05:30")
        self.assertIn("WH-1-v2", confirmed)
        self.assertNotIn("QUOTE-B-v2", confirmed)
        self.assertNotIn("v2", confirmed["QUOTE-B-v1"])
        revised = documents_at("2026-11-21T09:00:00+05:30")
        self.assertIn("QUOTE-B-v2", revised)
        self.assertNotIn("QUOTE-B-v1", revised)

    def test_exact_model_and_role_scope(self):
        self.assertEqual([d["id"] for d in retrieve("datasheet", "SO-1001", model="T20-H")], ["DATASHEET-T20-H"])
        self.assertNotIn("DATASHEET-T20-H", [d["id"] for d in retrieve("datasheet T20 H", "SO-1001", model="T20")])
        self.assertNotIn("POLICY-PRICING", [d["id"] for d in retrieve("commercial procurement policy", "SO-1001", role="sales")])

    def test_extraction_does_not_invent_fields(self):
        self.assertEqual(extract('SO-1001 quantity: 80; arrival: 2026-11-30T12:00:00+05:30')['quantity'], 80)
        self.assertIsNone(extract('Dispatch tomorrow')['arrival'])
        self.assertIsNone(extract('No certificate information')['certificate'])

    def test_draft_has_sources_and_handles_missing_evidence(self):
        self.assertIn('[A]', draft('SO-1', 'When?', [{'id': 'A', 'text': 'Arrival unknown.'}]))
        self.assertIn('need more evidence', draft('SO-1', 'When?', []))


if __name__ == '__main__':
    unittest.main()
