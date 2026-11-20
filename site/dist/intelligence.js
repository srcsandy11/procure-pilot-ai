/* Offline, order-scoped evidence search. Drafts stay in the browser. */
(() => {
  const corpus = window.PPData.documents;
  const words = s => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1);
  function search(question, order, role = "procurement", model = "T20", asOf = "2026-11-21T12:00:00+05:30") {
    const queryWords = words(question), scoped = corpus.filter(d => d.order_id === order && d.model === model && d.roles.includes(role) && (!d.recorded_at || Date.parse(d.recorded_at) <= Date.parse(asOf)) && (!d.superseded_at || Date.parse(asOf) < Date.parse(d.superseded_at)));
    const rows = scoped.map(d => words(d.title + ' ' + d.text));
    const vocabulary = new Set([...queryWords, ...rows.flat()]);
    const idf = Object.fromEntries([...vocabulary].map(w => [w, Math.log((1 + rows.length) / (1 + rows.filter(row => row.includes(w)).length)) + 1]));
    const count = row => row.reduce((a,w) => (a[w]=(a[w]||0)+1,a),{});
    const q = count(queryWords), qnorm = Math.sqrt(Object.entries(q).reduce((a,[w,n]) => a+(n*idf[w])**2,0));
    return scoped.map((d,i) => {
      const counts = count(rows[i]);
      const norm = Math.sqrt(Object.entries(counts).reduce((a,[w,n]) => a+(n*idf[w])**2,0));
      const dot = Object.entries(q).reduce((a,[w,n]) => a+n*(counts[w]||0)*idf[w]**2,0);
      return {...d, score: qnorm && norm ? dot/(qnorm*norm) : 0};
    }).filter(d => d.score).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0,4);
  }
  function evaluate() {
    const cases = [["customer split approval", "CUSTOMER-ACK-1"], ["warehouse arrival confirmation", "WH-1-v2"], ["direct dispatch arrival", "QUOTE-A-v1"], ["revised supplier arrival", "QUOTE-B-v2"]];
    return [...cases.map(([query, expected]) => ({query, expected, found: search(query, "SO-1001").some(d => d.id === expected)})),
      {query:'exact model boundary', found: search('datasheet', 'SO-1001', 'sales', 'T20-H').every(d => d.id === 'DATASHEET-T20-H') && !search('datasheet T20 H', 'SO-1001', 'sales', 'T20').some(d => d.id === 'DATASHEET-T20-H')},
      {query:'role boundary', found: !search('commercial procurement policy', 'SO-1001', 'sales', 'T20').some(d => d.id === 'POLICY-PRICING')}];
  }
  function mount(root) {
    root.innerHTML = `<style>
      .ppi {display:grid;gap:16px}.ppi .ppi-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ppi label{display:block;font-weight:600;margin-bottom:6px}.ppi input,.ppi textarea{box-sizing:border-box;width:100%;font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px}.ppi textarea{min-height:150px;resize:vertical}.ppi .ppi-row{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.ppi .ppi-field{flex:1;min-width:200px}.ppi .ppi-results{display:grid;gap:10px}.ppi .ppi-source{border:1px solid var(--line);border-radius:8px;padding:12px}.ppi .ppi-source p{margin:6px 0 0}.ppi .ppi-note{color:var(--muted);font-size:.9em}.ppi h3{margin:0 0 10px}@media(max-width:720px){.ppi .ppi-grid{grid-template-columns:1fr}}
      </style><div class="ppi"><div><h3>Ask the evidence</h3><p class="ppi-note">Search the fictional SO-1001 records locally using a TF-IDF index fitted to this order. Results include records active at the selected time (IST).</p></div><form class="ppi-row"><div class="ppi-field"><label for="ppi-order">Order</label><input id="ppi-order" value="SO-1001" required></div><div class="ppi-field"><label for="ppi-model">Exact model</label><input id="ppi-model" value="T20" required></div><div class="ppi-field"><label for="ppi-role">Role</label><select id="ppi-role"><option value="procurement">Procurement</option><option value="sales">Sales</option></select></div><div class="ppi-field"><label for="ppi-asof">As of (IST)</label><input id="ppi-asof" type="datetime-local" value="2026-11-21T12:00" required></div><div class="ppi-field"><label for="ppi-query">Question or keywords</label><input id="ppi-query" value="arrival confirmation" required></div><button class="button primary" type="submit">Search evidence</button></form><div class="ppi-grid"><section><h3>Matched sources</h3><div class="ppi-results" aria-live="polite"></div></section><section><h3>Draft for review</h3><p class="ppi-note">Editable and unsent. Confirm details before making a commitment.</p><textarea aria-label="Draft for review"></textarea></section></div></div>`;
    const form = root.querySelector('form'), results = root.querySelector('.ppi-results'), output = root.querySelector('textarea');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const order = root.querySelector('#ppi-order').value.trim(), query = root.querySelector('#ppi-query').value.trim();
      const found = search(query, order, root.querySelector('#ppi-role').value, root.querySelector('#ppi-model').value.trim(), root.querySelector('#ppi-asof').value + ':00+05:30'); results.replaceChildren();
      if (!found.length) { const p = document.createElement('p'); p.textContent = 'No matching evidence for this order. Try different keywords or provide another source.'; results.append(p); }
      found.forEach(d => { const card=document.createElement('article'); card.className='ppi-source'; const heading=document.createElement('strong'); heading.textContent=d.title+' · '+d.id; const p=document.createElement('p'); p.textContent=d.text; card.append(heading,p); results.append(card); });
      output.value = found.length ? `Draft for review — ${order}\n\nRegarding: ${query}\n\nThe available records state:\n${found.map(d=>'- '+d.text+' ['+d.id+']').join('\n')}\n\nPlease confirm any outstanding details before making a commitment.` : `Draft for review — ${order}\n\nI need more evidence to answer: ${query}\nPlease provide the relevant supply or customer confirmation.`;
    });
    form.requestSubmit();
    const draftHost = document.createElement('div');
    root.append(draftHost);
    return window.PPDeviceDraft?.mount(draftHost, () => {
      const question = root.querySelector('#ppi-query').value.trim();
      return {question, evidence: search(question, root.querySelector('#ppi-order').value.trim(), root.querySelector('#ppi-role').value, root.querySelector('#ppi-model').value.trim(), root.querySelector('#ppi-asof').value + ':00+05:30')};
    });
  }
  window.PPIntelligence = {mount, evaluate, search};
})();
