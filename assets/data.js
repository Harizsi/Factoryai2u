/* @section: data-layer — FactoryAI2U CORE data model, seed data & persistence
   NOTE (up to CORE V1.5 — database backend setup): This prototype persists to
   browser localStorage only. No live database is connected yet. Admin > Data
   Backend holds credentials for the CORE V1.5 shared-database connection but
   does NOT transmit or store secrets remotely at this stage. */
(function (global) {
  'use strict';

  var LS_KEY = 'factoryai2u.core.v1';
  var CFG_KEY = 'factoryai2u.dbconfig.v1';

  /* ---------- Roles & permissions (Design Manual §5) ---------- */
  var ROLES = {
    operator:     { name: 'Operator',      philosophy: 'Record → Report → Andon',                     mgmt: false },
    supervisor:   { name: 'Supervisor',    philosophy: 'Monitor → Respond → Control → Escalate',      mgmt: false },
    qa:           { name: 'QA / QC',       philosophy: 'Detect → Contain → Investigate → Correct',    mgmt: false },
    maintenance:  { name: 'Maintenance',   philosophy: 'Respond → Diagnose → Restore → Prevent',      mgmt: false },
    plant_head:   { name: 'Plant Head',    philosophy: 'See → Drill → Decide → Follow Up',            mgmt: true },
    division_head:{ name: 'Division Head', philosophy: 'Compare → Systemic Loss → Improvement',       mgmt: true },
    ceo:          { name: 'CEO',           philosophy: 'Business Impact → Drill → Decide',            mgmt: true },
    admin:        { name: 'Admin',         philosophy: 'Configure → Govern → Secure',                 mgmt: false }
  };

  // Menu access per role. Management roles never get working-level entry menus (Manual §5 critical rule).
  var MENUS = {
    operator:      ['dashboard','production','breakdown','quality','myitems','calculators'],
    supervisor:    ['dashboard','breakdown','quality','production','escalations','actions','myitems','calculators'],
    qa:            ['dashboard','quality','actions','rca','myitems','calculators'],
    maintenance:   ['dashboard','breakdown','actions','myitems','calculators'],
    plant_head:    ['dashboard','exceptions','loss','drilldown','actions','audit','calculators'],
    division_head: ['dashboard','exceptions','loss','drilldown','actions','audit','calculators'],
    ceo:           ['dashboard','exceptions','loss','drilldown','audit','calculators'],
    admin:         ['dashboard','admin','audit','calculators']
  };

  /* ---------- Escalation rules (Manual §6, §7) ---------- */
  var ESCALATION = {
    breakdown: [
      { min: 5,  to: 'Supervisor' },
      { min: 10, to: 'Production Head + Plant Head' },
      { min: 30, to: 'Division Head' },
      { min: 60, to: 'CEO' }
    ],
    quality: [
      { min: 10,   to: 'Supervisor' },
      { min: 60,   to: 'QA Head' },
      { min: 480,  to: 'Quality Division Head' },  // 1 shift ~ 8h
      { min: 1440, to: 'CEO' }                     // 1 day
    ]
  };

  var BREAKDOWN_CATEGORIES = ['Major','Minor','Mechanical','Electrical','Pneumatic','Hydraulic','Data Communication','Intermittent','Auto Stop','Manual Stop','Emergency Stop','Sudden Stop'];
  var BREAKDOWN_SYMPTOMS = ['Alert','Alarm','Abnormal Noise','Appearance','Vibration'];
  var QUALITY_CLASS = ['Safety Critical','Functional','Fitting','Appearance','Reliability','Dimensional'];
  var QUALITY_SEVERITY = ['Critical','Major','Minor','Observation'];
  var RUNNING_MODES = ['Normal Production','Trial','Auto','Manual'];

  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowISO() { return new Date().toISOString(); }
  function minAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

  /* ---------- Seed (neutral fictional demo data — Manual §11) ---------- */
  function seed() {
    var users = [
      { id: 'u1', name: 'Aiman R.',   role: 'operator',      shift: 'A', scope: 'P1' },
      { id: 'u2', name: 'Siti N.',    role: 'supervisor',    shift: 'A', scope: 'P1' },
      { id: 'u3', name: 'Ravi K.',    role: 'qa',            shift: 'A', scope: 'P1' },
      { id: 'u4', name: 'Chong W.',   role: 'maintenance',   shift: 'A', scope: 'P1' },
      { id: 'u5', name: 'Faridah M.', role: 'plant_head',    shift: '-', scope: 'P1' },
      { id: 'u6', name: 'Daniel T.',  role: 'division_head', shift: '-', scope: 'D1' },
      { id: 'u7', name: 'Grace L.',   role: 'ceo',           shift: '-', scope: 'ALL' },
      { id: 'u8', name: 'Admin',      role: 'admin',         shift: '-', scope: 'ALL' }
    ];

    var org = {
      company: 'Generic Manufacturing Co.',
      divisions: [
        { id: 'D1', name: 'Division North' },
        { id: 'D2', name: 'Division South' }
      ],
      plants: [
        { id: 'P1', name: 'Plant Alpha', division: 'D1' },
        { id: 'P2', name: 'Plant Beta',  division: 'D2' }
      ],
      areas: [
        { id: 'A1', name: 'Machining',  plant: 'P1' },
        { id: 'A2', name: 'Assembly',   plant: 'P1' },
        { id: 'A3', name: 'Moulding',   plant: 'P2' }
      ],
      stages: [
        { id: 'S1', name: 'CNC Turning', area: 'A1' },
        { id: 'S2', name: 'Milling',     area: 'A1' },
        { id: 'S3', name: 'Final Assy',  area: 'A2' },
        { id: 'S4', name: 'Injection',   area: 'A3' }
      ],
      lines: [
        { id: 'L1', name: 'Line 1', stage: 'S1' },
        { id: 'L2', name: 'Line 2', stage: 'S2' },
        { id: 'L3', name: 'Line 3', stage: 'S3' },
        { id: 'L4', name: 'Line 4', stage: 'S4' }
      ],
      machines: [
        { id: 'M1', name: 'CNC-01', line: 'L1', type: 'CNC Lathe' },
        { id: 'M2', name: 'MILL-02', line: 'L2', type: 'VMC' },
        { id: 'M3', name: 'ASSY-03', line: 'L3', type: 'Assembly Cell' },
        { id: 'M4', name: 'IMM-04', line: 'L4', type: 'Injection Moulder' }
      ],
      products: [
        { id: 'PR1', part: 'Shaft-A', partNo: 'SA-1001', model: 'MX', customer: 'Customer Blue' },
        { id: 'PR2', part: 'Housing-B', partNo: 'HB-2002', model: 'MX', customer: 'Customer Blue' },
        { id: 'PR3', part: 'Cover-C', partNo: 'CC-3003', model: 'GT', customer: 'Customer Green' }
      ],
      shifts: [
        { id: 'A', name: 'Shift A', start: '07:00', end: '15:00' },
        { id: 'B', name: 'Shift B', start: '15:00', end: '23:00' },
        { id: 'C', name: 'Shift C', start: '23:00', end: '07:00' }
      ]
    };

    var kpiTargets = { oee: 85, quality: 99, fpy: 97, availability: 90, performance: 95 };

    // Standard rates (Manual §10 financial rule: configurable, demo values are NOT real costing)
    var rates = { downtimeCostPerMin: 8.5, scrapCostPerUnit: 4.2, ngReworkPerUnit: 1.8, currency: 'USD' };

    var production = [
      prod('L1','M1','PR1','A','u1', 620, 604, 16, 640, minAgo(300)),
      prod('L2','M2','PR2','A','u1', 480, 470, 10, 500, minAgo(220)),
      prod('L3','M3','PR3','A','u1', 300, 291, 9, 320, minAgo(120)),
      prod('L4','M4','PR2','A','u1', 540, 520, 20, 560, minAgo(60))
    ];

    var breakdowns = [
      bd('M1','L1','PR1','u1','A', 'Major','Abnormal Noise', 604, 45, 24, 'Spindle noise then stop', minAgo(52), 'escalated', null),
      bd('M2','L2','PR2','u1','A', 'Electrical','Alarm', 470, 12, 8, 'Servo alarm', minAgo(18), 'active', null),
      bd('M4','L4','PR2','u1','A', 'Pneumatic','Alert', 520, 30, 15, 'Air pressure drop', minAgo(140), 'restored', minAgo(105))
    ];

    var quality = [
      qa_('L1','PR1','u1','A', 'Dimensional','Major', 120, 14, 'M1', 'CNC Turning', 'OD out of tolerance', minAgo(70), 'containment'),
      qa_('L3','PR3','u1','A', 'Appearance','Minor', 40, 6, 'M3', 'Final Assy', 'Scratch on cover', minAgo(200), 'rca'),
      qa_('L2','PR2','u1','A', 'Functional','Critical', 200, 22, 'M2', 'Milling', 'Threaded hole missing', minAgo(30), 'open')
    ];

    var actions = [
      act('RCA / CA', 'Replace spindle bearing on CNC-01', 'u4', 'M1', addDays(1), 'open', 'breakdown', breakdowns[0].id),
      act('Corrective', 'Recalibrate OD gauge & 100% sort suspect lot', 'u3', 'M1', addDays(-1), 'overdue', 'quality', quality[0].id),
      act('Preventive', 'Add air-pressure sensor alarm threshold', 'u4', 'M4', addDays(3), 'open', 'breakdown', breakdowns[2].id)
    ];

    var audit = [
      log('u1','CREATE','Production event L1/CNC-01 recorded', minAgo(300)),
      log('u1','CREATE','Breakdown raised on CNC-01 (Major)', minAgo(52)),
      log('u2','ESCALATE','CNC-01 breakdown escalated to Plant Head', minAgo(42)),
      log('u3','CREATE','Quality alert on Shaft-A (Dimensional/Major)', minAgo(70)),
      log('u8','CONFIG','KPI targets updated (OEE 85%)', minAgo(1440))
    ];

    return {
      version: 1, users: users, org: org, kpiTargets: kpiTargets, rates: rates,
      config: { breakdownCategories: BREAKDOWN_CATEGORIES.slice(), breakdownSymptoms: BREAKDOWN_SYMPTOMS.slice(),
                qualityClass: QUALITY_CLASS.slice(), qualitySeverity: QUALITY_SEVERITY.slice(),
                escalation: JSON.parse(JSON.stringify(ESCALATION)) },
      production: production, breakdowns: breakdowns, quality: quality,
      actions: actions, rca: [], audit: audit, queue: []
    };

    function prod(line, machine, product, shift, by, plan, good, ng, total, ts) {
      return { id: uid('prd'), line: line, machine: machine, product: product, shift: shift, by: by,
               plan: plan, good: good, ng: ng, total: total, ts: ts };
    }
    function bd(machine, line, product, by, shift, cat, sym, outAt, affected, dtMin, notes, start, status, restored) {
      return { id: uid('bd'), machine: machine, line: line, product: product, by: by, shift: shift,
               runningMode: 'Normal Production', category: cat, symptom: sym, outputAtDowntime: outAt,
               affectedQty: affected, downtimeMin: dtMin, notes: notes, start: start, status: status,
               restoredAt: restored, escalationLevel: 0 };
    }
    function qa_(line, product, by, shift, cls, sev, suspect, confirmedNG, machine, process, desc, ts, status) {
      return { id: uid('ql'), line: line, product: product, by: by, shift: shift, classification: cls,
               severity: sev, suspectQty: suspect, confirmedNG: confirmedNG, machine: machine, process: process,
               defectDesc: desc, ts: ts, status: status };
    }
    function act(type, desc, owner, machine, due, status, srcType, srcId) {
      return { id: uid('act'), type: type, desc: desc, owner: owner, machine: machine, due: due,
               status: status, srcType: srcType, srcId: srcId, created: nowISO() };
    }
    function log(uid_, action, detail, ts) { return { id: uid('lg'), user: uid_, action: action, detail: detail, ts: ts }; }
    function addDays(d) { var x = new Date(); x.setDate(x.getDate() + d); return x.toISOString(); }
  }

  /* ---------- Store ---------- */
  var _state = null;
  // Expose org children (plants/areas/stages/lines/machines/products/shifts/divisions)
  // as top-level references so both s.org.* (display lookups) and s.* (forms & CRUD) work.
  function bindOrg(st) {
    if (!st || !st.org) return st;
    var keys = ['divisions','plants','areas','stages','lines','machines','products','shifts'];
    keys.forEach(function (k) { if (!st.org[k]) st.org[k] = []; st[k] = st.org[k]; });
    return st;
  }
  function load() {
    if (_state) return _state;
    try { var raw = localStorage.getItem(LS_KEY); if (raw) { _state = bindOrg(JSON.parse(raw)); return _state; } } catch (e) {}
    _state = bindOrg(seed()); save(); return _state;
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(_state)); } catch (e) {} }
  function reset() { _state = bindOrg(seed()); save(); return _state; }

  function addAudit(user, action, detail) {
    load().audit.unshift({ id: uid('lg'), user: user, action: action, detail: detail, ts: nowISO() });
    save();
  }

  /* ---------- DB config (CORE V1.5 — database backend setup) ---------- */
  function getDbConfig() {
    try { var raw = localStorage.getItem(CFG_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return { provider: '', url: '', anonKey: '', serviceRoleHint: '', dbName: '', region: '', savedAt: '', connected: false };
  }
  function saveDbConfig(cfg) {
    cfg.savedAt = nowISO(); cfg.connected = false; // live connection is activated in the CORE V1.5 backend phase
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
    return cfg;
  }

  /* ---------- Lookups ---------- */
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function name(kind, id) {
    var s = load().org, m;
    if (kind === 'machine') { m = byId(s.machines, id); return m ? m.name : id; }
    if (kind === 'line')    { m = byId(s.lines, id);    return m ? m.name : id; }
    if (kind === 'product') { m = byId(s.products, id); return m ? (m.part + ' (' + m.partNo + ')') : id; }
    if (kind === 'user')    { m = byId(s.users, id);    return m ? m.name : id; }
    if (kind === 'plant')   { m = byId(s.plants, id);   return m ? m.name : id; }
    return id;
  }

  global.DB = {
    LS_KEY: LS_KEY, ROLES: ROLES, MENUS: MENUS, ESCALATION: ESCALATION,
    BREAKDOWN_CATEGORIES: BREAKDOWN_CATEGORIES, BREAKDOWN_SYMPTOMS: BREAKDOWN_SYMPTOMS,
    QUALITY_CLASS: QUALITY_CLASS, QUALITY_SEVERITY: QUALITY_SEVERITY, RUNNING_MODES: RUNNING_MODES,
    load: load, save: save, reset: reset, addAudit: addAudit,
    getDbConfig: getDbConfig, saveDbConfig: saveDbConfig,
    uid: uid, nowISO: nowISO, minAgo: minAgo, byId: byId, name: name
  };
})(window);
