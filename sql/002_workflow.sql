CREATE SCHEMA IF NOT EXISTS procure_pilot;
SET LOCAL search_path = procure_pilot;
-- A single locked aggregate makes review + reservations + events atomic.
-- Intentionally serialized for the demo; partition by SKU/site for production.
CREATE TABLE IF NOT EXISTS workflow_state (
    id integer PRIMARY KEY CHECK (id = 1),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object')
);
INSERT INTO workflow_state VALUES
(1, '{"reviews":{},"actions":{},"events":[],"observations":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;
CREATE OR REPLACE VIEW workflow_review_metrics AS
SELECT r->>'status' AS status, count(*) AS review_count
FROM workflow_state s CROSS JOIN LATERAL jsonb_each(s.state->'reviews') AS e(id, r)
GROUP BY r->>'status';
CREATE OR REPLACE VIEW workflow_delivery_metrics AS
SELECT observation->>'kind' AS observation_kind,
       sum((observation->>'quantity')::integer) AS quantity
FROM workflow_state s CROSS JOIN LATERAL jsonb_array_elements(s.state->'observations') AS o(observation)
GROUP BY observation->>'kind';
