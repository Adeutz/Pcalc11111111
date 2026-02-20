(function () {
  'use strict';

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const PAY_YEAR_MONTHS = [11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Dec-Nov order

  const goalInput = document.getElementById('goalInput');
  const initializeYearBtn = document.getElementById('initializeYear');
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

  let goal = null;
  let payYear = null;
  let payRateGroupsData = [];

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
    if (payRateGroupsData.length === 0) {
      addPayRateGroup(); // Pay Rate 1 (Dec, Jan, Feb)
      addPayRateGroup(); // Pay Rate 2 (remaining months) – visible right away
    }
    updatePayRatesInMonths();
    renderChart();
    updateTotals();
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
      input.dataset.monthIdx = String(idx);
      input.addEventListener('input', () => {
        const val = Math.max(0, Math.min(MAX_CREDIT_HARD, Number(input.value) || 0));
        payYear.months[idx].credit = val;
        renderChart();
        updateTotals();
      });
      input.addEventListener('change', () => {
        const val = Math.max(0, Math.min(MAX_CREDIT_HARD, Number(input.value) || 0));
        payYear.months[idx].credit = val;
        input.value = val.toFixed(2);
        renderChart();
        updateTotals();
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
  });
  goalInput.addEventListener('blur', () => {
    if (goal != null && !isNaN(goal)) goalInput.value = formatIntegerWithCommas(goal);
  });

  // Default annual income goal to 400k
  goalInput.value = formatIntegerWithCommas(400000);
  goal = 400000;
  if (chartTargetIncomeEl) chartTargetIncomeEl.textContent = formatMoney(400000);
  if (payYear) {
    updateTotals();
    renderChart();
  }

  initializeYearBtn.addEventListener('click', initializePayYear);
  addPayRateGroupBtn.addEventListener('click', addPayRateGroup);

  bidPeriodsInput.addEventListener('input', () => {
    if (payYear) {
      payYear.months.forEach(m => { m.bidPeriods = Number(bidPeriodsInput.value) || 1; });
      renderChart();
      updateTotals();
    }
  });
  percentageInput.addEventListener('input', () => {
    if (payYear) {
      payYear.months.forEach(m => { m.percentage = Number(percentageInput.value) / 100 || 1; });
      renderChart();
      updateTotals();
    }
  });

  // Draggable target line: moving it updates the targeted income goal (mouse + touch)
  if (chartTargetLine) {
    function startTargetLineDrag(e) {
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
})();
