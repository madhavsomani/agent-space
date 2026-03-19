// ===== LIVE LOGS =====
let liveLogsExpanded = true;
let liveLogFilter = 'all';
let liveLogsData = [];

function toggleLiveLogs() {
  liveLogsExpanded = !liveLogsExpanded;
  document.getElementById('live-logs-body').style.display = liveLogsExpanded ? 'block' : 'none';
  document.getElementById('live-logs-filters').style.display = liveLogsExpanded ? 'flex' : 'none';
  document.getElementById('live-logs-toggle').style.transform = liveLogsExpanded ? '' : 'rotate(-90deg)';
}

function setLogFilter(f, btn) {
  liveLogFilter = f;
  document.querySelectorAll('[data-log-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLiveLogs(liveLogsData);
}

function renderLiveLogs(logs) {
  const body = document.getElementById('live-logs-body');
  const filtered = liveLogFilter === 'all' ? logs : logs.filter(l => l.role === liveLogFilter);
  document.getElementById('live-logs-count').textContent = filtered.length;
  if (!filtered.length) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);font-size:11px">No logs in the last 30 minutes</div>';
    return;
  }
  body.innerHTML = filtered.map(l => {
    const t = l.ts ? new Date(l.ts).toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '';
    const roleIcon = l.role === 'assistant' ? '🤖' : l.role === 'user' ? '👤' : '⚙️';
    const roleBg = l.role === 'assistant' ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.08)';
    const text = l.text.length > 200 ? l.text.slice(0,200) + '…' : l.text;
    return `<div style="display:flex;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;background:${roleBg};border-radius:4px;margin-bottom:2px;align-items:flex-start;animation:feedSlideIn .2s ease">
      <span style="font-size:9px;color:var(--dim);font-family:'SF Mono',Menlo,monospace;white-space:nowrap;flex-shrink:0;margin-top:2px">${t}</span>
      <span style="flex-shrink:0">${roleIcon}</span>
      <span style="font-weight:700;color:${l.color||'var(--accent)'};flex-shrink:0;font-size:10px;min-width:60px">${l.agent}</span>
      <span style="color:var(--text);line-height:1.35;word-break:break-word;flex:1">${text}</span>
    </div>`;
  }).join('');
}

async function refreshLiveLogs() {
  try {
    const r = await fetchWithTimeout(API + '/live-logs', {}, 10000);
    const d = await r.json();
    liveLogsData = d.logs || [];
    renderLiveLogs(liveLogsData);
  } catch {}
}

// Initial load: fast essentials first, then heavier widgets.
(async function bootstrapDashboard() {
  // Fast-first, sequential bootstrap with retry for cold-start resilience.
  for (let attempt = 0; attempt < 3; attempt++) {
    await refreshAgents();
    if (agentData.length > 0) break;
    await new Promise(r => setTimeout(r, 2000)); // wait 2s between retries
  }
  await refreshTokens();
  await refreshMemory();
  await refreshDailyCost();
  await refreshLiveLogs();
  buildLegend(); renderAgentCards(); markUpdated();

  setTimeout(async () => {
    await Promise.allSettled([
      refreshSystem(),
      refreshHealthScore(),
      refreshQueue(),
      refreshActivity(),
      refreshTimeline(),
      refreshPerformance(),
      refreshUptime(),
      refreshCompletionStats(),
      refreshCommGraph(),
      refreshDepGraph(),
      refreshHeatmapCalendar(),
      refreshDiskBreakdown(),
    ]);
    buildLegend(); renderAgentCards(); markUpdated();
  }, 3000);

  // Retry wave: catch any endpoints that failed during cold start
  setTimeout(async () => {
    await Promise.allSettled([
      refreshUptime(),
      refreshHeatmapCalendar(),
      refreshDiskBreakdown(),
      refreshTimeline(),
      refreshActivity(),
    ]);
    markUpdated();
  }, 15000);
})();
// Live logs refreshed in consolidated 5s poll (every 3rd tick = 15s)
