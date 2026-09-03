/* @section: page-interactions — FactoryAI2U CORE app controller */
document.documentElement.classList.add('js-ready');
(function () {
  'use strict';
  var App = document.getElementById('app');
  var S = null;               // current session {userId, role}
  var route = 'dashboard';
  var drill = null;           // drill-down context

  /* ---------- helpers ---------- */
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function num(n) { n = Number(n); return isNaN(n) ? 0 : n; }
  function fmt(n) { return num(n).toLocaleString(); }
  function money(n) { return '$' + num(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
  function agoMin(iso) { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); }
  function agoText(iso) { var m = agoMin(iso); if (m < 60) return m + 'm ago'; var hh = Math.floor(m/60); if (hh<24) return hh + 'h ' + (m%60) + 'm ago'; return Math.floor(hh/24)+'d ago'; }
  function when(iso) { var d = new Date(iso); return d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  function dateStr(iso) { return new Date(iso).toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' }); }

  function toast(msg, kind) {
    var host = el('toast-host'); var t = h('<div class="toast ' + (kind||'') + '">' + esc(msg) + '</div>');
    host.appendChild(t); setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 250); }, 3200);
  }
  function modal(title, bodyHtml, footHtml) {
    var host = el('modal-host'); host.hidden = false;
    host.innerHTML = '';
    var m = h('<div class="modal"><div class="m-head"><h2>' + esc(title) + '</h2><button class="btn ghost sm x" aria-label="Close">✕</button></div><div class="m-body">' + bodyHtml + '</div>' + (footHtml ? '<div class="m-foot">' + footHtml + '</div>' : '') + '</div>');
    host.appendChild(m);
    m.querySelector('.x').onclick = closeModal;
    host.onclick = function (e) { if (e.target === host) closeModal(); };
    return m;
  }
  function closeModal() { var host = el('modal-host'); host.hidden = true; host.innerHTML = ''; }

  /* ---------- escalation engine (Manual §6/§7) ---------- */
  function escLevel(kind, elapsedMin) {
    var rules = DB.load().config.escalation[kind]; var lvl = 0;
    for (var i = 0; i < rules.length; i++) if (elapsedMin >= rules[i].min) lvl = i + 1;
    return { level: lvl, rules: rules };
  }
  function escSummary(kind, startIso, status) {
    if (status === 'restored' || status === 'closed') return { level: 0, met: true, label: 'Resolved' };
    var e = escLevel(kind, agoMin(startIso));
    var next = e.rules[e.level];
    return { level: e.level, rules: e.rules, current: e.rules[e.level-1], next: next };
  }

  /* ---------- loss engine (Manual §10) ---------- */
  function lossFor() {
    var s = DB.load(), r = s.rates, dtMin = 0, ng = 0, scrap = 0, affected = 0;
    s.breakdowns.forEach(function (b) { dtMin += num(b.downtimeMin); affected += num(b.affectedQty); });
    s.quality.forEach(function (q) { ng += num(q.confirmedNG); });
    s.production.forEach(function (p) { scrap += num(p.ng); });
    var dtCost = dtMin * r.downtimeCostPerMin;
    var ngCost = ng * r.scrapCostPerUnit;
    var scrapCost = scrap * r.scrapCostPerUnit;
    return { dtMin: dtMin, dtCost: dtCost, ng: ng, ngCost: ngCost, scrap: scrap, scrapCost: scrapCost, affected: affected, total: dtCost + ngCost + scrapCost };
  }

  /* ---------- KPI computation ---------- */
  function kpis() {
    var s = DB.load(); var plan = 0, good = 0, total = 0, ng = 0, dt = 0, planned = s.production.length * 480;
    s.production.forEach(function (p) { plan += num(p.plan); good += num(p.good); total += num(p.total); ng += num(p.ng); });
    s.breakdowns.forEach(function (b) { dt += num(b.downtimeMin); });
    var quality = total ? good / total : 0;
    var availability = planned ? (planned - dt) / planned : 0;
    var performance = 0.95; // demo assumption for prototype
    var oee = availability * performance * quality;
    var fpy = total ? (total - ng) / total : 0;
    var achievement = plan ? good / plan : 0;
    return { plan: plan, good: good, total: total, ng: ng, dt: dt,
      quality: quality*100, availability: availability*100, performance: performance*100,
      oee: oee*100, fpy: fpy*100, achievement: achievement*100 };
  }

  /* ---------- open counts for badges ---------- */
  function counts() {
    var s = DB.load();
    return {
      openBd: s.breakdowns.filter(function (b) { return b.status==='active'||b.status==='escalated'; }).length,
      escBd: s.breakdowns.filter(function (b) { return b.status==='escalated'; }).length,
      openQa: s.quality.filter(function (q) { return q.status!=='closed'; }).length,
      overdue: s.actions.filter(function (a) { return a.status==='overdue'; }).length,
      openAct: s.actions.filter(function (a) { return a.status!=='closed'; }).length
    };
  }

  /* ---------- LOGIN ---------- */
  function renderLogin() {
    document.body.className = '';
    var roles = Object.keys(DB.ROLES);
    var picks = roles.map(function (r) {
      var R = DB.ROLES[r];
      return '<button class="rp" data-role="' + r + '"><div class="rn">' + esc(R.name) + '</div><div class="rd">' + esc(R.philosophy) + '</div></button>';
    }).join('');
    App.innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
      '<div class="brand"><span class="dot"></span> FactoryAI2U</div>' +
      '<div class="tag">Manufacturing Operating System · CORE V1.4 prototype</div>' +
      '<p class="muted" style="font-size:.85rem">Select a role to enter the demo. Each role sees only the menus appropriate to its responsibility (management roles get dashboards &amp; drill-down, not data-entry).</p>' +
      '<div class="role-pick">' + picks + '</div>' +
      '<button class="btn primary block" id="enterBtn" disabled>Enter FactoryAI2U</button>' +
      '<p class="muted" style="font-size:.72rem;margin-top:14px">Prototype persists to this browser only (localStorage). No live database is connected — configure one later in Admin ▸ Data Backend.</p>' +
      '</div></div>';
    var sel = null;
    App.querySelectorAll('.rp').forEach(function (b) {
      b.onclick = function () { App.querySelectorAll('.rp').forEach(function (x){x.classList.remove('sel');}); b.classList.add('sel'); sel = b.dataset.role; el('enterBtn').disabled = false; };
    });
    el('enterBtn').onclick = function () {
      if (!sel) return;
      var u = DB.load().users.filter(function (x) { return x.role === sel; })[0];
      S = { userId: u.id, role: sel };
      try { sessionStorage.setItem('factoryai2u.session', JSON.stringify(S)); } catch (e) {}
      route = 'dashboard'; drill = null; renderApp();
    };
  }

  /* ---------- APP SHELL ---------- */
  var MENU_META = {
    dashboard:   { label: 'Dashboard',    ic: '📊' },
    production:  { label: 'Production',    ic: '🏭' },
    breakdown:   { label: 'Breakdown / Andon', ic: '🚨' },
    quality:     { label: 'Quality',      ic: '🔎' },
    escalations: { label: 'Escalations',  ic: '⏱️' },
    exceptions:  { label: 'Exceptions',   ic: '⚠️' },
    loss:        { label: 'Loss & Profit',ic: '💰' },
    drilldown:   { label: 'Drill-Down',   ic: '🧭' },
    actions:     { label: 'Actions',      ic: '✅' },
    rca:         { label: 'RCA',          ic: '🧩' },
    myitems:     { label: 'My Items',     ic: '📌' },
    calculators: { label: 'Calculators',  ic: '🧮' },
    admin:       { label: 'Admin',        ic: '⚙️' },
    audit:       { label: 'Audit Log',    ic: '📜' }
  };

  function renderApp() {
    document.body.className = 'has-app';
    var u = DB.byId(DB.load().users, S.userId); var menus = DB.MENUS[S.role]; var c = counts();
    function badgeFor(m) {
      if (m==='breakdown' && c.openBd) return '<span class="chip escalated badge">'+c.openBd+'</span>';
      if (m==='quality' && c.openQa) return '<span class="chip open badge">'+c.openQa+'</span>';
      if ((m==='actions') && c.overdue) return '<span class="chip overdue badge">'+c.overdue+'</span>';
      if (m==='exceptions' && (c.escBd+c.overdue)) return '<span class="chip escalated badge">'+(c.escBd+c.overdue)+'</span>';
      if (m==='escalations' && c.escBd) return '<span class="chip escalated badge">'+c.escBd+'</span>';
      return '';
    }
    var nav = menus.map(function (m) {
      var meta = MENU_META[m];
      return '<button class="nav-item' + (m===route?' active':'') + '" data-route="' + m + '"><span class="ic">'+meta.ic+'</span>' + esc(meta.label) + badgeFor(m) + '</button>';
    }).join('');
    // mobile tab bar: pick up to 4 primary + andon shortcut for capture roles
    var tabMenus = menus.slice(0, 4);
    var tabs = tabMenus.map(function (m) { var meta = MENU_META[m]; return '<button data-route="'+m+'" class="'+(m===route?'active':'')+'"><span class="ic">'+meta.ic+'</span>'+esc(meta.label)+'</button>'; }).join('');
    var andonTab = (menus.indexOf('breakdown')>=0) ? '<button data-route="breakdown" class="andon-tab"><span class="ic">🚨</span>Andon</button>' : (menus.indexOf('calculators')>=0 ? '<button data-route="calculators" class="'+(route==='calculators'?'active':'')+'"><span class="ic">🧮</span>Calc</button>' : '');

    App.innerHTML =
      '<div class="app-shell">' +
        '<header class="topbar">' +
          '<div class="brand"><span class="dot"></span> FactoryAI2U</div>' +
          '<div class="spacer"></div>' +
          '<span class="role-chip">' + esc(u.name) + ' · ' + esc(DB.ROLES[S.role].name) + '</span>' +
          '<button class="icon-btn" id="logoutBtn" title="Sign out">⏻</button>' +
        '</header>' +
        '<div class="layout">' +
          '<aside class="sidebar"><div class="nav-group"><div class="label">' + esc(DB.ROLES[S.role].philosophy) + '</div>' + nav + '</div>' +
            '<div class="nav-group"><div class="label">Session</div><button class="nav-item" id="resetBtn"><span class="ic">♻️</span>Reset demo data</button></div>' +
          '</aside>' +
          '<main class="content" id="view"></main>' +
        '</div>' +
        '<nav class="tabbar">' + tabs + andonTab + '</nav>' +
      '</div>';

    App.querySelectorAll('[data-route]').forEach(function (b) { b.onclick = function () { go(b.dataset.route); }; });
    el('logoutBtn').onclick = function () { S = null; try { sessionStorage.removeItem('factoryai2u.session'); } catch(e){} renderLogin(); };
    el('resetBtn').onclick = function () { if (confirm('Reset all demo data to seed?')) { DB.reset(); toast('Demo data reset.'); go('dashboard'); } };
    renderView();
  }

  function go(r) { route = r; drill = null; renderApp(); window.scrollTo(0,0); }
  function refresh() { renderApp(); }

  /* ---------- VIEW ROUTER ---------- */
  function renderView() {
    var v = el('view'); if (!v) return;
    var fn = ({
      dashboard: viewDashboard, production: viewProduction, breakdown: viewBreakdown, quality: viewQuality,
      escalations: viewEscalations, exceptions: viewExceptions, loss: viewLoss, drilldown: viewDrilldown,
      actions: viewActions, rca: viewActions, myitems: viewMyItems, calculators: viewCalculators,
      admin: viewAdmin, audit: viewAudit
    })[route] || viewDashboard;
    fn(v);
  }

  function pageHead(title, sub, actions) {
    return '<div class="page-head"><div class="titles"><h1>' + esc(title) + '</h1><p>' + esc(sub) + '</p></div>' + (actions?'<div class="actions">'+actions+'</div>':'') + '</div>';
  }

  /* ---------- DASHBOARD (role-aware) ---------- */
  function viewDashboard(v) {
    var mgmt = DB.ROLES[S.role].mgmt; var k = kpis(); var c = counts(); var loss = lossFor();
    var head = pageHead(mgmt ? 'Management Cockpit' : 'Shift Dashboard',
      mgmt ? 'Exceptions first — tap any figure to drill to the source event.' : 'Your live shift picture. Capture at source; the system does the rest.');

    var kpiCards =
      '<div class="grid cols-4">' +
        kpiCard('OEE', k.oee.toFixed(1), '%', 'Target ' + DB.load().kpiTargets.oee + '%', k.oee>=DB.load().kpiTargets.oee, mgmt?'drilldown':null) +
        kpiCard('Quality Rate', k.quality.toFixed(1), '%', 'Good ÷ Total', k.quality>=DB.load().kpiTargets.quality, mgmt?'quality':null) +
        kpiCard('Production Ach.', k.achievement.toFixed(0), '%', 'Actual vs Plan', k.achievement>=95, mgmt?'production':null) +
        kpiCard('Downtime', fmt(k.dt), 'min', c.openBd + ' open breakdowns', k.dt<60, mgmt?'breakdown':null) +
      '</div>';

    var exceptions =
      '<div class="section-title"><h2>Live Exceptions</h2><div class="line"></div></div>' +
      '<div class="grid cols-2">' +
        exCard('Open Breakdowns', c.openBd, c.escBd + ' escalated', 'escalated', 'breakdown') +
        exCard('Open Quality Alerts', c.openQa, 'Containment / RCA in progress', 'open', 'quality') +
        exCard('Overdue Actions', c.overdue, c.openAct + ' actions total', 'overdue', 'actions') +
        exCard('Estimated Loss', loss.total, 'Downtime + NG + scrap', 'active', 'loss', true) +
      '</div>';

    var recent = recentEventsPanel();

    v.innerHTML = head + kpiCards + exceptions + recent;
    v.querySelectorAll('[data-goto]').forEach(function (b){ b.onclick = function(){ go(b.dataset.goto); }; });
    v.querySelectorAll('[data-open-bd]').forEach(function (b){ b.onclick=function(){ openBreakdown(b.dataset.openBd); }; });
    v.querySelectorAll('[data-open-qa]').forEach(function (b){ b.onclick=function(){ openQuality(b.dataset.openQa); }; });

    function kpiCard(label, val, unit, foot, ok, goto) {
      return '<div class="card kpi' + (goto?' drill clickable':'') + '"' + (goto?' data-goto="'+goto+'"':'') + '>' +
        '<div class="k-label">' + esc(label) + '</div>' +
        '<div class="k-value">' + val + ' <small>' + unit + '</small></div>' +
        '<div class="k-foot ' + (ok?'trend-up':'trend-down') + '">' + (ok?'▲ on target':'▼ below target') + ' · <span class="muted">' + esc(foot) + '</span></div>' +
      '</div>';
    }
    function exCard(label, val, foot, chip, goto, isMoney) {
      return '<div class="card clickable" data-goto="' + goto + '"><div class="kpi">' +
        '<div class="k-label">' + esc(label) + '</div>' +
        '<div class="k-value">' + (isMoney?money(val):fmt(val)) + '</div>' +
        '<div class="k-foot"><span class="chip ' + chip + '">' + esc(foot) + '</span></div>' +
      '</div></div>';
    }
  }

  function recentEventsPanel() {
    var s = DB.load();
    var items = [];
    s.breakdowns.forEach(function (b){ items.push({ t:new Date(b.start).getTime(), kind:'bd', o:b }); });
    s.quality.forEach(function (q){ items.push({ t:new Date(q.ts).getTime(), kind:'qa', o:q }); });
    items.sort(function(a,b){ return b.t-a.t; });
    items = items.slice(0, 6);
    var rows = items.map(function (it) {
      if (it.kind==='bd') { var b=it.o;
        return '<div class="list-row" data-open-bd="'+b.id+'"><div class="lr-main"><div class="t">🚨 '+esc(DB.name('machine',b.machine))+' · '+esc(b.category)+'</div><div class="s">'+esc(b.notes)+' · '+agoText(b.start)+'</div></div><div class="lr-side"><span class="chip '+b.status+'">'+b.status+'</span><small>'+b.downtimeMin+'m DT</small></div></div>';
      } else { var q=it.o;
        return '<div class="list-row" data-open-qa="'+q.id+'"><div class="lr-main"><div class="t">🔎 '+esc(DB.name('product',q.product))+' · '+esc(q.classification)+'</div><div class="s">'+esc(q.defectDesc)+' · '+agoText(q.ts)+'</div></div><div class="lr-side"><span class="chip '+q.status+'">'+q.status+'</span><small>NG '+q.confirmedNG+'</small></div></div>';
      }
    }).join('');
    return '<div class="section-title"><h2>Recent Events</h2><div class="line"></div></div><div class="list">' + (rows||'<div class="empty">No events yet.</div>') + '</div>';
  }

  /* ---------- PRODUCTION ---------- */
  function viewProduction(v) {
    var mgmt = DB.ROLES[S.role].mgmt; var s = DB.load();
    var actions = mgmt ? '' : '<button class="btn primary" id="newProd">＋ Record Production</button>';
    var rows = s.production.slice().reverse().map(function (p) {
      var ach = p.plan ? Math.round(p.good/p.plan*100) : 0;
      return '<tr data-id="'+p.id+'"><td>'+when(p.ts)+'</td><td>'+esc(DB.name('line',p.line))+'</td><td>'+esc(DB.name('machine',p.machine))+'</td><td>'+esc(DB.name('product',p.product))+'</td><td>'+fmt(p.good)+' / '+fmt(p.plan)+'</td><td>'+p.ng+'</td><td><span class="chip '+(ach>=95?'restored':'active')+'">'+ach+'%</span></td></tr>';
    }).join('');
    v.innerHTML = pageHead('Production', mgmt?'Output vs plan across lines (view & drill only).':'Record good/NG output and operating context.', actions) +
      '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Line</th><th>Machine</th><th>Product</th><th>Good / Plan</th><th>NG</th><th>Ach.</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="empty">No production recorded.</td></tr>')+'</tbody></table></div>';
    if (el('newProd')) el('newProd').onclick = productionForm;
  }

  function productionForm() {
    var s = DB.load();
    var body =
      '<div class="form-grid">' +
        selField('p_line','Line', s.lines) +
        selField('p_machine','Machine', s.machines) +
        selField('p_product','Part / Model / Customer', s.products, function(x){return x.part+' · '+x.model+' · '+x.customer;}) +
        selField('p_shift','Shift', s.shifts) +
        inpField('p_plan','Plan Qty','number',640) +
        inpField('p_good','Good Qty','number',600) +
        inpField('p_ng','NG Qty','number',10) +
        inpField('p_total','Total Output','number',620) +
      '</div>';
    modal('Record Production', body, '<button class="btn ghost" onclick="void 0" id="pc">Cancel</button><button class="btn primary" id="ps">Save</button>');
    el('pc').onclick = closeModal;
    el('ps').onclick = function () {
      s.production.push({ id: DB.uid('prd'), line: el('p_line').value, machine: el('p_machine').value, product: el('p_product').value,
        shift: el('p_shift').value, by: S.userId, plan: num(el('p_plan').value), good: num(el('p_good').value),
        ng: num(el('p_ng').value), total: num(el('p_total').value), ts: DB.nowISO() });
      DB.save(); DB.addAudit(S.userId, 'CREATE', 'Production recorded on ' + DB.name('machine', el('p_machine').value));
      closeModal(); toast('Production recorded — reused everywhere.'); renderApp();
    };
  }

  /* ---------- BREAKDOWN / ANDON ---------- */
  function viewBreakdown(v) {
    var mgmt = DB.ROLES[S.role].mgmt; var s = DB.load();
    var actions = (S.role==='operator'||S.role==='supervisor'||S.role==='maintenance') ? '<button class="btn andon" id="raiseBd">🚨 Raise Andon</button>' : '';
    var rows = s.breakdowns.slice().reverse().map(function (b) {
      var e = escSummary('breakdown', b.start, b.status);
      var escTxt = (b.status==='restored'||b.status==='closed') ? 'resolved' : ('L'+e.level+(e.next?' · next '+e.next.min+'m→'+e.next.to:' · max'));
      return '<tr data-id="'+b.id+'"><td>'+esc(DB.name('machine',b.machine))+'</td><td>'+esc(b.category)+'<br><small class="muted">'+esc(b.symptom)+'</small></td><td>'+b.downtimeMin+'m</td><td>'+b.affectedQty+'</td><td>'+agoText(b.start)+'</td><td><span class="chip '+b.status+'">'+b.status+'</span></td><td><small class="muted">'+escTxt+'</small></td></tr>';
    }).join('');
    v.innerHTML = pageHead('Breakdown / Andon', 'One record → response chain, loss & KPI. Escalation: 5→Supervisor, 10→Prod+Plant Head, 30→Division, 60→CEO.', actions) +
      '<div class="table-wrap"><table><thead><tr><th>Machine</th><th>Category</th><th>Downtime</th><th>Affected</th><th>Age</th><th>Status</th><th>Escalation</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="empty">No breakdowns.</td></tr>')+'</tbody></table></div>';
    v.querySelectorAll('tr[data-id]').forEach(function (r){ r.onclick=function(){ openBreakdown(r.dataset.id); }; });
    if (el('raiseBd')) el('raiseBd').onclick = breakdownForm;
  }

  function breakdownForm() {
    var s = DB.load();
    var body =
      '<div class="form-grid">' +
        selField('b_machine','Machine', s.machines) +
        selField('b_line','Line', s.lines) +
        selField('b_product','Part / Model / Customer', s.products, function(x){return x.part+' · '+x.model;}) +
        selField('b_shift','Shift', s.shifts) +
        selRaw('b_mode','Running Mode', DB.RUNNING_MODES) +
        selRaw('b_cat','Breakdown Category', s.config.breakdownCategories) +
        selRaw('b_sym','Symptom', s.config.breakdownSymptoms) +
        inpField('b_out','Output at Downtime','number',600) +
        inpField('b_aff','Affected Quantity','number',20) +
        textField('b_notes','Notes / Immediate Observation','Short description...') +
      '</div>' +
      '<p class="muted" style="font-size:.8rem">Downtime start = now. This begins the Andon escalation clock immediately.</p>';
    modal('🚨 Raise Breakdown / Andon', body, '<button class="btn ghost" id="bc">Cancel</button><button class="btn andon" id="bs">Raise Andon Now</button>');
    el('bc').onclick = closeModal;
    el('bs').onclick = function () {
      var rec = { id: DB.uid('bd'), machine: el('b_machine').value, line: el('b_line').value, product: el('b_product').value,
        by: S.userId, shift: el('b_shift').value, runningMode: el('b_mode').value, category: el('b_cat').value,
        symptom: el('b_sym').value, outputAtDowntime: num(el('b_out').value), affectedQty: num(el('b_aff').value),
        downtimeMin: 0, notes: el('b_notes').value, start: DB.nowISO(), status: 'active', restoredAt: null, escalationLevel: 0 };
      s.breakdowns.push(rec); DB.save();
      DB.addAudit(S.userId, 'CREATE', 'Breakdown raised on ' + DB.name('machine', rec.machine) + ' (' + rec.category + ')');
      closeModal(); toast('Andon raised — Supervisor notified at 5 min.', 'warn'); renderApp();
    };
  }

  function openBreakdown(id) {
    var s = DB.load(); var b = DB.byId(s.breakdowns, id); if (!b) return;
    var e = escSummary('breakdown', b.start, b.status);
    var canRespond = ['supervisor','maintenance'].indexOf(S.role) >= 0;
    var linkedActs = s.actions.filter(function (a){ return a.srcType==='breakdown' && a.srcId===id; });
    var escList = DB.load().config.escalation.breakdown.map(function (r, i) {
      var reached = (b.status!=='restored'&&b.status!=='closed') && agoMin(b.start) >= r.min;
      return '<li><div class="tl-t">'+r.min+' min → '+esc(r.to)+' '+(reached?'<span class="chip escalated">reached</span>':'<span class="chip plain">pending</span>')+'</div></li>';
    }).join('');
    var body =
      '<dl class="kv">' +
        row('Machine', DB.name('machine',b.machine)) + row('Line', DB.name('line',b.line)) +
        row('Product', DB.name('product',b.product)) + row('Raised by', DB.name('user',b.by)+' · Shift '+b.shift) +
        row('Category', b.category + ' / ' + b.symptom) + row('Running Mode', b.runningMode) +
        row('Output at Downtime', fmt(b.outputAtDowntime)) + row('Affected Qty', fmt(b.affectedQty)) +
        row('Downtime', b.downtimeMin + ' min') + row('Started', when(b.start) + ' (' + agoText(b.start) + ')') +
        row('Status', '<span class="chip '+b.status+'">'+b.status+'</span>') + row('Notes', b.notes || '—') +
      '</dl>' +
      '<div class="section-title"><h2>Escalation Timeline</h2><div class="line"></div></div><ul class="timeline">'+escList+'</ul>' +
      (linkedActs.length? '<div class="section-title"><h2>Linked Actions</h2><div class="line"></div></div>'+linkedActs.map(actRow).join(''):'');
    var foot = canRespond ?
      (b.status!=='restored'&&b.status!=='closed' ?
        '<button class="btn" id="setDt">Set Downtime</button><button class="btn primary" id="restore">Mark Restored</button><button class="btn" id="addAct">＋ RCA / Action</button>' :
        '<button class="btn" id="addAct">＋ RCA / Action</button>') : '<button class="btn ghost" id="bcx">Close</button>';
    modal('Breakdown · ' + DB.name('machine', b.machine), body, foot);
    if (el('bcx')) el('bcx').onclick = closeModal;
    if (el('setDt')) el('setDt').onclick = function () { var m = prompt('Downtime minutes so far:', String(agoMin(b.start))); if (m!=null){ b.downtimeMin = num(m); DB.save(); DB.addAudit(S.userId,'UPDATE','Downtime set '+b.downtimeMin+'m on '+DB.name('machine',b.machine)); closeModal(); openBreakdown(id); renderApp(); } };
    if (el('restore')) el('restore').onclick = function () { b.status='restored'; b.restoredAt=DB.nowISO(); if(!b.downtimeMin) b.downtimeMin=agoMin(b.start); DB.save(); DB.addAudit(S.userId,'RESTORE','Machine restored: '+DB.name('machine',b.machine)); closeModal(); toast('Machine restored — loss & KPI updated.'); renderApp(); };
    if (el('addAct')) el('addAct').onclick = function () { closeModal(); actionForm('breakdown', id, b.machine); };
    function row(k, val) { return '<dt>'+esc(k)+'</dt><dd>'+val+'</dd>'; }
  }

  /* ---------- QUALITY ---------- */
  function viewQuality(v) {
    var s = DB.load();
    var actions = (['operator','qa','supervisor'].indexOf(S.role)>=0) ? '<button class="btn primary" id="newQa">＋ Quality Alert</button>' : '';
    var rows = s.quality.slice().reverse().map(function (q) {
      return '<tr data-id="'+q.id+'"><td>'+esc(DB.name('product',q.product))+'</td><td>'+esc(q.classification)+'</td><td>'+sevChip(q.severity)+'</td><td>'+q.suspectQty+'</td><td>'+q.confirmedNG+'</td><td>'+agoText(q.ts)+'</td><td><span class="chip '+q.status+'">'+q.status+'</span></td></tr>';
    }).join('');
    v.innerHTML = pageHead('Quality', 'Detect → Contain → Investigate → RCA → Correct → Verify → Close. Escalation: 10m→Sup, 1h→QA Head, 1 shift→Div, 1 day→CEO.', actions) +
      '<div class="table-wrap"><table><thead><tr><th>Product</th><th>Classification</th><th>Severity</th><th>Suspect</th><th>Conf. NG</th><th>Age</th><th>Status</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="empty">No quality alerts.</td></tr>')+'</tbody></table></div>';
    v.querySelectorAll('tr[data-id]').forEach(function (r){ r.onclick=function(){ openQuality(r.dataset.id); }; });
    if (el('newQa')) el('newQa').onclick = qualityForm;
  }

  function qualityForm() {
    var s = DB.load();
    var body =
      '<div class="form-grid">' +
        selField('q_line','Line', s.lines) +
        selField('q_product','Part / Model / Customer', s.products, function(x){return x.part+' · '+x.model+' · '+x.customer;}) +
        selField('q_machine','Machine / Process', s.machines) +
        selField('q_shift','Shift', s.shifts) +
        selRaw('q_class','Classification', s.config.qualityClass) +
        selRaw('q_sev','Severity', s.config.qualitySeverity) +
        inpField('q_susp','Suspected Qty','number',100) +
        inpField('q_ng','Confirmed NG','number',0) +
        textField('q_desc','Defect Description','What was observed...') +
      '</div>';
    modal('🔎 Quality Alert', body, '<button class="btn ghost" id="qc">Cancel</button><button class="btn primary" id="qs">Raise Alert</button>');
    el('qc').onclick = closeModal;
    el('qs').onclick = function () {
      var rec = { id: DB.uid('ql'), line: el('q_line').value, product: el('q_product').value, machine: el('q_machine').value,
        process: DB.name('machine', el('q_machine').value), shift: el('q_shift').value, by: S.userId,
        classification: el('q_class').value, severity: el('q_sev').value, suspectQty: num(el('q_susp').value),
        confirmedNG: num(el('q_ng').value), defectDesc: el('q_desc').value, ts: DB.nowISO(), status: 'open' };
      s.quality.push(rec); DB.save();
      DB.addAudit(S.userId, 'CREATE', 'Quality alert on ' + DB.name('product', rec.product) + ' (' + rec.classification + '/' + rec.severity + ')');
      closeModal(); toast('Quality alert raised — containment starts.', 'warn'); renderApp();
    };
  }

  var QA_STATES = ['open','containment','rca','closed'];
  function openQuality(id) {
    var s = DB.load(); var q = DB.byId(s.quality, id); if (!q) return;
    var canWork = ['qa','supervisor'].indexOf(S.role) >= 0;
    var linkedActs = s.actions.filter(function (a){ return a.srcType==='quality' && a.srcId===id; });
    var steps = ['Detect','Contain','Investigate','RCA','Correct','Verify','Close'];
    var curIdx = ({open:0, containment:1, rca:3, closed:6})[q.status] || 0;
    var life = '<ul class="timeline">'+steps.map(function (st,i){ return '<li><div class="tl-t">'+st+(i<=curIdx?' <span class="chip restored">done</span>':(i===curIdx+1?' <span class="chip active">next</span>':''))+'</div></li>'; }).join('')+'</ul>';
    var body =
      '<dl class="kv">' +
        r('Product', DB.name('product',q.product)) + r('Line', DB.name('line',q.line)) +
        r('Classification', q.classification) + r('Severity', sevChip(q.severity)) +
        r('Suspect Qty', fmt(q.suspectQty)) + r('Confirmed NG', fmt(q.confirmedNG)) +
        r('Machine / Process', q.process) + r('Raised by', DB.name('user',q.by)+' · '+agoText(q.ts)) +
        r('Status', '<span class="chip '+q.status+'">'+q.status+'</span>') + r('Description', q.defectDesc||'—') +
      '</dl>' +
      '<div class="section-title"><h2>Quality Lifecycle</h2><div class="line"></div></div>' + life +
      (linkedActs.length? '<div class="section-title"><h2>Linked Actions</h2><div class="line"></div></div>'+linkedActs.map(actRow).join(''):'');
    var foot = canWork ?
      '<button class="btn" id="advQa">Advance Stage</button><button class="btn" id="setNg">Set Confirmed NG</button><button class="btn primary" id="qaAct">＋ RCA / Action</button>' :
      '<button class="btn ghost" id="qcx">Close</button>';
    modal('Quality · ' + DB.name('product', q.product), body, foot);
    if (el('qcx')) el('qcx').onclick = closeModal;
    if (el('advQa')) el('advQa').onclick = function () { var i = QA_STATES.indexOf(q.status); if (i < QA_STATES.length-1){ q.status = QA_STATES[i+1]; DB.save(); DB.addAudit(S.userId,'UPDATE','Quality advanced to '+q.status+' on '+DB.name('product',q.product)); closeModal(); openQuality(id); renderApp(); } };
    if (el('setNg')) el('setNg').onclick = function () { var n = prompt('Confirmed NG quantity:', String(q.confirmedNG)); if (n!=null){ q.confirmedNG=num(n); DB.save(); closeModal(); openQuality(id); renderApp(); } };
    if (el('qaAct')) el('qaAct').onclick = function () { closeModal(); actionForm('quality', id, q.machine); };
    function r(k,val){ return '<dt>'+esc(k)+'</dt><dd>'+val+'</dd>'; }
  }

  /* ---------- ESCALATIONS ---------- */
  function viewEscalations(v) {
    var s = DB.load();
    var open = s.breakdowns.filter(function (b){ return b.status!=='restored'&&b.status!=='closed'; })
      .concat([]); // breakdowns only for supervisor view; quality shown too
    var qopen = s.quality.filter(function (q){ return q.status!=='closed'; });
    var rows = open.map(function (b){ var e=escSummary('breakdown',b.start,b.status); return escRow('🚨 '+DB.name('machine',b.machine), b.category, agoMin(b.start), e, function(){openBreakdown(b.id);}, b.id, 'bd'); })
      .concat(qopen.map(function (q){ var e=escSummary('quality',q.ts,q.status); return escRow('🔎 '+DB.name('product',q.product), q.classification, agoMin(q.ts), e, null, q.id, 'qa'); }));
    v.innerHTML = pageHead('Escalations', 'Active response obligations measured against defined thresholds.') +
      '<div class="list">' + (rows.join('')||'<div class="empty">No active escalations. 👍</div>') + '</div>';
    v.querySelectorAll('[data-bd]').forEach(function(r){ r.onclick=function(){ openBreakdown(r.dataset.bd); }; });
    v.querySelectorAll('[data-qa]').forEach(function(r){ r.onclick=function(){ openQuality(r.dataset.qa); }; });
    function escRow(title, sub, mins, e, cb, id, kind) {
      var meets = e.next ? (mins < e.next.min) : true;
      return '<div class="list-row" data-'+kind+'="'+id+'"><div class="lr-main"><div class="t">'+esc(title)+'</div><div class="s">'+esc(sub)+' · '+mins+' min elapsed'+(e.next?' · next: '+e.next.min+'m → '+esc(e.next.to):' · max level')+'</div></div><div class="lr-side"><span class="chip '+(e.level>=2?'escalated':'active')+'">Level '+e.level+'</span></div></div>';
    }
  }

  /* ---------- EXCEPTIONS (management) ---------- */
  function viewExceptions(v) {
    var s = DB.load();
    var bd = s.breakdowns.filter(function(b){return b.status==='escalated'||b.status==='active';});
    var qa = s.quality.filter(function(q){return q.status!=='closed'&&(q.severity==='Critical'||q.severity==='Major');});
    var ov = s.actions.filter(function(a){return a.status==='overdue';});
    v.innerHTML = pageHead('Exceptions', 'Management by exception — deviations, risks, losses and overdue actions only.') +
      block('Escalated / Active Breakdowns', bd.map(function(b){ return '<div class="list-row" data-bd="'+b.id+'"><div class="lr-main"><div class="t">'+esc(DB.name('machine',b.machine))+' · '+esc(b.category)+'</div><div class="s">'+b.downtimeMin+'m downtime · '+b.affectedQty+' affected · '+agoText(b.start)+'</div></div><div class="lr-side"><span class="chip '+b.status+'">'+b.status+'</span></div></div>'; })) +
      block('Critical / Major Quality', qa.map(function(q){ return '<div class="list-row" data-qa="'+q.id+'"><div class="lr-main"><div class="t">'+esc(DB.name('product',q.product))+' · '+esc(q.classification)+'</div><div class="s">NG '+q.confirmedNG+' · suspect '+q.suspectQty+' · '+esc(q.process)+'</div></div><div class="lr-side">'+sevChip(q.severity)+'</div></div>'; })) +
      block('Overdue Actions', ov.map(actRow));
    v.querySelectorAll('[data-bd]').forEach(function(r){ r.onclick=function(){ openBreakdown(r.dataset.bd); }; });
    v.querySelectorAll('[data-qa]').forEach(function(r){ r.onclick=function(){ openQuality(r.dataset.qa); }; });
    function block(t, arr){ return '<div class="section-title"><h2>'+esc(t)+'</h2><div class="line"></div></div><div class="list">'+(arr.join('')||'<div class="empty">None.</div>')+'</div>'; }
  }

  /* ---------- LOSS & PROFIT ---------- */
  function viewLoss(v) {
    var loss = lossFor(); var r = DB.load().rates;
    v.innerHTML = pageHead('Loss & Profit', 'Operational losses translated into financial impact. Uses configurable standard rates (Admin).') +
      '<div class="grid cols-4">' +
        lc('Total Estimated Loss', money(loss.total), 'Downtime + Quality + Scrap', 'escalated') +
        lc('Downtime Loss', money(loss.dtCost), loss.dtMin+' min × '+money(r.downtimeCostPerMin)+'/min', 'active') +
        lc('Quality (NG) Loss', money(loss.ngCost), loss.ng+' NG × '+money(r.scrapCostPerUnit)+'/pc', 'contained') +
        lc('Scrap Loss', money(loss.scrapCost), loss.scrap+' scrap units', 'open') +
      '</div>' +
      '<div class="section-title"><h2>Loss Breakdown</h2><div class="line"></div></div>' +
      '<div class="card">' + lossBar('Downtime', loss.dtCost, loss.total) + lossBar('Quality NG', loss.ngCost, loss.total) + lossBar('Scrap / Material', loss.scrapCost, loss.total) + '</div>' +
      '<p class="muted" style="font-size:.8rem;margin-top:12px">⚠ Financial rule (Manual §10): demo rates must never be treated as actual company costing. Configure approved standard rates in Admin ▸ Standard Rates.</p>';
    function lc(l,v_,f,chip){ return '<div class="card kpi"><div class="k-label">'+esc(l)+'</div><div class="k-value">'+v_+'</div><div class="k-foot"><span class="chip '+chip+'">'+esc(f)+'</span></div></div>'; }
    function lossBar(l, val, tot){ var p = tot? Math.round(val/tot*100):0; return '<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:5px"><span>'+esc(l)+'</span><strong>'+money(val)+' ('+p+'%)</strong></div><div class="bar"><span style="width:'+p+'%"></span></div></div>'; }
  }

  /* ---------- DRILL-DOWN (management) ---------- */
  function viewDrilldown(v) {
    var s = DB.load();
    drill = drill || { level: 'plant', id: null };
    var crumbs = drillCrumbs();
    var html = pageHead('Drill-Down', 'KPI / exception → Plant → Area → Line → Machine → Event → Cause → Action.') + crumbs;
    if (drill.level === 'plant') {
      html += grid(s.plants.map(function (p){ return dcard(p.name, machinesInPlant(p.id).length + ' machines · '+eventsInPlant(p.id)+' events', function(){ drill={level:'machine', id:p.id}; renderView(); }); }));
    } else if (drill.level === 'machine') {
      var ms = machinesInPlant(drill.id);
      html += grid(ms.map(function (m){ var ev=s.breakdowns.filter(function(b){return b.machine===m.id;}).length; return dcard(m.name, m.type+' · '+ev+' breakdowns', function(){ drill={level:'events', id:m.id, plant:drill.id}; renderView(); }); }));
    } else if (drill.level === 'events') {
      var bds = s.breakdowns.filter(function(b){return b.machine===drill.id;});
      var qas = s.quality.filter(function(q){return q.machine===drill.id;});
      html += '<div class="section-title"><h2>Events on '+esc(DB.name('machine',drill.id))+'</h2><div class="line"></div></div><div class="list">' +
        bds.map(function(b){ return '<div class="list-row" data-bd="'+b.id+'"><div class="lr-main"><div class="t">🚨 '+esc(b.category)+'</div><div class="s">'+b.downtimeMin+'m · '+agoText(b.start)+'</div></div><div class="lr-side"><span class="chip '+b.status+'">'+b.status+'</span></div></div>'; }).join('') +
        qas.map(function(q){ return '<div class="list-row" data-qa="'+q.id+'"><div class="lr-main"><div class="t">🔎 '+esc(q.classification)+'</div><div class="s">NG '+q.confirmedNG+' · '+agoText(q.ts)+'</div></div><div class="lr-side">'+sevChip(q.severity)+'</div></div>'; }).join('') +
        ((bds.length+qas.length)?'':'<div class="empty">No events on this machine.</div>') + '</div>';
    }
    v.innerHTML = html;
    v.querySelectorAll('[data-crumb]').forEach(function(b){ b.onclick=function(){ var lv=b.dataset.crumb; if(lv==='plant') drill={level:'plant',id:null}; else if(lv==='machine') drill={level:'machine',id:drill.plant||drill.id}; renderView(); }; });
    v.querySelectorAll('.card.clickable[data-idx]').forEach(function(c){ c.onclick = dcbacks[num(c.dataset.idx)]; });
    v.querySelectorAll('[data-bd]').forEach(function(r){ r.onclick=function(){ openBreakdown(r.dataset.bd); }; });
    v.querySelectorAll('[data-qa]').forEach(function(r){ r.onclick=function(){ openQuality(r.dataset.qa); }; });

    function machinesInPlant(pid){ var lines = linesInPlant(pid); return s.machines.filter(function(m){ return lines.indexOf(m.line)>=0; }); }
    function linesInPlant(pid){ var areas=s.areas.filter(function(a){return a.plant===pid;}).map(function(a){return a.id;});
      var stages=s.stages.filter(function(st){return areas.indexOf(st.area)>=0;}).map(function(st){return st.id;});
      return s.lines.filter(function(l){return stages.indexOf(l.stage)>=0;}).map(function(l){return l.id;}); }
    function eventsInPlant(pid){ var ms=machinesInPlant(pid).map(function(m){return m.id;}); return s.breakdowns.filter(function(b){return ms.indexOf(b.machine)>=0;}).length + s.quality.filter(function(q){return ms.indexOf(q.machine)>=0;}).length; }
    var dcbacks = [];
    function dcard(title, sub, cb){ var i = dcbacks.length; dcbacks.push(cb); return '<div class="card clickable" data-idx="'+i+'"><div class="kpi"><div class="k-value" style="font-size:1.1rem">'+esc(title)+'</div><div class="k-foot"><span class="muted">'+esc(sub)+'</span></div><div class="k-foot" style="color:var(--primary)">Drill in →</div></div></div>'; }
    function grid(cards){ return '<div class="grid cols-3">'+cards.join('')+'</div>'; }
    function drillCrumbs(){
      var c = ['<button data-crumb="plant">Enterprise / Plants</button>'];
      if (drill.level==='machine'||drill.level==='events') c.push('<span class="sep">›</span><button data-crumb="machine">'+esc(DB.name('plant',drill.plant||drill.id))+'</button>');
      if (drill.level==='events') c.push('<span class="sep">›</span><span>'+esc(DB.name('machine',drill.id))+'</span>');
      return '<div class="breadcrumbs">'+c.join('')+'</div>';
    }
  }

  /* ---------- ACTIONS / RCA ---------- */
  function actRow(a) {
    return '<div class="list-row" data-act="'+a.id+'"><div class="lr-main"><div class="t">'+esc(a.type)+' · '+esc(a.desc)+'</div><div class="s">Owner: '+esc(DB.name('user',a.owner))+' · Due '+dateStr(a.due)+' · '+esc(DB.name('machine',a.machine))+'</div></div><div class="lr-side"><span class="chip '+a.status+'">'+a.status+'</span></div></div>';
  }
  function viewActions(v) {
    var s = DB.load(); var mgmt = DB.ROLES[S.role].mgmt;
    var acts = s.actions.slice();
    // sort overdue first
    acts.sort(function(a,b){ var o={overdue:0,open:1,rca:2,closed:3}; return (o[a.status]||1)-(o[b.status]||1); });
    var tabs = '<div class="pill-tabs" id="actTabs">'+['all','open','overdue','closed'].map(function(t){ return '<button data-t="'+t+'"'+(t==='all'?' class="active"':'')+'>'+t[0].toUpperCase()+t.slice(1)+'</button>'; }).join('')+'</div>';
    v.innerHTML = pageHead(route==='rca'?'RCA & Corrective Actions':'Actions', 'Every problem → owner, due date, status, closure. No alert without an owner.', (!mgmt&&['qa','maintenance','supervisor'].indexOf(S.role)>=0)?'<button class="btn primary" id="newAct">＋ New Action</button>':'') +
      tabs + '<div class="list" id="actList"></div>';
    var filter = 'all';
    function paint(){ var list = acts.filter(function(a){ return filter==='all'||a.status===filter; });
      el('actList').innerHTML = list.map(actRow).join('')||'<div class="empty">No actions.</div>';
      el('actList').querySelectorAll('[data-act]').forEach(function(r){ r.onclick=function(){ openAction(r.dataset.act); }; }); }
    v.querySelectorAll('#actTabs button').forEach(function(b){ b.onclick=function(){ v.querySelectorAll('#actTabs button').forEach(function(x){x.classList.remove('active');}); b.classList.add('active'); filter=b.dataset.t; paint(); }; });
    if (el('newAct')) el('newAct').onclick = function(){ actionForm(null,null,null); };
    paint();
  }
  function openAction(id) {
    var s = DB.load(); var a = DB.byId(s.actions, id); if (!a) return;
    var can = ['qa','maintenance','supervisor'].indexOf(S.role)>=0;
    var body = '<dl class="kv">'+
      kv('Type', a.type)+kv('Description', a.desc)+kv('Owner', DB.name('user',a.owner))+
      kv('Machine', DB.name('machine',a.machine))+kv('Due', dateStr(a.due))+kv('Status','<span class="chip '+a.status+'">'+a.status+'</span>')+
      kv('Source', a.srcType?(a.srcType+' event'):'standalone')+kv('Created', when(a.created))+'</dl>';
    var foot = can ? '<button class="btn" id="reassign">Reassign</button><button class="btn" id="extend">Change Due</button>'+(a.status!=='closed'?'<button class="btn primary" id="closeAct">Close Action</button>':'') : '<button class="btn ghost" id="acx">Close</button>';
    modal('Action', body, foot);
    if (el('acx')) el('acx').onclick = closeModal;
    if (el('closeAct')) el('closeAct').onclick = function(){ a.status='closed'; DB.save(); DB.addAudit(S.userId,'CLOSE','Action closed: '+a.desc); closeModal(); toast('Action closed — loop complete.'); renderApp(); };
    if (el('reassign')) el('reassign').onclick = function(){ var opts=s.users.map(function(u){return u.id+':'+u.name;}).join(', '); var nv=prompt('Owner id ('+opts+')', a.owner); if(nv&&DB.byId(s.users,nv)){ a.owner=nv; DB.save(); closeModal(); openAction(id); } };
    if (el('extend')) el('extend').onclick = function(){ var nv=prompt('Due date (YYYY-MM-DD):', a.due.slice(0,10)); if(nv){ a.due=new Date(nv).toISOString(); a.status = new Date(nv)<new Date()?'overdue':'open'; DB.save(); closeModal(); openAction(id); renderApp(); } };
    function kv(k,val){ return '<dt>'+esc(k)+'</dt><dd>'+val+'</dd>'; }
  }
  function actionForm(srcType, srcId, machine) {
    var s = DB.load();
    var body = '<div class="form-grid">' +
      selRaw('a_type','Action Type', ['RCA / CA','Corrective','Preventive','Containment']) +
      selField('a_owner','Owner', s.users, function(u){return u.name+' ('+DB.ROLES[u.role].name+')';}) +
      selField('a_machine','Machine', s.machines) +
      inpField('a_due','Due Date','date', new Date(Date.now()+2*86400000).toISOString().slice(0,10)) +
      textField('a_desc','Action / Root Cause','Describe cause and corrective action...') +
      '</div>';
    modal('＋ RCA / Corrective Action', body, '<button class="btn ghost" id="ac">Cancel</button><button class="btn primary" id="as">Save</button>');
    if (machine) el('a_machine').value = machine;
    el('ac').onclick = closeModal;
    el('as').onclick = function(){
      var due = new Date(el('a_due').value).toISOString();
      s.actions.push({ id: DB.uid('act'), type: el('a_type').value, desc: el('a_desc').value, owner: el('a_owner').value,
        machine: el('a_machine').value, due: due, status: new Date(due)<new Date()?'overdue':'open',
        srcType: srcType||null, srcId: srcId||null, created: DB.nowISO() });
      DB.save(); DB.addAudit(S.userId,'CREATE','Action created: '+el('a_desc').value);
      closeModal(); toast('Action created with owner & due date.'); renderApp();
    };
  }

  /* ---------- MY ITEMS ---------- */
  function viewMyItems(v) {
    var s = DB.load();
    var myBd = s.breakdowns.filter(function(b){return b.by===S.userId;});
    var myQa = s.quality.filter(function(q){return q.by===S.userId;});
    var myAct = s.actions.filter(function(a){return a.owner===S.userId;});
    v.innerHTML = pageHead('My Items', 'Events you raised and actions you own.') +
      sec('My Actions', myAct.map(actRow)) +
      sec('My Breakdowns', myBd.map(function(b){return '<div class="list-row" data-bd="'+b.id+'"><div class="lr-main"><div class="t">'+esc(DB.name('machine',b.machine))+' · '+esc(b.category)+'</div><div class="s">'+agoText(b.start)+'</div></div><div class="lr-side"><span class="chip '+b.status+'">'+b.status+'</span></div></div>';})) +
      sec('My Quality Alerts', myQa.map(function(q){return '<div class="list-row" data-qa="'+q.id+'"><div class="lr-main"><div class="t">'+esc(DB.name('product',q.product))+' · '+esc(q.classification)+'</div><div class="s">'+agoText(q.ts)+'</div></div><div class="lr-side"><span class="chip '+q.status+'">'+q.status+'</span></div></div>';}));
    v.querySelectorAll('[data-bd]').forEach(function(r){r.onclick=function(){openBreakdown(r.dataset.bd);};});
    v.querySelectorAll('[data-qa]').forEach(function(r){r.onclick=function(){openQuality(r.dataset.qa);};});
    v.querySelectorAll('[data-act]').forEach(function(r){r.onclick=function(){openAction(r.dataset.act);};});
    function sec(t,arr){return '<div class="section-title"><h2>'+esc(t)+'</h2><div class="line"></div></div><div class="list">'+(arr.join('')||'<div class="empty">Nothing yet.</div>')+'</div>';}
  }

  /* ---------- CALCULATORS DIRECTORY ---------- */
  function viewCalculators(v) {
    v.innerHTML = pageHead('Manufacturing Calculators', 'Free operational calculators — production, quality, equipment, workers, material & financial performance.') +
      '<div class="pill-tabs" id="calcTabs"><button data-c="All" class="active">All</button>' + CALC.categories.map(function(c){ return '<button data-c="'+c+'">'+CALC.icon[c]+' '+c+'</button>'; }).join('') + '</div>' +
      '<div class="grid cols-3" id="calcGrid"></div>';
    var cat = 'All';
    function paint(){
      var list = CALC.list.filter(function(c){ return cat==='All'||c.cat===cat; });
      el('calcGrid').innerHTML = list.map(function(c){ return '<div class="card clickable" data-calc="'+c.id+'"><div class="kpi"><div class="k-foot"><span class="chip plain">'+CALC.icon[c.cat]+' '+esc(c.cat)+'</span></div><div class="k-value" style="font-size:1.05rem;margin-top:6px">'+esc(c.name)+'</div><div class="k-foot"><span class="muted">'+esc(c.desc)+'</span></div><div class="k-foot" style="color:var(--primary)">Open calculator →</div></div></div>'; }).join('');
      el('calcGrid').querySelectorAll('[data-calc]').forEach(function(cd){ cd.onclick=function(){ openCalc(cd.dataset.calc); }; });
    }
    v.querySelectorAll('#calcTabs button').forEach(function(b){ b.onclick=function(){ v.querySelectorAll('#calcTabs button').forEach(function(x){x.classList.remove('active');}); b.classList.add('active'); cat=b.dataset.c; paint(); }; });
    paint();
  }
  function openCalc(id) {
    var c = CALC.byId(id); if (!c) return;
    var fields = c.inputs.map(function(f){ return '<div class="field"><label>'+esc(f.label)+(f.unit?' <span class="muted">('+esc(f.unit)+')</span>':'')+'</label><input type="number" step="any" id="ci_'+f.key+'" value="'+f.def+'"></div>'; }).join('');
    var body = '<p class="muted" style="font-size:.85rem">'+esc(c.desc)+'</p><div class="form-grid">'+fields+'</div>' +
      '<div class="card" id="calcResult" style="margin-top:14px"><div class="kpi"><div class="k-label">Result</div><div class="k-value" id="cr_val">—</div><div class="k-foot muted" id="cr_note"></div></div><div id="cr_rows" style="margin-top:8px"></div></div>';
    modal(CALC.icon[c.cat] + ' ' + c.name, body, '<button class="btn ghost" id="cc">Close</button><button class="btn primary" id="crun">Calculate</button>');
    el('cc').onclick = closeModal;
    function run(){
      var vals = {}; c.inputs.forEach(function(f){ vals[f.key] = el('ci_'+f.key).value; });
      var res = c.compute(vals);
      el('cr_val').innerHTML = res.value + ' <small class="muted">' + esc(res.unit||'') + '</small>';
      el('cr_note').textContent = res.note || '';
      el('cr_rows').innerHTML = (res.rows||[]).map(function(r){ return '<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding:7px 0;font-size:.88rem"><span class="muted">'+esc(r[0])+'</span><strong>'+esc(r[1])+'</strong></div>'; }).join('');
    }
    el('crun').onclick = run;
    c.inputs.forEach(function(f){ el('ci_'+f.key).oninput = run; });
    run();
  }

  /* ---------- ADMIN (incl. Data Backend setup — CORE V1.5 phase) ---------- */
  function viewAdmin(v) {
    var s = DB.load();
    v.innerHTML = pageHead('Admin — Configuration', 'Configure company-specific masters, rules & rates without changing source code.') +
      '<div class="pill-tabs" id="admTabs">' +
        ['Data Backend','Masters','People & Roles','Escalation','KPI & Rates'].map(function(t,i){ return '<button data-a="'+t+'"'+(i===0?' class="active"':'')+'>'+esc(t)+'</button>'; }).join('') +
      '</div><div id="admBody"></div>';
    var tab = 'Data Backend';
    function paint(){
      var b = el('admBody');
      if (tab==='Data Backend') b.innerHTML = admDbBackend();
      else if (tab==='Masters') b.innerHTML = admMasters();
      else if (tab==='People & Roles') b.innerHTML = admPeople();
      else if (tab==='Escalation') b.innerHTML = admEscalation();
      else b.innerHTML = admKpiRates();
      wireAdmin(tab);
    }
    v.querySelectorAll('#admTabs button').forEach(function(bt){ bt.onclick=function(){ v.querySelectorAll('#admTabs button').forEach(function(x){x.classList.remove('active');}); bt.classList.add('active'); tab=bt.dataset.a; paint(); }; });
    paint();
  }

  function admDbBackend() {
    var cfg = DB.getDbConfig();
    return '<div class="card" style="border-left:4px solid var(--warn)">' +
      '<h3>🔌 Database Backend Connection <span class="chip plain">CORE V1.5</span></h3>' +
      '<p class="muted" style="font-size:.88rem">This prototype currently stores all data in <strong>this browser only</strong> (localStorage). No live database is registered yet. Enter your provider credentials here so an administrator can connect a shared backend (e.g. Supabase or Firebase) in a later phase (CORE V1.5+). ' +
      '<br><br>⚠ <strong>Security note (Manual §12):</strong> browser clients must never hold server-secret / service-role keys. Only public/anon keys belong here; privileged keys are configured server-side at connection time.</p>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Provider</label><select id="db_provider"><option value="">— Not connected —</option><option value="Supabase"'+(cfg.provider==='Supabase'?' selected':'')+'>Supabase</option><option value="Firebase"'+(cfg.provider==='Firebase'?' selected':'')+'>Firebase</option><option value="Custom REST"'+(cfg.provider==='Custom REST'?' selected':'')+'>Custom REST API</option></select></div>' +
        '<div class="field"><label>Project / API URL</label><input id="db_url" placeholder="https://your-project.supabase.co" value="'+esc(cfg.url)+'"></div>' +
        '<div class="field"><label>Public / Anon Key</label><input id="db_anon" placeholder="public anon key" value="'+esc(cfg.anonKey)+'"></div>' +
        '<div class="field"><label>Database Name / Ref</label><input id="db_name" placeholder="factory_core" value="'+esc(cfg.dbName)+'"></div>' +
        '<div class="field"><label>Region</label><input id="db_region" placeholder="ap-southeast-1" value="'+esc(cfg.region)+'"></div>' +
        '<div class="field"><label>Service-role Handling</label><input id="db_srv" placeholder="Configured server-side only" value="'+esc(cfg.serviceRoleHint)+'"></div>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:14px"><button class="btn primary" id="db_save">Save Credentials</button><button class="btn" id="db_test" disabled title="Backend connection is a later phase">Test Connection (later phase)</button><button class="btn ghost" id="db_clear">Clear</button></div>' +
      '<p class="muted" style="font-size:.78rem;margin-top:10px">Status: '+(cfg.savedAt? 'Credentials saved '+when(cfg.savedAt)+' · not yet connected':'No credentials saved')+'. Connecting the live backend is scoped for CORE V1.5+.</p>' +
    '</div>';
  }
  function admMasters() {
    var s = DB.load();
    function tbl(title, arr, cols){ return '<div class="section-title"><h2>'+esc(title)+'</h2><div class="line"></div></div><div class="table-wrap"><table><thead><tr>'+cols.map(function(c){return '<th>'+esc(c[0])+'</th>';}).join('')+'</tr></thead><tbody>'+arr.map(function(o){return '<tr>'+cols.map(function(c){return '<td>'+esc(o[c[1]]||'')+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>'; }
    return '<p class="muted">Company structure and product masters. Add/edit is scoped for the full Admin build; the model below is fully configurable (Manual §11).</p>' +
      tbl('Plants', s.plants, [['ID','id'],['Name','name'],['Division','division']]) +
      tbl('Lines', s.lines, [['ID','id'],['Name','name'],['Stage','stage']]) +
      tbl('Machines', s.machines, [['ID','id'],['Name','name'],['Type','type'],['Line','line']]) +
      tbl('Products', s.products, [['Part No','partNo'],['Part','part'],['Model','model'],['Customer','customer']]);
  }
  function admPeople() {
    var s = DB.load();
    var rows = s.users.map(function(u){ return '<tr><td>'+esc(u.name)+'</td><td>'+esc(DB.ROLES[u.role].name)+'</td><td>'+esc(u.shift)+'</td><td>'+esc(u.scope)+'</td><td class="muted" style="white-space:normal;font-size:.8rem">'+DB.MENUS[u.role].map(function(m){return MENU_META[m].label;}).join(', ')+'</td></tr>'; }).join('');
    return '<p class="muted">Users, roles, shifts and the menus each role can access (role-to-function mapping, Manual §11).</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Shift</th><th>Scope</th><th>Accessible Menus</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function admEscalation() {
    var esc_ = DB.load().config.escalation;
    function tbl(kind, arr){ return '<div class="section-title"><h2>'+(kind==='breakdown'?'Breakdown / Andon':'Quality')+' Escalation</h2><div class="line"></div></div><div class="table-wrap"><table><thead><tr><th>Threshold (min)</th><th>Notify</th></tr></thead><tbody>'+arr.map(function(r,i){return '<tr><td><input type="number" data-esc="'+kind+'" data-i="'+i+'" data-f="min" value="'+r.min+'" style="min-height:38px"></td><td><input data-esc="'+kind+'" data-i="'+i+'" data-f="to" value="'+esc(r.to)+'" style="min-height:38px"></td></tr>';}).join('')+'</tbody></table></div>'; }
    return '<p class="muted">Threshold minutes and recipients are configurable (Manual §6/§7). Changes are audited.</p>'+tbl('breakdown', esc_.breakdown)+tbl('quality', esc_.quality)+'<div class="btn-row" style="margin-top:14px"><button class="btn primary" id="esc_save">Save Escalation Rules</button></div>';
  }
  function admKpiRates() {
    var s = DB.load(); var k = s.kpiTargets; var r = s.rates;
    return '<div class="section-title"><h2>KPI Targets</h2><div class="line"></div></div><div class="form-grid">' +
      inpField('k_oee','OEE Target (%)','number',k.oee)+inpField('k_quality','Quality Target (%)','number',k.quality)+inpField('k_fpy','FPY Target (%)','number',k.fpy)+inpField('k_avail','Availability Target (%)','number',k.availability)+
      '</div>' +
      '<div class="section-title"><h2>Standard Rates <span class="chip plain">demo only — not real costing</span></h2><div class="line"></div></div><div class="form-grid">' +
      inpField('r_dt','Downtime Cost ($/min)','number',r.downtimeCostPerMin)+inpField('r_scrap','Scrap / NG Cost ($/pc)','number',r.scrapCostPerUnit)+inpField('r_rework','Rework Cost ($/pc)','number',r.ngReworkPerUnit)+
      '</div><div class="btn-row" style="margin-top:14px"><button class="btn primary" id="kpi_save">Save KPI & Rates</button></div>';
  }
  function wireAdmin(tab) {
    if (tab==='Data Backend') {
      el('db_save').onclick = function(){ var cfg = DB.saveDbConfig({ provider:el('db_provider').value, url:el('db_url').value, anonKey:el('db_anon').value, dbName:el('db_name').value, region:el('db_region').value, serviceRoleHint:el('db_srv').value }); DB.addAudit(S.userId,'CONFIG','Database credentials saved ('+(cfg.provider||'none')+')'); toast('Credentials saved locally. Live connection is a later phase.'); el('admBody').innerHTML = admDbBackend(); wireAdmin('Data Backend'); };
      el('db_clear').onclick = function(){ DB.saveDbConfig({provider:'',url:'',anonKey:'',dbName:'',region:'',serviceRoleHint:''}); toast('Credentials cleared.'); el('admBody').innerHTML = admDbBackend(); wireAdmin('Data Backend'); };
    } else if (tab==='Escalation') {
      el('esc_save').onclick = function(){ var s=DB.load(); document.querySelectorAll('[data-esc]').forEach(function(inp){ var kind=inp.dataset.esc, i=num(inp.dataset.i), f=inp.dataset.f; if(f==='min') s.config.escalation[kind][i].min=num(inp.value); else s.config.escalation[kind][i].to=inp.value; }); DB.save(); DB.addAudit(S.userId,'CONFIG','Escalation rules updated'); toast('Escalation rules saved.'); };
    } else if (tab==='KPI & Rates') {
      el('kpi_save').onclick = function(){ var s=DB.load(); s.kpiTargets.oee=num(el('k_oee').value); s.kpiTargets.quality=num(el('k_quality').value); s.kpiTargets.fpy=num(el('k_fpy').value); s.kpiTargets.availability=num(el('k_avail').value); s.rates.downtimeCostPerMin=num(el('r_dt').value); s.rates.scrapCostPerUnit=num(el('r_scrap').value); s.rates.ngReworkPerUnit=num(el('r_rework').value); DB.save(); DB.addAudit(S.userId,'CONFIG','KPI targets & standard rates updated'); toast('KPI targets & rates saved.'); };
    }
  }

  /* ---------- AUDIT ---------- */
  function viewAudit(v) {
    var s = DB.load();
    var rows = s.audit.map(function(l){ return '<tr><td>'+when(l.ts)+'</td><td>'+esc(DB.name('user',l.user))+'</td><td><span class="chip plain">'+esc(l.action)+'</span></td><td style="white-space:normal">'+esc(l.detail)+'</td></tr>'; }).join('');
    v.innerHTML = pageHead('Audit Log', 'Who · When · What. No silent deletion; significant activity is traceable (Manual §17).') +
      '<div class="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" class="empty">No audit entries.</td></tr>')+'</tbody></table></div>';
  }

  /* ---------- shared form field builders ---------- */
  function selField(id, label, arr, labeller) {
    var opts = arr.map(function(x){ return '<option value="'+esc(x.id)+'">'+esc(labeller?labeller(x):x.name)+'</option>'; }).join('');
    return '<div class="field"><label>'+esc(label)+' <span class="req">*</span></label><select id="'+id+'">'+opts+'</select></div>';
  }
  function selRaw(id, label, arr) {
    return '<div class="field"><label>'+esc(label)+' <span class="req">*</span></label><select id="'+id+'">'+arr.map(function(x){return '<option>'+esc(x)+'</option>';}).join('')+'</select></div>';
  }
  function inpField(id, label, type, def) { return '<div class="field"><label>'+esc(label)+'</label><input type="'+type+'" id="'+id+'" value="'+esc(def)+'"></div>'; }
  function textField(id, label, ph) { return '<div class="field full"><label>'+esc(label)+'</label><textarea id="'+id+'" placeholder="'+esc(ph)+'"></textarea></div>'; }
  function sevChip(sev) { var m={Critical:'crit',Major:'major',Minor:'minor',Observation:'plain'}; return '<span class="chip '+(m[sev]||'plain')+'">'+esc(sev)+'</span>'; }

  /* ---------- network status ---------- */
  function netStatus() {
    var b = el('net-banner');
    if (!navigator.onLine) { b.hidden = false; b.className = 'net-banner offline'; b.textContent = '⚡ Offline — data cached locally, transactions queue for sync (CORE V1.5+).'; }
    else { b.hidden = true; }
  }
  window.addEventListener('online', netStatus); window.addEventListener('offline', netStatus);

  /* ---------- boot ---------- */
  DB.load();
  try { var sv = sessionStorage.getItem('factoryai2u.session'); if (sv) S = JSON.parse(sv); } catch (e) {}
  if (S && DB.byId(DB.load().users, S.userId)) renderApp(); else renderLogin();
  netStatus();
})();
