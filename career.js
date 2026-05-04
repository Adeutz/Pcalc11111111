/* ==========================================================================
 * Career Comparison Module
 * Pure-vanilla JS, no dependencies. Plays nicely alongside app.js (separate
 * IIFE module). Persists scenarios to localStorage.
 * ========================================================================== */
(function () {
  'use strict';

  // ===========================================================================
  // Constants
  // ===========================================================================
  var STORAGE_KEY = 'pcalc11111111-career-v1';
  var COLOR_PALETTE = [
    '#7baaf7', // blue (G4 default)
    '#f48fb1', // pink (DL default)
    '#81c784', // green
    '#ffb74d', // orange
    '#ba68c8', // purple
    '#4dd0e1', // cyan
    '#ff8a65', // coral
    '#aed581'  // lime
  ];

  var DEFAULT_RAISE = 3.0;
  var DEFAULT_HOURS = 80;
  var DEFAULT_AFTER_TAX = 58;
  var DEFAULT_401K = 15;

  // ===========================================================================
  // DOM refs
  // ===========================================================================
  var $ = function (id) { return document.getElementById(id); };
  var els = {};
  var initialized = false;

  // ===========================================================================
  // State
  // ===========================================================================
  /** @type {{scenarios:Scenario[], activeId:string}} */
  var state = { scenarios: [], activeId: '' };

  // Per-render cache for computed series so chart hover etc. doesn't recompute
  var lastComputed = null;

  // ===========================================================================
  // Helpers
  // ===========================================================================
  function uid() {
    return 'c' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // Apply iOS-friendly inputmode to all number inputs inside the career view.
  // Called after re-renders. inputmode='decimal' brings up the proper numeric
  // keyboard with a decimal point on iOS / Android.
  function applyInputModeDecimal() {
    var view = document.getElementById('viewCareer');
    if (!view) return;
    var inputs = view.querySelectorAll('input[type="number"]');
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].hasAttribute('inputmode')) {
        inputs[i].setAttribute('inputmode', 'decimal');
      }
    }
  }

  function formatMoney(n, opts) {
    opts = opts || {};
    if (n == null || isNaN(n)) return '—';
    var abs = Math.abs(n);
    if (opts.compact && abs >= 1000) {
      if (abs >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
      if (abs >= 1e3) return (n / 1e3).toFixed(0) + 'k';
    }
    var sign = n < 0 ? '-' : '';
    return sign + '$' + Math.round(abs).toLocaleString('en-US');
  }

  function formatMoneyShort(n) {
    if (n == null || isNaN(n)) return '—';
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'k';
    return sign + '$' + Math.round(abs);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ===========================================================================
  // Data model
  // ===========================================================================
  function makePath(overrides) {
    var p = {
      id: uid(),
      name: 'New Path',
      color: COLOR_PALETTE[0],
      startAge: 31,
      startYos: 1,
      yearlyExpenses: 100000,
      afterTaxRate: DEFAULT_AFTER_TAX, // % of gross income kept after taxes/deductions
      employer401kRate: DEFAULT_401K,  // % of income employer adds to retirement
      profitShareRate: 0,              // % of income added as profit share
      creditHoursPerMonth: DEFAULT_HOURS,
      payRateModel: 'simple',
      simple: { startRate: 200, annualRaisePct: DEFAULT_RAISE },
      milestones: {
        foRate: 100,
        caRate: 250,
        widebodyCaRate: 350,
        upgradeYearsOfService: 3,    // YOS at which CA upgrade happens
        widebodyYearsOfService: 0,   // 0 = never
        annualRaisePct: DEFAULT_RAISE
      },
      contractSteps: [
        { yos: 1, rate: 100 },
        { yos: 2, rate: 120 },
        { yos: 3, rate: 140 },
        { yos: 5, rate: 200 },
        { yos: 8, rate: 260 },
        { yos: 12, rate: 320 }
      ],
      yearlyOverrides: {},   // { 2026: { rate?: number, income?: number } }
      riskEvents: [],        // [{ id, type, startYear, endYear, payMultiplier }]
      furloughProbability: 0 // % per year (probability mode)
    };
    if (overrides) Object.assign(p, overrides);
    return p;
  }

  function makeScenario(overrides) {
    var s = {
      id: uid(),
      name: 'New Scenario',
      startYear: 2026,
      endYear: 2060,
      startNetWorth: 100000,
      interestRate: 6.0,
      paths: [],
      createdAt: new Date().toISOString()
    };
    if (overrides) Object.assign(s, overrides);
    if (!s.paths || s.paths.length === 0) {
      s.paths = [makePath({ name: 'Path A', color: COLOR_PALETTE[0] })];
    }
    return s;
  }

  // Default seed scenarios mirroring the user's spreadsheet.
  function buildDefaultScenarios() {
    var goodContract = makeScenario({
      name: 'Now. Good contract',
      startYear: 2026,
      endYear: 2060,
      startNetWorth: 620000,
      interestRate: 6.0,
      paths: [
        makePath({
          name: 'G4 (Stay)',
          color: COLOR_PALETTE[0],
          startAge: 31,
          startYos: 8,
          yearlyExpenses: 150000,
          afterTaxRate: 58,
          employer401kRate: 15,
          profitShareRate: 0,
          creditHoursPerMonth: 85,
          payRateModel: 'manual',
          yearlyOverrides: {
            2026: { rate: 263, income: 340000 },
            2027: { rate: 275, income: 310000 },
            2028: { rate: 315 },
            2029: { rate: 271.6 },
            2030: { rate: 271.6 },
            2031: { rate: 271.6 },
            2032: { rate: 271.6 }
          },
          simple: { startRate: 271.6, annualRaisePct: 0 }
        }),
        makePath({
          name: 'DL (Leave)',
          color: COLOR_PALETTE[1],
          startAge: 31,
          startYos: 1,
          yearlyExpenses: 150000,
          afterTaxRate: 58,
          employer401kRate: 18,
          profitShareRate: 0,
          creditHoursPerMonth: 75,
          payRateModel: 'contractSteps',
          contractSteps: [
            { yos: 1, rate: 123.04 },
            { yos: 2, rate: 188.43 },
            { yos: 3, rate: 220.42 },
            { yos: 4, rate: 225.78 },
            { yos: 5, rate: 231.21 },
            { yos: 6, rate: 236.98 },
            { yos: 7, rate: 243.61 },
            { yos: 8, rate: 249.24 },
            { yos: 9, rate: 388.0 }
          ]
        })
      ]
    });

    return [goodContract];
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.scenarios) && parsed.scenarios.length) {
          state = parsed;
          if (!state.activeId || !state.scenarios.find(function (s) { return s.id === state.activeId; })) {
            state.activeId = state.scenarios[0].id;
          }
          return;
        }
      }
    } catch (e) { /* fall through to defaults */ }

    state.scenarios = buildDefaultScenarios();
    state.activeId = state.scenarios[0].id;
    save();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function getActive() {
    return state.scenarios.find(function (s) { return s.id === state.activeId; }) || null;
  }

  // ===========================================================================
  // Pay rate computation
  // ===========================================================================
  /**
   * Resolve the base pay rate for a given year, ignoring risk events.
   * Returns a number (dollars per credit hour).
   */
  function resolveBaseRate(path, year, scenario) {
    var idx = year - scenario.startYear;
    var yos = path.startYos + idx;

    // Per-year override always wins
    var ov = path.yearlyOverrides && path.yearlyOverrides[year];
    if (ov && typeof ov.rate === 'number' && !isNaN(ov.rate)) {
      return ov.rate;
    }

    if (path.payRateModel === 'manual') {
      // Manual mode but no override for this year — find nearest-prior override
      var keys = Object.keys(path.yearlyOverrides || {})
        .map(Number).filter(function (y) { return y <= year; }).sort(function (a, b) { return a - b; });
      if (keys.length) {
        var k = keys[keys.length - 1];
        var ovk = path.yearlyOverrides[k];
        if (ovk && typeof ovk.rate === 'number') return ovk.rate;
      }
      return 0;
    }

    if (path.payRateModel === 'simple') {
      var s = path.simple || { startRate: 0, annualRaisePct: 0 };
      var rate = (s.startRate || 0) * Math.pow(1 + (s.annualRaisePct || 0) / 100, idx);
      return rate;
    }

    if (path.payRateModel === 'milestones') {
      var m = path.milestones || {};
      var raise = (m.annualRaisePct || 0) / 100;
      var base;
      if (m.widebodyYearsOfService > 0 && yos >= m.widebodyYearsOfService) {
        base = m.widebodyCaRate || 0;
      } else if (m.upgradeYearsOfService > 0 && yos >= m.upgradeYearsOfService) {
        base = m.caRate || 0;
      } else {
        base = m.foRate || 0;
      }
      // Compound a yearly raise on top
      return base * Math.pow(1 + raise, idx);
    }

    if (path.payRateModel === 'contractSteps') {
      var steps = (path.contractSteps || []).slice().sort(function (a, b) { return a.yos - b.yos; });
      if (!steps.length) return 0;
      var match = steps[0].rate;
      for (var i = 0; i < steps.length; i++) {
        if (yos >= steps[i].yos) match = steps[i].rate;
        else break;
      }
      return match;
    }

    return 0;
  }

  /**
   * Resolve the credit hours per month for a given year.
   * Per-year override wins; otherwise falls back to the path default.
   */
  function resolveCreditHours(path, year) {
    var ov = path.yearlyOverrides && path.yearlyOverrides[year];
    if (ov && typeof ov.creditHours === 'number' && !isNaN(ov.creditHours)) {
      return ov.creditHours;
    }
    return path.creditHoursPerMonth || 0;
  }

  /**
   * Compute the income for a given year, applying risk events.
   * Returns { rate, income, creditHours, riskMultiplier, riskLabel }.
   */
  function computeYearIncome(path, year, scenario, opts) {
    opts = opts || {};
    var rate = resolveBaseRate(path, year, scenario);
    var creditHours = resolveCreditHours(path, year);
    var ov = path.yearlyOverrides && path.yearlyOverrides[year];

    var income;
    if (ov && typeof ov.income === 'number' && !isNaN(ov.income)) {
      income = ov.income;
    } else {
      income = rate * creditHours * 12;
    }

    var mult = 1;
    var label = '';
    var events = path.riskEvents || [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (year >= ev.startYear && year <= ev.endYear) {
        mult *= (typeof ev.payMultiplier === 'number') ? ev.payMultiplier : 1;
        label = ev.type || 'event';
      }
    }

    // Probability-mode random furlough (only when explicitly requested)
    if (opts.applyFurloughRoll && (path.furloughProbability || 0) > 0) {
      var p = clamp(path.furloughProbability / 100, 0, 1);
      if (Math.random() < p) {
        mult *= 0.0;
        label = label || 'random furlough';
      }
    }

    return {
      rate: rate,
      income: income * mult,
      creditHours: creditHours,
      riskMultiplier: mult,
      riskLabel: label
    };
  }

  /**
   * Compute the annual savings (added to net worth) for a path in a given year.
   *  saveRate = (income * afterTax) - expenses + (income * employer401k) + (income * profitShare)
   * This matches the user's spreadsheet formula.
   */
  function computeSaveRate(path, income) {
    var afterTax = (path.afterTaxRate || 0) / 100;
    var dc = (path.employer401kRate || 0) / 100;
    var ps = (path.profitShareRate || 0) / 100;
    var afterTaxIncome = income * afterTax;
    var retirement = income * (dc + ps);
    return afterTaxIncome - (path.yearlyExpenses || 0) + retirement;
  }

  /**
   * Run a full simulation for a path. Returns an array of yearly snapshots:
   *   [{ year, age, yos, rate, income, save, netWorth, riskLabel }, ...]
   * networth update: networth_{Y+1} = (networth_Y + save_Y) * (1 + r)
   *   matches the spreadsheet: 620000 -> 761,292 with save=98200, r=6%
   */
  function simulatePath(path, scenario, opts) {
    opts = opts || {};
    var rows = [];
    var nw = scenario.startNetWorth || 0;
    var r = (scenario.interestRate || 0) / 100;

    for (var year = scenario.startYear; year <= scenario.endYear; year++) {
      var idx = year - scenario.startYear;
      var inc = computeYearIncome(path, year, scenario, {
        applyFurloughRoll: !!opts.applyFurloughRoll
      });
      var save = computeSaveRate(path, inc.income);

      rows.push({
        year: year,
        age: path.startAge + idx,
        yos: path.startYos + idx,
        rate: inc.rate,
        creditHours: inc.creditHours,
        income: inc.income,
        save: save,
        netWorth: nw,
        riskLabel: inc.riskLabel
      });
      // Compound to next year
      nw = (nw + save) * (1 + r);
    }
    // Add final year-end net worth as a separate marker (after last save)
    rows[rows.length - 1].netWorthEnd = nw;
    return rows;
  }

  /**
   * Run Monte Carlo simulations and return percentile bands for net worth per year.
   * Used in probability mode.
   */
  function simulateMonteCarlo(path, scenario, simCount) {
    if (!simCount || simCount < 1) return null;
    if (!(path.furloughProbability > 0)) return null;
    var allRuns = [];
    for (var s = 0; s < simCount; s++) {
      allRuns.push(simulatePath(path, scenario, { applyFurloughRoll: true }));
    }
    // For each year, gather net worths and compute percentiles
    var nYears = allRuns[0].length;
    var bands = [];
    for (var yi = 0; yi < nYears; yi++) {
      var vals = [];
      for (var ri = 0; ri < allRuns.length; ri++) vals.push(allRuns[ri][yi].netWorth);
      vals.sort(function (a, b) { return a - b; });
      bands.push({
        year: allRuns[0][yi].year,
        p10: vals[Math.floor(vals.length * 0.10)],
        p50: vals[Math.floor(vals.length * 0.50)],
        p90: vals[Math.floor(vals.length * 0.90)]
      });
    }
    return bands;
  }

  /**
   * Compute everything needed for the chart and summary.
   */
  function computeAll(scenario, simCount) {
    var paths = scenario.paths.map(function (p) {
      return {
        path: p,
        rows: simulatePath(p, scenario),
        bands: simulateMonteCarlo(p, scenario, simCount || 0)
      };
    });
    return paths;
  }

  /**
   * Find years where two paths "cross" (one overtakes the other in net worth).
   */
  function findCrossovers(seriesA, seriesB) {
    var crosses = [];
    for (var i = 1; i < seriesA.length; i++) {
      var prevDiff = seriesA[i - 1].netWorth - seriesB[i - 1].netWorth;
      var nowDiff = seriesA[i].netWorth - seriesB[i].netWorth;
      if (prevDiff === 0) continue;
      if ((prevDiff < 0 && nowDiff >= 0) || (prevDiff > 0 && nowDiff <= 0)) {
        crosses.push({
          year: seriesA[i].year,
          age: seriesA[i].age,
          netWorth: (seriesA[i].netWorth + seriesB[i].netWorth) / 2
        });
      }
    }
    return crosses;
  }

  // ===========================================================================
  // Rendering: top-level
  // ===========================================================================
  function rerenderAll() {
    renderScenarioPicker();
    var s = getActive();
    if (!s) return;
    renderGlobalSettings(s);
    renderPaths(s);
    renderWhatIfPathSelectors(s);
    renderChart(s);
    applyInputModeDecimal();
    save();
  }

  // ----- Scenario picker --------------------------------------------------------
  function renderScenarioPicker() {
    var sel = els.scenarioSelect;
    sel.innerHTML = '';
    state.scenarios.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === state.activeId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ----- Global settings -------------------------------------------------------
  function renderGlobalSettings(scenario) {
    els.startYear.value = scenario.startYear;
    els.endYear.value = scenario.endYear;
    els.startNetWorth.value = scenario.startNetWorth;
    els.interestRate.value = scenario.interestRate;
    if (els.whatIfYear && !els.whatIfYear.value) els.whatIfYear.value = scenario.endYear;
  }

  // ----- Paths list ------------------------------------------------------------
  function renderPaths(scenario) {
    var container = els.pathsList;
    container.innerHTML = '';
    scenario.paths.forEach(function (path, idx) {
      container.appendChild(buildPathCard(path, scenario, idx));
    });
  }

  function buildPathCard(path, scenario, idx) {
    var card = document.createElement('div');
    card.className = 'career-path-card' + (path._collapsed ? ' collapsed' : '');
    card.style.borderLeftColor = path.color;
    card.dataset.pathId = path.id;

    // Header
    var header = document.createElement('div');
    header.className = 'career-path-card-header';

    var swatch = document.createElement('span');
    swatch.className = 'career-path-color';
    swatch.style.background = path.color;
    header.appendChild(swatch);

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'career-path-name-input';
    nameInput.value = path.name;
    nameInput.addEventListener('click', function (e) { e.stopPropagation(); });
    nameInput.addEventListener('input', function () {
      path.name = nameInput.value;
      renderWhatIfPathSelectors(scenario);
      renderLegend();
      save();
    });
    header.appendChild(nameInput);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'career-path-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.title = 'Delete this path';
    removeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (scenario.paths.length <= 1) {
        alert('Need at least one path. Add another, then remove this one.');
        return;
      }
      if (!confirm('Remove path "' + path.name + '"?')) return;
      scenario.paths = scenario.paths.filter(function (p) { return p.id !== path.id; });
      rerenderAll();
    });
    header.appendChild(removeBtn);

    var chev = document.createElement('span');
    chev.className = 'career-path-toggle-icon';
    chev.setAttribute('aria-hidden', 'true');
    header.appendChild(chev);

    header.addEventListener('click', function () {
      path._collapsed = !path._collapsed;
      card.classList.toggle('collapsed', !!path._collapsed);
    });

    card.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'career-path-card-body';
    body.appendChild(buildPathBasicsGrid(path, scenario));
    body.appendChild(buildPathColorRow(path, scenario));
    body.appendChild(buildPathRateModel(path, scenario));
    body.appendChild(buildPathRiskSection(path, scenario));
    body.appendChild(buildPathYearlyGrid(path, scenario));
    card.appendChild(body);

    return card;
  }

  function buildPathBasicsGrid(path, scenario) {
    var grid = document.createElement('div');
    grid.className = 'career-grid';

    var fields = [
      { key: 'startAge', label: 'Start age (year ' + scenario.startYear + ')', step: 1, min: 0, max: 100 },
      { key: 'startYos', label: 'Start years of service', step: 1, min: 0, max: 50 },
      { key: 'creditHoursPerMonth', label: 'Credit hours / month', step: 1, min: 0, max: 200 },
      { key: 'yearlyExpenses', label: 'Yearly expenses ($)', step: 1000, min: 0 },
      { key: 'afterTaxRate', label: 'After-tax %', step: 1, min: 0, max: 100 },
      { key: 'employer401kRate', label: 'Employer 401k %', step: 0.5, min: 0, max: 100 },
      { key: 'profitShareRate', label: 'Profit share %', step: 0.5, min: 0, max: 100 }
    ];
    fields.forEach(function (f) {
      var field = document.createElement('div');
      field.className = 'career-field';
      var lbl = document.createElement('label');
      lbl.textContent = f.label;
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.value = path[f.key];
      inp.step = f.step != null ? f.step : 1;
      if (f.min != null) inp.min = f.min;
      if (f.max != null) inp.max = f.max;
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value);
        path[f.key] = isNaN(v) ? 0 : v;
        renderChart(scenario);
        refreshYearlyGrid(path, scenario);
        save();
      });
      field.appendChild(lbl);
      field.appendChild(inp);
      grid.appendChild(field);
    });
    return grid;
  }

  function buildPathColorRow(path, scenario) {
    var wrap = document.createElement('div');
    var head = document.createElement('div');
    head.className = 'career-path-subhead';
    head.textContent = 'Line color';
    wrap.appendChild(head);
    var row = document.createElement('div');
    row.className = 'career-color-swatch-row';
    COLOR_PALETTE.forEach(function (col) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'career-color-swatch' + (col === path.color ? ' active' : '');
      btn.style.background = col;
      btn.title = col;
      btn.addEventListener('click', function () {
        path.color = col;
        rerenderAll();
      });
      row.appendChild(btn);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function buildPathRateModel(path, scenario) {
    var wrap = document.createElement('div');
    var head = document.createElement('div');
    head.className = 'career-path-subhead';
    head.textContent = 'Pay rate model';
    wrap.appendChild(head);

    var tabs = document.createElement('div');
    tabs.className = 'career-rate-model-tabs';
    var modelDefs = [
      { id: 'simple', label: 'Simple (start + raise%)' },
      { id: 'milestones', label: 'Milestones (FO/CA/WB)' },
      { id: 'contractSteps', label: 'Contract steps (per YOS)' },
      { id: 'manual', label: 'Manual (per year)' }
    ];
    var panels = {};
    modelDefs.forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'career-rate-tab' + (path.payRateModel === m.id ? ' active' : '');
      btn.textContent = m.label;
      btn.addEventListener('click', function () {
        path.payRateModel = m.id;
        Array.prototype.forEach.call(tabs.children, function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        Object.keys(panels).forEach(function (k) {
          panels[k].classList.toggle('active', k === m.id);
        });
        renderChart(scenario);
        refreshYearlyGrid(path, scenario);
        save();
      });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    panels.simple = buildSimplePanel(path, scenario);
    panels.milestones = buildMilestonesPanel(path, scenario);
    panels.contractSteps = buildContractStepsPanel(path, scenario);
    panels.manual = buildManualPanel(path, scenario);
    Object.keys(panels).forEach(function (k) {
      panels[k].classList.toggle('active', k === path.payRateModel);
      wrap.appendChild(panels[k]);
    });
    return wrap;
  }

  function buildSimplePanel(path, scenario) {
    var panel = document.createElement('div');
    panel.className = 'career-rate-panel';
    var grid = document.createElement('div');
    grid.className = 'career-grid';
    [
      { key: 'startRate', label: 'Starting hourly rate ($)', step: 0.01 },
      { key: 'annualRaisePct', label: 'Annual raise %', step: 0.1 }
    ].forEach(function (f) {
      var field = document.createElement('div');
      field.className = 'career-field';
      var lbl = document.createElement('label');
      lbl.textContent = f.label;
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.step = f.step;
      inp.value = path.simple[f.key];
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value);
        path.simple[f.key] = isNaN(v) ? 0 : v;
        renderChart(scenario);
        refreshYearlyGrid(path, scenario);
        save();
      });
      field.appendChild(lbl);
      field.appendChild(inp);
      grid.appendChild(field);
    });
    panel.appendChild(grid);
    return panel;
  }

  function buildMilestonesPanel(path, scenario) {
    var panel = document.createElement('div');
    panel.className = 'career-rate-panel';
    var grid = document.createElement('div');
    grid.className = 'career-grid';
    [
      { key: 'foRate', label: 'First Officer rate ($/hr)', step: 0.01 },
      { key: 'caRate', label: 'Captain rate ($/hr)', step: 0.01 },
      { key: 'widebodyCaRate', label: 'Widebody Captain rate ($/hr)', step: 0.01 },
      { key: 'upgradeYearsOfService', label: 'YOS at Captain upgrade', step: 1 },
      { key: 'widebodyYearsOfService', label: 'YOS at Widebody upgrade (0=never)', step: 1 },
      { key: 'annualRaisePct', label: 'Annual raise % (compounds on top)', step: 0.1 }
    ].forEach(function (f) {
      var field = document.createElement('div');
      field.className = 'career-field';
      var lbl = document.createElement('label');
      lbl.textContent = f.label;
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.step = f.step;
      inp.value = path.milestones[f.key];
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value);
        path.milestones[f.key] = isNaN(v) ? 0 : v;
        renderChart(scenario);
        refreshYearlyGrid(path, scenario);
        save();
      });
      field.appendChild(lbl);
      field.appendChild(inp);
      grid.appendChild(field);
    });
    panel.appendChild(grid);
    return panel;
  }

  function buildContractStepsPanel(path, scenario) {
    var panel = document.createElement('div');
    panel.className = 'career-rate-panel';

    var info = document.createElement('p');
    info.className = 'section-hint';
    info.style.marginTop = '0.5rem';
    info.textContent = 'Set hourly rate at each year of service. Years between rows use the most recent prior rate.';
    panel.appendChild(info);

    var table = document.createElement('table');
    table.className = 'career-steps-table';
    table.innerHTML = '<thead><tr><th>YOS</th><th>Rate ($/hr)</th><th></th></tr></thead>';
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);

    function renderRows() {
      tbody.innerHTML = '';
      path.contractSteps.sort(function (a, b) { return a.yos - b.yos; });
      path.contractSteps.forEach(function (step, i) {
        var tr = document.createElement('tr');
        var tdYos = document.createElement('td');
        var inpYos = document.createElement('input');
        inpYos.type = 'number'; inpYos.step = 1; inpYos.min = 0; inpYos.value = step.yos;
        inpYos.addEventListener('input', function () {
          var v = parseInt(inpYos.value, 10);
          step.yos = isNaN(v) ? 0 : v;
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        tdYos.appendChild(inpYos);
        tr.appendChild(tdYos);

        var tdRate = document.createElement('td');
        var inpRate = document.createElement('input');
        inpRate.type = 'number'; inpRate.step = 0.01; inpRate.value = step.rate;
        inpRate.addEventListener('input', function () {
          var v = parseFloat(inpRate.value);
          step.rate = isNaN(v) ? 0 : v;
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        tdRate.appendChild(inpRate);
        tr.appendChild(tdRate);

        var tdAct = document.createElement('td');
        var rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'career-path-remove';
        rmBtn.textContent = '\u00D7';
        rmBtn.title = 'Remove step';
        rmBtn.addEventListener('click', function () {
          path.contractSteps.splice(i, 1);
          renderRows();
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        tdAct.appendChild(rmBtn);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
    }
    renderRows();
    panel.appendChild(table);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary btn-sm';
    addBtn.textContent = '+ Add step';
    addBtn.style.marginTop = '0.5rem';
    addBtn.addEventListener('click', function () {
      var maxYos = 0;
      var lastRate = 100;
      path.contractSteps.forEach(function (s) {
        if (s.yos > maxYos) { maxYos = s.yos; lastRate = s.rate; }
      });
      path.contractSteps.push({ yos: maxYos + 1, rate: lastRate });
      renderRows();
      renderChart(scenario);
      refreshYearlyGrid(path, scenario);
      save();
    });
    panel.appendChild(addBtn);
    return panel;
  }

  function buildManualPanel(path, scenario) {
    var panel = document.createElement('div');
    panel.className = 'career-rate-panel';
    var info = document.createElement('p');
    info.className = 'section-hint';
    info.style.marginTop = '0.5rem';
    info.textContent = 'Manual mode uses only the per-year overrides set in the table below. Years without an override carry forward the last set rate.';
    panel.appendChild(info);
    return panel;
  }

  // ----- Risk events ------------------------------------------------------------
  function buildPathRiskSection(path, scenario) {
    var wrap = document.createElement('div');

    var head = document.createElement('div');
    head.className = 'career-path-subhead';
    head.textContent = 'Risk events';
    wrap.appendChild(head);

    var info = document.createElement('p');
    info.className = 'section-hint';
    info.style.marginTop = '0';
    info.textContent = 'Add fixed events (downgrades, furloughs) and/or set a yearly furlough probability for Monte Carlo simulation.';
    wrap.appendChild(info);

    // Probability mode field
    var probGrid = document.createElement('div');
    probGrid.className = 'career-grid';
    var probField = document.createElement('div');
    probField.className = 'career-field';
    var probLabel = document.createElement('label');
    probLabel.textContent = 'Furlough probability % per year';
    var probInput = document.createElement('input');
    probInput.type = 'number'; probInput.step = 1; probInput.min = 0; probInput.max = 100;
    probInput.value = path.furloughProbability || 0;
    probInput.addEventListener('input', function () {
      var v = parseFloat(probInput.value);
      path.furloughProbability = isNaN(v) ? 0 : clamp(v, 0, 100);
      renderChart(scenario);
      save();
    });
    probField.appendChild(probLabel);
    probField.appendChild(probInput);
    probGrid.appendChild(probField);
    wrap.appendChild(probGrid);

    // Fixed events list
    var list = document.createElement('div');
    list.className = 'career-risk-list';
    list.style.marginTop = '0.5rem';

    function renderEvents() {
      list.innerHTML = '';
      (path.riskEvents || []).forEach(function (ev, i) {
        var row = document.createElement('div');
        row.className = 'career-risk-event';

        var typeSel = document.createElement('select');
        ['downgrade', 'furlough', 'medical', 'leave', 'custom'].forEach(function (t) {
          var o = document.createElement('option'); o.value = t; o.textContent = t;
          if (ev.type === t) o.selected = true;
          typeSel.appendChild(o);
        });
        typeSel.addEventListener('change', function () {
          ev.type = typeSel.value;
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        row.appendChild(typeSel);

        var fromLbl = document.createElement('span');
        fromLbl.textContent = 'from'; fromLbl.style.fontSize = '0.8rem';
        row.appendChild(fromLbl);
        var fromInp = document.createElement('input');
        fromInp.type = 'number'; fromInp.value = ev.startYear; fromInp.style.width = '80px';
        fromInp.addEventListener('input', function () {
          ev.startYear = parseInt(fromInp.value, 10) || ev.startYear;
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        row.appendChild(fromInp);

        var toLbl = document.createElement('span');
        toLbl.textContent = 'to'; toLbl.style.fontSize = '0.8rem';
        row.appendChild(toLbl);
        var toInp = document.createElement('input');
        toInp.type = 'number'; toInp.value = ev.endYear; toInp.style.width = '80px';
        toInp.addEventListener('input', function () {
          ev.endYear = parseInt(toInp.value, 10) || ev.endYear;
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        row.appendChild(toInp);

        var multLbl = document.createElement('span');
        multLbl.textContent = '× pay'; multLbl.style.fontSize = '0.8rem';
        row.appendChild(multLbl);
        var multInp = document.createElement('input');
        multInp.type = 'number'; multInp.step = 0.05; multInp.min = 0; multInp.max = 2;
        multInp.value = ev.payMultiplier; multInp.style.width = '70px';
        multInp.addEventListener('input', function () {
          ev.payMultiplier = parseFloat(multInp.value);
          if (isNaN(ev.payMultiplier)) ev.payMultiplier = 1;
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        row.appendChild(multInp);

        var spacer = document.createElement('span'); spacer.className = 'risk-spacer';
        row.appendChild(spacer);

        var rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'career-path-remove';
        rmBtn.textContent = '\u00D7';
        rmBtn.title = 'Remove event';
        rmBtn.addEventListener('click', function () {
          path.riskEvents.splice(i, 1);
          renderEvents();
          renderChart(scenario);
          refreshYearlyGrid(path, scenario);
          save();
        });
        row.appendChild(rmBtn);

        list.appendChild(row);
      });
    }
    renderEvents();
    wrap.appendChild(list);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary btn-sm';
    addBtn.textContent = '+ Add risk event';
    addBtn.style.marginTop = '0.5rem';
    addBtn.addEventListener('click', function () {
      var y = scenario.startYear;
      path.riskEvents = path.riskEvents || [];
      path.riskEvents.push({
        id: uid(), type: 'downgrade', startYear: y, endYear: y, payMultiplier: 0.7
      });
      renderEvents();
      renderChart(scenario);
      refreshYearlyGrid(path, scenario);
      save();
    });
    wrap.appendChild(addBtn);
    return wrap;
  }

  // ----- Yearly grid (per-year override + computed columns) --------------------
  function buildPathYearlyGrid(path, scenario) {
    var wrap = document.createElement('div');
    var head = document.createElement('div');
    head.className = 'career-path-subhead';
    head.textContent = 'Yearly breakdown (override rate or income for any year)';
    wrap.appendChild(head);

    var grid = document.createElement('table');
    grid.className = 'career-yearly-grid';
    grid.dataset.pathId = path.id;
    wrap.appendChild(grid);

    populateYearlyGrid(grid, path, scenario);
    return wrap;
  }

  function populateYearlyGrid(grid, path, scenario) {
    grid.innerHTML = '';
    var thead = document.createElement('thead');
    thead.innerHTML =
      '<tr>' +
      '<th>Year</th><th>Age</th><th>YOS</th>' +
      '<th>Rate $/hr</th><th title="Override credit hours per month for this year. Leave blank to use the path default.">Credit hrs/mo</th><th>Income $</th>' +
      '<th>Save $</th><th>Net Worth $</th>' +
      '</tr>';
    grid.appendChild(thead);
    var tbody = document.createElement('tbody');
    grid.appendChild(tbody);

    var rows = simulatePath(path, scenario);
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var ov = path.yearlyOverrides && path.yearlyOverrides[row.year];
      var hasOverride = !!(ov && (
        typeof ov.rate === 'number' ||
        typeof ov.income === 'number' ||
        typeof ov.creditHours === 'number'
      ));
      if (hasOverride) tr.classList.add('yg-override');

      tr.appendChild(td(row.year));
      tr.appendChild(td(row.age));
      tr.appendChild(td(row.yos));

      // Rate (editable override)
      var rateTd = document.createElement('td');
      var rateInp = document.createElement('input');
      rateInp.type = 'number'; rateInp.step = 0.01;
      rateInp.placeholder = row.rate ? row.rate.toFixed(2) : '';
      rateInp.value = ov && typeof ov.rate === 'number' ? ov.rate : '';
      rateInp.title = 'Override hourly rate. Leave blank to use the model.';
      rateInp.addEventListener('input', function () {
        path.yearlyOverrides = path.yearlyOverrides || {};
        var v = rateInp.value === '' ? null : parseFloat(rateInp.value);
        if (v == null || isNaN(v)) {
          if (path.yearlyOverrides[row.year]) delete path.yearlyOverrides[row.year].rate;
          if (path.yearlyOverrides[row.year] && Object.keys(path.yearlyOverrides[row.year]).length === 0)
            delete path.yearlyOverrides[row.year];
        } else {
          path.yearlyOverrides[row.year] = path.yearlyOverrides[row.year] || {};
          path.yearlyOverrides[row.year].rate = v;
        }
        renderChart(scenario);
        refreshYearlyGrid(path, scenario);
        save();
      });
      rateTd.appendChild(rateInp);
      tr.appendChild(rateTd);

      // Credit hours per month (editable override)
      var chTd = document.createElement('td');
      var chInp = document.createElement('input');
      chInp.type = 'number'; chInp.step = 1; chInp.min = 0;
      chInp.placeholder = String(path.creditHoursPerMonth || 0);
      chInp.value = ov && typeof ov.creditHours === 'number' ? ov.creditHours : '';
      chInp.title = 'Override credit hours/month for this year. Leave blank to use the path default. (401k & profit share auto-recalc.)';
      chInp.addEventListener('input', function () {
        path.yearlyOverrides = path.yearlyOverrides || {};
        var v = chInp.value === '' ? null : parseFloat(chInp.value);
        if (v == null || isNaN(v)) {
          if (path.yearlyOverrides[row.year]) delete path.yearlyOverrides[row.year].creditHours;
          if (path.yearlyOverrides[row.year] && Object.keys(path.yearlyOverrides[row.year]).length === 0)
            delete path.yearlyOverrides[row.year];
        } else {
          path.yearlyOverrides[row.year] = path.yearlyOverrides[row.year] || {};
          path.yearlyOverrides[row.year].creditHours = v;
        }
        renderChart(scenario);
        refreshYearlyGrid(path, scenario);
        save();
      });
      chTd.appendChild(chInp);
      tr.appendChild(chTd);

      // Income (editable override)
      var incTd = document.createElement('td');
      var incInp = document.createElement('input');
      incInp.type = 'number'; incInp.step = 100;
      incInp.placeholder = row.income ? Math.round(row.income).toString() : '';
      incInp.value = ov && typeof ov.income === 'number' ? ov.income : '';
      incInp.title = 'Override total income. Leave blank to compute from rate × hours × 12.';
      incInp.addEventListener('input', function () {
        path.yearlyOverrides = path.yearlyOverrides || {};
        var v = incInp.value === '' ? null : parseFloat(incInp.value);
        if (v == null || isNaN(v)) {
          if (path.yearlyOverrides[row.year]) delete path.yearlyOverrides[row.year].income;
          if (path.yearlyOverrides[row.year] && Object.keys(path.yearlyOverrides[row.year]).length === 0)
            delete path.yearlyOverrides[row.year];
        } else {
          path.yearlyOverrides[row.year] = path.yearlyOverrides[row.year] || {};
          path.yearlyOverrides[row.year].income = v;
        }
        renderChart(scenario);
        refreshYearlyGrid(path, scenario);
        save();
      });
      incTd.appendChild(incInp);
      tr.appendChild(incTd);

      // Save (computed)
      var saveTd = document.createElement('td');
      saveTd.className = 'yg-computed';
      if (row.save > 0) saveTd.classList.add('is-positive');
      else if (row.save < 0) saveTd.classList.add('is-negative');
      saveTd.textContent = formatMoneyShort(row.save);
      if (row.riskLabel) {
        saveTd.title = row.riskLabel;
        saveTd.textContent += ' (' + row.riskLabel + ')';
      }
      tr.appendChild(saveTd);

      // Net worth (computed)
      var nwTd = document.createElement('td');
      nwTd.className = 'yg-computed';
      nwTd.textContent = formatMoneyShort(row.netWorth);
      tr.appendChild(nwTd);

      tbody.appendChild(tr);
    });

    function td(text) {
      var cell = document.createElement('td');
      cell.textContent = text;
      cell.className = 'yg-computed';
      return cell;
    }
  }

  function refreshYearlyGrid(path, scenario) {
    var grid = els.pathsList.querySelector('.career-yearly-grid[data-path-id="' + path.id + '"]');
    if (grid) {
      populateYearlyGrid(grid, path, scenario);
      applyInputModeDecimal();
    }
  }

  // ===========================================================================
  // Chart rendering (SVG)
  // ===========================================================================
  function renderChart(scenario) {
    var simCount = parseInt(els.mcSims.value, 10) || 0;
    var showBand = !!els.showBand.checked;
    var data = computeAll(scenario, showBand ? simCount : 0);
    lastComputed = { scenario: scenario, data: data };

    drawSvgChart(scenario, data, { showBand: showBand });
    renderLegend();
    renderCrossovers(scenario, data);
    renderChartSummary(scenario, data);
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function drawSvgChart(scenario, data, opts) {
    var svg = els.chart;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var rect = els.chartWrap.getBoundingClientRect();
    var W = Math.max(300, rect.width);
    var H = Math.max(220, rect.height);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    var pad = { top: 18, right: 18, bottom: 38, left: 70 };
    var innerW = W - pad.left - pad.right;
    var innerH = H - pad.top - pad.bottom;

    var startYear = scenario.startYear;
    var endYear = scenario.endYear;
    var nYears = endYear - startYear + 1;

    // Compute Y range across all paths
    var maxNW = 0, minNW = 0;
    data.forEach(function (entry) {
      entry.rows.forEach(function (r) {
        if (r.netWorth > maxNW) maxNW = r.netWorth;
        if (r.netWorth < minNW) minNW = r.netWorth;
      });
      if (entry.bands) entry.bands.forEach(function (b) {
        if (b.p90 > maxNW) maxNW = b.p90;
        if (b.p10 < minNW) minNW = b.p10;
      });
    });
    if (maxNW === minNW) { maxNW = minNW + 1; }
    // Add 5% headroom
    var range = maxNW - minNW;
    maxNW += range * 0.05;
    if (minNW > 0) minNW = 0; // anchor at zero if everyone is positive

    var x = function (year) {
      if (nYears <= 1) return pad.left + innerW / 2;
      return pad.left + ((year - startYear) / (nYears - 1)) * innerW;
    };
    var y = function (val) {
      return pad.top + (1 - (val - minNW) / (maxNW - minNW)) * innerH;
    };

    // Draw grid lines + Y labels
    var gridGroup = svgEl('g');
    var nTicks = 6;
    for (var i = 0; i <= nTicks; i++) {
      var v = minNW + ((maxNW - minNW) * i / nTicks);
      var yy = y(v);
      gridGroup.appendChild(svgEl('line', {
        x1: pad.left, x2: pad.left + innerW, y1: yy, y2: yy,
        stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1
      }));
      var lbl = svgEl('text', {
        x: pad.left - 8, y: yy + 4, fill: '#9aa0a6',
        'font-size': 11, 'text-anchor': 'end',
        'font-family': 'Segoe UI, system-ui, sans-serif'
      });
      lbl.textContent = formatMoneyShort(v);
      gridGroup.appendChild(lbl);
    }
    // Zero line stronger
    if (minNW < 0 && maxNW > 0) {
      gridGroup.appendChild(svgEl('line', {
        x1: pad.left, x2: pad.left + innerW, y1: y(0), y2: y(0),
        stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1
      }));
    }
    svg.appendChild(gridGroup);

    // X labels (show ~10 ticks max)
    var xStep = Math.max(1, Math.ceil(nYears / 10));
    var xGroup = svgEl('g');
    for (var yr = startYear; yr <= endYear; yr += xStep) {
      var t = svgEl('text', {
        x: x(yr), y: H - pad.bottom + 16,
        fill: '#9aa0a6', 'font-size': 11, 'text-anchor': 'middle',
        'font-family': 'Segoe UI, system-ui, sans-serif'
      });
      t.textContent = String(yr);
    xGroup.appendChild(t);
    }
    if ((endYear - startYear) % xStep !== 0) {
      var t2 = svgEl('text', {
        x: x(endYear), y: H - pad.bottom + 16,
        fill: '#9aa0a6', 'font-size': 11, 'text-anchor': 'middle',
        'font-family': 'Segoe UI, system-ui, sans-serif'
      });
      t2.textContent = String(endYear);
      xGroup.appendChild(t2);
    }
    svg.appendChild(xGroup);

    // Probability bands (drawn behind lines)
    if (opts.showBand) {
      data.forEach(function (entry) {
        if (!entry.bands) return;
        var pts10 = entry.bands.map(function (b) { return [x(b.year), y(b.p10)]; });
        var pts90 = entry.bands.map(function (b) { return [x(b.year), y(b.p90)]; });
        var d = 'M' + pts10[0][0] + ',' + pts10[0][1];
        for (var i = 1; i < pts10.length; i++) d += ' L' + pts10[i][0] + ',' + pts10[i][1];
        for (var j = pts90.length - 1; j >= 0; j--) d += ' L' + pts90[j][0] + ',' + pts90[j][1];
        d += ' Z';
        svg.appendChild(svgEl('path', {
          d: d, fill: entry.path.color, opacity: 0.15
        }));
      });
    }

    // Crossover markers (between all pairs)
    if (data.length >= 2) {
      var crossGroup = svgEl('g');
      for (var a = 0; a < data.length; a++) {
        for (var b = a + 1; b < data.length; b++) {
          var crosses = findCrossovers(data[a].rows, data[b].rows);
          crosses.forEach(function (c) {
            var cx = x(c.year);
            crossGroup.appendChild(svgEl('line', {
              x1: cx, x2: cx, y1: pad.top, y2: pad.top + innerH,
              stroke: 'rgba(255,183,77,0.45)', 'stroke-width': 1, 'stroke-dasharray': '4,4'
            }));
            var lbl = svgEl('text', {
              x: cx, y: pad.top + 12,
              fill: '#ffb74d', 'font-size': 10, 'text-anchor': 'middle',
              'font-family': 'Segoe UI, system-ui, sans-serif'
            });
            lbl.textContent = c.year;
            crossGroup.appendChild(lbl);
          });
        }
      }
      svg.appendChild(crossGroup);
    }

    // Lines
    data.forEach(function (entry) {
      var pts = entry.rows.map(function (r) { return [x(r.year), y(r.netWorth)]; });
      if (pts.length === 0) return;
      var d = 'M' + pts[0][0] + ',' + pts[0][1];
      for (var i = 1; i < pts.length; i++) d += ' L' + pts[i][0] + ',' + pts[i][1];
      svg.appendChild(svgEl('path', {
        d: d, fill: 'none', stroke: entry.path.color, 'stroke-width': 2.5,
        'stroke-linejoin': 'round'
      }));
      // Endpoint dot
      var last = pts[pts.length - 1];
      svg.appendChild(svgEl('circle', {
        cx: last[0], cy: last[1], r: 4, fill: entry.path.color
      }));
    });

    // Hover overlay (one transparent rect; we use an indicator line + tooltip)
    var hover = svgEl('g');
    var indicator = svgEl('line', {
      x1: 0, x2: 0, y1: pad.top, y2: pad.top + innerH,
      stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 1, opacity: 0
    });
    hover.appendChild(indicator);
    var dots = [];
    data.forEach(function (entry) {
      var dot = svgEl('circle', { cx: 0, cy: 0, r: 4, fill: entry.path.color, opacity: 0 });
      hover.appendChild(dot);
      dots.push({ entry: entry, el: dot });
    });
    var hoverRect = svgEl('rect', {
      x: pad.left, y: pad.top, width: innerW, height: innerH,
      fill: 'transparent'
    });
    hover.appendChild(hoverRect);
    svg.appendChild(hover);

    var tooltip = els.tooltip;

    function onMove(evt) {
      var box = svg.getBoundingClientRect();
      var px = (evt.clientX - box.left) * (W / box.width);
      if (px < pad.left || px > pad.left + innerW) {
        indicator.setAttribute('opacity', 0);
        dots.forEach(function (d) { d.el.setAttribute('opacity', 0); });
        tooltip.hidden = true;
        return;
      }
      var ratio = (px - pad.left) / innerW;
      var year = Math.round(startYear + ratio * (nYears - 1));
      year = clamp(year, startYear, endYear);
      var ix = year - startYear;
      var hx = x(year);
      indicator.setAttribute('x1', hx);
      indicator.setAttribute('x2', hx);
      indicator.setAttribute('opacity', 1);

      var html = '<strong>' + year + '</strong>';
      var firstAge = null;
      dots.forEach(function (d) {
        var row = d.entry.rows[ix];
        if (!row) return;
        d.el.setAttribute('cx', hx);
        d.el.setAttribute('cy', y(row.netWorth));
        d.el.setAttribute('opacity', 1);
        if (firstAge == null) firstAge = row.age;
        html += '<div class="tt-row">' +
          '<span class="tt-swatch" style="background:' + d.entry.path.color + '"></span>' +
          escapeHtml(d.entry.path.name) + ': ' +
          '<strong>' + formatMoney(row.netWorth) + '</strong>' +
          ' &middot; inc ' + formatMoneyShort(row.income) +
          (row.riskLabel ? ' <span style="color:#ffb74d">(' + escapeHtml(row.riskLabel) + ')</span>' : '') +
          '</div>';
      });
      if (firstAge != null) html = '<strong>' + year + ' (age ' + firstAge + ')</strong>' + html.slice(html.indexOf('</strong>') + 9);
      tooltip.innerHTML = html;
      tooltip.hidden = false;
      var wrapBox = els.chartWrap.getBoundingClientRect();
      var leftPx = (hx / W) * wrapBox.width;
      tooltip.style.left = leftPx + 'px';
      tooltip.style.top = (pad.top / H) * wrapBox.height + 'px';
    }

    function onLeave() {
      indicator.setAttribute('opacity', 0);
      dots.forEach(function (d) { d.el.setAttribute('opacity', 0); });
      tooltip.hidden = true;
    }

    hoverRect.addEventListener('mousemove', onMove);
    hoverRect.addEventListener('mouseleave', onLeave);

    // Touch behaviour: tooltip stays visible until the user taps outside the
    // chart. This is much better than disappearing on touchend (which is what
    // mobile users expect for a "tap to inspect" interaction).
    function touchHandler(ev) {
      if (ev.touches && ev.touches[0]) {
        onMove(ev.touches[0]);
        ev.preventDefault();
      }
    }
    hoverRect.addEventListener('touchstart', touchHandler, { passive: false });
    hoverRect.addEventListener('touchmove', touchHandler, { passive: false });
    // Stash the latest onLeave so the (single, init-time) doc-level handler
    // can dismiss the tooltip when the user taps outside the chart.
    chartTooltipDismiss = onLeave;
  }

  // Single doc-level "tap outside chart to dismiss" handler. Installed once at
  // init time; reads the latest onLeave through chartTooltipDismiss.
  var chartTooltipDismiss = null;
  function installTooltipDismissListener() {
    document.addEventListener('touchstart', function (ev) {
      if (!chartTooltipDismiss) return;
      if (els.tooltip && els.tooltip.hidden) return;
      if (els.chartWrap && !els.chartWrap.contains(ev.target)) chartTooltipDismiss();
    }, { passive: true });
  }

  function renderLegend() {
    var s = getActive();
    if (!s) return;
    var lg = els.legend;
    lg.innerHTML = '';
    s.paths.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'legend-item';
      var sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = p.color;
      var lbl = document.createElement('span');
      lbl.textContent = p.name;
      item.appendChild(sw);
      item.appendChild(lbl);
      lg.appendChild(item);
    });
  }

  function renderCrossovers(scenario, data) {
    var ul = els.crossList;
    ul.innerHTML = '';
    if (data.length < 2) return;
    var any = false;
    for (var a = 0; a < data.length; a++) {
      for (var b = a + 1; b < data.length; b++) {
        var crosses = findCrossovers(data[a].rows, data[b].rows);
        crosses.forEach(function (c) {
          var div = document.createElement('div');
          div.className = 'crossover-item';
          // Determine which path leads after the crossover
          var ix = c.year - scenario.startYear;
          var leader = data[a].rows[ix].netWorth >= data[b].rows[ix].netWorth ? data[a].path : data[b].path;
          var lagger = leader === data[a].path ? data[b].path : data[a].path;
          div.innerHTML = 'In <strong>' + c.year + '</strong> (age ' + c.age + '), ' +
            '<strong>' + escapeHtml(leader.name) + '</strong> overtakes ' +
            '<strong>' + escapeHtml(lagger.name) + '</strong>.';
          ul.appendChild(div);
          any = true;
        });
      }
    }
    if (!any && data.length >= 2) {
      var d = document.createElement('div');
      d.className = 'crossover-item';
      d.textContent = 'No crossovers in this range — one path stays ahead the whole time.';
      ul.appendChild(d);
    }
  }

  function renderChartSummary(scenario, data) {
    var sum = els.chartSummary;
    if (data.length === 0) { sum.textContent = ''; return; }
    var lastIdx = data[0].rows.length - 1;
    var parts = [];
    parts.push(scenario.startYear + ' \u2013 ' + scenario.endYear);
    parts.push('Final net worth:');
    data.forEach(function (entry) {
      var nw = entry.rows[lastIdx].netWorth;
      parts.push('<span style="color:' + entry.path.color + '">' + escapeHtml(entry.path.name) + '</span> ' + formatMoneyShort(nw));
    });
    sum.innerHTML = parts.join(' &middot; ');
  }

  // ===========================================================================
  // What-if helper
  // ===========================================================================
  function renderWhatIfPathSelectors(scenario) {
    var aSel = els.whatIfPathA;
    var bSel = els.whatIfPathB;
    if (!aSel || !bSel) return;
    var prevA = aSel.value, prevB = bSel.value;
    aSel.innerHTML = '';
    bSel.innerHTML = '';
    scenario.paths.forEach(function (p) {
      var oa = document.createElement('option');
      oa.value = p.id; oa.textContent = p.name;
      aSel.appendChild(oa);
      var ob = document.createElement('option');
      ob.value = p.id; ob.textContent = p.name;
      bSel.appendChild(ob);
    });
    if (prevA && scenario.paths.find(function (p) { return p.id === prevA; })) aSel.value = prevA;
    if (prevB && scenario.paths.find(function (p) { return p.id === prevB; })) bSel.value = prevB;
    if (aSel.value === bSel.value && scenario.paths.length >= 2) {
      bSel.value = scenario.paths[1].id;
    }
  }

  function runWhatIf() {
    var scenario = getActive();
    if (!scenario) return;
    var pa = scenario.paths.find(function (p) { return p.id === els.whatIfPathA.value; });
    var pb = scenario.paths.find(function (p) { return p.id === els.whatIfPathB.value; });
    var year = parseInt(els.whatIfYear.value, 10) || scenario.endYear;
    if (!pa || !pb || pa.id === pb.id) {
      els.whatIfResult.textContent = 'Pick two different paths.';
      return;
    }
    if (year < scenario.startYear || year > scenario.endYear) {
      els.whatIfResult.textContent = 'Target year must be between ' + scenario.startYear + ' and ' + scenario.endYear + '.';
      return;
    }
    var ix = year - scenario.startYear;
    var rowsB = simulatePath(pb, scenario);
    var targetNW = rowsB[ix].netWorth;
    var rowsA0 = simulatePath(pa, scenario);
    var currentNW = rowsA0[ix].netWorth;

    // Bisection: find a flat hourly rate boost added to every year for path A
    // so that A's net worth at target year == targetNW.
    function nwAtYearWithBoost(boost) {
      var clone = deepClone(pa);
      // Override: set every year's rate to (resolveBaseRate + boost). Simpler:
      // multiply income by (income + boost*hours*12)/income — but income may be
      // overridden too. Easiest: if income override exists, scale it; else scale rate.
      for (var yr = scenario.startYear; yr <= scenario.endYear; yr++) {
        var baseInc = computeYearIncome(pa, yr, scenario);
        var ovBase = pa.yearlyOverrides && pa.yearlyOverrides[yr];
        clone.yearlyOverrides = clone.yearlyOverrides || {};
        // Use this year's effective credit hours (per-year override wins)
        var hoursThisYear = resolveCreditHours(pa, yr);
        var addIncome = boost * hoursThisYear * 12;
        // If a manual income was set, just add boost*hours*12 to that income
        if (ovBase && typeof ovBase.income === 'number') {
          clone.yearlyOverrides[yr] = Object.assign({}, ovBase, {
            income: ovBase.income + addIncome
          });
        } else {
          // Otherwise, scale the resolved base rate
          var newRate = baseInc.rate + boost;
          clone.yearlyOverrides[yr] = Object.assign({}, ovBase || {}, { rate: newRate });
        }
      }
      var rows = simulatePath(clone, scenario);
      return rows[ix].netWorth;
    }

    // Probe range
    var lo = -200, hi = 1000;
    var nwLo = nwAtYearWithBoost(lo);
    var nwHi = nwAtYearWithBoost(hi);
    if (nwLo > targetNW) {
      els.whatIfResult.innerHTML = 'Even with $' + Math.abs(lo) + '/hr <em>less</em>, ' +
        escapeHtml(pa.name) + ' still beats ' + escapeHtml(pb.name) + ' in ' + year + '.';
      return;
    }
    if (nwHi < targetNW) {
      els.whatIfResult.innerHTML = 'Even with $' + hi + '/hr more, ' + escapeHtml(pa.name) +
        ' cannot match ' + escapeHtml(pb.name) + ' by ' + year + '. (Maybe expenses or 401k differ too much.)';
      return;
    }
    for (var iter = 0; iter < 60; iter++) {
      var mid = (lo + hi) / 2;
      var nwMid = nwAtYearWithBoost(mid);
      if (nwMid < targetNW) lo = mid;
      else hi = mid;
      if (Math.abs(hi - lo) < 0.01) break;
    }
    var boost = (lo + hi) / 2;
    var sign = boost >= 0 ? '+' : '';
    var dirText = boost >= 0 ? 'higher' : 'LOWER';
    els.whatIfResult.innerHTML =
      'To match <strong>' + escapeHtml(pb.name) + '</strong> (' + formatMoney(targetNW) + ') by end of <strong>' + year + '</strong>,\n' +
      '<strong>' + escapeHtml(pa.name) + '</strong> would need an hourly rate ' + sign + '$' +
      boost.toFixed(2) + '/hr ' + dirText + ' (every year).\n' +
      'Currently ' + escapeHtml(pa.name) + ' projects to ' + formatMoney(currentNW) + ' by ' + year +
      ' (gap = ' + formatMoney(targetNW - currentNW) + ').';
  }

  // ===========================================================================
  // Scenario actions
  // ===========================================================================
  function newScenario() {
    var name = prompt('Name for the new scenario:', 'Scenario ' + (state.scenarios.length + 1));
    if (!name) return;
    var s = makeScenario({ name: name });
    s.paths = [
      makePath({ name: 'Stay', color: COLOR_PALETTE[0] }),
      makePath({ name: 'Leave', color: COLOR_PALETTE[1] })
    ];
    state.scenarios.push(s);
    state.activeId = s.id;
    rerenderAll();
  }

  function cloneScenario() {
    var s = getActive();
    if (!s) return;
    var copy = deepClone(s);
    copy.id = uid();
    copy.name = s.name + ' (copy)';
    copy.createdAt = new Date().toISOString();
    copy.paths.forEach(function (p) { p.id = uid(); });
    state.scenarios.push(copy);
    state.activeId = copy.id;
    rerenderAll();
  }

  function renameScenario() {
    var s = getActive();
    if (!s) return;
    var name = prompt('Rename scenario:', s.name);
    if (!name) return;
    s.name = name;
    rerenderAll();
  }

  function deleteScenario() {
    var s = getActive();
    if (!s) return;
    if (state.scenarios.length <= 1) {
      alert('Cannot delete the last scenario. Create another one first.');
      return;
    }
    if (!confirm('Delete scenario "' + s.name + '"?')) return;
    state.scenarios = state.scenarios.filter(function (x) { return x.id !== s.id; });
    state.activeId = state.scenarios[0].id;
    rerenderAll();
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'career-scenarios-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  function importJsonFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.scenarios) || !parsed.scenarios.length) {
          throw new Error('Invalid file');
        }
        if (!confirm('Replace current scenarios with imported ones? (' + parsed.scenarios.length + ' scenarios)')) return;
        state = parsed;
        if (!state.activeId || !state.scenarios.find(function (s) { return s.id === state.activeId; })) {
          state.activeId = state.scenarios[0].id;
        }
        rerenderAll();
      } catch (e) {
        alert('Could not load that file. Is it a valid scenarios JSON?');
      }
    };
    reader.readAsText(file);
  }

  function resetDefaults() {
    if (!confirm('Replace all current scenarios with the default starter scenarios? (Cannot be undone — export first if you want to keep a copy.)')) return;
    state.scenarios = buildDefaultScenarios();
    state.activeId = state.scenarios[0].id;
    rerenderAll();
  }

  // ===========================================================================
  // Init
  // ===========================================================================
  function init() {
    if (initialized) return;
    initialized = true;

    els = {
      scenarioSelect: $('careerScenarioSelect'),
      newBtn: $('careerNewScenarioBtn'),
      cloneBtn: $('careerCloneScenarioBtn'),
      renameBtn: $('careerRenameScenarioBtn'),
      deleteBtn: $('careerDeleteScenarioBtn'),
      exportBtn: $('careerExportBtn'),
      importBtn: $('careerImportBtn'),
      importFile: $('careerImportFile'),
      resetBtn: $('careerResetBtn'),

      startYear: $('careerStartYear'),
      endYear: $('careerEndYear'),
      startNetWorth: $('careerStartNetWorth'),
      interestRate: $('careerInterestRate'),
      mcSims: $('careerMcSims'),
      showBand: $('careerShowBand'),

      addPathBtn: $('careerAddPathBtn'),
      pathsList: $('careerPathsList'),

      chartWrap: $('careerChartWrap'),
      chart: $('careerChart'),
      tooltip: $('careerChartTooltip'),
      legend: $('careerLegend'),
      crossList: $('careerCrossoverList'),
      chartSummary: $('careerChartSummary'),

      whatIfPathA: $('whatIfPathA'),
      whatIfPathB: $('whatIfPathB'),
      whatIfYear: $('whatIfYear'),
      whatIfRunBtn: $('whatIfRunBtn'),
      whatIfResult: $('whatIfResult')
    };

    load();

    // Wire scenario picker
    els.scenarioSelect.addEventListener('change', function () {
      state.activeId = els.scenarioSelect.value;
      save();
      rerenderAll();
    });
    els.newBtn.addEventListener('click', newScenario);
    els.cloneBtn.addEventListener('click', cloneScenario);
    els.renameBtn.addEventListener('click', renameScenario);
    els.deleteBtn.addEventListener('click', deleteScenario);
    els.exportBtn.addEventListener('click', exportJson);
    els.importBtn.addEventListener('click', function () { els.importFile.click(); });
    els.importFile.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importJsonFile(f);
      e.target.value = '';
    });
    els.resetBtn.addEventListener('click', resetDefaults);

    // Wire global settings
    function updateScenarioField(key, parser) {
      return function () {
        var s = getActive(); if (!s) return;
        var v = parser(els[key].value);
        if (v == null || isNaN(v)) return;
        s[key] = v;
        if (key === 'endYear' || key === 'startYear') {
          if (s.endYear < s.startYear) s.endYear = s.startYear;
        }
        renderChart(s);
        // Yearly grids depend on year range
        renderPaths(s);
        save();
      };
    }
    els.startYear.addEventListener('input', updateScenarioField('startYear', function (v) { return parseInt(v, 10); }));
    els.endYear.addEventListener('input', updateScenarioField('endYear', function (v) { return parseInt(v, 10); }));
    els.startNetWorth.addEventListener('input', updateScenarioField('startNetWorth', function (v) { return parseFloat(v); }));
    els.interestRate.addEventListener('input', updateScenarioField('interestRate', function (v) { return parseFloat(v); }));
    els.mcSims.addEventListener('input', function () {
      var s = getActive(); if (!s) return;
      renderChart(s);
    });
    els.showBand.addEventListener('change', function () {
      var s = getActive(); if (!s) return;
      renderChart(s);
    });

    // Add path
    els.addPathBtn.addEventListener('click', function () {
      var s = getActive(); if (!s) return;
      var nextColor = COLOR_PALETTE[s.paths.length % COLOR_PALETTE.length];
      s.paths.push(makePath({ name: 'Path ' + (s.paths.length + 1), color: nextColor }));
      rerenderAll();
    });

    // What-if
    els.whatIfRunBtn.addEventListener('click', runWhatIf);

    // Tap-outside-to-dismiss for chart tooltip (touch devices)
    installTooltipDismissListener();

    // Re-render chart on resize
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var s = getActive();
        if (s) renderChart(s);
      }, 120);
    });

    // Generic collapsible support for new sections
    document.querySelectorAll('[data-collapse-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-collapse-target');
        var section = btn.closest('.collapsible');
        if (!section) return;
        section.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', section.classList.contains('collapsed') ? 'false' : 'true');
      });
    });

    rerenderAll();
  }

  // Public API
  window.CareerComparison = {
    activate: function () {
      init();
      // Re-render chart on activation in case container size changed
      var s = getActive();
      if (s) renderChart(s);
    }
  };
})();
