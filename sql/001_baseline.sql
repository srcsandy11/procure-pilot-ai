CREATE SCHEMA IF NOT EXISTS procure_pilot;
SET LOCAL search_path = procure_pilot;
CREATE TABLE IF NOT EXISTS orders (
    id text PRIMARY KEY, sku text NOT NULL, quantity integer NOT NULL CHECK (quantity > 0),
    unit text NOT NULL, destination text NOT NULL, deadline timestamptz NOT NULL,
    certificate_required boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS split_decisions (
    order_id text REFERENCES orders, recorded_at timestamptz NOT NULL, allowed boolean NOT NULL,
    evidence text NOT NULL, PRIMARY KEY (order_id, recorded_at)
);
CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders
);
CREATE TABLE IF NOT EXISTS plan_legs (
    plan_id text REFERENCES plans, source text, quantity integer NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (plan_id, source)
);
CREATE TABLE IF NOT EXISTS offers (
    source text, revision integer CHECK (revision > 0), recorded_at timestamptz NOT NULL,
    sku text NOT NULL, unit text NOT NULL, available integer NOT NULL CHECK (available >= 0),
    destination text NOT NULL, certificate boolean, dispatch timestamptz, arrival timestamptz,
    valid_until timestamptz NOT NULL, PRIMARY KEY (source, revision),
    CHECK (arrival IS NULL OR dispatch IS NULL OR arrival >= dispatch)
);
