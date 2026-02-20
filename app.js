(function () {
  'use strict';

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const PAY_YEAR_MONTHS = [11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Dec-Nov order

  const goalInput = document.getElementById('goalInput');
  const initializeYearBtn = document.getElementById('initializeYear');
  const refreshBtn = document.getElementById('refreshBtn');
  const currentTotalEl = document.getElementById('currentTotal');
  const remainingGoalEl = document.getElementById('remainingGoal');
  const payRatesSection = document.getElementById('payRatesSection');
  const chartSection = document.getElementById('chartSection');
  const payRateGroups = document.getElementById('payRateGroups');
  const addPayRateGroupBtn = document.getElementById('addPayRateGroup');
  const bidPeriodsInput = document.getElementById('bidPeriodsInput');
  const percentageInput = document.getElementById('percentageInput');
  const chartBars = document.getElementById('chartBars');
  const chartYAxis = document.getElementById('chartYAxis');
  const chartTargetLine = document.getElementById('chartTargetLine');
  const chartMonthLabels = document.getElementById('chartMonthLabels');
  const targetLegendItem = document.getElementById('targetLegendItem');
  const targetLegendText = document.getElementById('targetLegendText');
  const chartResultIncomeEl = document.getElementById('chartResultIncome');
  const chartTargetIncomeEl = document.getElementById('chartTargetIncome');
  const creditInputsRow = document.getElementById('creditInputsRow');
  const scenariosSection = document.getElementById('scenariosSection');
  const scenarioSlots = document.getElementById('scenarioSlots');
  const compareScenariosBtn = document.getElementById('compareScenariosBtn');

  const STORAGE_KEY = 'pcalc11111111-data';
  const SCENARIOS_KEY = 'pcalc11111111-scenarios';
  const COLLAPSE_KEY_PREFIX = 'pcalc11111111-collapse-';
  const STORAGE_KEY_LEGACY = 'pay-calculator-data';
  const COLLAPSE_KEY_LEGACY_PREFIX = 'pay-calculator-collapse-';

  // One-time migration from old keys so existing users keep their data
  try {
    if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(STORAGE_KEY_LEGACY)) {
      localStorage.setItem(STORAGE_KEY, localStorage.getItem(STORAGE_KEY_LEGACY));
    }
    ['goal', 'payRates'].forEach(function (id) {
      var legacy = localStorage.getItem(COLLAPSE_KEY_LEGACY_PREFIX + id);
      if (legacy !== null && localStorage.getItem(COLLAPSE_KEY_PREFIX + id) === null) {
        localStorage.setItem(COLLAPSE_KEY_PREFIX + id, legacy);
      }
    });
  } catch (e) {}

  let goal = null;
  let payYear = null;
  let payRateGroupsData = [];

  function getState() {
    return {
      goal,
      payYear: payYear ? { year: payYear.year, months: payYear.months.map(m => ({ ...m })) } : null,
      payRateGroupsData: payRateGroupsData.map(g => ({ id: g.id, payRate: g.payRate, months: g.months.slice() }))
    };
  }

  function save() {
    try {
      const state = getState();
      if (state.payYear || state.payRateGroupsData.length > 0 || (state.goal != null && !isNaN(state.goal))) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        showSavedIndicator();
      }
    } catch (err) { /* ignore quota / private mode */ }
  }

  let saveIndicatorTimer = null;
  function showSavedIndicator() {
    const el = document.getElementById('saveIndicator');
    if (!el) return;
    el.classList.add('visible');
    if (saveIndicatorTimer) clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(function () {
      el.classList.remove('visible');
      saveIndicatorTimer = null;
    }, 1800);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (!state) return false;

      if (state.goal != null && !isNaN(state.goal)) {
        goal = state.goal;
        goalInput.value = formatIntegerWithCommas(goal);
        if (chartTargetIncomeEl) chartTargetIncomeEl.textContent = formatMoney(goal);
      }

      if (Array.isArray(state.payRateGroupsData) && state.payRateGroupsData.length > 0) {
        payRateGroupsData = state.payRateGroupsData.map(g => ({ id: g.id, payRate: g.payRate, months: g.months.slice() }));
      }

      if (state.payYear && Array.isArray(state.payYear.months) && state.payYear.months.length === 12) {
        payYear = {
          year: state.payYear.year,
          months: state.payYear.months.map(m => ({
            monthIndex: m.monthIndex,
            year: m.year,
            payRate: m.payRate,
            credit: typeof m.credit === 'number' ? m.credit : 70,
            bidPeriods: typeof m.bidPeriods === 'number' ? m.bidPeriods : 1,
            percentage: typeof m.percentage === 'number' ? m.percentage : 1
          }))
        };
        const first = payYear.months[0];
        if (first) {
          bidPeriodsInput.value = first.bidPeriods || 1;
          percentageInput.value = Math.round((first.percentage || 1) * 100);
        }
        payRatesSection.style.display = 'block';
        chartSection.style.display = 'block';
        if (scenariosSection) scenariosSection.style.display = 'block';
        renderPayRateGroups();
        updatePayRatesInMonths();
        renderChart();
        updateTotals();
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  function formatMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatIntegerWithCommas(n) {
    const num = Math.round(Number(n));
    if (isNaN(num) || num === 0) return '';
    return num.toLocaleString('en-US');
  }

  function parseGoalInput(value) {
    const cleaned = String(value).replace(/,/g, '').replace(/\D/g, '');
    return cleaned === '' ? null : Number(cleaned);
  }

  function formatHours(n) {
    return Number(n).toFixed(2);
  }

  function formatHoursWhole(n) {
    return String(Math.round(Number(n) || 0));
  }

  function initializePayYear() {
    const year = new Date().getFullYear();
    payYear = {
      year: year,
      months: PAY_YEAR_MONTHS.map((monthIndex) => {
        const y = monthIndex === 11 ? year - 1 : year;
        return {
          monthIndex,
          year: y,
          payRate: null,
          credit: 70,
          bidPeriods: Number(bidPeriodsInput.value) || 1,
          percentage: Number(percentageInput.value) / 100 || 1
        };
      })
    };
    payRatesSection.style.display = 'block';
    chartSection.style.display = 'block';
    if (scenariosSection) scenariosSection.style.display = 'block';
    if (payRateGroupsData.length === 0) {
      addPayRateGroup(); // Pay Rate 1 (Dec, Jan, Feb)
      addPayRateGroup(); // Pay Rate 2 (remaining months) – visible right away
    }
    updatePayRatesInMonths();
    renderChart();
    updateTotals();
    save();
  }

  function addPayRateGroup() {
    if (payRateGroupsData.length >= 2) return;
    const groupId = payRateGroupsData.length;
    let months = [];
    let payRate = 150;
    if (groupId === 0) {
      months = [11, 0, 1];
      payRate = 256.14;
    } else if (groupId === 1) {
      const firstGroupMonths = payRateGroupsData[0].months;
      months = PAY_YEAR_MONTHS.filter(m => !firstGroupMonths.includes(m));
      payRate = 263.75;
    }
    payRateGroupsData.push({ id: groupId, payRate, months });
    renderPayRateGroups();
    if (payYear) {
      updatePayRatesInMonths();
      renderChart();
      updateTotals();
    }
    save();
  }

  function syncInverseMonths(changedGroupId) {
    if (payRateGroupsData.length !== 2) return;
    const g1 = payRateGroupsData[0];
    const g2 = payRateGroupsData[1];
    if (changedGroupId === 0) {
      g2.months = PAY_YEAR_MONTHS.filter(m => !g1.months.includes(m));
    } else {
      g1.months = PAY_YEAR_MONTHS.filter(m => !g2.months.includes(m));
    }
  }

  function removePayRateGroup(groupId) {
    if (payRateGroupsData.length <= 1) return;
    payRateGroupsData = payRateGroupsData.filter(g => g.id !== groupId);
    payRateGroupsData.forEach((g, idx) => { g.id = idx; });
    renderPayRateGroups();
    if (payYear) {
      updatePayRatesInMonths();
      renderChart();
      updateTotals();
    }
    save();
  }

  function renderPayRateGroups() {
    if (addPayRateGroupBtn) {
      if (payRateGroupsData.length >= 2) {
        addPayRateGroupBtn.disabled = true;
        addPayRateGroupBtn.style.opacity = '0.5';
        addPayRateGroupBtn.style.cursor = 'not-allowed';
        addPayRateGroupBtn.textContent = 'Maximum 2 pay rates';
      } else {
        addPayRateGroupBtn.disabled = false;
        addPayRateGroupBtn.style.opacity = '1';
        addPayRateGroupBtn.style.cursor = 'pointer';
        addPayRateGroupBtn.textContent = payRateGroupsData.length === 0 ? '+ Add first pay rate' : '+ Add second pay rate';
      }
    }
    payRateGroups.innerHTML = '';
    payRateGroupsData.forEach((group, idx) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'pay-rate-group';
      const header = document.createElement('div');
      header.className = 'pay-rate-group-header';
      const label = document.createElement('label');
      label.textContent = `Pay Rate ${idx + 1}`;
      const payInput = document.createElement('input');
      payInput.type = 'number';
      payInput.className = 'pay-rate-input';
      payInput.min = '0';
      payInput.max = '450';
      payInput.step = '0.01';
      payInput.value = group.payRate.toFixed(2);
      payInput.addEventListener('input', () => {
        group.payRate = Number(payInput.value) || 0;
        updatePayRatesInMonths();
        renderChart();
        updateTotals();
        save();
      });
      header.appendChild(label);
      header.appendChild(payInput);
      const monthSelector = document.createElement('div');
      monthSelector.className = 'month-selector';
      PAY_YEAR_MONTHS.forEach((monthIndex) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'month-checkbox-wrapper';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `group-${group.id}-month-${monthIndex}`;
        checkbox.checked = group.months.includes(monthIndex);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            if (!group.months.includes(monthIndex)) group.months.push(monthIndex);
          } else {
            group.months = group.months.filter(m => m !== monthIndex);
          }
          if (payRateGroupsData.length === 2) {
            syncInverseMonths(group.id);
            renderPayRateGroups();
          }
          updatePayRatesInMonths();
          renderChart();
          updateTotals();
          save();
        });
        const labelEl = document.createElement('label');
        labelEl.htmlFor = checkbox.id;
        labelEl.textContent = MONTH_NAMES[monthIndex];
        wrapper.appendChild(checkbox);
        wrapper.appendChild(labelEl);
        monthSelector.appendChild(wrapper);
      });
      const removeBtn = document.createElement('button');
      removeBtn.className = 'pay-rate-group-remove';
      removeBtn.textContent = 'Remove';
      if (payRateGroupsData.length === 1) {
        removeBtn.disabled = true;
        removeBtn.style.opacity = '0.5';
      }
      removeBtn.addEventListener('click', () => { if (payRateGroupsData.length > 1) removePayRateGroup(group.id); });
      groupEl.appendChild(header);
      groupEl.appendChild(monthSelector);
      groupEl.appendChild(removeBtn);
      payRateGroups.appendChild(groupEl);
    });
  }

  function updatePayRatesInMonths() {
    if (!payYear) return;
    payYear.months.forEach(month => {
      month.payRate = null;
      payRateGroupsData.forEach(group => {
        if (group.months.includes(month.monthIndex)) month.payRate = group.payRate;
      });
    });
  }

  let chartLocked = false;
  const chartLockToggle = document.getElementById('chartLockToggle');
  const lockIcon = document.getElementById('lockIcon');

  function setChartLocked(locked) {
    chartLocked = locked;
    if (chartLockToggle) chartLockToggle.checked = locked;
    if (lockIcon) lockIcon.textContent = locked ? '\u{1F512}' : '\u{1F513}';
    try { localStorage.setItem(COLLAPSE_KEY_PREFIX + 'chartLock', locked ? '1' : '0'); } catch (e) {}
  }

  if (chartLockToggle) {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY_PREFIX + 'chartLock');
      if (stored === '1') setChartLocked(true);
    } catch (e) {}
    chartLockToggle.addEventListener('change', () => { setChartLocked(chartLockToggle.checked); });
  }

  const CHART_HEIGHT_PX = 280;
  const MAX_CREDIT_HARD = 350;
  const SCALE_OPTIONS = [200, 250, 300, 350];
  let currentChartMaxScale = 200;

  function pickScale(dataMax) {
    if (dataMax <= 0) return 200;
    const cap = Math.min(dataMax, MAX_CREDIT_HARD);
    return SCALE_OPTIONS.find(s => s >= cap) || 350;
  }

  function creditToPx(credit, maxScale) {
    return Math.max(0, (credit / maxScale) * CHART_HEIGHT_PX);
  }

  function renderChart() {
    if (!payYear) return;

    let targetCredit = null;
    if (goal != null && !isNaN(goal) && goal > 0) {
      const avgPay = payYear.months.reduce((s, m) => s + (m.payRate || 0), 0) / 12;
      const bid = Number(bidPeriodsInput.value) || 1;
      const pct = Number(percentageInput.value) / 100 || 1;
      if (avgPay > 0 && bid > 0 && pct > 0) {
        targetCredit = (goal / 12) / (avgPay * bid * pct);
        targetCredit = Math.max(0, Math.min(MAX_CREDIT_HARD, targetCredit));
      }
    }
    const dataMax = Math.max(...payYear.months.map(m => m.credit), targetCredit || 0);
    const maxScale = pickScale(dataMax);
    currentChartMaxScale = maxScale;

    if (chartYAxis) {
      chartYAxis.innerHTML = '';
      for (let v = maxScale; v >= 0; v -= 50) {
        const tick = document.createElement('div');
        tick.className = 'y-tick';
        tick.textContent = v;
        chartYAxis.appendChild(tick);
      }
    }

    if (chartTargetLine) {
      if (targetCredit != null) {
        chartTargetLine.classList.add('visible');
        const linePx = creditToPx(targetCredit, maxScale);
        chartTargetLine.style.top = (CHART_HEIGHT_PX - linePx) + 'px';
        chartTargetLine.style.bottom = '';
        chartTargetLine.title = 'Drag to adjust target income. Target avg: ' + targetCredit.toFixed(1) + ' hrs/month';
      } else {
        chartTargetLine.classList.remove('visible');
      }
    }

    if (targetLegendItem && targetLegendText) {
      if (targetCredit != null) {
        targetLegendItem.style.display = 'flex';
        targetLegendText.textContent = 'Target avg: ' + targetCredit.toFixed(1) + ' hrs to reach goal';
      } else {
        targetLegendItem.style.display = 'none';
      }
    }

    const gridStepPx = CHART_HEIGHT_PX / (maxScale / 50);
    if (chartBars) chartBars.style.setProperty('--grid-step-px', gridStepPx + 'px');

    chartBars.innerHTML = '';
    if (chartMonthLabels) chartMonthLabels.innerHTML = '';

    payYear.months.forEach((month, idx) => {
      const cell = document.createElement('div');
      cell.className = 'chart-bar-cell';
      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      const heightPx = creditToPx(month.credit, maxScale);
      bar.style.height = heightPx + 'px';

      const creditLabel = document.createElement('div');
      creditLabel.className = 'chart-bar-credit-label';
      creditLabel.textContent = formatHoursWhole(month.credit);
      bar.appendChild(creditLabel);

      const valueLabel = document.createElement('div');
      valueLabel.className = 'chart-bar-value';
      valueLabel.innerHTML = formatHours(month.credit) + ' hrs<br>' + formatMoney(computeMonthTotal(month));
      bar.appendChild(valueLabel);

      const updateBarHeight = () => {
        const h = creditToPx(month.credit, maxScale);
        bar.style.height = h + 'px';
        creditLabel.textContent = formatHoursWhole(month.credit);
        valueLabel.innerHTML = formatHours(month.credit) + ' hrs<br>' + formatMoney(computeMonthTotal(month));
      };

      function startBarDrag(e) {
        if (chartLocked) return;
        e.preventDefault();
        e.stopPropagation();
        const clientY = e.clientY != null ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        const startY = clientY;
        const startCredit = month.credit;
        const onMove = (moveE) => {
          const y = moveE.clientY != null ? moveE.clientY : (moveE.touches && moveE.touches[0] ? moveE.touches[0].clientY : startY);
          const deltaY = startY - y;
          const deltaCredit = (deltaY / CHART_HEIGHT_PX) * maxScale;
          month.credit = Math.max(0, Math.min(MAX_CREDIT_HARD, startCredit + deltaCredit));
          updateBarHeight();
          updateTotals();
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.removeEventListener('touchmove', onMove, { passive: false });
          document.removeEventListener('touchend', onUp);
          document.removeEventListener('touchcancel', onUp);
          renderChart();
          save();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
      }
      bar.addEventListener('mousedown', startBarDrag);
      bar.addEventListener('touchstart', startBarDrag, { passive: false });

      bar.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'chart-bar-edit-input';
        input.min = '0';
        input.max = String(MAX_CREDIT_HARD);
        input.step = '0.01';
        input.setAttribute('inputmode', 'decimal');
        input.value = month.credit.toFixed(2);
        bar.appendChild(input);
        input.focus();
        input.select();
        const finishEdit = () => {
          const val = Math.max(0, Math.min(MAX_CREDIT_HARD, Number(input.value) || 0));
          month.credit = val;
          input.remove();
          updateBarHeight();
          updateTotals();
          renderChart();
          save();
        };
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finishEdit();
          else if (e.key === 'Escape') input.remove();
        });
      });

      cell.appendChild(bar);
      chartBars.appendChild(cell);

      const monthLabel = document.createElement('div');
      monthLabel.className = 'month-label';
      const y = month.monthIndex === 11 ? payYear.year - 1 : payYear.year;
      monthLabel.textContent = MONTH_NAMES[month.monthIndex] + " '" + String(y).slice(-2);
      if (chartMonthLabels) chartMonthLabels.appendChild(monthLabel);
    });

    ensureCreditInputs();
    updateCreditInputs();
  }

  function ensureCreditInputs() {
    if (!payYear || !creditInputsRow) return;
    if (creditInputsRow.children.length > 0) return;
    payYear.months.forEach((month, idx) => {
      const cell = document.createElement('div');
      cell.className = 'credit-input-cell';
      const y = month.monthIndex === 11 ? payYear.year - 1 : payYear.year;
      const label = document.createElement('label');
      label.textContent = MONTH_NAMES[month.monthIndex] + " '" + String(y).slice(-2);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(MAX_CREDIT_HARD);
      input.step = '0.01';
      input.setAttribute('inputmode', 'decimal');
      input.dataset.monthIdx = String(idx);
      input.addEventListener('input', () => {
        const val = Math.max(0, Math.min(MAX_CREDIT_HARD, Number(input.value) || 0));
        payYear.months[idx].credit = val;
        renderChart();
        updateTotals();
        save();
      });
      input.addEventListener('change', () => {
        const val = Math.max(0, Math.min(MAX_CREDIT_HARD, Number(input.value) || 0));
        payYear.months[idx].credit = val;
        input.value = val.toFixed(2);
        renderChart();
        updateTotals();
        save();
      });
      cell.appendChild(label);
      cell.appendChild(input);
      creditInputsRow.appendChild(cell);
    });
  }

  function updateCreditInputs() {
    if (!payYear || !creditInputsRow) return;
    const inputs = creditInputsRow.querySelectorAll('input[data-month-idx]');
    inputs.forEach((input) => {
      // Don't overwrite the input that has focus so the user can type multi-digit values
      if (document.activeElement === input) return;
      const idx = parseInt(input.dataset.monthIdx, 10);
      if (payYear.months[idx]) input.value = payYear.months[idx].credit.toFixed(2);
    });
  }

  function computeMonthTotal(month) {
    const payRate = month.payRate || 0;
    const credit = month.credit || 0;
    const bidPeriods = month.bidPeriods || 1;
    const percentage = month.percentage || 1;
    return payRate * credit * bidPeriods * percentage;
  }

  function updateTotals() {
    if (!payYear) return;
    const total = payYear.months.reduce((sum, month) => sum + computeMonthTotal(month), 0);
    currentTotalEl.textContent = formatMoney(total);
    if (chartResultIncomeEl) chartResultIncomeEl.textContent = formatMoney(total);
    if (chartTargetIncomeEl) {
      chartTargetIncomeEl.textContent = (goal != null && !isNaN(goal)) ? formatMoney(goal) : '—';
      const targetedBlock = chartTargetIncomeEl.closest('.chart-targeted-income');
      if (targetedBlock) {
        targetedBlock.classList.remove('under', 'met');
        if (goal != null && !isNaN(goal)) {
          targetedBlock.classList.add(total < goal ? 'under' : 'met');
        }
      }
    }
    if (goal != null && !isNaN(goal)) {
      const remaining = goal - total;
      remainingGoalEl.textContent = formatMoney(Math.abs(remaining));
      remainingGoalEl.className = 'remaining ' + (remaining <= 0 ? 'met' : 'over');
    } else {
      remainingGoalEl.textContent = '—';
      remainingGoalEl.className = 'remaining';
    }
  }

  goalInput.addEventListener('input', () => {
    goal = parseGoalInput(goalInput.value);
    if (chartTargetIncomeEl) chartTargetIncomeEl.textContent = (goal != null && !isNaN(goal)) ? formatMoney(goal) : '—';
    updateTotals();
    if (payYear) renderChart();
    save();
  });
  goalInput.addEventListener('blur', () => {
    if (goal != null && !isNaN(goal)) goalInput.value = formatIntegerWithCommas(goal);
  });

  // Load saved data or default to 400k goal
  if (!load()) {
    goalInput.value = formatIntegerWithCommas(400000);
    goal = 400000;
    if (chartTargetIncomeEl) chartTargetIncomeEl.textContent = formatMoney(400000);
    if (payYear) {
      updateTotals();
      renderChart();
    }
  }

  // Collapsible sections (1 & 2): restore state and wire toggles
  function getCollapseState(sectionId) {
    try {
      return localStorage.getItem(COLLAPSE_KEY_PREFIX + sectionId) === '1';
    } catch (e) { return false; }
  }
  function setCollapseState(sectionId, collapsed) {
    try {
      localStorage.setItem(COLLAPSE_KEY_PREFIX + sectionId, collapsed ? '1' : '0');
    } catch (e) {}
  }
  function setSectionCollapsed(sectionEl, collapsed) {
    if (!sectionEl) return;
    const toggle = sectionEl.querySelector('.collapsible-header');
    if (collapsed) {
      sectionEl.classList.add('collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    } else {
      sectionEl.classList.remove('collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }
  }
  const goalSectionEl = document.getElementById('goalSection');
  const goalSectionToggle = document.getElementById('goalSectionToggle');
  const payRatesSectionToggle = document.getElementById('payRatesSectionToggle');
  if (goalSectionEl && goalSectionToggle) {
    setSectionCollapsed(goalSectionEl, getCollapseState('goal'));
    goalSectionToggle.addEventListener('click', function () {
      const collapsed = goalSectionEl.classList.toggle('collapsed');
      goalSectionToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      setCollapseState('goal', collapsed);
    });
  }
  if (payRatesSection && payRatesSectionToggle) {
    setSectionCollapsed(payRatesSection, getCollapseState('payRates'));
    payRatesSectionToggle.addEventListener('click', function () {
      const collapsed = payRatesSection.classList.toggle('collapsed');
      payRatesSectionToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      setCollapseState('payRates', collapsed);
    });
  }

  initializeYearBtn.addEventListener('click', initializePayYear);
  addPayRateGroupBtn.addEventListener('click', addPayRateGroup);
  if (refreshBtn) refreshBtn.addEventListener('click', function () { location.reload(); });

  bidPeriodsInput.addEventListener('input', () => {
    if (payYear) {
      payYear.months.forEach(m => { m.bidPeriods = Number(bidPeriodsInput.value) || 1; });
      renderChart();
      updateTotals();
      save();
    }
  });
  percentageInput.addEventListener('input', () => {
    if (payYear) {
      payYear.months.forEach(m => { m.percentage = Number(percentageInput.value) / 100 || 1; });
      renderChart();
      updateTotals();
      save();
    }
  });

  // Draggable target line: moving it updates the targeted income goal (mouse + touch)
  if (chartTargetLine) {
    function startTargetLineDrag(e) {
      if (chartLocked) return;
      if (!payYear || !chartTargetLine.classList.contains('visible')) return;
      e.preventDefault();
      e.stopPropagation();
      const wrap = chartTargetLine.parentElement;
      if (!wrap) return;
      const avgPay = payYear.months.reduce((s, m) => s + (m.payRate || 0), 0) / 12;
      const bid = Number(bidPeriodsInput.value) || 1;
      const pct = Number(percentageInput.value) / 100 || 1;
      if (avgPay <= 0 || bid <= 0 || pct <= 0) return;
      const getClientY = (ev) => (ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0));

      const onMove = (moveE) => {
        const wrapRect = wrap.getBoundingClientRect();
        let topPx = getClientY(moveE) - wrapRect.top;
        topPx = Math.max(0, Math.min(CHART_HEIGHT_PX, topPx));
        const targetCredit = (CHART_HEIGHT_PX - topPx) / CHART_HEIGHT_PX * currentChartMaxScale;
        const targetCreditClamped = Math.max(0, Math.min(MAX_CREDIT_HARD, targetCredit));
        goal = Math.round(targetCreditClamped * 12 * avgPay * bid * pct);
        goalInput.value = formatIntegerWithCommas(goal);
        if (chartTargetIncomeEl) chartTargetIncomeEl.textContent = formatMoney(goal);
        chartTargetLine.style.top = topPx + 'px';
        chartTargetLine.title = 'Drag to adjust target income. Target avg: ' + targetCreditClamped.toFixed(1) + ' hrs/month';
        if (targetLegendText) targetLegendText.textContent = 'Target avg: ' + targetCreditClamped.toFixed(1) + ' hrs to reach goal';
        updateTotals();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove, { passive: false });
        document.removeEventListener('touchend', onUp);
        document.removeEventListener('touchcancel', onUp);
        renderChart();
        save();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      document.addEventListener('touchcancel', onUp);
      onMove(e);
    }
    chartTargetLine.addEventListener('mousedown', startTargetLineDrag);
    chartTargetLine.addEventListener('touchstart', startTargetLineDrag, { passive: false });
  }

  // ─── Scenarios ───────────────────────────────────────────────────────
  const MAX_SCENARIOS = 3;
  let scenarios = [];

  function loadScenarios() {
    try {
      const raw = localStorage.getItem(SCENARIOS_KEY);
      if (raw) scenarios = JSON.parse(raw) || [];
    } catch (e) { scenarios = []; }
  }

  function saveScenarios() {
    try {
      localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
      showSavedIndicator();
    } catch (e) {}
  }

  function saveToScenarioSlot(index) {
    const state = getState();
    const existing = scenarios[index];
    scenarios[index] = {
      name: (existing && existing.name) ? existing.name : 'Scenario ' + (index + 1),
      data: state,
      savedAt: Date.now()
    };
    saveScenarios();
    renderScenarioSlots();
  }

  function loadFromScenarioSlot(index) {
    const sc = scenarios[index];
    if (!sc || !sc.data) return;
    const state = sc.data;

    if (state.goal != null && !isNaN(state.goal)) {
      goal = state.goal;
      goalInput.value = formatIntegerWithCommas(goal);
      if (chartTargetIncomeEl) chartTargetIncomeEl.textContent = formatMoney(goal);
    }
    if (Array.isArray(state.payRateGroupsData) && state.payRateGroupsData.length > 0) {
      payRateGroupsData = state.payRateGroupsData.map(g => ({ id: g.id, payRate: g.payRate, months: g.months.slice() }));
    }
    if (state.payYear && Array.isArray(state.payYear.months) && state.payYear.months.length === 12) {
      payYear = {
        year: state.payYear.year,
        months: state.payYear.months.map(m => ({
          monthIndex: m.monthIndex,
          year: m.year,
          payRate: m.payRate,
          credit: typeof m.credit === 'number' ? m.credit : 70,
          bidPeriods: typeof m.bidPeriods === 'number' ? m.bidPeriods : 1,
          percentage: typeof m.percentage === 'number' ? m.percentage : 1
        }))
      };
      const first = payYear.months[0];
      if (first) {
        bidPeriodsInput.value = first.bidPeriods || 1;
        percentageInput.value = Math.round((first.percentage || 1) * 100);
      }
    }

    payRatesSection.style.display = 'block';
    chartSection.style.display = 'block';
    if (scenariosSection) scenariosSection.style.display = 'block';

    creditInputsRow.innerHTML = '';
    renderPayRateGroups();
    updatePayRatesInMonths();
    renderChart();
    updateTotals();
    save();
  }

  function deleteScenarioSlot(index) {
    scenarios[index] = null;
    scenarios = scenarios.slice(0, Math.max(...scenarios.map((s, i) => s ? i + 1 : 0), 0));
    saveScenarios();
    renderScenarioSlots();
  }

  function renameScenarioSlot(index, newName) {
    if (scenarios[index]) {
      scenarios[index].name = newName || ('Scenario ' + (index + 1));
      saveScenarios();
    }
  }

  function renderScenarioSlots() {
    if (!scenarioSlots) return;
    scenarioSlots.innerHTML = '';

    const savedCount = scenarios.filter(s => s != null).length;
    const nextEmpty = scenarios.length < MAX_SCENARIOS ? scenarios.length : scenarios.findIndex(s => s == null);

    for (let i = 0; i < MAX_SCENARIOS; i++) {
      const sc = scenarios[i] || null;
      const slot = document.createElement('div');
      slot.className = 'scenario-slot' + (sc ? ' saved' : ' empty');

      if (sc) {
        const nameRow = document.createElement('div');
        nameRow.className = 'scenario-name-row';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'scenario-name-input';
        nameInput.value = sc.name;
        nameInput.maxLength = 30;
        nameInput.addEventListener('change', () => { renameScenarioSlot(i, nameInput.value); });
        nameRow.appendChild(nameInput);
        slot.appendChild(nameRow);

        const summary = document.createElement('div');
        summary.className = 'scenario-summary';
        const scGoal = sc.data.goal;
        const scTotal = sc.data.payYear ? sc.data.payYear.months.reduce((sum, m) => {
          return sum + (m.payRate || 0) * (m.credit || 0) * (m.bidPeriods || 1) * (m.percentage || 1);
        }, 0) : 0;
        summary.innerHTML =
          '<span>Goal: <strong>' + formatMoney(scGoal || 0) + '</strong></span>' +
          '<span>Income: <strong>' + formatMoney(scTotal) + '</strong></span>';
        slot.appendChild(summary);

        const ts = document.createElement('div');
        ts.className = 'scenario-timestamp';
        ts.textContent = 'Saved ' + new Date(sc.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        slot.appendChild(ts);

        const actions = document.createElement('div');
        actions.className = 'scenario-actions';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn btn-primary btn-sm';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', () => { loadFromScenarioSlot(i); });
        const overwriteBtn = document.createElement('button');
        overwriteBtn.className = 'btn btn-secondary btn-sm';
        overwriteBtn.textContent = 'Overwrite';
        overwriteBtn.addEventListener('click', () => { saveToScenarioSlot(i); });
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger-outline btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
          if (confirm('Delete "' + (sc.name || 'Scenario') + '"?')) deleteScenarioSlot(i);
        });
        actions.appendChild(loadBtn);
        actions.appendChild(overwriteBtn);
        actions.appendChild(deleteBtn);
        slot.appendChild(actions);
      } else {
        const emptyLabel = document.createElement('div');
        emptyLabel.className = 'scenario-empty-label';
        emptyLabel.textContent = 'Scenario ' + (i + 1) + ' — empty';
        slot.appendChild(emptyLabel);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary btn-sm';
        saveBtn.textContent = 'Save Current';
        saveBtn.addEventListener('click', () => { saveToScenarioSlot(i); });
        slot.appendChild(saveBtn);
      }

      scenarioSlots.appendChild(slot);
    }

    if (compareScenariosBtn) {
      compareScenariosBtn.disabled = savedCount < 2;
    }
  }

  function generateComparisonPDF() {
    const active = scenarios.filter(s => s != null);
    if (active.length < 2) return;

    const monthOrder = PAY_YEAR_MONTHS;
    const colWidth = Math.floor(100 / active.length);

    let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
    html += '<title>Scenario Comparison</title>';
    html += '<style>';
    html += 'body{font-family:"Segoe UI",system-ui,sans-serif;margin:2rem;color:#222;font-size:13px}';
    html += 'h1{font-size:1.4rem;margin:0 0 0.25rem}';
    html += '.subtitle{color:#666;margin:0 0 1.5rem;font-size:0.9rem}';
    html += '.cols{display:flex;gap:1.5rem}';
    html += '.col{flex:1;border:1px solid #ccc;border-radius:8px;padding:1rem}';
    html += '.col h2{margin:0 0 0.5rem;font-size:1.1rem;color:#333}';
    html += '.meta{display:flex;gap:1.5rem;margin-bottom:0.75rem;font-size:0.85rem;color:#555}';
    html += '.meta strong{color:#222}';
    html += 'table{width:100%;border-collapse:collapse;font-size:0.82rem}';
    html += 'th,td{padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:right}';
    html += 'th{background:#f5f5f5;font-weight:600;color:#444}';
    html += 'th:first-child,td:first-child{text-align:left}';
    html += 'tr.total-row td{border-top:2px solid #333;font-weight:700}';
    html += '.met{color:#2e7d32}.under{color:#c62828}';
    html += '.rates-info{font-size:0.8rem;color:#555;margin-bottom:0.5rem}';
    html += '.rates-info strong{color:#222}';
    html += '@media print{body{margin:0.5rem}h1{font-size:1.2rem}.col{page-break-inside:avoid}}';
    html += '</style></head><body>';
    html += '<h1>Scenario Comparison</h1>';
    html += '<p class="subtitle">Generated ' + new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) + '</p>';
    html += '<div class="cols">';

    active.forEach(sc => {
      const d = sc.data;
      const months = d.payYear ? d.payYear.months : [];
      const scGoal = d.goal || 0;
      let total = 0;

      html += '<div class="col">';
      html += '<h2>' + escapeHtml(sc.name) + '</h2>';

      const rates = d.payRateGroupsData || [];
      if (rates.length > 0) {
        html += '<div class="rates-info">';
        rates.forEach((r, ri) => {
          const rMonths = r.months.map(mi => MONTH_NAMES[mi]).join(', ');
          html += 'Pay Rate ' + (ri + 1) + ': <strong>$' + r.payRate.toFixed(2) + '</strong> (' + rMonths + ')<br>';
        });
        if (months.length > 0) {
          html += 'Bid periods: <strong>' + (months[0].bidPeriods || 1) + '</strong> &middot; ';
          html += 'Percentage: <strong>' + Math.round((months[0].percentage || 1) * 100) + '%</strong>';
        }
        html += '</div>';
      }

      html += '<div class="meta">';
      html += '<span>Goal: <strong>' + formatMoney(scGoal) + '</strong></span>';
      html += '</div>';

      html += '<table><thead><tr><th>Month</th><th>Rate</th><th>Credit Hrs</th><th>Monthly Income</th></tr></thead><tbody>';

      monthOrder.forEach(mi => {
        const m = months.find(x => x.monthIndex === mi);
        if (!m) return;
        const monthIncome = (m.payRate || 0) * (m.credit || 0) * (m.bidPeriods || 1) * (m.percentage || 1);
        total += monthIncome;
        const yr = m.year || '';
        html += '<tr>';
        html += '<td>' + MONTH_NAMES[m.monthIndex] + " '" + String(yr).slice(-2) + '</td>';
        html += '<td>$' + (m.payRate || 0).toFixed(2) + '</td>';
        html += '<td>' + (m.credit || 0).toFixed(2) + '</td>';
        html += '<td>' + formatMoney(monthIncome) + '</td>';
        html += '</tr>';
      });

      const diff = total - scGoal;
      const cls = diff >= 0 ? 'met' : 'under';
      html += '<tr class="total-row"><td>Total</td><td></td><td></td><td>' + formatMoney(total) + '</td></tr>';
      html += '<tr><td>Remaining</td><td></td><td></td><td class="' + cls + '">' + (diff >= 0 ? '+' : '-') + formatMoney(Math.abs(diff)) + '</td></tr>';
      html += '</tbody></table>';
      html += '</div>';
    });

    html += '</div></body></html>';

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.print(); }, 400);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  if (compareScenariosBtn) {
    compareScenariosBtn.addEventListener('click', generateComparisonPDF);
  }

  loadScenarios();
  renderScenarioSlots();
})();
