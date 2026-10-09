/**
 * DropWise – Smart Water Management System
 * Core Application Logic & Sensor Simulation Engine (app.js)
 * 
 * Features:
 * - Central state object with differential volume calculations
 * - 2-second realistic sensor simulation ticks using elapsed-time integration
 * - Rolling 30-point Chart.js telemetry visualization without re-instantiation
 * - 3-strike threshold-based leak detection algorithm
 * - Low-water (<=20%) & overflow-risk (>=90%) smart alarms
 * - Dedicated 10-second cooldown guards per alert channel
 * - Rainwater harvesting potential calculator
 * - AI recommendations integration with offline fallback
 * - Full suite of hackathon demo controls and deterministic test scenarios
 */

// Global App Namespace
const DropWiseApp = (() => {
  'use strict';

  // =========================================================================
  // 1. Central State Object
  // =========================================================================
  const state = {
    // Tank & Water Volume
    tankLevel: 72.0,          // Percentage (0% - 100%)
    tankCapacity: 2000,       // Total capacity in Litres
    waterAvailable: 1440.0,   // Litres (tankCapacity * tankLevel / 100)
    usageToday: 185.4,        // Litres consumed today
    flowRate: 3.5,            // Current sensor reading in Litres/minute
    pumpStatus: false,        // boolean: true = ON (filling), false = OFF
    pumpInflowRate: 24.0,     // Litres/minute pumped when pump is ON

    // Leak Detection Parameters
    leakSimulation: false,
    leakDetected: false,
    consecutiveAbnormalReadings: 0,
    requiredAbnormalReadings: 3,  // 3-strike rule
    leakThreshold: 15.0,          // Litres/minute

    // Threshold Alarms
    lowWaterThreshold: 20,    // Tank % <= 20
    overflowThreshold: 90,    // Tank % >= 90

    // Alert Cooldown Guards (timestamps of last fired alert per type)
    alertCooldowns: {
      lowWater: 0,
      overflow: 0,
      leak: 0
    },
    cooldownDurationMs: 10000, // 10-second cooldown per alert type

    // System Control State
    monitoringPaused: false,
    lastTickTime: Date.now(),
    tickIntervalMs: 2000,
    simTimerId: null
  };

  // Historical Alert Log Storage
  let alertLog = [];

  // Chart References
  let liveFlowChart = null;
  let consumptionChart = null;
  let tankHistoryChart = null;

  // Rolling Chart Data Buffers (Max 30 points)
  const MAX_CHART_POINTS = 30;
  const flowChartLabels = [];
  const flowChartData = [];

  // =========================================================================
  // 2. Initialization & DOM Hookup
  // =========================================================================
  function init() {
    initClock();
    initNavigation();
    initCharts();
    initEventListeners();
    initSettingsModal();
    initRainwaterCalculator();
    loadPersistedSettings();
    updateUI();

    // Start Simulation Loop (2-second interval)
    state.lastTickTime = Date.now();
    state.simTimerId = setInterval(tickSimulation, state.tickIntervalMs);

    console.log('DropWise Smart Water System initialized. Simulation active.');
  }

  // =========================================================================
  // 3. Sensor Simulator Engine (2s ticks with differential volume)
  // =========================================================================
  function tickSimulation() {
    if (state.monitoringPaused) return;

    const now = Date.now();
    const elapsedSeconds = Math.max(0.5, (now - state.lastTickTime) / 1000);
    state.lastTickTime = now;

    // A. Compute Current Flow Rate (Outflow)
    let currentOutflow = 0;

    if (state.leakSimulation) {
      // Sustained abnormal flow between 18.0 and 23.5 L/min
      const jitter = (Math.random() - 0.5) * 2;
      currentOutflow = Math.max(16.5, 20.0 + jitter);
    } else {
      // Normal household water flow with gentle variance (1.2 to 6.8 L/min)
      // Occasional brief idle (0.8 L/min) or brief draw (7.5 L/min)
      const base = 3.4;
      const noise = (Math.random() - 0.48) * 3.2;
      currentOutflow = Math.max(0.6, Math.min(10.5, base + noise));
    }

    state.flowRate = Number(currentOutflow.toFixed(1));

    // B. Compute Inflow (from Pump)
    let currentInflow = 0;
    if (state.pumpStatus) {
      currentInflow = state.pumpInflowRate;
    }

    // C. Volume Calculus: Litres = (Rate in L/min) * (elapsedSeconds / 60)
    const outflowVolumeLitres = state.flowRate * (elapsedSeconds / 60);
    const inflowVolumeLitres = currentInflow * (elapsedSeconds / 60);

    // D. Update Daily Usage (only consumption/outflow increases today's usage)
    state.usageToday += outflowVolumeLitres;

    // E. Net Tank Volume Balance
    const netVolumeDelta = inflowVolumeLitres - outflowVolumeLitres;
    let newAvailable = state.waterAvailable + netVolumeDelta;

    // Clamp tank volume between 0 and tankCapacity
    if (newAvailable > state.tankCapacity) {
      newAvailable = state.tankCapacity;
      // Auto pump protection: If tank is overflowing, switch pump off in auto mode
      if (state.tankLevel >= 100 && state.pumpStatus) {
        state.pumpStatus = false;
        showToast('warning', 'Pump Auto-Trip', 'Overhead tank reached 100% capacity. Pump disengaged.');
      }
    } else if (newAvailable < 0) {
      newAvailable = 0;
    }

    state.waterAvailable = Number(newAvailable.toFixed(1));
    state.tankLevel = Number(((state.waterAvailable / state.tankCapacity) * 100).toFixed(1));

    // F. Evaluate Leak Detection Algorithm
    evaluateLeakDetection();

    // G. Evaluate Threshold Alarms (Low Water & Overflow)
    evaluateThresholdAlerts();

    // H. Refresh UI & Live Chart
    updateUI();
    updateLiveFlowChart();
  }

  // =========================================================================
  // 4. Leak Detection Logic (3-Strike Rule & Baseline Threshold)
  // =========================================================================
  function evaluateLeakDetection() {
    const isAbnormal = state.flowRate >= state.leakThreshold;

    if (isAbnormal) {
      state.consecutiveAbnormalReadings++;

      // Trigger Possible Leak alert once condition persists for required consecutive readings
      if (state.consecutiveAbnormalReadings >= state.requiredAbnormalReadings) {
        state.leakDetected = true;
        
        // Check 10s cooldown
        const now = Date.now();
        if (now - state.alertCooldowns.leak >= state.cooldownDurationMs) {
          state.alertCooldowns.leak = now;
          createAlert({
            type: 'leak',
            severity: 'critical',
            title: 'Possible Leak Detected',
            message: `Abnormal continuous flow of ${state.flowRate.toFixed(1)} L/min detected for ${state.consecutiveAbnormalReadings} consecutive sensor cycles (Threshold: ${state.leakThreshold} L/min).`,
            recommendedAction: 'Inspect toilets, garden risers, and shut main isolation valve to verify line integrity.'
          });
        }
      }
    } else {
      // Flow normalized -> Reset consecutive strike counter
      state.consecutiveAbnormalReadings = 0;
      state.leakDetected = false;
    }
  }

  // =========================================================================
  // 5. Low Water & Overflow Threshold Evaluation
  // =========================================================================
  function evaluateThresholdAlerts() {
    const now = Date.now();

    // Low Water Warning (<= lowWaterThreshold %)
    if (state.tankLevel <= state.lowWaterThreshold) {
      if (now - state.alertCooldowns.lowWater >= state.cooldownDurationMs) {
        state.alertCooldowns.lowWater = now;
        createAlert({
          type: 'lowWater',
          severity: 'warning',
          title: 'Low Water Level Warning',
          message: `Overhead tank has dropped to ${state.tankLevel.toFixed(1)}% (${Math.round(state.waterAvailable)} L remaining).`,
          recommendedAction: 'Engage water pump to refill tank or postpone heavy laundry/wash cycles.'
        });
      }
    }

    // Overflow Risk Warning (>= overflowThreshold %)
    if (state.tankLevel >= state.overflowThreshold) {
      if (now - state.alertCooldowns.overflow >= state.cooldownDurationMs) {
        state.alertCooldowns.overflow = now;
        createAlert({
          type: 'overflow',
          severity: 'warning',
          title: 'Overflow Risk Warning',
          message: `Overhead tank capacity is at ${state.tankLevel.toFixed(1)}% (${Math.round(state.waterAvailable)} L). Impending overflow.`,
          recommendedAction: 'Verify pump power and shut off inlet supply before water spills through overflow vents.'
        });
      }
    }
  }

  // =========================================================================
  // 6. Smart Alert Lifecycle & Management
  // =========================================================================
  function createAlert({ type, severity, title, message, recommendedAction }) {
    const alertItem = {
      id: 'alert_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type,
      severity,
      title,
      message,
      recommendedAction,
      timestamp: new Date().toLocaleTimeString(),
      dismissed: false
    };

    alertLog.unshift(alertItem);
    
    // Cap in-memory history to 50 alerts
    if (alertLog.length > 50) {
      alertLog.pop();
    }

    // Trigger Toast Notification
    showToast(severity, title, message);

    // Update UI Alert Feeds
    renderAlerts();
    updateAlertBadges();
  }

  function dismissAlert(alertId) {
    const target = alertLog.find(a => a.id === alertId);
    if (target) {
      target.dismissed = true;
      renderAlerts();
      updateAlertBadges();
    }
  }

  function clearDismissedAlerts() {
    alertLog = alertLog.filter(a => !a.dismissed);
    renderAlerts();
    updateAlertBadges();
    showToast('info', 'Cleaned', 'Dismissed alerts cleared from log.');
  }

  function updateAlertBadges() {
    const activeCount = alertLog.filter(a => !a.dismissed).length;
    const badge = document.getElementById('alertCountBadge');
    if (badge) {
      badge.textContent = activeCount;
      badge.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }

    const allCountElem = document.getElementById('allAlertCount');
    const activeCountElem = document.getElementById('activeAlertCount');
    const dismissedCountElem = document.getElementById('dismissedAlertCount');

    if (allCountElem) allCountElem.textContent = alertLog.length;
    if (activeCountElem) activeCountElem.textContent = activeCount;
    if (dismissedCountElem) dismissedCountElem.textContent = alertLog.length - activeCount;
  }

  function renderAlerts(filter = 'all') {
    // 1. Dashboard Active Alerts Widget (shows up to 3 non-dismissed)
    const dashList = document.getElementById('dashboardAlertsList');
    const dashEmpty = document.getElementById('dashboardEmptyAlerts');
    
    if (dashList) {
      const activeAlerts = alertLog.filter(a => !a.dismissed);
      if (activeAlerts.length === 0) {
        dashList.innerHTML = '';
        if (dashEmpty) dashList.appendChild(dashEmpty);
      } else {
        dashList.innerHTML = activeAlerts.slice(0, 3).map(a => renderAlertCardHtml(a)).join('');
      }
    }

    // 2. Full Alerts View Feed
    const logContainer = document.getElementById('alertLogContainer');
    if (logContainer) {
      let filtered = alertLog;
      if (filter === 'active') filtered = alertLog.filter(a => !a.dismissed);
      else if (filter === 'dismissed') filtered = alertLog.filter(a => a.dismissed);

      if (filtered.length === 0) {
        logContainer.innerHTML = `
          <div class="empty-alerts">
            <i class="fa-solid fa-clipboard-check"></i>
            <p>No alerts matching the selected filter criteria.</p>
          </div>
        `;
      } else {
        logContainer.innerHTML = filtered.map(a => renderAlertCardHtml(a)).join('');
      }
    }

    // Bind dismiss buttons
    document.querySelectorAll('.alert-dismiss-btn').forEach(btn => {
      btn.onclick = (e) => {
        const id = e.currentTarget.dataset.id;
        dismissAlert(id);
      };
    });
  }

  function renderAlertCardHtml(alert) {
    const iconClass = alert.severity === 'critical'
      ? 'fa-triangle-exclamation'
      : alert.severity === 'warning'
      ? 'fa-circle-exclamation'
      : 'fa-circle-info';

    return `
      <div class="alert-item severity-${alert.severity} ${alert.dismissed ? 'dismissed' : ''}" id="${alert.id}">
        <div class="alert-icon-wrap">
          <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="alert-content">
          <div class="alert-title-row">
            <span class="alert-title">${alert.title}</span>
            <span class="alert-timestamp">${alert.timestamp}</span>
          </div>
          <p class="alert-message">${alert.message}</p>
          <div class="alert-action-rec">
            <i class="fa-solid fa-wrench"></i> ${alert.recommendedAction}
          </div>
        </div>
        ${!alert.dismissed ? `
          <button class="alert-dismiss-btn" data-id="${alert.id}" title="Dismiss Alert">
            <i class="fa-solid fa-xmark"></i>
          </button>
        ` : ''}
      </div>
    `;
  }

  // =========================================================================
  // 7. Toast Notification Utility
  // =========================================================================
  function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'critical' ? 'fa-triangle-exclamation' : (type === 'warning' ? 'fa-circle-exclamation' : 'fa-circle-info');

    toast.innerHTML = `
      <i class="fa-solid ${icon} toast-icon"></i>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${message}</div>
      </div>
      <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').onclick = () => toast.remove();
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 5000);
  }

  // =========================================================================
  // 8. Live UI Updates (Cards, Badges, Animated Tank)
  // =========================================================================
  function updateUI() {
    // A. Summary Metrics
    const kpiTankLevel = document.getElementById('kpiTankLevel');
    const kpiTankProgress = document.getElementById('kpiTankProgress');
    const kpiWaterAvailable = document.getElementById('kpiWaterAvailable');
    const kpiTankCapacity = document.getElementById('kpiTankCapacity');
    const kpiUsageToday = document.getElementById('kpiUsageToday');
    const kpiUsageProgress = document.getElementById('kpiUsageProgress');
    const kpiFlowRate = document.getElementById('kpiFlowRate');
    const kpiPumpState = document.getElementById('kpiPumpState');
    const pumpSwitchLabel = document.getElementById('pumpSwitchLabel');
    const pumpToggleBtn = document.getElementById('pumpToggleBtn');
    const pumpInflowText = document.getElementById('pumpInflowText');
    const kpiBufferHours = document.getElementById('kpiBufferHours');

    if (kpiTankLevel) kpiTankLevel.textContent = Math.round(state.tankLevel);
    if (kpiTankProgress) {
      kpiTankProgress.style.width = `${Math.min(100, Math.max(0, state.tankLevel))}%`;
      kpiTankProgress.className = 'progress-fill' + 
        (state.tankLevel <= state.lowWaterThreshold ? ' danger' : (state.tankLevel >= state.overflowThreshold ? ' warning' : ''));
    }

    if (kpiWaterAvailable) kpiWaterAvailable.textContent = Math.round(state.waterAvailable).toLocaleString();
    if (kpiTankCapacity) kpiTankCapacity.textContent = state.tankCapacity.toLocaleString();
    if (kpiUsageToday) kpiUsageToday.textContent = state.usageToday.toFixed(1);
    
    // Usage progress against baseline (450 Litres)
    if (kpiUsageProgress) {
      const usagePct = Math.min(100, (state.usageToday / 450) * 100);
      kpiUsageProgress.style.width = `${usagePct}%`;
    }

    // Estimated buffer hours (at average consumption ~18 L/hr)
    if (kpiBufferHours) {
      const buffer = (state.waterAvailable / 18.75).toFixed(1);
      kpiBufferHours.textContent = `~${buffer} hrs`;
    }

    if (kpiFlowRate) kpiFlowRate.textContent = state.flowRate.toFixed(1);

    // Pump Status styling
    if (kpiPumpState) {
      kpiPumpState.textContent = state.pumpStatus ? 'ON' : 'OFF';
      kpiPumpState.className = 'metric-value pump-state-text' + (state.pumpStatus ? ' on' : '');
    }

    if (pumpToggleBtn) {
      if (state.pumpStatus) {
        pumpToggleBtn.className = 'pump-switch-btn on';
        if (pumpSwitchLabel) pumpSwitchLabel.textContent = 'Pumping (24 L/m)';
      } else {
        pumpToggleBtn.className = 'pump-switch-btn off';
        if (pumpSwitchLabel) pumpSwitchLabel.textContent = 'Click to Start';
      }
    }

    if (pumpInflowText) {
      pumpInflowText.textContent = state.pumpStatus ? 'Inflow: 24.0 L/min' : 'Inflow: 0.0 L/min';
    }

    // Tank Status Badge & Label
    const tankStatusLabel = document.getElementById('tankStatusLabel');
    const tankStatusBadge = document.getElementById('tankStatusBadge');
    if (tankStatusLabel && tankStatusBadge) {
      const ind = tankStatusBadge.querySelector('.status-indicator');
      if (state.tankLevel <= state.lowWaterThreshold) {
        tankStatusLabel.textContent = 'Low Water Level';
        if (ind) ind.className = 'status-indicator danger';
      } else if (state.tankLevel >= state.overflowThreshold) {
        tankStatusLabel.textContent = 'Overflow Risk';
        if (ind) ind.className = 'status-indicator warning';
      } else {
        tankStatusLabel.textContent = 'Normal Capacity';
        if (ind) ind.className = 'status-indicator normal';
      }
    }

    // Flow Status Badge & Icon
    const flowStatusLabel = document.getElementById('flowStatusLabel');
    const flowDot = document.getElementById('flowDot');
    const flowIcon = document.getElementById('flowIcon');
    if (flowStatusLabel && flowDot) {
      if (state.leakDetected) {
        flowStatusLabel.textContent = 'Possible Leak Detected';
        flowDot.className = 'status-indicator danger';
        if (flowIcon) flowIcon.className = 'fa-solid fa-triangle-exclamation';
      } else if (state.flowRate >= state.leakThreshold) {
        flowStatusLabel.textContent = `Abnormal Spike (${state.consecutiveAbnormalReadings}/${state.requiredAbnormalReadings})`;
        flowDot.className = 'status-indicator warning';
        if (flowIcon) flowIcon.className = 'fa-solid fa-gauge-high';
      } else {
        flowStatusLabel.textContent = 'Moderate Household Use';
        flowDot.className = 'status-indicator normal';
        if (flowIcon) flowIcon.className = 'fa-solid fa-gauge';
      }
    }

    // B. ANIMATED WATER TANK COMPONENT
    const tankCylinder = document.getElementById('tankCylinder');
    const waterFill = document.getElementById('waterFill');
    const tankCenterPct = document.getElementById('tankCenterPct');
    const tankCenterLitres = document.getElementById('tankCenterLitres');
    const tankLevelBadge = document.getElementById('tankLevelBadge');
    const tankStatePill = document.getElementById('tankStatePill');
    const tankNetRatePill = document.getElementById('tankNetRatePill');

    if (waterFill) {
      waterFill.style.height = `${Math.min(100, Math.max(0, state.tankLevel))}%`;
    }

    if (tankCenterPct) tankCenterPct.textContent = `${Math.round(state.tankLevel)}%`;
    if (tankCenterLitres) tankCenterLitres.textContent = `${Math.round(state.waterAvailable).toLocaleString()} Litres`;
    if (tankLevelBadge) tankLevelBadge.textContent = `${Math.round(state.tankLevel)}% Full`;

    // Visual classes on tank cylinder
    if (tankCylinder) {
      // Pump stream & bubbles
      if (state.pumpStatus) {
        tankCylinder.classList.add('pumping');
      } else {
        tankCylinder.classList.remove('pumping');
      }

      // Tank warning states
      if (state.tankLevel <= state.lowWaterThreshold) {
        tankCylinder.classList.add('low-water');
        tankCylinder.classList.remove('overflow-water');
        if (tankStatePill) {
          tankStatePill.textContent = 'Status: Low Water Alert';
          tankStatePill.className = 'badge' + ' btn-danger';
        }
      } else if (state.tankLevel >= state.overflowThreshold) {
        tankCylinder.classList.add('overflow-water');
        tankCylinder.classList.remove('low-water');
        if (tankStatePill) {
          tankStatePill.textContent = 'Status: Overflow Risk';
          tankStatePill.className = 'badge' + ' btn-warning';
        }
      } else {
        tankCylinder.classList.remove('low-water', 'overflow-water');
        if (tankStatePill) {
          tankStatePill.textContent = 'Status: Normal';
          tankStatePill.className = 'badge';
        }
      }
    }

    if (tankNetRatePill) {
      const net = (state.pumpStatus ? state.pumpInflowRate : 0) - state.flowRate;
      const sign = net > 0 ? '+' : '';
      tankNetRatePill.textContent = `Net: ${sign}${net.toFixed(1)} L/min`;
    }

    // C. Water Analytics View KPIs
    const analyticsUsageValue = document.getElementById('analyticsUsageValue');
    const analyticsUsageBar = document.getElementById('analyticsUsageBar');
    const analyticsUsageComp = document.getElementById('analyticsUsageComp');
    const analyticsEfficiencyRating = document.getElementById('analyticsEfficiencyRating');
    const analyticsCostValue = document.getElementById('analyticsCostValue');
    const analyticsLeakScore = document.getElementById('analyticsLeakScore');
    const analyticsLeakDetail = document.getElementById('analyticsLeakDetail');

    if (analyticsUsageValue) analyticsUsageValue.textContent = state.usageToday.toFixed(1);
    if (analyticsUsageBar) {
      const pct = Math.min(100, (state.usageToday / 450) * 100);
      analyticsUsageBar.style.width = `${pct}%`;
    }
    if (analyticsUsageComp) {
      const pct = ((state.usageToday / 450) * 100).toFixed(1);
      analyticsUsageComp.textContent = `${pct}% of 450L household baseline`;
    }
    if (analyticsEfficiencyRating) {
      if (state.leakDetected || state.usageToday > 500) {
        analyticsEfficiencyRating.innerHTML = 'D <small>Elevated</small>';
        analyticsEfficiencyRating.className = 'stat-number text-danger';
      } else if (state.usageToday > 380) {
        analyticsEfficiencyRating.innerHTML = 'B <small>Moderate</small>';
        analyticsEfficiencyRating.className = 'stat-number text-warning';
      } else {
        analyticsEfficiencyRating.innerHTML = 'A <small>Optimal</small>';
        analyticsEfficiencyRating.className = 'stat-number text-success';
      }
    }
    if (analyticsCostValue) {
      // Estimated at $0.0025 per litre
      const cost = (state.usageToday * 0.0025).toFixed(2);
      analyticsCostValue.innerHTML = `$${cost} <small>USD</small>`;
    }
    if (analyticsLeakScore) {
      if (state.leakDetected) {
        analyticsLeakScore.innerHTML = 'High <small>(Critical)</small>';
        analyticsLeakScore.className = 'stat-number text-danger';
        if (analyticsLeakDetail) analyticsLeakDetail.textContent = 'Continuous abnormal flow exceeds 15 L/min.';
      } else if (state.consecutiveAbnormalReadings > 0) {
        analyticsLeakScore.innerHTML = `Warning <small>(${state.consecutiveAbnormalReadings}/${state.requiredAbnormalReadings})</small>`;
        analyticsLeakScore.className = 'stat-number text-warning';
        if (analyticsLeakDetail) analyticsLeakDetail.textContent = 'Transient spike being evaluated by 3-strike filter.';
      } else {
        analyticsLeakScore.innerHTML = 'Low <small>(0/3)</small>';
        analyticsLeakScore.className = 'stat-number text-success';
        if (analyticsLeakDetail) analyticsLeakDetail.textContent = 'No sustained abnormal continuous flow.';
      }
    }

    // D. Telemetry Payload Snapshot inside AI Advisor View
    const aiPayloadTank = document.getElementById('aiPayloadTank');
    const aiPayloadWater = document.getElementById('aiPayloadWater');
    const aiPayloadUsage = document.getElementById('aiPayloadUsage');
    const aiPayloadFlow = document.getElementById('aiPayloadFlow');
    const aiPayloadPump = document.getElementById('aiPayloadPump');
    const aiPayloadLeak = document.getElementById('aiPayloadLeak');

    if (aiPayloadTank) aiPayloadTank.textContent = `${state.tankLevel.toFixed(1)}%`;
    if (aiPayloadWater) aiPayloadWater.textContent = `${Math.round(state.waterAvailable)} L`;
    if (aiPayloadUsage) aiPayloadUsage.textContent = `${state.usageToday.toFixed(1)} L`;
    if (aiPayloadFlow) aiPayloadFlow.textContent = `${state.flowRate.toFixed(1)} L/min`;
    if (aiPayloadPump) aiPayloadPump.textContent = state.pumpStatus ? 'ON (Filling)' : 'OFF';
    if (aiPayloadLeak) {
      aiPayloadLeak.textContent = state.leakDetected ? 'Leak Triggered' : 'Nominal';
      aiPayloadLeak.className = state.leakDetected ? 'text-danger' : 'text-success';
    }
  }

  // =========================================================================
  // 9. Chart.js Telemetry Visualizations
  // =========================================================================
  function initCharts() {
    // A. LIVE FLOW RATE CHART (Rolling 30 Readings)
    const liveFlowCanvas = document.getElementById('liveFlowChart');
    if (liveFlowCanvas && typeof Chart !== 'undefined') {
      const ctx = liveFlowCanvas.getContext('2d');

      // Pre-seed buffer with 20 initial readings for aesthetic appearance
      const now = new Date();
      for (let i = 20; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 2000);
        flowChartLabels.push(time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        flowChartData.push(Number((3.2 + (Math.random() - 0.5) * 1.5).toFixed(1)));
      }

      // Create gradient fill
      const gradient = ctx.createLinearGradient(0, 0, 0, 260);
      gradient.addColorStop(0, 'rgba(0, 229, 255, 0.45)');
      gradient.addColorStop(0.6, 'rgba(2, 132, 199, 0.15)');
      gradient.addColorStop(1, 'rgba(7, 13, 24, 0.0)');

      liveFlowChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: flowChartLabels,
          datasets: [
            {
              label: 'Water Flow Rate (L/min)',
              data: flowChartData,
              borderColor: '#00e5ff',
              borderWidth: 2.5,
              backgroundColor: gradient,
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              pointHoverRadius: 6,
              pointBackgroundColor: '#00e5ff'
            },
            {
              label: 'Leak Threshold Baseline',
              data: flowChartLabels.map(() => state.leakThreshold),
              borderColor: 'rgba(239, 68, 68, 0.75)',
              borderWidth: 1.5,
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false, // Disabled for high-performance 2s updates
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#94a3b8',
                font: { family: 'Outfit', size: 12 },
                boxWidth: 12
              }
            },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#fff',
              bodyColor: '#38bdf8',
              borderColor: 'rgba(56, 189, 248, 0.3)',
              borderWidth: 1,
              padding: 10
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#64748b', maxTicksLimit: 8, font: { family: 'JetBrains Mono', size: 10 } }
            },
            y: {
              min: 0,
              max: 28,
              grid: { color: 'rgba(255, 255, 255, 0.06)' },
              ticks: {
                color: '#94a3b8',
                font: { family: 'JetBrains Mono', size: 11 },
                callback: (val) => `${val} L/m`
              }
            }
          }
        }
      });
    }

    // B. HOURLY CONSUMPTION BREAKDOWN CHART (Water Analytics View)
    const consumptionCanvas = document.getElementById('consumptionChart');
    if (consumptionCanvas && typeof Chart !== 'undefined') {
      const hours = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      const actualUsage = [6.2, 3.1, 2.5, 28.4, 42.1, 26.5, 34.2, 19.8, 22.7, 0, 0, 0];
      const baselineUsage = [8, 5, 4, 30, 45, 30, 35, 25, 28, 40, 35, 15];

      consumptionChart = new Chart(consumptionCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: hours,
          datasets: [
            {
              label: 'Actual Usage (L)',
              data: actualUsage,
              backgroundColor: 'rgba(0, 229, 255, 0.65)',
              borderColor: '#00e5ff',
              borderWidth: 1,
              borderRadius: 6
            },
            {
              label: 'Expected Baseline (L)',
              data: baselineUsage,
              backgroundColor: 'rgba(148, 163, 184, 0.2)',
              borderColor: 'rgba(148, 163, 184, 0.4)',
              borderWidth: 1,
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#94a3b8', font: { family: 'Outfit', size: 12 } }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
            y: { grid: { color: 'rgba(255, 255, 255, 0.06)' }, ticks: { color: '#94a3b8' } }
          }
        }
      });
    }

    // C. TANK LEVEL HISTORICAL TREND CHART
    const tankHistoryCanvas = document.getElementById('tankHistoryChart');
    if (tankHistoryCanvas && typeof Chart !== 'undefined') {
      const times = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', 'Now'];
      const levels = [85, 62, 54, 90, 78, 68, 72];

      tankHistoryChart = new Chart(tankHistoryCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: times,
          datasets: [{
            label: 'Tank Level (%)',
            data: levels,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: '#00e5ff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
            y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.06)' }, ticks: { color: '#94a3b8', callback: v => `${v}%` } }
          }
        }
      });
    }
  }

  function updateLiveFlowChart() {
    if (!liveFlowChart) return;

    const timeLabel = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    flowChartLabels.push(timeLabel);
    flowChartData.push(state.flowRate);

    // Keep rolling window of MAX_CHART_POINTS (30)
    if (flowChartLabels.length > MAX_CHART_POINTS) {
      flowChartLabels.shift();
      flowChartData.shift();
    }

    // Keep threshold baseline matching label length
    liveFlowChart.data.datasets[1].data = flowChartLabels.map(() => state.leakThreshold);

    // Chart Footnote Stats
    const chartCurrentFlow = document.getElementById('chartCurrentFlow');
    const chartPeakFlow = document.getElementById('chartPeakFlow');
    const chartAvgFlow = document.getElementById('chartAvgFlow');

    if (chartCurrentFlow) chartCurrentFlow.textContent = `${state.flowRate.toFixed(1)} L/min`;
    if (chartPeakFlow) {
      const peak = Math.max(...flowChartData);
      chartPeakFlow.textContent = `${peak.toFixed(1)} L/min`;
    }
    if (chartAvgFlow) {
      const avg = flowChartData.reduce((a, b) => a + b, 0) / flowChartData.length;
      chartAvgFlow.textContent = `${avg.toFixed(1)} L/min`;
    }

    // Update chart without re-creating instance
    liveFlowChart.update('none');
  }

  // =========================================================================
  // 10. Demo Simulation Controls & Deterministic Scenarios
  // =========================================================================
  function simulateLeak() {
    state.leakSimulation = true;
    showToast('warning', 'Leak Simulation Active', 'Spiking flow to abnormal range (> 18 L/min). Detection will trigger after 3 consecutive ticks.');
    updateSimStatusLabels();
  }

  function stopLeak() {
    state.leakSimulation = false;
    state.consecutiveAbnormalReadings = 0;
    state.leakDetected = false;
    showToast('success', 'Leak Simulation Stopped', 'Restoring nominal domestic flow pattern.');
    updateSimStatusLabels();
  }

  function togglePump() {
    state.pumpStatus = !state.pumpStatus;
    if (state.pumpStatus) {
      showToast('info', 'Water Pump Started', 'Pump engaged at 24.0 L/min inlet flow rate.');
    } else {
      showToast('info', 'Water Pump Stopped', 'Inlet flow halted.');
    }
    updateUI();
  }

  function toggleMonitoring() {
    state.monitoringPaused = !state.monitoringPaused;
    const btnText = document.getElementById('btnMonitoringText');
    const btnIcon = document.getElementById('btnMonitoringIcon');
    const headerIcon = document.getElementById('headerPauseIcon');

    if (state.monitoringPaused) {
      if (btnText) btnText.textContent = 'Resume Monitoring';
      if (btnIcon) btnIcon.className = 'fa-solid fa-play';
      if (headerIcon) headerIcon.className = 'fa-solid fa-play';
      showToast('warning', 'Monitoring Paused', 'Sensor simulation clock frozen.');
    } else {
      state.lastTickTime = Date.now();
      if (btnText) btnText.textContent = 'Pause Monitoring';
      if (btnIcon) btnIcon.className = 'fa-solid fa-pause';
      if (headerIcon) headerIcon.className = 'fa-solid fa-pause';
      showToast('success', 'Monitoring Resumed', 'Sensor simulation active.');
    }
    updateSimStatusLabels();
  }

  function resetSimulation() {
    state.tankLevel = 72.0;
    state.waterAvailable = 1440.0;
    state.usageToday = 185.4;
    state.flowRate = 3.5;
    state.pumpStatus = false;
    state.leakSimulation = false;
    state.leakDetected = false;
    state.consecutiveAbnormalReadings = 0;
    state.monitoringPaused = false;
    
    // Reset cooldowns
    state.alertCooldowns = { lowWater: 0, overflow: 0, leak: 0 };

    // Reset chart buffers
    flowChartLabels.length = 0;
    flowChartData.length = 0;
    const now = new Date();
    for (let i = 20; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 2000);
      flowChartLabels.push(time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      flowChartData.push(Number((3.2 + (Math.random() - 0.5) * 1.5).toFixed(1)));
    }

    if (liveFlowChart) {
      liveFlowChart.update();
    }

    // Clear active alerts
    alertLog = [];
    renderAlerts();
    updateAlertBadges();
    updateSimStatusLabels();
    updateUI();

    showToast('success', 'Simulation Reset', 'Restored 72% tank level, nominal flow, and cleared alert history.');
  }

  // Deterministic Demo Scenarios for reliable evaluation
  function runDeterministicScenario(scenario) {
    switch (scenario) {
      case 'normal':
        state.leakSimulation = false;
        state.pumpStatus = false;
        state.tankLevel = 70.0;
        state.waterAvailable = 1400.0;
        state.flowRate = 3.2;
        state.consecutiveAbnormalReadings = 0;
        state.leakDetected = false;
        showToast('info', 'Scenario: Normal', 'Baseline 70% tank, 3.2 L/min flow.');
        break;

      case 'lowWater':
        state.leakSimulation = false;
        state.pumpStatus = false;
        state.tankLevel = 18.0;
        state.waterAvailable = 360.0;
        state.alertCooldowns.lowWater = 0; // Reset cooldown so alarm fires immediately
        showToast('warning', 'Scenario: Low Water', 'Set tank to 18% (Threshold: 20%). Alarm will evaluate.');
        break;

      case 'overflow':
        state.leakSimulation = false;
        state.pumpStatus = true;
        state.tankLevel = 92.0;
        state.waterAvailable = 1840.0;
        state.alertCooldowns.overflow = 0; // Reset cooldown
        showToast('warning', 'Scenario: Overflow Risk', 'Set tank to 92% with Pump ON. Alarm will evaluate.');
        break;

      case 'leak':
        state.leakSimulation = true;
        state.flowRate = 21.0;
        state.alertCooldowns.leak = 0;
        showToast('danger', 'Scenario: High Leak', 'Abnormal flow active. 3 consecutive readings will trigger Possible Leak.');
        break;
    }
    updateUI();
  }

  function updateSimStatusLabels() {
    const statusText = document.getElementById('sidebarSimStatus');
    const simBadge = document.getElementById('simBadge');
    
    if (state.monitoringPaused) {
      if (statusText) statusText.textContent = 'Simulator Paused';
      if (simBadge) simBadge.innerHTML = '<span class="badge-dot" style="background:#f59e0b;"></span><span class="badge-text">Paused</span>';
    } else if (state.leakSimulation) {
      if (statusText) statusText.textContent = 'Simulating Leak!';
      if (simBadge) simBadge.innerHTML = '<span class="badge-dot" style="background:#ef4444;"></span><span class="badge-text">Leak Simulation Mode</span>';
    } else {
      if (statusText) statusText.textContent = 'Simulating Sensors';
      if (simBadge) simBadge.innerHTML = '<span class="badge-dot"></span><span class="badge-text">Simulation Mode (2s ticks)</span>';
    }
  }

  // =========================================================================
  // 11. Rainwater Harvesting Potential Calculator
  // =========================================================================
  function initRainwaterCalculator() {
    const form = document.getElementById('rainwaterForm');
    const areaInput = document.getElementById('inputRoofArea');
    const rainInput = document.getElementById('inputRainfall');
    const effInput = document.getElementById('inputEfficiency');
    const effDisplay = document.getElementById('efficiencyDisplay');

    if (effInput && effDisplay) {
      effInput.oninput = () => {
        const val = Number(effInput.value);
        effDisplay.textContent = `${val.toFixed(2)} (${Math.round(val * 100)}%)`;
      };
    }

    // Presets
    document.getElementById('presetSmallHome')?.addEventListener('click', () => { if (areaInput) areaInput.value = 60; calculateRainwater(); });
    document.getElementById('presetMediumHome')?.addEventListener('click', () => { if (areaInput) areaInput.value = 120; calculateRainwater(); });
    document.getElementById('presetHostel')?.addEventListener('click', () => { if (areaInput) areaInput.value = 300; calculateRainwater(); });
    document.getElementById('presetLightRain')?.addEventListener('click', () => { if (rainInput) rainInput.value = 15; calculateRainwater(); });
    document.getElementById('presetMonsoon')?.addEventListener('click', () => { if (rainInput) rainInput.value = 50; calculateRainwater(); });

    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        calculateRainwater();
      };
    }
  }

  function calculateRainwater() {
    const area = parseFloat(document.getElementById('inputRoofArea')?.value || 0);
    const rain = parseFloat(document.getElementById('inputRainfall')?.value || 0);
    const eff = parseFloat(document.getElementById('inputEfficiency')?.value || 0.8);

    // Validation
    if (isNaN(area) || area <= 0 || isNaN(rain) || rain <= 0) {
      showToast('warning', 'Validation Error', 'Please enter positive numeric values for Roof Area and Rainfall.');
      return;
    }

    // Formula: Harvest (Litres) = Area (m²) * Rainfall (mm) * Efficiency
    const harvestLitres = Math.round(area * rain * eff);
    const cubicMeters = (harvestLitres / 1000).toFixed(1);

    // Equivalents
    const tanksFilled = (harvestLitres / state.tankCapacity).toFixed(1);
    const daysSupply = (harvestLitres / 450).toFixed(1);
    const moneySaved = (harvestLitres * 0.0025).toFixed(2);

    // Update Output Elements
    const resultLitres = document.getElementById('resultLitres');
    const resultCubicMeters = document.getElementById('resultCubicMeters');
    const resultTanksFilled = document.getElementById('resultTanksFilled');
    const resultDaysSupply = document.getElementById('resultDaysSupply');
    const resultMoneySaved = document.getElementById('resultMoneySaved');

    if (resultLitres) resultLitres.textContent = harvestLitres.toLocaleString();
    if (resultCubicMeters) resultCubicMeters.textContent = `≈ ${cubicMeters} m³ (Cubic Metres)`;
    if (resultTanksFilled) resultTanksFilled.textContent = `${tanksFilled}×`;
    if (resultDaysSupply) resultDaysSupply.textContent = `~${daysSupply} Days`;
    if (resultMoneySaved) resultMoneySaved.textContent = `$${moneySaved}`;

    showToast('success', 'Calculation Complete', `Estimated harvest potential: ${harvestLitres.toLocaleString()} Litres.`);
  }

  // =========================================================================
  // 12. AI Water Advisor & Gemini Integration
  // =========================================================================
  async function generateAiRecommendations() {
    const loadingState = document.getElementById('aiLoadingState');
    const recGrid = document.getElementById('recommendationsGrid');
    const btnGenerate = document.getElementById('btnGenerateAiTips');
    const sourceBadge = document.getElementById('aiSourceBadge');
    const sourceText = document.getElementById('aiSourceText');
    const engineBadge = document.getElementById('aiEngineStatusBadge');

    if (loadingState) loadingState.classList.remove('hidden');
    if (recGrid) recGrid.style.opacity = '0.3';
    if (btnGenerate) btnGenerate.disabled = true;

    // Telemetry vector snapshot
    const telemetrySnapshot = {
      tankLevel: state.tankLevel,
      waterAvailable: state.waterAvailable,
      dailyConsumption: state.usageToday,
      currentFlowRate: state.flowRate,
      pumpStatus: state.pumpStatus,
      possibleLeakStatus: state.leakDetected
    };

    try {
      const result = await AIAdvisor.generateRecommendations(telemetrySnapshot);

      if (sourceText) sourceText.textContent = result.source;
      if (engineBadge) {
        if (result.isAiGenerated) {
          engineBadge.innerHTML = '<span class="status-dot" style="background:#a855f7;"></span> Gemini 1.5 Active';
        } else {
          engineBadge.innerHTML = '<span class="status-dot"></span> Offline Heuristic Active';
        }
      }

      // Populate 3 cards
      renderRecommendationCards(result.tips);

      if (result.isAiGenerated) {
        showToast('success', 'Gemini Recommendations Ready', 'Synthesized 3 custom conservation tips.');
      } else {
        showToast('info', 'Offline Tips Loaded', result.reason || 'Utilized deterministic expert rules.');
      }
    } catch (err) {
      console.error('Error generating AI tips:', err);
      const fallback = AIAdvisor.getOfflineRecommendations(telemetrySnapshot);
      renderRecommendationCards(fallback.tips);
      showToast('warning', 'Offline Fallback', 'Network issue. Loaded offline recommendations.');
    } finally {
      if (loadingState) loadingState.classList.add('hidden');
      if (recGrid) recGrid.style.opacity = '1';
      if (btnGenerate) btnGenerate.disabled = false;
    }
  }

  function renderRecommendationCards(tips) {
    if (!Array.isArray(tips) || tips.length < 3) return;

    for (let i = 0; i < 3; i++) {
      const tip = tips[i];
      const idx = i + 1;
      const cat = document.getElementById(`recCat${idx}`);
      const title = document.getElementById(`recTitle${idx}`);
      const desc = document.getElementById(`recDesc${idx}`);
      const badge = document.getElementById(`recBadge${idx}`);

      if (cat) cat.textContent = tip.category;
      if (title) title.textContent = tip.title;
      if (desc) desc.textContent = tip.description;
      if (badge) badge.textContent = tip.badge;
    }
  }

  // =========================================================================
  // 13. Settings & Gemini API Key Modal
  // =========================================================================
  function initSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const openBtn = document.getElementById('openSettingsModalBtn');
    const openBtnAi = document.getElementById('btnOpenAiSettingsModal');
    const closeBtn = document.getElementById('closeSettingsModalBtn');
    const saveBtn = document.getElementById('btnSaveApiKey');
    const clearBtn = document.getElementById('btnClearApiKey');
    const keyInput = document.getElementById('geminiApiKeyInput');
    const togglePw = document.getElementById('toggleApiKeyVisibility');
    const eyeIcon = document.getElementById('eyeIcon');

    function openModal() {
      if (keyInput) keyInput.value = AIAdvisor.getApiKey();
      updateKeyStatusDisplay();
      if (modal) modal.classList.remove('hidden');
    }

    function closeModal() {
      if (modal) modal.classList.add('hidden');
    }

    if (openBtn) openBtn.onclick = openModal;
    if (openBtnAi) openBtnAi.onclick = openModal;
    if (closeBtn) closeBtn.onclick = closeModal;

    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) closeModal();
      };
    }

    if (togglePw && keyInput && eyeIcon) {
      togglePw.onclick = () => {
        const isPw = keyInput.type === 'password';
        keyInput.type = isPw ? 'text' : 'password';
        eyeIcon.className = isPw ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
      };
    }

    if (saveBtn && keyInput) {
      saveBtn.onclick = () => {
        const key = keyInput.value.trim();
        AIAdvisor.setApiKey(key);
        updateKeyStatusDisplay();
        closeModal();
        showToast('success', 'Settings Saved', key ? 'Gemini API key configured in localStorage.' : 'API key cleared. Offline engine active.');
      };
    }

    if (clearBtn && keyInput) {
      clearBtn.onclick = () => {
        keyInput.value = '';
        AIAdvisor.removeApiKey();
        updateKeyStatusDisplay();
        showToast('info', 'Key Removed', 'Offline expert fallback active.');
      };
    }
  }

  function updateKeyStatusDisplay() {
    const display = document.getElementById('keyStatusDisplay');
    const text = document.getElementById('keyStatusText');
    const hasKey = AIAdvisor.hasApiKey();

    if (text && display) {
      if (hasKey) {
        text.textContent = 'API key saved in private localStorage (Ready for live AI)';
        display.style.color = '#34d399';
      } else {
        text.textContent = 'No API key saved (Offline expert fallback active)';
        display.style.color = '#94a3b8';
      }
    }
  }

  // =========================================================================
  // 14. Navigation, View Switching, and Live Clock
  // =========================================================================
  function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('pageTitle');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileCloseBtn = document.getElementById('mobileCloseBtn');
    const sidebar = document.getElementById('sidebar');

    const viewTitles = {
      dashboard: 'Monitoring Center',
      analytics: 'Water Analytics & Trends',
      alerts: 'Smart Alerts & Logs',
      advisor: 'AI Water Advisor',
      rainwater: 'Rainwater Harvesting Calculator',
      about: 'About DropWise System'
    };

    function switchView(viewName) {
      navItems.forEach(item => {
        if (item.dataset.view === viewName) item.classList.add('active');
        else item.classList.remove('active');
      });

      viewSections.forEach(section => {
        if (section.id === `view-${viewName}`) section.classList.add('active');
        else section.classList.remove('active');
      });

      if (pageTitle && viewTitles[viewName]) {
        pageTitle.textContent = viewTitles[viewName];
      }

      if (sidebar) sidebar.classList.remove('mobile-open');

      // Trigger chart resize if navigating to analytics
      if (viewName === 'analytics' && consumptionChart && tankHistoryChart) {
        consumptionChart.resize();
        tankHistoryChart.resize();
      }
    }

    navItems.forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        const targetView = item.dataset.view;
        switchView(targetView);
      };
    });

    // Hash change routing
    window.onhashchange = () => {
      const hash = window.location.hash.replace('#', '');
      if (viewTitles[hash]) switchView(hash);
    };

    // Mobile sidebar toggle
    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.onclick = () => sidebar.classList.add('mobile-open');
    }
    if (mobileCloseBtn && sidebar) {
      mobileCloseBtn.onclick = () => sidebar.classList.remove('mobile-open');
    }

    // View All Alerts link inside Dashboard
    document.getElementById('viewAllAlertsLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('alerts');
    });
  }

  function initClock() {
    const clockElem = document.getElementById('liveClock');
    const dateElem = document.getElementById('liveDate');

    function tick() {
      const now = new Date();
      if (clockElem) {
        clockElem.textContent = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      if (dateElem) {
        dateElem.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  // =========================================================================
  // 15. Event Listeners & Config Sliders
  // =========================================================================
  function initEventListeners() {
    // Simulator Toolbar
    document.getElementById('btnSimulateLeak')?.addEventListener('click', simulateLeak);
    document.getElementById('btnStopLeak')?.addEventListener('click', stopLeak);
    document.getElementById('btnToggleMonitoring')?.addEventListener('click', toggleMonitoring);
    document.getElementById('headerPauseToggle')?.addEventListener('click', toggleMonitoring);
    document.getElementById('btnResetSimulation')?.addEventListener('click', resetSimulation);
    document.getElementById('pumpToggleBtn')?.addEventListener('click', togglePump);

    // Sidebar Compact Quick Controls
    document.getElementById('quickLeakBtn')?.addEventListener('click', simulateLeak);
    document.getElementById('quickPumpBtn')?.addEventListener('click', togglePump);
    document.getElementById('quickResetBtn')?.addEventListener('click', resetSimulation);

    // Deterministic Hackathon Demo Scenarios
    document.getElementById('demoNormalBtn')?.addEventListener('click', () => runDeterministicScenario('normal'));
    document.getElementById('demoLowWaterBtn')?.addEventListener('click', () => runDeterministicScenario('lowWater'));
    document.getElementById('demoOverflowBtn')?.addEventListener('click', () => runDeterministicScenario('overflow'));
    document.getElementById('demoLeakBtn')?.addEventListener('click', () => runDeterministicScenario('leak'));

    // AI Advisor Generator
    document.getElementById('btnGenerateAiTips')?.addEventListener('click', generateAiRecommendations);

    // Alert Clear & Filter Tabs
    document.getElementById('btnClearResolvedAlerts')?.addEventListener('click', clearDismissedAlerts);
    
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        renderAlerts(e.currentTarget.dataset.filter);
      });
    });

    // Alert Configuration Sliders
    const cfgLowWater = document.getElementById('cfgLowWater');
    const cfgLowWaterVal = document.getElementById('cfgLowWaterVal');
    const cfgOverflow = document.getElementById('cfgOverflow');
    const cfgOverflowVal = document.getElementById('cfgOverflowVal');
    const cfgLeakFlow = document.getElementById('cfgLeakFlow');
    const cfgLeakFlowVal = document.getElementById('cfgLeakFlowVal');
    const cfgConsecutive = document.getElementById('cfgConsecutive');
    const cfgConsecutiveVal = document.getElementById('cfgConsecutiveVal');

    if (cfgLowWater && cfgLowWaterVal) {
      cfgLowWater.oninput = () => {
        state.lowWaterThreshold = Number(cfgLowWater.value);
        cfgLowWaterVal.textContent = `${state.lowWaterThreshold}%`;
      };
    }

    if (cfgOverflow && cfgOverflowVal) {
      cfgOverflow.oninput = () => {
        state.overflowThreshold = Number(cfgOverflow.value);
        cfgOverflowVal.textContent = `${state.overflowThreshold}%`;
      };
    }

    if (cfgLeakFlow && cfgLeakFlowVal) {
      cfgLeakFlow.oninput = () => {
        state.leakThreshold = Number(cfgLeakFlow.value);
        cfgLeakFlowVal.textContent = `${state.leakThreshold.toFixed(1)} L/m`;
        const kpiDisplay = document.getElementById('kpiLeakThresholdDisplay');
        if (kpiDisplay) kpiDisplay.textContent = `${state.leakThreshold.toFixed(1)} L/min`;
        if (liveFlowChart) {
          liveFlowChart.data.datasets[1].data = flowChartLabels.map(() => state.leakThreshold);
          liveFlowChart.update('none');
        }
      };
    }

    if (cfgConsecutive && cfgConsecutiveVal) {
      cfgConsecutive.oninput = () => {
        state.requiredAbnormalReadings = Number(cfgConsecutive.value);
        cfgConsecutiveVal.textContent = `${state.requiredAbnormalReadings} ticks`;
      };
    }

    document.getElementById('btnResetThresholds')?.addEventListener('click', () => {
      state.lowWaterThreshold = 20;
      state.overflowThreshold = 90;
      state.leakThreshold = 15.0;
      state.requiredAbnormalReadings = 3;

      if (cfgLowWater) cfgLowWater.value = 20;
      if (cfgLowWaterVal) cfgLowWaterVal.textContent = '20%';
      if (cfgOverflow) cfgOverflow.value = 90;
      if (cfgOverflowVal) cfgOverflowVal.textContent = '90%';
      if (cfgLeakFlow) cfgLeakFlow.value = 15;
      if (cfgLeakFlowVal) cfgLeakFlowVal.textContent = '15.0 L/m';
      if (cfgConsecutive) cfgConsecutive.value = 3;
      if (cfgConsecutiveVal) cfgConsecutiveVal.textContent = '3 ticks';

      const kpiDisplay = document.getElementById('kpiLeakThresholdDisplay');
      if (kpiDisplay) kpiDisplay.textContent = '15.0 L/min';

      if (liveFlowChart) {
        liveFlowChart.data.datasets[1].data = flowChartLabels.map(() => state.leakThreshold);
        liveFlowChart.update('none');
      }

      showToast('info', 'Thresholds Restored', 'Reset alarm triggers to default specifications.');
    });
  }

  function loadPersistedSettings() {
    updateKeyStatusDisplay();
  }

  // Self-Start on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API exposed for browser debugging / test automation
  return {
    getState: () => ({ ...state }),
    simulateLeak,
    stopLeak,
    togglePump,
    resetSimulation,
    toggleMonitoring,
    runDeterministicScenario,
    calculateRainwater,
    generateAiRecommendations
  };
})();
