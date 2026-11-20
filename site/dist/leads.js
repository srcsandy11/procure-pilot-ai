/* Procure Pilot discovery panel. No network or framework dependency. */
(function (global) {
  'use strict';
  const CHECKED = '2026-11-19';
  const STORAGE = 'procure-pilot-leads-v1';
  const today = () => new Date().toISOString().slice(0,10);
  const PRODUCTS = {
    logger: {
      name: 'Temperature data logger',
      brief: 'Calibrated temperature loggers for pharmaceutical cold-chain shipments in India. Exact model, certificate, quantity and arrival still require a dated quote.',
      supplier: ['temperature data logger calibrated supplier India', 'cold chain logger manufacturer distributor India certificate', 'exact model temperature logger availability quote'],
      buyer: ['pharma cold chain logistics temperature logger India', 'vaccine distribution temperature monitoring data logger', 'clinical trial logistics temperature logger service']
    },
    box: {
      name: 'Corrugated shipping box',
      brief: 'Corrugated shipping cartons for India distribution. Confirm size, ply, strength, print, minimum order and delivery before any purchase.',
      supplier: ['corrugated shipping box manufacturer India 3 ply 5 ply', 'bulk corrugated cartons supplier India custom size', 'shipping box wholesale MOQ delivery India'],
      buyer: ['ecommerce fulfilment corrugated packaging guidelines India', 'parcel logistics shipping box use India', 'retail distribution corrugated packaging requirements']
    }
  };
  const SEED = [
    {id:'giriraj-logger-s',product:'logger',role:'supplier',company:'Giriraj',domain:'giriraj.co.in',signal:'TLog temperature and humidity monitoring for pharmaceutical storage and transport',evidence:'The pharmaceutical page describes TLog loggers monitoring temperature and humidity for sensitive medical products during storage and transportation.',url:'https://www.giriraj.co.in/pharmaceutical.html',sourceDate:'',checked:CHECKED,question:'Can you quote the exact calibrated model, 100 units, certificate and arrival in Bhubaneswar by the required date?',status:'discovered',origin:'public page'},
    {id:'lisaline-logger-s',product:'logger',role:'supplier',company:'Lisaline Asia',domain:'lisalineasia.com',signal:'Tempmate data logger range supplied in India',evidence:'The company lists Tempmate GS2 and GM2 temperature and humidity data loggers and says it supplies these models in India.',url:'https://lisalineasia.com/gsm-dataloggers/',sourceDate:'',checked:CHECKED,question:'Which exact model and calibration documentation meet the specification, and what stock and delivery terms can you quote?',status:'discovered',origin:'public page'},
    {id:'bluedart-logger-b',product:'logger',role:'buyer',company:'Blue Dart',domain:'bluedart.com',signal:'Temperature loggers appear in temperature-controlled logistics services',evidence:'The company lists temperature loggers and says it provides temperature logger graphs to the shipper after delivery.',url:'https://api.bluedart.com/temperature-controlled-logistics',sourceDate:'',checked:CHECKED,question:'Who owns logger procurement, and is there a current requirement or an existing contracted source?',status:'discovered',origin:'public page'},
    {id:'tci-logger-b',product:'logger',role:'buyer',company:'TCI Express',domain:'tciexpress.in',signal:'Recent annual report describes travel data loggers in pharma cold chain',evidence:'Its FY 2025–26 annual report describes continuous monitoring via travel data loggers and additional loggers at vehicle doors.',url:'https://www.tciexpress.in/images/pdf/1306_Annual%20Report_FY%202025-26.pdf',sourceDate:'FY 2025–26',checked:CHECKED,question:'Does the service currently buy external devices, and who approves the specification and sourcing?',status:'discovered',origin:'annual report'},
    {id:'dcgpac-box-s',product:'box',role:'supplier',company:'DCGpac',domain:'dcgpac.com',signal:'Corrugated cartons in standard packaging catalogue',evidence:'The standard packaging catalogue lists corrugated boxes including universal, heavy duty, printed and mailer formats.',url:'https://www.dcgpac.com/packaging-products',sourceDate:'',checked:CHECKED,question:'Can the required dimensions, ply, strength and print be supplied at the needed MOQ and destination?',status:'discovered',origin:'public catalogue'},
    {id:'moglix-box-s',product:'box',role:'supplier',company:'Moglix Packaging',domain:'moglix.com',signal:'Bulk corrugated box catalogue',evidence:'The packaging catalogue offers corrugated boxes in bulk at wholesale prices based on project requirements.',url:'https://packaging.moglix.com/catalog/tertiary/corrugated-boxes',sourceDate:'',checked:CHECKED,question:'Which manufacturer and SKU meet the box specification, and what are the MOQ and dated delivery terms?',status:'discovered',origin:'public catalogue'},
    {id:'delhivery-box-b',product:'box',role:'buyer',company:'Delhivery',domain:'delhivery.com',signal:'Packaging guidance specifies corrugated boxes by shipment weight',evidence:'Delhivery’s packaging guidelines specify 3-ply corrugated boxes below 4 kg and 5-ply boxes for heavier or fragile products.',url:'https://help.delhivery.com/docs/packaging-guidelines',sourceDate:'2024-11-09',checked:CHECKED,question:'Does Delhivery purchase cartons centrally, or are shippers responsible for their own packaging?',status:'discovered',origin:'public guidance'},
    {id:'bluedart-box-b',product:'box',role:'buyer',company:'Blue Dart',domain:'bluedart.com',signal:'Company offers cardboard-based shipping packaging',evidence:'Its international services page describes easy-to-assemble Express Easy Boxes and a reinforced cardboard Express Pallet.',url:'https://www.bluedart.com/international-services',sourceDate:'',checked:CHECKED,question:'Is there an open sourcing need for these box formats, and who owns packaging procurement?',status:'discovered',origin:'public page'}
  ];
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try { const u = new URL(String(value)); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } };
  const keyOf = item => [item.product,item.role,(item.domain || item.company).toLowerCase().replace(/^www\./,'').trim()].join('|');
  const id = () => 'lead-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7);
  const qs = (root, selector) => root.querySelector(selector);
  function parseCSV(input) {
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i=0;i<input.length;i++) {
      const c=input[i];
      if (quoted && c==='"' && input[i+1]==='"') { cell+='"'; i++; }
      else if (c==='"') quoted=!quoted;
      else if (c===',' && !quoted) { row.push(cell); cell=''; }
      else if ((c==='\n' || c==='\r') && !quoted) { if (c==='\r' && input[i+1]==='\n') i++; row.push(cell); if (row.some(v=>v.trim())) rows.push(row); row=[]; cell=''; }
      else cell+=c;
    }
    if (quoted) throw new Error('CSV has an unclosed quoted field.');
    row.push(cell); if (row.some(v=>v.trim())) rows.push(row);
    const headers=(rows.shift() || []).map(v=>v.trim().toLowerCase());
    return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i] || ''])));
  }
  function normalize(raw) {
    const product=String(raw.product || '').toLowerCase().trim();
    const role=String(raw.role || '').toLowerCase().trim();
    const company=String(raw.company || '').trim();
    const url=safeUrl(raw.url || raw.source_url);
    const evidence=String(raw.evidence || raw.passage || '').trim();
    const question=String(raw.question || raw.qualification_question || '').trim();
    if (!PRODUCTS[product] || !['supplier','buyer'].includes(role) || !company || !url || !evidence || !question) throw new Error('Each lead needs product (logger/box), role (supplier/buyer), company, source URL, evidence and question.');
    const domain=String(raw.domain || new URL(url).hostname).toLowerCase().replace(/^www\./,'').trim();
    return {id:raw.id || id(),product,role,company,domain,signal:String(raw.signal || evidence).trim(),evidence,url,sourceDate:String(raw.sourceDate || raw.source_date || raw.sourcedate || ''),checked:String(raw.checked || today()),question,status:['discovered','imported','qualified','rejected'].includes(raw.status) ? raw.status : 'imported',origin:String(raw.origin || 'imported'),notes:String(raw.notes || '')};
  }
  function merge(items, incoming) {
    let added=0, duplicates=0;
    for (const raw of incoming) {
      const next=normalize(raw), existing=items.find(item=>keyOf(item)===keyOf(next));
      if (existing) { duplicates++; if (next.checked>=existing.checked && next.evidence.length>existing.evidence.length) Object.assign(existing,{evidence:next.evidence,url:next.url,checked:next.checked,sourceDate:next.sourceDate}); }
      else { items.push(next); added++; }
    }
    return {added,duplicates};
  }
  function csv(rows) {
    const columns=['product','role','company','domain','signal','evidence','url','sourceDate','checked','question','status','origin','notes'];
    const quote=v=>{const value=String(v == null ? '' : v); return '"'+(/^[\s]*[=+@-]/.test(value) ? "'" : '')+value.replace(/"/g,'""')+'"'};
    return [columns.join(','),...rows.map(r=>columns.map(k=>quote(r[k])).join(','))].join('\r\n')+'\r\n';
  }
  function download(name, body, type) {
    const href=URL.createObjectURL(new Blob([body],{type})), a=document.createElement('a');
    a.href=href; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(href),1000);
  }
  const css = [
    '.pp-leads{color:var(--ink,#172b2a);font-family:inherit}',
    '.pp-leads *{box-sizing:border-box}',
    '.pp-leads .pp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-bottom:18px}',
    '.pp-leads h2,.pp-leads h3,.pp-leads p{margin-top:0}',
    '.pp-leads h2{font-size:clamp(24px,3vw,34px);letter-spacing:-.035em;margin-bottom:6px}',
    '.pp-leads .pp-muted{color:var(--muted,#697a75);font-size:13px;line-height:1.55}',
    '.pp-leads .pp-controls{display:flex;gap:8px;flex-wrap:wrap}',
    '.pp-leads button,.pp-leads select,.pp-leads input,.pp-leads textarea{font:inherit}',
    '.pp-leads button{cursor:pointer}',
    '.pp-leads .pp-tab,.pp-leads .pp-action{border:1px solid var(--line,#dce5de);background:var(--surface,#fff);color:var(--ink,#172b2a);padding:9px 13px;border-radius:9px;font-size:13px;font-weight:650}',
    '.pp-leads .pp-tab[aria-selected=true],.pp-leads .pp-action-primary{background:var(--accent,#176f58);color:#fff;border-color:var(--accent,#176f58)}',
    '.pp-leads .pp-brief{padding:18px 20px;background:var(--surface,#fff);border:1px solid var(--line,#dce5de);border-radius:14px;margin-bottom:18px}',
    '.pp-leads .pp-brief p{margin:6px 0 0;line-height:1.55;font-size:14px}',
    '.pp-leads .pp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}',
    '.pp-leads .pp-column{min-width:0}',
    '.pp-leads .pp-column-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:10px}',
    '.pp-leads .pp-column h3{font-size:19px;margin:0}',
    '.pp-leads .pp-count{color:var(--muted,#697a75);font-size:12px}',
    '.pp-leads .pp-card{background:var(--surface,#fff);border:1px solid var(--line,#dce5de);border-radius:13px;padding:16px;margin-bottom:10px}',
    '.pp-leads .pp-card-top{display:flex;justify-content:space-between;gap:12px}',
    '.pp-leads .pp-card h4{font-size:17px;margin:0 0 3px}',
    '.pp-leads .pp-card a{color:var(--accent,#176f58);font-size:12px;overflow-wrap:anywhere}',
    '.pp-leads .pp-tag{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:750;background:#e8f2ee;color:#226a54;padding:5px 7px;border-radius:5px;white-space:nowrap;height:fit-content}',
    '.pp-leads .pp-signal{font-size:13px;font-weight:650;line-height:1.45;margin:12px 0 6px}',
    '.pp-leads .pp-evidence{border-left:2px solid var(--accent,#176f58);padding-left:10px;font-size:12px;line-height:1.5;color:var(--muted,#697a75);margin:0 0 12px}',
    '.pp-leads .pp-question{font-size:12px;line-height:1.5;margin:0 0 12px}',
    '.pp-leads .pp-meta{font-size:11px;color:var(--muted,#697a75);margin:0 0 12px}',
    '.pp-leads .pp-review{display:flex;gap:7px;flex-wrap:wrap}',
    '.pp-leads .pp-review select,.pp-leads .pp-review input{border:1px solid var(--line,#dce5de);background:var(--surface,#fff);color:var(--ink,#172b2a);border-radius:7px;padding:7px;font-size:12px}',
    '.pp-leads .pp-review input{flex:1;min-width:145px}',
    '.pp-leads .pp-tools{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}',
    '.pp-leads .pp-searches{border:1px solid var(--line,#dce5de);border-radius:12px;padding:16px;margin-top:18px;background:var(--surface,#fff)}',
    '.pp-leads .pp-searches summary{cursor:pointer;font-weight:700}',
    '.pp-leads .pp-search-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding-top:12px}',
    '.pp-leads .pp-searches li{font-size:12px;line-height:1.6;margin-bottom:5px}',
    '.pp-leads .pp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
    '.pp-leads .pp-form label{font-size:11px;color:var(--muted,#697a75);display:flex;flex-direction:column;gap:4px}',
    '.pp-leads .pp-form input,.pp-leads .pp-form select,.pp-leads .pp-form textarea{width:100%;border:1px solid var(--line,#dce5de);background:var(--surface,#fff);color:var(--ink,#172b2a);padding:9px;border-radius:7px;font-size:13px}',
    '.pp-leads .pp-form .pp-wide{grid-column:1/-1}',
    '.pp-leads .pp-dialog{border:1px solid var(--line,#dce5de);border-radius:14px;max-width:650px;width:min(95vw,650px);padding:20px;background:var(--surface,#fff);color:var(--ink,#172b2a)}',
    '.pp-leads .pp-dialog::backdrop{background:#10251eb3}',
    '.pp-leads .pp-message{min-height:18px;font-size:12px;color:var(--accent,#176f58);margin:6px 0}',
    '@media(max-width:760px){.pp-leads .pp-grid,.pp-leads .pp-search-grid{grid-template-columns:1fr}}'
  ].join('');
  function mount(element) {
    if (!element) throw new Error('PPLeads.mount requires an element.');
    const saved=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE))}catch(_){return null}})();
    const items=SEED.map(item=>({...item}));
    if (Array.isArray(saved)) {
      for(const raw of saved) {
        try {
          const lead=normalize(raw), index=items.findIndex(item=>keyOf(item)===keyOf(lead));
          if(index>=0) items[index]=lead; else items.push(lead);
        } catch (_) { /* Ignore invalid old records. */ }
      }
    }
    let product='logger', filter='all';
    const style=document.createElement('style'); style.textContent=css; element.append(style);
    const root=document.createElement('section'); root.className='pp-leads'; element.append(root);
    const persist=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(items))}catch(_){message('Local storage is unavailable; export to keep your edits.')}};
    function message(value){const m=qs(root,'.pp-message');if(m)m.textContent=value}
    function card(item) {
      return '<article class="pp-card" data-id="'+escape(item.id)+'"><div class="pp-card-top"><div><h4>'+escape(item.company)+'</h4><a href="'+escape(item.url)+'" target="_blank" rel="noopener noreferrer">View source ↗</a></div><span class="pp-tag">'+escape(item.status)+'</span></div><p class="pp-signal">'+escape(item.signal)+'</p><p class="pp-evidence">'+escape(item.evidence)+'</p><p class="pp-meta">'+escape(item.origin)+' · checked '+escape(item.checked)+(item.sourceDate?' · source '+escape(item.sourceDate):' · source date not stated')+'</p><p class="pp-question"><strong>Qualify:</strong> '+escape(item.question)+'</p><div class="pp-review"><select aria-label="Qualification status for '+escape(item.company)+'" data-status><option value="discovered" '+(item.status==='discovered'?'selected':'')+'>Discovered</option><option value="imported" '+(item.status==='imported'?'selected':'')+'>Imported</option><option value="qualified" '+(item.status==='qualified'?'selected':'')+'>Qualified</option><option value="rejected" '+(item.status==='rejected'?'selected':'')+'>Rejected</option></select><input data-notes aria-label="Analyst notes for '+escape(item.company)+'" placeholder="Analyst note / next action" value="'+escape(item.notes)+'"></div></article>';
    }
    function render(){
      const spec=PRODUCTS[product], shown=items.filter(item=>item.product===product && (filter==='all'||item.status===filter));
      root.innerHTML='<div class="pp-head"><div><div class="eyebrow">DISCOVER / QUALIFY</div><h2>Lead research</h2><p class="pp-muted">Public evidence points to a possible fit. A person must confirm a commercial opportunity.</p></div><div class="pp-controls" role="tablist" aria-label="Product"><button class="pp-tab" data-product="logger" role="tab" aria-selected="'+(product==='logger')+'">Temperature loggers</button><button class="pp-tab" data-product="box" role="tab" aria-selected="'+(product==='box')+'">Shipping boxes</button></div></div><div class="pp-brief"><strong>'+escape(spec.name)+'</strong><p>'+escape(spec.brief)+'</p></div><div class="pp-tools"><button class="pp-action" data-add>Add URL lead</button><button class="pp-action" data-import>Import CSV / JSON</button><button class="pp-action" data-export>Export shortlist CSV</button><select class="pp-action" data-filter aria-label="Filter leads"><option value="all">All signals</option><option value="qualified">Qualified only</option><option value="discovered">Discovered only</option><option value="imported">Imported only</option><option value="rejected">Rejected only</option></select></div><div class="pp-message" role="status" aria-live="polite"></div><div class="pp-grid">'+['supplier','buyer'].map(role=>{const rows=shown.filter(item=>item.role===role);return '<section class="pp-column"><div class="pp-column-head"><h3>'+(role==='supplier'?'Supplier candidates':'Prospective buyers')+'</h3><span class="pp-count">'+rows.length+' leads</span></div>'+(rows.length?rows.map(card).join(''):'<p class="pp-muted">No leads in this view.</p>')+'</section>'}).join('')+'</div><details class="pp-searches"><summary>Search queries for this product</summary><div class="pp-search-grid">'+['supplier','buyer'].map(role=>'<div><strong>'+(role==='supplier'?'Supply':'Demand')+'</strong><ul>'+spec[role].map(q=>'<li>'+escape(q)+'</li>').join('')+'</ul></div>').join('')+'</div></details><dialog class="pp-dialog"><h3>Add an evidence-backed lead</h3><form class="pp-form" method="dialog"><label>Company<input name="company" required></label><label>Role<select name="role"><option value="supplier">Supplier</option><option value="buyer">Prospective buyer</option></select></label><label class="pp-wide">Public source URL<input name="url" type="url" placeholder="https://…" required></label><label class="pp-wide">Supporting passage<textarea name="evidence" rows="3" required></textarea></label><label class="pp-wide">Qualification question<textarea name="question" rows="2" required></textarea></label><label>Source date, if known<input name="sourceDate" placeholder="e.g. 2026-03-15"></label><div class="pp-wide pp-controls"><button class="pp-action pp-action-primary" value="save">Add lead</button><button class="pp-action" value="cancel">Cancel</button></div></form></dialog><input type="file" accept=".csv,.json,text/csv,application/json" hidden data-file>';
      qs(root,'[data-filter]').value=filter;
    }
    render();
    root.addEventListener('click',e=>{
      const target=e.target.closest('button'); if(!target)return;
      if(target.dataset.product){product=target.dataset.product;filter='all';render()}
      else if(target.hasAttribute('data-add'))qs(root,'dialog').showModal();
      else if(target.hasAttribute('data-import'))qs(root,'[data-file]').click();
      else if(target.hasAttribute('data-export')){
        const shortlisted=items.filter(item=>item.product===product && item.status==='qualified');
        if(!shortlisted.length){message('Qualify leads first to create a shortlist.');return}
        download('procure-pilot-'+product+'-qualified.csv',csv(shortlisted),'text/csv;charset=utf-8');
        message('Exported '+shortlisted.length+' qualified '+(shortlisted.length===1?'lead':'leads')+'.');
      }
    });
    root.addEventListener('change',async e=>{
      if(e.target.matches('[data-filter]')){filter=e.target.value;render();return}
      if(e.target.matches('[data-status]')){const item=items.find(v=>v.id===e.target.closest('[data-id]').dataset.id);if(item){item.status=e.target.value;persist();render()}return}
      if(e.target.matches('[data-file]')){
        const file=e.target.files[0];if(!file)return;
        try {
          const body=await file.text(), records=file.name.toLowerCase().endsWith('.json')?JSON.parse(body):parseCSV(body);
          if(!Array.isArray(records))throw new Error('Import must be an array of leads.');
          const normalized=records.map(normalize), result=merge(items,normalized);persist();render();
          message('Imported '+result.added+'; merged '+result.duplicates+' duplicate '+(result.duplicates===1?'company':'companies')+'.');
        }catch(err){message('Import failed: '+err.message)}
        e.target.value='';
      }
    });
    root.addEventListener('focusout',e=>{
      if(!e.target.matches('[data-notes]'))return;
      const item=items.find(v=>v.id===e.target.closest('[data-id]').dataset.id);
      if(item){item.notes=e.target.value.trim();persist()}
    });
    root.addEventListener('close',e=>{
      if(!e.target.matches('dialog')||e.target.returnValue!=='save')return;
      const form=qs(e.target,'form'), values=Object.fromEntries(new FormData(form));
      try {const result=merge(items,[{...values,product,checked:today(),origin:'manual URL',status:'imported'}]);persist();render();message(result.added?'Lead added for analyst review.':'Company already exists for this product and role; evidence merged if newer.')}
      catch(err){message(err.message)}
    },true);
    return {getLeads:()=>items.map(item=>({...item})),destroy:()=>{style.remove();root.remove()}};
  }
  global.PPLeads={mount,parseCSV,normalize,merge,PRODUCTS};
})(typeof window !== 'undefined' ? window : globalThis);
