"""Compare scoped PostgreSQL full-text and exact pgvector cosine rankings."""
import argparse
from collections import Counter
import hashlib
import json
import math
import os
import re
from urllib.request import Request, urlopen

from .intelligence import load_corpus
from .store import ROOT, connection


def term_vector(text):
    vector = [0.0] * 256
    for term, count in Counter(re.findall(r"[a-z0-9]+", text.lower())).items():
        digest = hashlib.sha256(term.encode()).digest()
        vector[digest[0]] += (1 if digest[1] % 2 else -1) * (1 + math.log(count))
    return vector


def encode(texts, model):
    if model is None:
        return [term_vector(text) for text in texts]
    base = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    if "://" not in base:
        base = "http://" + base
    request = Request(base + "/api/embed", data=json.dumps({"model": model, "input": texts}).encode(),
                      headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=180) as response:
        vectors = json.load(response)["embeddings"]
    if len(vectors) != len(texts) or not all(vectors):
        raise ValueError("Embedding server returned an incomplete batch")
    return vectors


def compare(query, order_id="SO-1001", role="procurement", product="T20", model=None, limit=4):
    if not query.strip():
        raise ValueError("Enter a search query")
    corpus = load_corpus()
    dataset = hashlib.sha256(json.dumps(corpus, sort_keys=True).encode()).hexdigest()
    encoder = "ollama/" + model if model else "signed-log-term-frequency-256/v1"
    with connection() as db:
        db.execute((ROOT / "sql/003_evidence.sql").read_text())
        present = db.execute("""
            SELECT count(*) AS n FROM procure_pilot.evidence_vectors WHERE dataset=%s AND encoder=%s
        """, (dataset, encoder)).fetchone()["n"]
        if present != len(corpus):
            vectors = encode([doc["title"] + " " + doc["text"] for doc in corpus], model)
            for doc, vector in zip(corpus, vectors):
                db.execute("""
                    INSERT INTO procure_pilot.evidence_vectors
                    (dataset, encoder, passage_id, order_id, model, roles, title, passage, embedding)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::vector) ON CONFLICT DO NOTHING
                """, (dataset, encoder, doc["id"], doc["order_id"], doc["model"], doc["roles"],
                      doc["title"], doc["text"], json.dumps(vector)))
        scope = (dataset, encoder, order_id, product, role)
        query_vector = json.dumps(encode([query], model)[0])
        vector = db.execute("""
            SELECT passage_id, title, passage, 1 - (embedding <=> %s::vector) AS score
            FROM procure_pilot.evidence_vectors
            WHERE dataset=%s AND encoder=%s AND order_id=%s AND model=%s AND %s=ANY(roles)
            AND (embedding <=> %s::vector) < 1
            ORDER BY score DESC, passage_id LIMIT %s
        """, (query_vector, *scope, query_vector, limit)).fetchall()
        keyword = db.execute("""
            WITH ranked AS (
                SELECT passage_id,title,passage,ts_rank(to_tsvector('english',title || ' ' || passage),
                  plainto_tsquery('english', %s)) AS score FROM procure_pilot.evidence_vectors
                WHERE dataset=%s AND encoder=%s AND order_id=%s AND model=%s AND %s=ANY(roles))
            SELECT * FROM ranked WHERE score>0 ORDER BY score DESC, passage_id LIMIT %s
        """, (query, *scope, limit)).fetchall()
    return {"encoder": encoder, "keyword": keyword, "vector": vector}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question")
    parser.add_argument("--order", default="SO-1001")
    parser.add_argument("--role", default="procurement")
    parser.add_argument("--product", default="T20")
    parser.add_argument("--embedding-model", help="Use a locally installed Ollama embedding model")
    args = parser.parse_args()
    print(json.dumps(compare(args.question, args.order, args.role, args.product, args.embedding_model), indent=2))
