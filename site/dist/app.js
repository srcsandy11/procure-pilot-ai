"use strict";

(() => {
  const workspace = document.querySelector("#workspace");
  const notice = document.querySelector("#notice");
  const breadcrumb = document.querySelector("#breadcrumb");
  const inboxCount = document.querySelector("#inbox-count");
  const navigation = [...document.querySelectorAll("[data-view]")];
  const data = window.PPData;
  const views = {
    overview: "Decision desk",
    inbox: "Action inbox",
    fulfilment: "Fulfilment",
    intelligence: "Document intelligence",
    leads: "Lead discovery",
  };
  const stageNames = {initial: "Initial", confirmed: "Confirmed", revised: "Revised"};
  const stageSummary = {
    initial: "Arrival and split delivery need confirmation",
    confirmed: "The split plan is ready for review",
    revised: "A supplier revision puts 80 units at risk",
  };
  const planNames = {"DIRECT-A": "Direct supplier A", "SPLIT-B": "Supplier B + warehouse"};
  const sourceNames = {"QUOTE-A": "Supplier A", "QUOTE-B": "Supplier B", "WH-1": "Warehouse"};
  const demoReviewer = "Ananya Rao · Sales";
  const icons = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    inbox: '<path d="M3 13 6 5h12l3 8v6H3z"/><path d="M3 13h5l2 3h4l2-3h5"/>',
    parcel: '<path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10M8 5l8 4"/>',
    document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
    search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
    replay: '<path d="M4 11a8 8 0 1 1 2 6M4 6v5h5M12 8v4l3 2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  };

  function icon(name) {
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  for (const link of navigation) link.insertAdjacentHTML("afterbegin", icon(link.dataset.icon));

  if (!data?.fixture?.orders?.length || !data?.stages?.revised?.length) {
    workspace.innerHTML = '<section class="panel"><h1>Workspace data unavailable</h1><p>The decision replay needs its generated data file. Reload the page after the demo data is available.</p></section>';
    return;
  }

  const order = data.fixture.orders[0];
  const savedKey = "procure-pilot-workspace-v1";
  let state = {
    stage: "revised",
    approval: null,
    reviewed: {},
    activity: [],
    fulfilment: "open",
  };

  try {
    const saved = JSON.parse(localStorage.getItem(savedKey));
    if (saved && Object.hasOwn(stageNames, saved.stage)) state = {...state, ...saved};
  } catch {
    // Session state remains usable when local storage is unavailable.
  }

  let role = "All roles";
  let noticeTimeout;

  function save() {
    try {
      localStorage.setItem(savedKey, JSON.stringify(state));
    } catch {
      // The current workspace state stays in memory.
    }
  }

  function announce(message) {
    clearTimeout(noticeTimeout);
    notice.textContent = message;
    noticeTimeout = setTimeout(() => { notice.textContent = ""; }, 4500);
  }

  function rows() {
    return data.stages[state.stage];
  }

  function formatDate(value, withTime = false) {
    const options = {day: "numeric", month: "short", timeZone: "Asia/Kolkata"};
    if (withTime) Object.assign(options, {hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
    return new Intl.DateTimeFormat("en-GB", options).format(new Date(value));
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", hourCycle: "h23",
    }).format(new Date(value));
  }

  function log(title, detail) {
    const recorded = rows()[0].as_of;
    state.activity.unshift({title, detail, date: formatDate(recorded, true)});
    state.activity = state.activity.slice(0, 12);
  }

  function reviewTasks() {
    const tasks = rows().flatMap(row => row.findings.map((finding, index) => ({
      ...finding,
      id: `${state.stage}-${row.plan}-${index}`,
      plan: planNames[row.plan],
      kind: "finding",
    })));
    if (state.stage === "confirmed" && !state.approval) {
      tasks.push({id: "review-confirmed", owner: "Sales", plan: planNames["SPLIT-B"],
        action: "Review the split plan and record the commitment.", evidence: "CUSTOMER-ACK-1", kind: "review"});
    }
    if (state.fulfilment !== "closed") {
      tasks.push({id: "support-receipt", owner: "Support", plan: "SO-1002 · partial delivery",
        action: state.fulfilment === "received" ? "Close the case after recording final customer receipt." :
          "Verify the 20 outstanding units with the customer.",
        evidence: state.fulfilment === "received" ? "Final customer receipt · 100 of 100" : "Initial customer report · 80 of 100",
        kind: "support"});
    }
    return tasks;
  }

  function statusLabel(verdict) {
    return {
      "needs confirmation": '<span class="badge warn">Needs confirmation</span>',
      feasible: '<span class="badge good">Feasible</span>',
      infeasible: '<span class="badge risk">Infeasible</span>',
    }[verdict];
  }

  function pageHeading(label, title, detail) {
    return `<div class="page-heading"><div><p class="eyebrow">${label}</p><h1>${title}</h1><p class="muted">${detail}</p></div></div>`;
  }

  function metric(symbol, name, value, qualifier) {
    return `<div class="panel metric"><span class="metric-title">${icon(symbol)}${name}</span><strong>${value}</strong><small>${qualifier}</small></div>`;
  }

  function sourcingPlan(row) {
    const plan = data.fixture.plans.find(candidate => candidate.id === row.plan);
    const legs = plan.legs.map(leg => {
      const offer = data.fixture.offers
        .filter(offer => offer.source === leg.source && Date.parse(offer.recorded_at) <= Date.parse(row.as_of))
        .sort((first, second) => Date.parse(second.recorded_at) - Date.parse(first.recorded_at))[0];
      const arrival = offer?.arrival ? `Arrives ${formatDate(offer.arrival)}` : "Arrival unconfirmed";
      const evidence = offer ? `${leg.source} v${offer.revision}` : leg.source;
      return `<div class="plan-line"><div><strong>${sourceNames[leg.source]} · ${leg.quantity} units</strong><small>${evidence}</small></div><span>${arrival}</span></div>`;
    }).join("");
    const findings = row.findings.length ? `<ul class="findings">${row.findings.map(finding =>
      `<li><strong>${escapeHtml(finding.owner)}</strong> · ${escapeHtml(finding.action)} <small class="muted">[${escapeHtml(finding.evidence)}]</small></li>`).join("")}</ul>`
      : '<p class="muted">Both arrivals meet the deadline and the customer has accepted split delivery.</p>';
    const action = row.verdict === "feasible" && row.plan === "SPLIT-B" ?
      (state.approval ? '<span class="badge good">Commitment recorded</span>' :
        '<button class="button primary" data-action="approve">Approve split plan</button>') : "";
    return `<article class="panel plan"><div class="plan-top"><div><h3>${planNames[row.plan]}</h3><p>${row.plan}</p></div>${statusLabel(row.verdict)}</div>
      <div class="plan-lines">${legs}</div>${findings}<div class="plan-bottom">
      <details><summary>Evidence references</summary><div class="sources">${row.evidence.map(reference =>
        `<span class="source">${escapeHtml(reference)}</span>`).join("")}</div></details>${action}</div></article>`;
  }

  function overview() {
    const summary = {
      initial: "Supplier A specified dispatch. Confirm the customer’s split consent and the warehouse arrival.",
      confirmed: "Supplier B can cover 80 units and warehouse stock covers the remaining 20.",
      revised: "The revised Supplier B arrival is 30 November. The customer deadline is 27 November.",
    };
    const chip = {
      initial: '<span class="badge warn">Confirmation required</span>',
      confirmed: '<span class="badge good">Feasible option found</span>',
      revised: '<span class="badge risk">At risk</span>',
    };
    const defaults = {
      initial: {title: "Order requirements recorded", detail: "Initial supplier and warehouse evidence loaded."},
      confirmed: {title: "Split consent and warehouse arrival confirmed", detail: "CUSTOMER-ACK-1 and warehouse revision 2 were applied."},
      revised: {title: "Supplier B arrival moved", detail: "QUOTE-B v2 affects 80 units and invalidates the split plan for the customer deadline."},
    };
    const activity = [
      ...state.activity,
      {...defaults[state.stage], date: formatDate(rows()[0].as_of, true)},
    ].map(event => `<div class="activity-row"><div><strong>${escapeHtml(event.title)}</strong><p class="muted">${escapeHtml(event.detail)}</p></div><small>${escapeHtml(event.date)}</small></div>`).join("");
    workspace.innerHTML = `${pageHeading("Operations", "Decision desk", "Review sourcing options before making a delivery commitment.")}
      <section class="panel replay" aria-label="Decision replay"><div class="replay-title">${icon("replay")}<div>Decision replay<small>Evidence as of ${formatDate(rows()[0].as_of, true)} IST</small></div></div>
      <div class="stage-buttons" role="group" aria-label="Replay stage">${Object.entries(stageNames).map(([key, name]) =>
        `<button data-stage="${key}" aria-pressed="${state.stage === key}">${name}</button>`).join("")}</div></section>
      <section class="hero"><div>${chip[state.stage]}<h2>${stageSummary[state.stage]}</h2><p>${summary[state.stage]}</p></div>
      <div class="order-stamp"><span>Customer order</span><strong>${escapeHtml(order.id)}</strong><span>${escapeHtml(order.sku)} calibrated loggers</span></div></section>
      <div class="metrics">
      ${metric("parcel", "Quantity requested", `${order.quantity} units`, "Calibration certificate required")}
      ${metric("pin", "Destination", escapeHtml(order.destination), "Customer delivery")}
      ${metric("clock", "Arrival cutoff", formatDate(order.deadline), `${formatTime(order.deadline)} IST`)}
      </div>
      <section aria-labelledby="plans-heading"><div class="section-heading"><h2 id="plans-heading">Sourcing options</h2><a class="button" href="#inbox">Open action inbox ${icon("arrow")}</a></div>
      <div class="plan-grid">${rows().map(sourcingPlan).join("")}</div></section>
      <section class="panel activity"><h2>Activity</h2>${activity}</section>`;
  }

  function inbox() {
    const visible = reviewTasks().filter(task => role === "All roles" || task.owner === role);
    const roles = ["All roles", "Sales", "Procurement", "Support"];
    workspace.innerHTML = `${pageHeading("Operations", "Action inbox", "Review open questions and case updates by owner.")}
      <div class="filters" role="group" aria-label="Filter by owner">${roles.map(owner =>
        `<button class="button" data-role="${owner}" aria-pressed="${role === owner}">${owner}</button>`).join("")}</div>
      <section class="panel task-list" aria-label="Action queue">${visible.length ? visible.map(task => {
        const seen = Boolean(state.reviewed[task.id]);
        const action = task.kind === "review" ? '<a class="button primary" href="#overview">Review plan</a>' :
          task.kind === "support" ? '<a class="button" href="#fulfilment">Open case</a>' :
            seen ? '<span class="badge">Reviewed · awaiting evidence</span>' :
              `<button class="button" data-action="review-task" data-task="${task.id}">Mark reviewed</button>`;
        return `<article class="task"><div><span class="badge">${task.owner}</span><h3>${escapeHtml(task.plan)}</h3>
          <p>${escapeHtml(task.action)}</p><small>${escapeHtml(task.evidence)}</small></div>${action}</article>`;
      }).join("") : '<p class="muted">No actions for this role in the selected replay stage.</p>'}</section>`;
  }

  function fulfilment() {
    const received = state.fulfilment !== "open";
    const closed = state.fulfilment === "closed";
    const status = closed ? '<span class="badge good">Case closed</span>' :
      received ? '<span class="badge good">Final receipt verified</span>' : '<span class="badge warn">20 units outstanding</span>';
    const action = closed ? "" : received ? '<button class="button primary" data-action="close-case">Close support case</button>' :
      '<button class="button primary" data-action="record-receipt">Simulate final customer receipt</button>';
    workspace.innerHTML = `${pageHeading("Support", "Fulfilment", "Reconcile carrier and customer evidence for a partial delivery.")}
      <section class="hero"><div>${status}<h2>Partial delivery case</h2><p>Support is tracking the receipt of 100 calibrated T20 loggers.</p></div>
      <div class="order-stamp"><span>Customer order</span><strong>SO-1002</strong><span>Separate fulfilment scenario</span></div></section>
      <div class="support-grid"><section class="panel"><h2>Delivery evidence</h2>
      <dl class="support-facts"><div><dt>Carrier dispatch</dt><dd>100 units</dd></div><div><dt>Initial customer report</dt><dd>80 units</dd></div>
      <div><dt>Final customer receipt</dt><dd>${received ? "100 units confirmed" : "Awaiting confirmation"}</dd></div>
      <div><dt>Warehouse receipt</dt><dd>No warehouse receipt recorded</dd></div><div><dt>Outstanding</dt><dd>${received ? 0 : 20} units</dd></div></dl></section>
      <section class="panel"><h2>Support action</h2><p>${closed ? "Final customer receipt was recorded before the case closed." :
        received ? "The customer has confirmed all 100 units. Review the receipt before closing the case." :
        "The carrier reports 100 dispatched and the customer reports 80 received. Verify the remaining 20 with the customer."}</p>
      <div class="actions">${action}</div></section></div>`;
  }

  let cleanupModule;
  function render() {
    cleanupModule?.();
    cleanupModule = undefined;
    const hash = window.location.hash.slice(1);
    const view = Object.hasOwn(views, hash) ? hash : "overview";
    breadcrumb.textContent = views[view];
    for (const link of navigation) {
      if (link.dataset.view === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    const openCount = reviewTasks().filter(task => !state.reviewed[task.id]).length;
    inboxCount.textContent = openCount || "";
    if (view === "overview") overview();
    if (view === "inbox") inbox();
    if (view === "fulfilment") fulfilment();
    if (view === "intelligence" || view === "leads") {
      const detail = view === "intelligence" ? "Find source passages and draft an evidence-backed reply." : "Review public evidence for potential suppliers and buyers.";
      workspace.innerHTML = pageHeading("Research", views[view], detail);
      const module = view === "intelligence" ? window.PPIntelligence : window.PPLeads;
      if (typeof module?.mount === "function") {
        const moduleHost = document.createElement("div");
        if (view === "intelligence") moduleHost.className = "panel";
        workspace.append(moduleHost);
        const mounted = module.mount(moduleHost);
        cleanupModule = typeof mounted === "function" ? mounted : mounted?.destroy;
      } else {
        workspace.insertAdjacentHTML("beforeend", '<p class="panel">This workspace module is unavailable.</p>');
      }
    }
  }

  workspace.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const {stage, role: selectedRole, action, task: taskId} = button.dataset;
    let message = "";
    let changed = false;
    let focusAfter = null;
    if (stage && Object.hasOwn(stageNames, stage) && state.stage !== stage) {
      state.stage = stage;
      if (state.approval && stage === "revised" && rows().find(row => row.plan === "SPLIT-B")?.verdict !== "feasible") {
        state.approval = null;
        log("Commitment reopened", "Supplier B revision 2 made the approved split infeasible. Procurement needs earlier supply for 80 units.");
        message = "Commitment reopened after the supplier revision.";
      }
      focusAfter = `[data-stage="${stage}"]`;
      changed = true;
    }
    if (selectedRole) {
      role = selectedRole;
      focusAfter = `[data-role="${role}"]`;
      changed = true;
    }
    if (action === "approve" && state.stage === "confirmed" && !state.approval &&
        rows().find(row => row.plan === "SPLIT-B")?.verdict === "feasible") {
      const decision = rows().find(row => row.plan === "SPLIT-B");
      state.approval = {plan: decision.plan, reviewer: demoReviewer, evidence: decision.evidence};
      log("Split commitment approved", `${demoReviewer} approved an 80-unit supplier allocation and a 20-unit warehouse allocation in the demo.`);
      message = "Split commitment recorded.";
      changed = true;
    }
    if (action === "review-task") {
      const task = reviewTasks().find(task => task.id === taskId && task.kind === "finding");
      if (task && !state.reviewed[task.id]) {
        state.reviewed[task.id] = true;
        log("Action reviewed", `${task.owner} reviewed ${task.evidence}. Confirmation remains open.`);
        message = "Action reviewed. Confirmation remains open.";
        changed = true;
      }
    }
    if (action === "record-receipt" && state.fulfilment === "open") {
      state.fulfilment = "received";
      log("Final customer receipt recorded", "The simulated customer confirmed receipt of all 100 units on SO-1002.");
      message = "Customer receipt recorded for all 100 units.";
      focusAfter = '[data-action="close-case"]';
      changed = true;
    }
    if (action === "close-case" && state.fulfilment === "received") {
      state.fulfilment = "closed";
      log("Support case closed", "SO-1002 has a final receipt for all 100 units.");
      message = "Support case closed.";
      changed = true;
    }
    if (!changed) return;
    save();
    render();
    (focusAfter ? workspace.querySelector(focusAfter) : workspace)?.focus({preventScroll: true});
    if (message) announce(message);
  });

  window.addEventListener("hashchange", () => {
    render();
    workspace.focus();
  });
  render();
})();
