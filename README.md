# Procure Pilot

Procure Pilot is a distributor workbench for deciding whether sales can promise a customer a delivery. Replay a fictional request for 100 calibrated T20 loggers in Bhubaneswar, trace the evidence behind two supply plans, review an allocation, and see what changes when the supplier revises its arrival date.

## Open the workbench

Open `site/dist/index.html` directly, or serve the same files locally:

```sh
python3 -m http.server 8000 --directory site/dist
```

Open http://localhost:8000. The dashboard runs in the browser. Operational records are fictional. Lead discovery links to real public sources and labels prospective buyers as unqualified. Browser edits are stored in this browser profile. Opening the dashboard from another origin starts a separate workspace.

| In the dashboard | What to try |
|---|---|
| Decision desk | Start at **Revised** and inspect the late 80-unit leg. Switch to **Initial** to see which two confirmations the split needs. Select **Confirmed**, approve the split and return to **Revised** to reopen the commitment. |
| Action inbox | Filter by owner, inspect the evidence and record human review of the next action. |
| Fulfilment | Compare the separate partial-delivery case's dispatch, receipt and customer count. Resolve the remaining 20 units using the evidence form. |
| Document intelligence | Search dated quotes, exact-model datasheets and policies. Select the product and role, inspect source passages and review a draft. Scoped TF-IDF search runs on the device. On a hosted page, select **Download model and generate** to draft an editable reply from the matching records. |
| Lead discovery | Switch between temperature loggers and corrugated boxes. Follow public evidence, record qualification notes, import CSV/JSON and export a qualified shortlist. |

On-device drafting downloads Flan-T5 Small and its WebAssembly runtime on first use (about 110 MB). The browser sends the question and selected passages to a local worker. Review generated wording against the source records.

The hosted dashboard uses a fixed export from the Python evaluator and independent browser state. For shared database transactions, the local model and restartable workflow, use the Python console below. Demo role selectors illustrate information routing. A deployment with real customer records would require authenticated identities and server-enforced permissions.

## Run the local decision and support workflows

Use Python 3.10 or newer for the dependency-free commands. For optional third-party services, use Python 3.12 in a virtual environment.

```sh
python3 -m procure_pilot demo --stage revised
python3 -m procure_pilot.workflow
python3 -m procure_pilot.intelligence 'confirmed arrival' --order SO-1001 --role procurement --model T20
python3 -m procure_pilot.benchmark
python3 -m unittest discover -s tests -v
```

The decision engine checks model, units, allocation totals, available quantities, destination, certification, split consent, quote validity and arrival time. The workflow records who approved, checks the current evidence again and tracks reservations. The support path keeps purchase orders, shipments, warehouse receipts, customer reports and customer-confirmed receipts separate. Closing a support case requires full confirmed receipt and named resolution.

| Evidence time (IST) | Direct supplier A, 100 | Supplier B, 80 + warehouse, 20 |
|---|---|---|
| 19 November 2026, noon | Dispatch known. Arrival needs confirmation. | Customer split consent and warehouse arrival outstanding. |
| 20 November 2026, noon | Arrival still unknown. | Confirmed split meets the deadline. A human can approve it. |
| 21 November 2026, noon | Arrival still unknown. | QUOTE-B v2 moves arrival to 30 November. The 80 units miss the 27 November deadline. |

To test the cutoff, edit `data/demo.json` in a working copy. Set QUOTE-B revision 2 arrival to 16:59 IST on 27 November and replay the revised stage. Change it to 17:01 to see the verdict change. Run `python3 -m procure_pilot.web_data` to refresh the static dashboard export after changing the fixture or rules.

## Local PostgreSQL and interactive operator console

Use a dedicated empty PostgreSQL database. `init-db` creates its schema and inserts missing seed keys. The database account needs permission to create schema objects. For the optional vector search, install the pgvector extension on the PostgreSQL server and grant permission to enable it.

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-ui.txt
createdb procure_pilot_demo
export DATABASE_URL='postgresql:///procure_pilot_demo'
python -m procure_pilot init-db
python -m procure_pilot demo --store postgres
streamlit run streamlit_app.py
```

The local Streamlit console calls the Python engine directly. Submit the confirmed split, record a named review, then select Revised and inspect Operations. PostgreSQL mode persists pending reviews, approvals, events, reservations and delivery observations. With DATABASE_URL unset, the console holds workflow state in the current Streamlit session. The command `python -m procure_pilot.workflow --store postgres` exercises the durable support and review workflow with sample events.

For this small deployment, one workflow aggregate lives in a PostgreSQL JSONB row. Transactions lock the aggregate and supply tables while rechecking evidence and capacity. This serializes competing approvals. Use the SQL views in `sql/002_workflow.sql` for reporting. The dashboard and local database do not synchronize.

## Local language model and durable human review

Install the optional dependencies and start Ollama with a locally available instruction model. Set `OLLAMA_MODEL` to the installed tag. All model calls are explicit.

```sh
python -m pip install -r requirements-ai.txt
ollama list
python -m procure_pilot.intelligence 'Which arrival threatens the deadline?' --order SO-1001 --ollama-model "$OLLAMA_MODEL"
```

Compare PostgreSQL full-text search with exact pgvector cosine search over the same role-, order- and product-filtered passages. The default encoder produces a reproducible signed term-frequency vector. An installed Ollama embedding model enables a semantic comparison.

```sh
python -m procure_pilot.vector_search 'arrival' --role procurement --product T20
python -m procure_pilot.vector_search 'arrival' --embedding-model "$OLLAMA_EMBEDDING_MODEL"
```

Run the following in **three separate processes** with the same DATABASE_URL to exercise LangGraph's PostgreSQL checkpointer. `start` pauses at human review. `status` reads the persisted thread. `resume` applies the review to the business record and advances the graph. Use a new thread ID for another exercise. A dedicated fresh database makes the approval example reproducible after prior commitments have reserved the order.

```sh
python -m procure_pilot.review_graph start --thread bhubaneswar-001
python -m procure_pilot.review_graph status --thread bhubaneswar-001
python -m procure_pilot.review_graph resume --thread bhubaneswar-001 --action approve --reviewer "Demo reviewer" --stage confirmed
```

Resume against `--stage revised` to see a previously feasible pending approval become stale. The application uses evidence time from the replay. A production decision would use the transaction's current business time.

## Verification and scope

`data/decision_cases.json` includes 20 fictional decision variants, five designated as fixed acceptance cases. The benchmark prints each result plus correct verdicts, decisive evidence references, next owners, false feasible decisions and feasible cases found. These measure the bounded scenarios in the repository. They do not measure outcomes on independent customer orders.

The fixture-based unit suite runs without network access. PostgreSQL parity tests require a configured database:

```sh
PROCURE_TEST_POSTGRES=1 python -m unittest discover -s tests -v
```

The concurrency and restart test additionally requires `PROCURE_TEST_WORKFLOW_RESET=1` and resets the workflow aggregate. Use a disposable test database for that option.

Arbitrary multi-line orders, numeric product tolerances, purchase budgets, MOQ optimization, authenticated multi-tenant access, live ERP integration and sending external messages are outside this demonstration. Lead qualifications and model-produced wording are for human review. For the original project scope, business story and study sequence, see [the project plan](Procure-Pilot-Project-Plan.md).
