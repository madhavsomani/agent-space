// ===== HEALTH ALERTS BANNER =====
// Dismissed alerts (keyed by alert id, expires after 30min)
const _dismissedAlerts = {};
function dismissAlert(id) {
  _dismissedAlerts[id] = Date.now() + 30 * 60000;
  refreshAlerts();
}

// Wake a sleeping cron agent from the alert banner
async function wakeAgentFromAlert(cronJobId, agentName) {
  try {
    const _wakeHeaders = { 'Content-Type': 'application/json' };
    if (_authToken) _wakeHeaders['X-API-Key'] = _authToken;
    const r = await fetch(API + '/wake-agent', { method: 'POST', headers: _wakeHeaders, body: JSON.stringify({ cronJobId }) });
    const d = await r.json();
    if (d.ok) {
      showToast('⚡', `Woke ${agentName}`, 'var(--green)');
    } else {
      showToast('❌', `Failed to wake ${agentName}: ${d.error || 'unknown'}`, 'var(--red)');
    }
  } catch (e) { showToast('❌', `Wake failed: ${e.message}`, 'var(--red)'); }
}

// Performance data cache for alert checks
let _perfAlertData = null;
async function fetchPerfForAlerts() {
  try {
    const r = await fetchWithTimeout(API + '/performance', {}, 10000);
    _perfAlertData = await r.json();
  } catch { _perfAlertData = null; }
}
// Perf data for alerts refreshed in consolidated 5s poll (every 12th tick = 60s)
fetchPerfForAlerts();

function refreshAlerts() {
  const now = Date.now();
  // Clean expired dismissals
  for (const k in _dismissedAlerts) { if (_dismissedAlerts[k] < now) delete _dismissedAlerts[k]; }

  const alerts = []; // { id, icon, text, color, severity, action? }

  // CPU alert
  const cpuEl = document.getElementById('ss-cpu');
  if (cpuEl) {
    const cpuPct = parseFloat(cpuEl.textContent);
    if (cpuPct > 80) alerts.push({ id:'cpu-crit', icon:'🔥', text:`CPU ${cpuPct}%`, color:'var(--red)', severity:'critical' });
    else if (cpuPct > 60) alerts.push({ id:'cpu-warn', icon:'⚠️', text:`CPU ${cpuPct}%`, color:'var(--orange)', severity:'warning' });
  }

  // Disk alert
  const diskEl = document.getElementById('ss-disk');
  if (diskEl) {
    const diskPct = parseInt(diskEl.textContent);
    if (diskPct > 90) alerts.push({ id:'disk-crit', icon:'💾', text:`Disk ${diskPct}%`, color:'var(--red)', severity:'critical' });
    else if (diskPct > 80) alerts.push({ id:'disk-warn', icon:'💾', text:`Disk ${diskPct}%`, color:'var(--orange)', severity:'warning' });
  }

  // Service alerts
  if (_cachedSystem && _cachedSystem.services) {
    _cachedSystem.services.forEach(s => {
      if (s.status !== 'running') alerts.push({ id:`svc-${s.name}`, icon:'🔌', text:`${s.name} down`, color:'var(--red)', severity:'critical' });
    });
  }

  // Agent alerts: sleeping too long + failed cron runs
  if (agentData.length) {
    agentData.forEach(a => {
      // Sleeping agents with cron jobs
      if (a.status === 'sleeping' && a.cronJobId) {
        if (a.ageMin > 360) {
          alerts.push({ id:`sleep-${a.name}`, icon:'😴', text:`${a.name} sleeping ${Math.round(a.ageMin/60)}h`, color:'var(--red)', severity:'critical',
            action: { label:'Wake', fn: () => wakeAgentFromAlert(a.cronJobId, a.name) } });
        } else if (a.ageMin > 120) {
          alerts.push({ id:`sleep-${a.name}`, icon:'💤', text:`${a.name} sleeping ${Math.round(a.ageMin/60)}h`, color:'var(--orange)', severity:'warning',
            action: { label:'Wake', fn: () => wakeAgentFromAlert(a.cronJobId, a.name) } });
        }
      }

      // Check cron status for errors
      if (a.cronStatus && (a.cronStatus === 'error' || a.cronStatus === 'fail')) {
        alerts.push({ id:`cron-err-${a.name}`, icon:'❌', text:`${a.name} last run failed`, color:'var(--red)', severity:'critical',
          action: a.cronJobId ? { label:'Retry', fn: () => wakeAgentFromAlert(a.cronJobId, a.name) } : null });
      }
    });
  }

  // Performance alerts: agents with <50% success rate
  if (_perfAlertData && _perfAlertData.agents) {
    _perfAlertData.agents.forEach(pa => {
      if (pa.total >= 3 && pa.successRate < 50) {
        alerts.push({ id:`perf-${pa.name}`, icon:'📉', text:`${pa.name} ${pa.successRate}% success (${pa.failed} failures)`, color:'var(--red)', severity:'critical' });
      } else if (pa.total >= 5 && pa.successRate < 80) {
        alerts.push({ id:`perf-${pa.name}`, icon:'📊', text:`${pa.name} ${pa.successRate}% success rate`, color:'var(--orange)', severity:'warning' });
      }
    });
  }

  // Filter dismissed
  const active = alerts.filter(a => !_dismissedAlerts[a.id]);

  // Sort: critical first
  active.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));

  const banner = document.getElementById('alerts-banner');
  const content = document.getElementById('alerts-content');

  if (active.length) {
    // Color banner based on max severity (collapsed view)
    const hasCritical = active.some(a => a.severity === 'critical');
    banner.style.background = hasCritical ? 'var(--red-dim)' : 'rgba(245,158,11,0.08)';
    banner.style.borderBottomColor = hasCritical ? 'rgba(255,51,102,0.3)' : 'rgba(245,158,11,0.3)';

    const first = active[0];
    const extra = active.length > 1 ? ` +${active.length - 1} more` : '';
    const actionBtn = first.action ? `<button onclick="event.stopPropagation();(${first.action.fn.toString()})()" style="font-size:9px;padding:1px 6px;border-radius:4px;border:1px solid ${first.color};background:transparent;color:${first.color};cursor:pointer;font-weight:600;margin-left:6px;transition:background .15s" onmouseenter="this.style.background=this.style.borderColor+'22'" onmouseleave="this.style.background='transparent'">${first.action.label}</button>` : '';
    const dismissBtn = `<button onclick="event.stopPropagation();dismissAlert('${first.id}')" style="font-size:9px;padding:0 3px;border:none;background:transparent;color:var(--dim);cursor:pointer;opacity:0.6;transition:opacity .15s" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.6'" title="Dismiss for 30min">✕</button>`;
    content.innerHTML = `<span style="font-size:10px;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0">Alerts</span>` +
      `<span style="display:inline-flex;align-items:center;gap:6px;color:${first.color};font-weight:600;flex-shrink:0">${first.icon} ${first.text}<span style=\"color:var(--dim)\">${extra}</span>${actionBtn}${dismissBtn}</span>`;
    banner.style.display = 'block';

    // Push critical alerts to notification center + browser notification (once per alert)
    active.filter(a => a.severity === 'critical').forEach(a => {
      const nKey = 'alert-notif-' + a.id;
      if (!window[nKey]) {
        window[nKey] = true;
        addNotification(`${a.icon} ${a.text}`, a.color);
        sendBrowserNotification(`🚨 ${a.text}`, a.icon);
        setTimeout(() => { window[nKey] = false; }, 300000);
      }
    });
  } else {
    banner.style.display = 'none';
  }
}
// Alert refresh + tab title update handled in consolidated 5s poll above
// (refreshAlerts and updateTabTitle called each tick)

// ===== BROWSER NOTIFICATIONS (for critical alerts when tab is backgrounded) =====
let _browserNotifsEnabled = false;
async function requestBrowserNotifs() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { _browserNotifsEnabled = true; return; }
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    _browserNotifsEnabled = perm === 'granted';
  }
}
requestBrowserNotifs();

function sendBrowserNotification(body, icon) {
  if (!_browserNotifsEnabled || document.hasFocus()) return; // only when tab is not focused
  try {
    const n = new Notification('⚡ Agent Space', { body, icon: '/favicon.ico', tag: body.slice(0, 40), renotify: false, silent: false });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 15000);
  } catch {}
}

// ===== FAVICON BADGE =====
function updateFaviconBadge(activeCount, isCritical) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  // Background circle
  if (isCritical) {
    ctx.fillStyle = '#ef4444';
  } else if (activeCount > 0) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#3b82f6'); g.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = '#475569';
  }
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.fill();

  // Inner icon
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (isCritical) {
    ctx.font = 'bold 36px system-ui';
    ctx.fillText('!', size/2, size/2+2);
  } else if (activeCount > 0) {
    ctx.font = 'bold 32px system-ui';
    ctx.fillText('⚡', size/2, size/2+2);
    // Badge count
    const badgeR = 14;
    const bx = size - badgeR, by = badgeR;
    ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI*2);
    ctx.fillStyle = '#22c55e'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${activeCount > 9 ? 14 : 18}px system-ui`;
    ctx.fillText(String(activeCount), bx, by+1);
  } else {
    ctx.font = '36px system-ui';
    ctx.fillText('💤', size/2, size/2+2);
  }

  const link = document.querySelector("link[rel='icon']");
  if (link) link.href = c.toDataURL('image/png');
}

// ===== DYNAMIC TAB TITLE =====
let _lastFaviconState = '';
function updateTabTitle() {
  if (!agentData.length) return;
  const w = agentData.filter(a => a.status === 'working').length;
  const i = agentData.filter(a => a.status === 'idle').length;
  const s = agentData.filter(a => a.status === 'sleeping').length;
  const alertBanner = document.getElementById('alerts-banner');
  const hasAlerts = alertBanner && alertBanner.style.display !== 'none';
  const hasCritical = hasAlerts && alertBanner.style.background?.includes('red');
  let prefix = '';
  if (hasCritical) prefix = `🚨 `;
  else if (w > 0) prefix = `(${w}⚡) `;
  document.title = `${prefix}Agent Space`;
  // Update favicon with active agent count badge (canvas-rendered)
  const newState = hasCritical ? 'alert' : w > 0 ? 'active:'+w : 'idle';
  if (newState !== _lastFaviconState) {
    _lastFaviconState = newState;
    updateFaviconBadge(w, hasCritical);
  }
}
// Tab title updated in consolidated 5s poll

connectSSE();

// Initial data fetch so quickstats show real values immediately (don't wait for SSE)
(async function fetchInitialStats() {
  try {
    const [tokRes, memRes, agRes] = await Promise.all([
      fetch('/api/tokens').then(r => r.json()).catch(() => null),
      fetch('/api/memory').then(r => r.json()).catch(() => null),
      fetch('/api/agents').then(r => r.json()).catch(() => null),
    ]);
    if (tokRes) {
      const total = (tokRes.totals?.input||0) + (tokRes.totals?.output||0);
      const tokLabel = total > 1e6 ? (total/1e6).toFixed(1)+'M' : total > 1e3 ? (total/1e3).toFixed(0)+'K' : String(total);
      const qst = document.getElementById('qs-tokens'); if(qst) qst.textContent = tokLabel;
      const qsc = document.getElementById('qs-cost'); if(qsc) qsc.textContent = '$' + (tokRes.estimatedCostUSD||0).toFixed(2);
    }
    if (memRes) {
      const qsm = document.getElementById('qs-memories'); if(qsm) qsm.textContent = (memRes.totalPoints||memRes.count||0).toLocaleString();
    }
    if (agRes && Array.isArray(agRes)) {
      const active = agRes.filter(a => a.status === 'working').length;
      const qsw = document.getElementById('qs-wrs'); if(qsw) { qsw.textContent = String(active); qsw.style.color = active > 0 ? 'var(--green)' : 'var(--dim)'; }
    }
  } catch(e) { /* SSE will fill in later */ }
})();
