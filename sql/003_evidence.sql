CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS procure_pilot;
CREATE TABLE IF NOT EXISTS procure_pilot.evidence_vectors (
    dataset text NOT NULL,
    encoder text NOT NULL,
    passage_id text NOT NULL,
    order_id text NOT NULL,
    model text NOT NULL,
    roles text[] NOT NULL,
    title text NOT NULL,
    passage text NOT NULL,
    embedding vector NOT NULL,
    PRIMARY KEY (dataset, encoder, passage_id)
);
