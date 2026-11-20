"""Durable LangGraph approval handoff backed by a dedicated demo PostgreSQL DB."""
import argparse
import json
import os
from typing import TypedDict

from .__main__ import STAGES
from .workflow import PostgresWorkflow


class ReviewState(TypedDict, total=False):
    order_id: str
    plan_id: str
    submitted_at: str
    submission_key: str
    review_id: str
    status: str


def build_graph(checkpointer, workflow):
    from langgraph.graph import END, START, StateGraph
    from langgraph.types import interrupt

    def submit(state):
        review = workflow.submit(state["order_id"], state["plan_id"], state["submitted_at"],
                                 submission_key=state["submission_key"])
        return {"review_id": review["id"], "status": review["status"]}

    def review(state):
        record = workflow.resume(state["review_id"])
        response = interrupt({"review_id": state["review_id"], "decision": record["decision"],
                              "action": "Approve or reject after reviewing the evidence."})
        result = workflow.review(state["review_id"], response["action"], response["reviewer"],
                                 "graph/" + state["submission_key"] + "/decision", response["as_of"])
        return {"status": result["status"]}

    graph = StateGraph(ReviewState)
    graph.add_node("submit", submit)
    graph.add_node("review", review)
    graph.add_edge(START, "submit")
    graph.add_edge("submit", "review")
    graph.add_edge("review", END)
    return graph.compile(checkpointer=checkpointer)


def main():
    from langgraph.checkpoint.postgres import PostgresSaver
    from langgraph.types import Command

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("start", "status", "resume"))
    parser.add_argument("--thread", required=True)
    parser.add_argument("--stage", choices=STAGES, default="confirmed")
    parser.add_argument("--plan", default="SPLIT-B")
    parser.add_argument("--action", choices=("approve", "reject"))
    parser.add_argument("--reviewer")
    args = parser.parse_args()
    if args.command == "resume" and (not args.action or not (args.reviewer or "").strip()):
        parser.error("resume requires --action and --reviewer")
    config = {"configurable": {"thread_id": args.thread}}
    with PostgresSaver.from_conn_string(os.environ["DATABASE_URL"]) as saver:
        saver.setup()
        graph = build_graph(saver, PostgresWorkflow())
        before = graph.get_state(config)
        if args.command == "start" and not before.values:
            graph.invoke({"order_id": "SO-1001", "plan_id": args.plan, "submitted_at": STAGES[args.stage],
                          "submission_key": "graph/" + args.thread}, config)
        if args.command == "resume":
            if not before.values:
                parser.error("Unknown thread. Start a thread or check its ID.")
            if before.next:
                graph.invoke(Command(resume={"action": args.action, "reviewer": args.reviewer,
                                             "as_of": STAGES[args.stage]}), config)
        snapshot = graph.get_state(config)
        print(json.dumps({"thread": args.thread, "state": snapshot.values, "next": snapshot.next}, indent=2))


if __name__ == "__main__":
    main()
