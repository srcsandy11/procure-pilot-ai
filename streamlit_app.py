"""Local operator console. Run with streamlit run streamlit_app.py."""
import os

import streamlit as st

from procure_pilot.__main__ import STAGES, replay
from procure_pilot.intelligence import draft, ollama_answer, retrieve
from procure_pilot.store import fixture_snapshot, postgres_snapshot
from procure_pilot.workflow import PostgresWorkflow, Workflow

st.set_page_config(page_title="Procure Pilot | Operator console", layout="wide")
st.title("Procure Pilot")
st.caption("Local operator console · fictional SO-1001 · Bhubaneswar")
database = bool(os.getenv("DATABASE_URL"))
st.sidebar.write("PostgreSQL connected mode" if database else "Session-only fixture mode")
if "workflow" not in st.session_state:
    st.session_state.workflow = PostgresWorkflow() if database else Workflow()
workflow = st.session_state.workflow
reader = postgres_snapshot if database else fixture_snapshot
stage = st.sidebar.selectbox("Evidence revision", list(STAGES), index=1)
at = STAGES[stage]
st.sidebar.caption(at)
decisions, inbox, intelligence, analytics = st.tabs(["Supply decisions", "Review", "Evidence desk", "Operations"])

with decisions:
    st.subheader("Supply plans")
    for row in replay(reader, "SO-1001", {stage: at}):
        with st.container(border=True):
            st.markdown(f"**{row['plan']} · {row['verdict'].capitalize()}**")
            st.caption(" · ".join(row["evidence"]))
            for finding in row["findings"]:
                st.write(f"{finding['owner']} — {finding['action']}")
            if st.button("Submit for review", key=row["plan"], disabled=row["verdict"] != "feasible"):
                review = workflow.submit("SO-1001", row["plan"], at)
                st.session_state.review_id = review["id"]
                st.success(f"Submitted review {review['id']}")

with inbox:
    st.subheader("Review and reserve")
    with st.form("review"):
        review_id = st.text_input("Review ID", value=st.session_state.get("review_id", ""))
        reviewer = st.text_input("Reviewer name")
        action = st.radio("Decision", ["approve", "reject"], horizontal=True)
        if st.form_submit_button("Record decision"):
            if not review_id.strip() or not reviewer.strip():
                st.error("Enter a review ID and reviewer name.")
            else:
                try:
                    result = workflow.review(review_id.strip(), action, reviewer.strip(), f"{review_id}:{action}:{reviewer.strip()}", at)
                    st.write(result["status"].capitalize(), "—", result["reason"])
                except (ValueError, KeyError) as exc:
                    st.error(str(exc))

with intelligence:
    st.subheader("Ask about SO-1001")
    if st.session_state.get("answer_at") != at:
        st.session_state.pop("answer", None)
        st.session_state.pop("sources", None)
    with st.form("evidence"):
        question = st.text_input("Question", "Which supplier confirmed arrival?")
        model = st.text_input("Local Ollama model (optional)")
        if st.form_submit_button("Retrieve evidence"):
            docs = retrieve(question, "SO-1001", as_of=at)
            st.session_state.answer_at = at
            st.session_state.answer = draft("SO-1001", question, docs)
            if model.strip():
                try:
                    st.session_state.answer = ollama_answer(question, docs, model.strip())
                except Exception as exc:
                    st.error(f"Local model unavailable: {exc}")
            st.session_state.sources = docs
    if "answer" in st.session_state:
        st.text_area("Draft for review", key="answer", height=200)
        st.dataframe(st.session_state.sources, hide_index=True)

with analytics:
    report = workflow.metrics(at)
    counts = st.columns(3)
    for column, label, key in zip(counts, ("Awaiting review", "Approved", "Reserved units"), ("pending", "approved", "reserved_units")):
        column.metric(label, report[key])
    st.subheader("Commitments at risk")
    if report["at_risk"]:
        st.json(report["at_risk"])
    else:
        st.write("No approved commitments at risk at this evidence revision.")
    st.subheader("Fulfilment observations")
    st.dataframe([report["observations"]], hide_index=True)
