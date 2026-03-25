// ===== AGENT TIMELINE HEATMAP =====
async function refreshTimeline() {
  try {
    const r = await fetchWithTimeout(API + '/timeline-heatmap', {}, 10000);
    const d = await r.json();
    if (!d.agents || !d.agents.length) {
      document.getElementById('timeline-content').innerHTML = '<span style="color:var(--dim)">No timeline data</span>';
      return;
    }
    const BUCKETS = d.agents[0].slots.length;
    // Time labels (every 4th bucket = every hour)
    let headerHtml = '<div class="timeline-header">';
    const now = new Date();
    for (let i = 0; i < BUCKETS; i++) {
      const minsAgo = (BUCKETS - 1 - i) * d.bucketMinutes;
      const t = new Date(now.getTime() - minsAgo * 60000);
      if (i % 4 === 0) {
        headerHtml += `<span>${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}</span>`;
      } else {
        headerHtml += '<span></span>';
      }
    }
    headerHtml += '</div>';

    let rowsHtml = '';
    d.agents.forEach(agent => {
      const activeCount = agent.slots.filter(s => s > 0).length;
      if (activeCount === 0 && d.agents.length > 6) return; // skip fully inactive for cleaner view
      rowsHtml += `<div class="timeline-row"><div class="timeline-label" style="color:${agent.color}">${agent.name}</div><div class="timeline-slots">`;
      agent.slots.forEach((s, i) => {
        const minsAgo = (BUCKETS - 1 - i) * d.bucketMinutes;
        const slotStart = new Date(now.getTime() - minsAgo * 60000);
        const slotEnd = new Date(slotStart.getTime() + d.bucketMinutes * 60000);
        const label = `${slotStart.getHours().toString().padStart(2,'0')}:${slotStart.getMinutes().toString().padStart(2,'0')}`;
        const clickAttr = s > 0 ? ` onclick="filterByTimeSlot('${agent.name}','${slotStart.toISOString()}','${slotEnd.toISOString()}','${label}','${agent.color}')"` : '';
        if (s > 0) {
          rowsHtml += `<div class="timeline-slot active" style="background:${agent.color}" title="${agent.name} active at ${label}"${clickAttr}></div>`;
        } else {
          rowsHtml += `<div class="timeline-slot inactive" title="${label}"></div>`;
        }
      });
      rowsHtml += '</div></div>';
    });

    document.getElementById('timeline-content').innerHTML = headerHtml + rowsHtml;
    timelineData = d; // cache for sparklines in agent cards
    scheduleRenderAgentCards(); // re-render cards with sparklines
  } catch (e) {
    document.getElementById('timeline-content').innerHTML = '<span style="color:var(--dim)">Failed to load timeline</span>';
  }
}

// --- Uptime Chart ---
async function refreshUptime() {
  try {
    const r = await fetchWithTimeout(API + '/uptime', {}, 10000);
    const d = await r.json();
    window._uptimeData = d;
    if (!d.agents || !d.agents.length) {
      document.getElementById('uptime-content').innerHTML = '<span style="color:var(--dim)">No uptime data</span>';
      return;
    }
    // Summary
    let html = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap">
      <div style="font-size:24px;font-weight:800;color:var(--accent)">${d.avgUptime}%</div>
      <div style="font-size:11px;color:var(--dim)">avg fleet uptime (24h)</div>
    </div>`;
    // Per-agent bars
    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    d.agents.forEach(a => {
      const barColor = a.uptimePct >= 50 ? 'var(--green)' : a.uptimePct >= 20 ? 'var(--orange)' : 'var(--dim)';
      const barBg = a.uptimePct >= 50 ? 'var(--green-dim)' : a.uptimePct >= 20 ? 'var(--orange-dim)' : 'rgba(100,100,100,0.1)';
      const activeH = Math.floor(a.activeMinutes / 60);
      const activeM = a.activeMinutes % 60;
      const timeLabel = activeH > 0 ? `${activeH}h ${activeM}m` : `${activeM}m`;
      // Mini sparkline from 96 slots
      const sparkW = 192;
      const sparkH = 12;
      const slotW = sparkW / a.totalSlots;
      const sparkRects = a.slots.map((s, i) => 
        s > 0 ? `<rect x="${i * slotW}" y="0" width="${Math.max(slotW - 0.3, 0.5)}" height="${sparkH}" fill="${a.color}" opacity="0.6" rx="0.5"/>` : ''
      ).join('');
      html += `<div style="display:flex;align-items:center;gap:10px">
        <div style="width:100px;font-weight:600;color:${a.color};font-size:11px;text-align:right;flex-shrink:0">${a.name}</div>
        <div style="flex:1;max-width:300px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${a.uptimePct}%;background:${barColor};border-radius:4px;transition:width .8s cubic-bezier(.4,0,.2,1)"></div>
            </div>
            <span style="font-size:11px;font-weight:800;color:${barColor};min-width:36px;text-align:right;font-variant-numeric:tabular-nums">${a.uptimePct}%</span>
          </div>
          <svg width="${sparkW}" height="${sparkH}" viewBox="0 0 ${sparkW} ${sparkH}" style="display:block;border-radius:2px;background:rgba(255,255,255,0.02)">${sparkRects}</svg>
        </div>
        <span style="font-size:10px;color:var(--dim);min-width:50px">${timeLabel}</span>
      </div>`;
    });
    html += '</div>';
    document.getElementById('uptime-content').innerHTML = html;
    // Update status strip uptime stat if element exists
    const ssUpEl = document.getElementById('ss-uptime');
    if (ssUpEl) animateValue(ssUpEl, d.avgUptime + '% fleet');
  } catch {
    document.getElementById('uptime-content').innerHTML = '<span style="color:var(--dim)">Failed to load uptime</span>';
  }
}

// --- SSE real-time updates (replaces polling for agents, activity, system) ---
let _sseConnected = false;
let _sseLatency = null;
let _sseClients = 0;
let _sseEventCount = 0;
let _sseInstance = null;
let _sseReconnectTimer = null;
let _sseReconnectDelay = 1000;
let _sseReconnectCount = 0;
function connectSSE() {
  if (_sseInstance) { try { _sseInstance.close(); } catch {} }
  if (_sseReconnectTimer) { clearTimeout(_sseReconnectTimer); _sseReconnectTimer = null; }
  const es = new EventSource(_authToken ? `/api/events?token=${encodeURIComponent(_authToken)}` : '/api/events');
  _sseInstance = es;
  es.addEventListener('connected', () => {
    _sseConnected = true;
    _sseReconnectDelay = 1000;
    _sseReconnectCount = 0;
    updateSSEIndicator();
  });
  es.addEventListener('ping', (e) => {
    try {
      const d = JSON.parse(e.data);
      _sseLatency = Date.now() - d.ts;
      _sseClients = d.clients || 1;
      updateSSEIndicator();
    } catch {}
  });
  es.addEventListener('agents', (e) => {
    _sseEventCount++;
    if (autoRefreshPaused) return;
    try {
      const data = JSON.parse(e.data);
      const newAgents = data.agents || [];
      if (agentData.length && newAgents.length) {
        const oldMap = {};
        agentData.forEach(a => oldMap[a.id || a.name] = a.status);
        newAgents.forEach(a => {
          const key = a.id || a.name;
          const oldStatus = oldMap[key];
          if (oldStatus && oldStatus !== a.status) {
            playStatusChangeSound(oldStatus, a.status, a.name, a.color);
          }
        });
      }
      agentData = newAgents;
      updateStatusStrip();
      buildLegend(); scheduleRenderAgentCards(); markUpdated();
      // Update office views with new agent data (only when Office tab visible)
      if (typeof isOfficeTabActive === 'function' && isOfficeTabActive()) {
        if (_officeView === '2d' && typeof updateOfficeMap === 'function') updateOfficeMap(agentData);
        if (_officeView === 'grid') renderGridView();
      }
    } catch {}
  });
  es.addEventListener('activity', (e) => {
    _sseEventCount++;
    if (autoRefreshPaused) return;
    try {
      const data = JSON.parse(e.data);
      if (data.activity) { activityCache = data.activity; renderActivityFeed(data.activity); }
    } catch {}
  });
  es.addEventListener('system', (e) => {
    _sseEventCount++;
    if (autoRefreshPaused) return;
    refreshSystem();
  });
  es.addEventListener('tokens', (e) => {
    _sseEventCount++;
    if (autoRefreshPaused) return;
    try {
      const d = JSON.parse(e.data);
      // Update quick stats from SSE push
      const fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
      const totalTok = (d.totals?.input||0) + (d.totals?.output||0);
      animateValue(document.getElementById('ss-cost'), '$' + (d.estimatedCostUSD||0).toFixed(2));
      animateValue(document.getElementById('qs-cost'), '$' + (d.estimatedCostUSD||0).toFixed(2));
      animateValue(document.getElementById('qs-tokens'), fmtK(totalTok));
    } catch {}
  });
  es.addEventListener('queue', (e) => {
    _sseEventCount++;
    if (autoRefreshPaused) return;
    try {
      const d = JSON.parse(e.data);
      const activeCount = (d.active||[]).filter(w=>!w.complete).length;
      animateValue(document.getElementById('qs-wrs'), String(activeCount));
      const queueBtn = document.querySelector('[data-tab="queue"]');
      if(activeCount > 0) queueBtn.innerHTML = `📋 Queue <span class="badge">${activeCount}</span>`;
      else queueBtn.innerHTML = '📋 Queue';
    } catch {}
  });
  es.addEventListener('timeline', (e) => {
    _sseEventCount++;
    if (autoRefreshPaused) return;
    try {
      timelineData = JSON.parse(e.data);
      // Timeline data cached — sparklines in agent cards will use it on next render
    } catch {}
  });
  es.onerror = () => {
    _sseConnected = false;
    _sseLatency = null;
    updateSSEIndicator();
    es.close();
    _sseInstance = null;
    _sseReconnectCount++;
    _sseReconnectDelay = Math.min(_sseReconnectDelay * 2, 30000);
    _sseReconnectTimer = setTimeout(connectSSE, _sseReconnectDelay);
  };
}
function updateSSEIndicator() {
  const el = document.querySelector('.live');
  if (!el) return;
  if (_sseConnected) {
    el.className = 'live online';
    const latStr = _sseLatency !== null ? ` · ${_sseLatency}ms` : '';
    const clientStr = _sseClients > 1 ? ` · ${_sseClients}👁` : '';
    el.innerHTML = `<span class="pulse"></span>LIVE${latStr}${clientStr}`;
    el.title = `SSE connected${_sseLatency !== null ? ` | Latency: ${_sseLatency}ms` : ''} | Events: ${_sseEventCount}${_sseClients > 1 ? ` | Viewers: ${_sseClients}` : ''}`;
  } else {
    el.className = 'live offline';
    el.innerHTML = '<span class="pulse"></span>RECONNECTING';
    el.title = 'SSE disconnected, reconnecting...';
  }
}
