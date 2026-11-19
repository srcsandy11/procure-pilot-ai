# Procure Pilot
## Project plan for a distributor’s sales, procurement, and support teams

**Goal.** Given a customer request, determine whether the distributor can promise the specified item, quantity, destination, and arrival date. Show the evidence, explain any uncertainty, assign the next action, and reopen the decision when a supporting fact changes.

**Working assumptions.** One developer, an existing laptop, a local PostgreSQL database, a local model, and a one-week target for a narrow demonstration. The timetable is an estimate. The tool capabilities below were checked against their documentation. Model quality, laptop performance, and business outcomes require measurement during the build.

### 1. The story the demo must tell

A fictional customer asks for 100 calibrated temperature loggers delivered to Bhubaneswar by Friday, 27 November 2026. Use a precise local cutoff on the request. Supplier A offers 100 at ₹950 each, dispatching Thursday. Supplier B confirms 80 of the required model delivered Thursday at ₹1,020 each. The warehouse has 20 units of that model with appropriate documentation. Its delivery leg and the customer's acceptance of split delivery both need confirmation.

1. Sales enters the request. The system identifies the mandatory requirements and asks about the split.
2. Procurement sees why A needs an arrival commitment and why B plus warehouse stock could cover the order. A dated quote provides commercial terms. A model-specific document supplies technical evidence. SQL calculates available quantities.
3. Once both delivery legs, certification, budget if specified, and split acceptance are confirmed, a reviewer approves the plan. The app reserves the warehouse units and records which quote revision each customer line relies on.
4. B revises its arrival to Monday. The 80 affected units turn the overall Friday commitment at risk. Approval history survives. Procurement receives the specific question for A, and sales receives an editable customer update.
5. In a separate fulfilment scenario, only 80 arrive. Support sees which units were dispatched, received, still outstanding, or disputed. The customer confirms final receipt before support closes the case.

The cost of B's 80 units is ₹81,600 before any additional charges. A complete cost comparison also needs the agreed basis for the warehouse 20, freight, and applicable quote terms. Keep the total unknown until those inputs are comparable. Use invented firms for every quote, order and complaint.

### 2. Architecture and technology decisions

Build a single Python application, one local PostgreSQL database and a small Streamlit interface. Keep ordinary Python functions callable independently from the UI and graph.

| Capability | Implementation | Why it belongs |
|---|---|---|
| Product and order records | PostgreSQL, SQL migrations, psycopg; fixed columns for shared fields and JSONB for product specifications | Joins trace one customer line to its supply. Transactions protect reservations and approvals. |
| Feasibility and suggestions | Pure Python rules over typed records | Quantities, units, mandatory specs and deadlines can be checked repeatedly and tested exactly. |
| Language tasks | Local Ollama model with LangChain and Pydantic schemas | Extract requirements and quote terms, then draft messages a reviewer can edit. A schema validates shape; source checks validate meaning. |
| Document questions | Versioned passages with source IDs, model numbers and visibility. Baseline with PostgreSQL keyword search, then compare exact vector retrieval with pgvector and local embeddings. | Qualifiers such as “available on request” and exact suffixes matter. Measure which approach retrieves the right evidence before adding complexity. |
| Human handoffs | One LangGraph workflow with a PostgreSQL checkpointer and one thread per request | Pause for a reply or approval, resume after a restart, and branch to clarification or reassessment. |
| Communication and BI | Role-scoped in-app inboxes and SQL views over events | Customer, supplier and support each see an appropriate next action. Managers see commitments needing attention. |

Use one generation model at first. Select a locally runnable model by trying a clear request, an ambiguous quote, and a missing field on the actual laptop. Record model ID, latency, and extraction errors. Keep manual entry and review functional when the model is unavailable. Add approximate vector indexes only when retrieval latency on a larger corpus justifies them. Defer fine-tuning, multiple autonomous agents, a live SAP integration, external messaging, and a separate frontend to later versions.

**Hosting.** Run the interactive demo locally on existing hardware to avoid paid API and hosting dependencies. Share a recording, a reproducible repository, and optionally a public static walkthrough on GitHub Pages. A hosted interactive Python backend with persistent PostgreSQL and a local model is a separate deployment milestone.

### 3. Data and accountability

| Group | Minimum records | Important relationship or rule |
|---|---|---|
| Discovery | Companies, products, lead evidence | Role belongs to company + product + opportunity. Store URL, short supporting passage, source date if known, and date checked. Deduplicate companies by verified identity. |
| Demand | Requests and customer order lines | Keep quantity, unit, destination, timezone, deadline, required specs, permitted equivalents and split preference. Unknown fields stay unknown. |
| Supply | Versioned quotes and lines, inventory and reservations, supplier purchase lines | A candidate plan explicitly assigns quantities from supply sources to a customer line. An approved allocation points to the precise quote version. |
| Knowledge | Documents, versions, passages, embedding metadata | Each passage retains company, model, scope, page or section, and version. Filter by permission and product before retrieval. |
| Fulfilment | Shipment lines, receipt lines, support cases | Keep the warehouse receipt, carrier event, customer receipt and customer-reported quantity distinguishable. Aggregate by order line, participant and shipment leg. |
| History | Decisions, evidence references, approvals, messages, timestamped events, AI runs | Save reviewer, audience, previous decision and revision. A stable event key prevents repeated actions. |

Graph checkpoints hold execution progress. Business tables hold the approved record. On approval, recheck current versions and stock inside one transaction, lock the relevant stock rows, reserve units, and write the approval and in-app event together. A retry with the same approval key returns the committed result. A newer quote invalidates pending decisions that used the superseded terms.

### 4. Lead generation for suppliers and prospective customers

Start from a product brief. Generate two query sets: product and model terms plus manufacturer/distributor/geography for suppliers; applications, operating industries and geography for buyers. The zero-service-cost route is guided public search plus URL/CSV intake. A search connector can later automate candidate collection. Label imported, discovered and qualified records distinctly.

Retrieve relevant public pages, find supporting passages, deduplicate, and rank by evidence. Supplier ranking favours a documented exact model over a broad category match. Buyer ranking favours explicit use over inferred industry fit. Store the qualification question alongside every lead. Reuse existing supplier leads until evidence is stale or the order has a coverage gap.

| Starting lead | Evidence to retain | What a person must still qualify |
|---|---|---|
| Giriraj, supplier | TLog product/application page for pharmaceutical monitoring | Model, availability and current delivery terms. [Company page](https://www.giriraj.co.in/pharmaceutical.html) |
| Lisaline Asia, supplier | Data logger product range | Exact specifications, dated quote and stock. [Company page](https://lisalineasia.com/temperature-and-humidity-data-logger/) |
| Blue Dart, prospective customer | Temperature loggers listed in temperature-controlled logistics services | Decision owner, current need and buying process. [Company page](https://api.bluedart.com/temperature-controlled-logistics) |
| TCI Express, prospective customer | FY2024 annual report describes use in cold-chain operations | Whether the historical use is current and whether a procurement opportunity exists. [Annual report](https://www.tciexpress.in/images/pdf/1192_AnnualReportFY2024.pdf) |

Test the same workflow with corrugated boxes. Switch required specs to internal dimensions, ply, units per bundle and acceptable equivalents. Keep the company, request, evidence, decision and approval structures the same.

### 5. Decision procedure and RAG

1. Extract requirements, preserving the original message and evidence for each field. Resolve ambiguous dates, units, product variants and substitutions with the request owner.
2. Read exact quantities, allocations, prices and deadlines from SQL. Choose candidate sources from approved stock and eligible quotes. For the first demo enumerate single-source options and one supplier-plus-warehouse split.
3. Retrieve authorized passages for unresolved documentary questions. Search section-sized chunks that retain table headings and units. For each claim, save the quote revision or document section used. Cache extraction by document version and model/prompt version.
4. Mark each mandatory constraint confirmed, contradicted or unknown. A known contradiction makes that candidate infeasible under current terms. Otherwise an unresolved mandatory fact means it needs confirmation. A plan is feasible when all required facts are confirmed, including every delivery leg. Optional preferences rank feasible plans. An explicit maximum budget is a hard constraint.
5. Return verdict, evidence, alternatives, missing fact, next action and owner. Ask the smallest question whose answer could change the decision. With a dispatch-only quote, procurement asks for arrival at the named destination by the cutoff.
6. Pause for the named reviewer. Approve, edit, reject or request clarification. Put only the approved wording in the recipient’s inbox. Track promises and re-evaluate affected allocations after an update. Compare new facts to the last approved version and show the precise change.

### 6. Seven build sessions

| Session | Build in this order | Completion check |
|---|---|---|
| 1. Data and baseline | Write three fixtures and their expected answers. Create PostgreSQL schema and seed script. Query demand, available inventory, quote revision and delivery terms for one request. | A terminal command explains why Thursday dispatch leaves Friday delivery unknown. You can explain the joins yourself. |
| 2. Decisions and handoffs | Implement evaluate_plan and the three outcomes. Add direct and split plans, a manual review screen and timestamped inbox messages. | Change exactly one term and observe exactly which decision and owner change. |
| 3. Product discovery | Build product brief, paired search terms, URL intake, source capture, deduplication and the two ranked lists. | Two supplier and two prospective customer leads each have a source and an open qualification question. Repeat with a box brief. |
| 4. Language and retrieval | Try a local model on the laptop. Extract required fields with LangChain. Import a datasheet, near-match datasheet, two quotes and one policy. Add keyword retrieval, then pgvector. | Ask one answerable and one unsupported question. Show exact evidence for the first and the missing fact for the second. |
| 5. Approvals and revisions | Wrap existing functions in one LangGraph workflow. Persist checkpoints, resume by request ID, revalidate approval and handle duplicate events. | Restart during review, approve once, replay the approval, revise the quote and see the impacted case reopen. |
| 6. Support and BI | Add shipment/receipt comparison, vendor reply, human-reviewed customer update, closure and an at-risk queue. | Explain where the 20 units are or who must verify them. Each role sees its own records. |
| 7. Evaluation and handoff | Run the fixed cases plus system checks. Log failures, fix the most consequential, repeat, and record actual results. Package a one-command seed/reset and a five-minute demo. | A fresh local run reproduces the example. You can trace one bad result to a record, a passage, a rule or a prompt. |

**Time trade-off.** If week one is tight, finish sessions 1–2 and 4–5 with a saved example shortlist and a minimal at-risk queue. Then complete discovery automation, fulfilment breadth and the second-product exercise. Report the features actually demonstrated. Preserve the changed-commitment demo and evidence checks.

### 7. Edge cases and evaluation

Before tuning, label 20 small orders with expected verdict, decisive evidence, next action and owner. Reserve five unseen cases until the final run. Use the same inputs for the manual/rules baseline and AI-assisted workflow. Keep operational failure tests separate from the decision score.

| Test family | Example | Expected behaviour |
|---|---|---|
| Exact product | T20 versus T20-H, optional certificate, substitute proposed | Ask for the required evidence or explicit acceptance; a near-match stays unqualified. |
| Units and cost | Per box versus per piece, missing pack size or freight, minimum order quantity | Convert only documented units. Keep unknown cost visible; enforce budget when mandatory. |
| Lead quality | Historic buyer signal, reseller mirror, company both buys and supplies | Preserve source dates, merge duplicates and keep roles per product. |
| Supply feasibility | 80 + 20, stock already allocated, split refused | Verify each leg and split permission, recalculate when a source cannot cover its allocation. |
| Timing | Dispatch versus arrival, vague Friday, quote expires during review | Ask for the relevant commitment or rerun against the new terms. |
| Conflicting evidence | Customer reports 80, dispatch says 100, receipt missing | Preserve both claims. Assign receiving verification and avoid an unsupported replacement promise. |
| Concurrency and retries | Two requests claim the same stock; reviewer double-clicks | One reservation wins for the contested stock. Each approved action produces one message. |
| Access and model failure | Unauthorized quote, misleading instructions in a PDF, unavailable model | Scope retrieval by participant, treat document text only as evidence and allow manual resolution. |
| Vendor silence | No response by the assigned follow-up time | Keep the case open, mark it overdue, and offer a qualified alternate supplier. |

**Report the counts.** Track unsupported promises, correctly recognized feasible cases, unnecessary clarifications, correct owner/action, and answers whose cited passage supports the claim. For retrieval, compare correct passage in the top three for keyword and vector methods. Log model version, prompt version, source IDs, elapsed time, reviewer edits and failure category. Target zero unsupported promises on the fixed suite and check feasible cases to catch an overly cautious system. Report denominators and held-out results separately. A small test suite demonstrates behaviour on those cases.

**Operational dashboard.** Start with a table of customer commitment, units at risk, changed fact, next owner, next action and time waiting. Add supplier response time from request/reply events and lead qualification rate from reviewed leads. Each number should open the underlying cases. Label fictional BI data as demo data.

### 8. Learning and portfolio outcome

Use the first hour to write the order, its competing quotes and expected decisions by hand. Implement the decision function yourself. Use coding assistance for setup and UI scaffolding. End each session by closing your notes and explaining one business rule, one implementation decision and one failing example.

The final portfolio package is a runnable project, seed data, a small architecture diagram, a test-results table with actual counts, and a five-minute walkthrough. Show the approval changing when the supplier revises its promise. Discuss one example the model got wrong and the change that fixed it. In interviews describe the ERP as a SAP-style simulation and identify which discovery steps are manual or automated. This project supplies interview evidence for SQL, retrieval, workflow orchestration, evaluation and governance. Keep independent coding-round practice alongside it.

### Technical references

- Local schema-constrained responses and model integration. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) · [LangChain structured output](https://docs.langchain.com/oss/python/langchain/structured-output)
- Exact and approximate vector retrieval in PostgreSQL. [pgvector](https://github.com/pgvector/pgvector)
- Human approval, resumption and durable state. [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) · [Checkpointer integrations](https://docs.langchain.com/oss/python/integrations/checkpointers)
- Concurrent stock reservation. [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- Static public walkthrough option. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
