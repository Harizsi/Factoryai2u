/* @section: calculators — Free manufacturing performance calculators
   Categories: Production, Quality, Equipment, Workers, Material, Financial.
   Each calculator declares inputs {key,label,unit,def} and a compute() that
   returns {value, unit, note} plus optional extra rows. Formulas are standard,
   widely-used manufacturing definitions. */
(function (global) {
  'use strict';

  function pct(n) { return (isFinite(n) ? (Math.round(n * 100) / 100) : 0); }
  function safe(n) { n = parseFloat(n); return isNaN(n) ? 0 : n; }
  function div(a, b) { return b === 0 ? 0 : a / b; }

  var CALCS = [
    /* ---------------- PRODUCTION ---------------- */
    {
      id: 'oee', cat: 'Production', name: 'OEE (Overall Equipment Effectiveness)',
      desc: 'Availability × Performance × Quality — the headline production KPI.',
      inputs: [
        { key: 'planned', label: 'Planned Production Time', unit: 'min', def: 480 },
        { key: 'downtime', label: 'Downtime', unit: 'min', def: 45 },
        { key: 'ideal', label: 'Ideal Cycle Time', unit: 'sec/pc', def: 30 },
        { key: 'total', label: 'Total Units Produced', unit: 'pcs', def: 820 },
        { key: 'good', label: 'Good Units', unit: 'pcs', def: 800 }
      ],
      compute: function (v) {
        var runTime = safe(v.planned) - safe(v.downtime);
        var avail = div(runTime, safe(v.planned));
        var perf = div((safe(v.ideal) / 60) * safe(v.total), runTime);
        var qual = div(safe(v.good), safe(v.total));
        var oee = avail * perf * qual;
        return { value: pct(oee * 100), unit: '%',
          rows: [
            ['Availability', pct(avail * 100) + ' %'],
            ['Performance', pct(perf * 100) + ' %'],
            ['Quality', pct(qual * 100) + ' %']
          ], note: 'World-class benchmark ≈ 85%.' };
      }
    },
    {
      id: 'availability', cat: 'Production', name: 'Availability',
      desc: 'Run time as a share of planned production time.',
      inputs: [
        { key: 'planned', label: 'Planned Time', unit: 'min', def: 480 },
        { key: 'downtime', label: 'Downtime', unit: 'min', def: 60 }
      ],
      compute: function (v) { var a = div(safe(v.planned) - safe(v.downtime), safe(v.planned));
        return { value: pct(a * 100), unit: '%', note: 'Run Time ÷ Planned Time.' }; }
    },
    {
      id: 'performance', cat: 'Production', name: 'Performance Efficiency',
      desc: 'Actual output speed vs ideal cycle time.',
      inputs: [
        { key: 'ideal', label: 'Ideal Cycle Time', unit: 'sec/pc', def: 30 },
        { key: 'total', label: 'Total Units', unit: 'pcs', def: 820 },
        { key: 'runtime', label: 'Run Time', unit: 'min', def: 420 }
      ],
      compute: function (v) { var p = div((safe(v.ideal) / 60) * safe(v.total), safe(v.runtime));
        return { value: pct(p * 100), unit: '%', note: '(Ideal Cycle × Total) ÷ Run Time.' }; }
    },
    {
      id: 'takt', cat: 'Production', name: 'Takt Time',
      desc: 'Pace of production required to meet customer demand.',
      inputs: [
        { key: 'avail', label: 'Available Time', unit: 'min', def: 450 },
        { key: 'demand', label: 'Customer Demand', unit: 'pcs', def: 900 }
      ],
      compute: function (v) { var t = div(safe(v.avail) * 60, safe(v.demand));
        return { value: pct(t), unit: 'sec/pc', note: 'One unit must complete every ' + pct(t) + ' s to meet demand.' }; }
    },
    {
      id: 'cycletime', cat: 'Production', name: 'Cycle Time & Throughput',
      desc: 'Average time per unit and units per hour.',
      inputs: [
        { key: 'runtime', label: 'Run Time', unit: 'min', def: 420 },
        { key: 'units', label: 'Units Produced', unit: 'pcs', def: 820 }
      ],
      compute: function (v) { var ct = div(safe(v.runtime) * 60, safe(v.units)); var tph = div(safe(v.units), safe(v.runtime) / 60);
        return { value: pct(ct), unit: 'sec/pc', rows: [['Throughput', pct(tph) + ' pcs/hr']], note: 'Run Time ÷ Units.' }; }
    },
    {
      id: 'capacity', cat: 'Production', name: 'Capacity Utilisation',
      desc: 'Actual output vs maximum possible output.',
      inputs: [
        { key: 'actual', label: 'Actual Output', unit: 'pcs', def: 820 },
        { key: 'max', label: 'Maximum Capacity', unit: 'pcs', def: 1000 }
      ],
      compute: function (v) { var u = div(safe(v.actual), safe(v.max));
        return { value: pct(u * 100), unit: '%', note: 'Actual ÷ Maximum Capacity.' }; }
    },

    /* ---------------- QUALITY ---------------- */
    {
      id: 'fpy', cat: 'Quality', name: 'First Pass Yield (FPY)',
      desc: 'Units passing without rework, as a share of units started.',
      inputs: [
        { key: 'started', label: 'Units Started', unit: 'pcs', def: 1000 },
        { key: 'rework', label: 'Reworked Units', unit: 'pcs', def: 25 },
        { key: 'scrap', label: 'Scrapped Units', unit: 'pcs', def: 15 }
      ],
      compute: function (v) { var good = safe(v.started) - safe(v.rework) - safe(v.scrap); var y = div(good, safe(v.started));
        return { value: pct(y * 100), unit: '%', note: '(Started − Rework − Scrap) ÷ Started.' }; }
    },
    {
      id: 'ppm', cat: 'Quality', name: 'Defect Rate (PPM)',
      desc: 'Defective parts per million — supplier/quality standard.',
      inputs: [
        { key: 'defects', label: 'Defective Units', unit: 'pcs', def: 12 },
        { key: 'total', label: 'Total Inspected', unit: 'pcs', def: 5000 }
      ],
      compute: function (v) { var ppm = div(safe(v.defects), safe(v.total)) * 1e6;
        return { value: Math.round(ppm), unit: 'PPM', rows: [['Defect %', pct(div(safe(v.defects), safe(v.total)) * 100) + ' %']], note: '(Defects ÷ Total) × 1,000,000.' }; }
    },
    {
      id: 'scraprate', cat: 'Quality', name: 'Scrap & Rework Rate',
      desc: 'Share of production scrapped or reworked.',
      inputs: [
        { key: 'scrap', label: 'Scrap Units', unit: 'pcs', def: 15 },
        { key: 'rework', label: 'Rework Units', unit: 'pcs', def: 25 },
        { key: 'total', label: 'Total Produced', unit: 'pcs', def: 1000 }
      ],
      compute: function (v) { var s = div(safe(v.scrap), safe(v.total)); var r = div(safe(v.rework), safe(v.total));
        return { value: pct(s * 100), unit: '% scrap', rows: [['Rework Rate', pct(r * 100) + ' %'], ['Combined', pct((s + r) * 100) + ' %']], note: 'Scrap ÷ Total.' }; }
    },
    {
      id: 'sigma', cat: 'Quality', name: 'Process Sigma (approx.)',
      desc: 'Approximate sigma level from defect rate (DPMO).',
      inputs: [
        { key: 'defects', label: 'Defects', unit: 'ea', def: 12 },
        { key: 'units', label: 'Units', unit: 'pcs', def: 5000 },
        { key: 'opps', label: 'Opportunities / Unit', unit: 'ea', def: 1 }
      ],
      compute: function (v) {
        var dpmo = div(safe(v.defects), safe(v.units) * safe(v.opps)) * 1e6;
        var yieldp = 1 - div(safe(v.defects), safe(v.units) * safe(v.opps));
        // Approximate sigma: normsinv(yield) + 1.5 shift
        var sigma = approxSigma(yieldp) + 1.5;
        return { value: pct(sigma), unit: 'σ', rows: [['DPMO', Math.round(dpmo)], ['Yield', pct(yieldp * 100) + ' %']], note: 'Includes 1.5σ long-term shift.' };
      }
    },
    {
      id: 'cpk', cat: 'Quality', name: 'Process Capability (Cp / Cpk)',
      desc: 'Capability of a process to meet specification limits.',
      inputs: [
        { key: 'usl', label: 'Upper Spec Limit', unit: '', def: 10.5 },
        { key: 'lsl', label: 'Lower Spec Limit', unit: '', def: 9.5 },
        { key: 'mean', label: 'Process Mean', unit: '', def: 10.1 },
        { key: 'sd', label: 'Std Deviation (σ)', unit: '', def: 0.12 }
      ],
      compute: function (v) {
        var cp = div(safe(v.usl) - safe(v.lsl), 6 * safe(v.sd));
        var cpu = div(safe(v.usl) - safe(v.mean), 3 * safe(v.sd));
        var cpl = div(safe(v.mean) - safe(v.lsl), 3 * safe(v.sd));
        var cpk = Math.min(cpu, cpl);
        return { value: pct(cpk), unit: 'Cpk', rows: [['Cp', pct(cp)], ['Cpu', pct(cpu)], ['Cpl', pct(cpl)]], note: 'Cpk ≥ 1.33 generally acceptable.' };
      }
    },

    /* ---------------- EQUIPMENT ---------------- */
    {
      id: 'mtbf', cat: 'Equipment', name: 'MTBF (Mean Time Between Failures)',
      desc: 'Average operating time between breakdowns — reliability.',
      inputs: [
        { key: 'optime', label: 'Total Operating Time', unit: 'hrs', def: 720 },
        { key: 'failures', label: 'Number of Failures', unit: 'ea', def: 6 }
      ],
      compute: function (v) { var m = div(safe(v.optime), safe(v.failures));
        return { value: pct(m), unit: 'hrs', note: 'Operating Time ÷ Failures. Higher is better.' }; }
    },
    {
      id: 'mttr', cat: 'Equipment', name: 'MTTR (Mean Time To Repair)',
      desc: 'Average time to restore equipment after failure — maintainability.',
      inputs: [
        { key: 'repair', label: 'Total Repair Time', unit: 'hrs', def: 9 },
        { key: 'failures', label: 'Number of Repairs', unit: 'ea', def: 6 }
      ],
      compute: function (v) { var m = div(safe(v.repair), safe(v.failures));
        return { value: pct(m), unit: 'hrs', note: 'Repair Time ÷ Repairs. Lower is better.' }; }
    },
    {
      id: 'avail_eq', cat: 'Equipment', name: 'Equipment Availability (MTBF/MTTR)',
      desc: 'Uptime from reliability & maintainability.',
      inputs: [
        { key: 'mtbf', label: 'MTBF', unit: 'hrs', def: 120 },
        { key: 'mttr', label: 'MTTR', unit: 'hrs', def: 1.5 }
      ],
      compute: function (v) { var a = div(safe(v.mtbf), safe(v.mtbf) + safe(v.mttr));
        return { value: pct(a * 100), unit: '%', note: 'MTBF ÷ (MTBF + MTTR).' }; }
    },
    {
      id: 'downtimecost', cat: 'Equipment', name: 'Downtime Loss',
      desc: 'Lost units and cost from equipment downtime.',
      inputs: [
        { key: 'downtime', label: 'Downtime', unit: 'min', def: 45 },
        { key: 'cycle', label: 'Ideal Cycle Time', unit: 'sec/pc', def: 30 },
        { key: 'rate', label: 'Cost per Minute', unit: '$/min', def: 8.5 }
      ],
      compute: function (v) { var lost = div(safe(v.downtime) * 60, safe(v.cycle)); var cost = safe(v.downtime) * safe(v.rate);
        return { value: Math.round(lost), unit: 'units lost', rows: [['Downtime Cost', '$' + pct(cost)]], note: 'Lost units = Downtime ÷ Cycle Time.' }; }
    },

    /* ---------------- WORKERS ---------------- */
    {
      id: 'labor_prod', cat: 'Workers', name: 'Labour Productivity',
      desc: 'Output per labour hour.',
      inputs: [
        { key: 'output', label: 'Total Output', unit: 'pcs', def: 2400 },
        { key: 'hours', label: 'Total Labour Hours', unit: 'hrs', def: 160 }
      ],
      compute: function (v) { var p = div(safe(v.output), safe(v.hours));
        return { value: pct(p), unit: 'pcs/hr', note: 'Output ÷ Labour Hours.' }; }
    },
    {
      id: 'labor_eff', cat: 'Workers', name: 'Labour Efficiency',
      desc: 'Standard (earned) hours vs actual hours worked.',
      inputs: [
        { key: 'std', label: 'Standard Hours Earned', unit: 'hrs', def: 150 },
        { key: 'actual', label: 'Actual Hours Worked', unit: 'hrs', def: 160 }
      ],
      compute: function (v) { var e = div(safe(v.std), safe(v.actual));
        return { value: pct(e * 100), unit: '%', note: 'Standard Hours ÷ Actual Hours.' }; }
    },
    {
      id: 'absentee', cat: 'Workers', name: 'Absenteeism Rate',
      desc: 'Lost days as a share of available working days.',
      inputs: [
        { key: 'lost', label: 'Days Absent', unit: 'days', def: 8 },
        { key: 'avail', label: 'Available Work Days', unit: 'days', def: 440 }
      ],
      compute: function (v) { var a = div(safe(v.lost), safe(v.avail));
        return { value: pct(a * 100), unit: '%', note: 'Absent Days ÷ Available Days.' }; }
    },
    {
      id: 'utilisation', cat: 'Workers', name: 'Worker Utilisation',
      desc: 'Productive time vs total time on shift.',
      inputs: [
        { key: 'prod', label: 'Productive Time', unit: 'min', def: 400 },
        { key: 'total', label: 'Total Shift Time', unit: 'min', def: 480 }
      ],
      compute: function (v) { var u = div(safe(v.prod), safe(v.total));
        return { value: pct(u * 100), unit: '%', note: 'Productive ÷ Total shift time.' }; }
    },

    /* ---------------- MATERIAL ---------------- */
    {
      id: 'yield_mat', cat: 'Material', name: 'Material Yield',
      desc: 'Good output relative to material input.',
      inputs: [
        { key: 'output', label: 'Usable Output', unit: 'kg', def: 940 },
        { key: 'input', label: 'Material Input', unit: 'kg', def: 1000 }
      ],
      compute: function (v) { var y = div(safe(v.output), safe(v.input));
        return { value: pct(y * 100), unit: '%', rows: [['Waste', pct((1 - y) * 100) + ' %']], note: 'Output ÷ Input.' }; }
    },
    {
      id: 'scrap_mat', cat: 'Material', name: 'Material Scrap / Waste',
      desc: 'Wasted material and its cost.',
      inputs: [
        { key: 'waste', label: 'Wasted Material', unit: 'kg', def: 60 },
        { key: 'input', label: 'Total Input', unit: 'kg', def: 1000 },
        { key: 'cost', label: 'Cost per kg', unit: '$/kg', def: 3.2 }
      ],
      compute: function (v) { var r = div(safe(v.waste), safe(v.input)); var c = safe(v.waste) * safe(v.cost);
        return { value: pct(r * 100), unit: '% waste', rows: [['Waste Cost', '$' + pct(c)]], note: 'Waste ÷ Input.' }; }
    },
    {
      id: 'inv_turns', cat: 'Material', name: 'Inventory Turnover',
      desc: 'How many times inventory is used over a period.',
      inputs: [
        { key: 'cogs', label: 'Cost of Goods Sold', unit: '$', def: 1200000 },
        { key: 'avginv', label: 'Average Inventory', unit: '$', def: 200000 }
      ],
      compute: function (v) { var t = div(safe(v.cogs), safe(v.avginv)); var days = div(365, t);
        return { value: pct(t), unit: 'turns/yr', rows: [['Days of Inventory', pct(days) + ' days']], note: 'COGS ÷ Average Inventory.' }; }
    },
    {
      id: 'consumption', cat: 'Material', name: 'Material Consumption per Unit',
      desc: 'Average material used per finished unit.',
      inputs: [
        { key: 'used', label: 'Total Material Used', unit: 'kg', def: 1000 },
        { key: 'units', label: 'Units Produced', unit: 'pcs', def: 5000 }
      ],
      compute: function (v) { var c = div(safe(v.used), safe(v.units));
        return { value: pct(c * 1000) / 1000, unit: 'kg/pc', note: 'Material Used ÷ Units.' }; }
    },

    /* ---------------- FINANCIAL ---------------- */
    {
      id: 'unitcost', cat: 'Financial', name: 'Cost per Unit',
      desc: 'Total manufacturing cost divided by units produced.',
      inputs: [
        { key: 'material', label: 'Material Cost', unit: '$', def: 40000 },
        { key: 'labor', label: 'Labour Cost', unit: '$', def: 22000 },
        { key: 'overhead', label: 'Overhead', unit: '$', def: 18000 },
        { key: 'units', label: 'Units Produced', unit: 'pcs', def: 5000 }
      ],
      compute: function (v) { var total = safe(v.material) + safe(v.labor) + safe(v.overhead); var c = div(total, safe(v.units));
        return { value: pct(c), unit: '$/unit', rows: [['Total Cost', '$' + pct(total)]], note: '(Material + Labour + Overhead) ÷ Units.' }; }
    },
    {
      id: 'grossmargin', cat: 'Financial', name: 'Gross Margin',
      desc: 'Profit remaining after cost of goods sold.',
      inputs: [
        { key: 'revenue', label: 'Revenue', unit: '$', def: 150000 },
        { key: 'cogs', label: 'Cost of Goods Sold', unit: '$', def: 100000 }
      ],
      compute: function (v) { var gp = safe(v.revenue) - safe(v.cogs); var m = div(gp, safe(v.revenue));
        return { value: pct(m * 100), unit: '%', rows: [['Gross Profit', '$' + pct(gp)]], note: '(Revenue − COGS) ÷ Revenue.' }; }
    },
    {
      id: 'cogl', cat: 'Financial', name: 'Cost of Poor Quality (COPQ)',
      desc: 'Total financial impact of defects, scrap and rework.',
      inputs: [
        { key: 'scrap', label: 'Scrap Cost', unit: '$', def: 6300 },
        { key: 'rework', label: 'Rework Cost', unit: '$', def: 2400 },
        { key: 'warranty', label: 'Warranty / Returns', unit: '$', def: 1500 },
        { key: 'revenue', label: 'Revenue (for %)', unit: '$', def: 150000 }
      ],
      compute: function (v) { var total = safe(v.scrap) + safe(v.rework) + safe(v.warranty); var m = div(total, safe(v.revenue));
        return { value: '$' + pct(total), unit: 'COPQ', rows: [['% of Revenue', pct(m * 100) + ' %']], note: 'Scrap + Rework + Warranty.' }; }
    },
    {
      id: 'roi', cat: 'Financial', name: 'Improvement ROI',
      desc: 'Return on an improvement/kaizen investment.',
      inputs: [
        { key: 'saving', label: 'Annual Saving / Gain', unit: '$', def: 48000 },
        { key: 'invest', label: 'Investment', unit: '$', def: 20000 }
      ],
      compute: function (v) { var roi = div(safe(v.saving) - safe(v.invest), safe(v.invest)); var pay = div(safe(v.invest), safe(v.saving) / 12);
        return { value: pct(roi * 100), unit: '% ROI', rows: [['Payback', pct(pay) + ' months']], note: '(Gain − Investment) ÷ Investment.' }; }
    },
    {
      id: 'oti', cat: 'Financial', name: 'Loss-to-Profit Impact',
      desc: 'Translate operational losses into a financial figure (Manual §10).',
      inputs: [
        { key: 'dtmin', label: 'Downtime', unit: 'min', def: 120 },
        { key: 'dtrate', label: 'Downtime Cost', unit: '$/min', def: 8.5 },
        { key: 'ng', label: 'NG Units', unit: 'pcs', def: 80 },
        { key: 'ngcost', label: 'NG Cost', unit: '$/pc', def: 4.2 }
      ],
      compute: function (v) {
        var dt = safe(v.dtmin) * safe(v.dtrate); var ng = safe(v.ng) * safe(v.ngcost); var total = dt + ng;
        return { value: '$' + pct(total), unit: 'total loss', rows: [['Downtime Loss', '$' + pct(dt)], ['Quality Loss', '$' + pct(ng)]], note: 'Demo rates only — configure real standard costs in Admin.' };
      }
    }
  ];

  function approxSigma(p) {
    // rational approximation of the inverse normal CDF (Acklam) for yield->z
    if (p <= 0) return 0; if (p >= 1) return 6;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, ph = 1 - pl, q, r, z;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); z = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    else if (p <= ph) { q = p - 0.5; r = q*q; z = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
    else { q = Math.sqrt(-2 * Math.log(1-p)); z = -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    return z;
  }

  var CATEGORIES = ['Production', 'Quality', 'Equipment', 'Workers', 'Material', 'Financial'];
  var CAT_ICON = { Production: '⚙️', Quality: '✓', Equipment: '🔧', Workers: '👷', Material: '📦', Financial: '💲' };

  global.CALC = { list: CALCS, categories: CATEGORIES, icon: CAT_ICON, byId: function (id) { for (var i=0;i<CALCS.length;i++) if (CALCS[i].id===id) return CALCS[i]; return null; } };
})(window);
