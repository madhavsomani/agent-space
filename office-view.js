let _officeView = localStorage.getItem('office-view') || '2d'; // Default to cozy office view
const _mobileOfficeViewKey = 'office-view-mobile';

// ── Grid View Renderer ──
function renderGridView() {
  const el = document.getElementById('office-2d-flat');
  if (!el) return;
  const agents = typeof agentData !== 'undefined' ? agentData : [];
  if (!agents.length) { el.innerHTML = '<div style="text-align:center;color:var(--dim);padding:40px;grid-column:1/-1">No agents discovered</div>'; return; }
  
  // Group agents by zone
  const zones = { Engineering: [], 'Content Team': [], Leadership: [], Support: [], Other: [] };
  agents.forEach(a => {
    const z = a.zone || a.team || 'Other';
    if (zones[z]) zones[z].push(a); else (zones.Other = zones.Other || []).push(a);
  });
  
  let html = '';
  for (const [zoneName, zoneAgents] of Object.entries(zones)) {
    if (!zoneAgents.length) continue;
    const activeCount = zoneAgents.filter(a => a.status === 'working').length;
    html += '<div class="zone-header">' +
      '<span style="font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:1px">' + esc(zoneName) + '</span>' +
      '<span class="count">' + activeCount + '/' + zoneAgents.length + ' active</span>' +
      '<div style="flex:1;height:1px;background:var(--border)"></div>' +
    '</div>';
    
    zoneAgents.forEach(a => {
      const isWorking = a.status === 'working';
      const isIdle = a.status === 'idle';
      const statusColor = isWorking ? '#22c55e' : isIdle ? '#9ca3af' : '#6b7280';
      const statusLabel = isWorking ? 'Working' : isIdle ? 'Idle' : 'Sleeping';
      const ageText = !a.ageMin ? '' : a.ageMin < 1 ? 'just now' : a.ageMin < 60 ? a.ageMin + 'm ago' : Math.round(a.ageMin/60) + 'h ago';
      const inactive = !isWorking && (!a.lastMessage || a.lastMessage.length < 2) && (a.ageMin || 0) > 60;
      const avatarSeed = encodeURIComponent(a.name);
      const avatarUrl = 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + avatarSeed + '&backgroundColor=transparent';
      const tokIn = a.tokensIn ? (a.tokensIn > 1000 ? (a.tokensIn/1000).toFixed(0) + 'K' : a.tokensIn) : '0';
      const tokOut = a.tokensOut ? (a.tokensOut > 1000 ? (a.tokensOut/1000).toFixed(0) + 'K' : a.tokensOut) : '0';
      const cost = a.costUSD ? '$' + a.costUSD.toFixed(2) : '';

      if (inactive) {
        html += '<div class="agent-card compact" onclick="openAgentDetail(\'' + a.name.replace(/'/g,"\\'") + '\')">' +
          '<div class="agent-avatar compact" style="border-color:' + statusColor + '">' +
            '<img src="' + avatarUrl + '" alt="" style="width:28px;height:28px" loading="lazy">' +
          '</div>' +
          '<div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px">' +
            '<span class="agent-name" style="font-size:12px">' + esc(a.name) + '</span>' +
            '<span class="agent-status-dot" style="background:' + statusColor + '"></span>' +
            '<span class="agent-status-label" style="color:' + statusColor + '">' + statusLabel + '</span>' +
            (ageText ? '<span style="margin-left:auto;font-size:10px;color:var(--dim);flex-shrink:0">inactive ' + esc(ageText) + '</span>' : '') +
          '</div>' +
        '</div>';
        return;
      }
      
      html += '<div class="agent-card" onclick="openAgentDetail(\'' + a.name.replace(/'/g,"\\'") + '\')">' +
        '<div class="agent-avatar" style="border-color:' + statusColor + '">' +
          '<img src="' + avatarUrl + '" alt="" style="width:44px;height:44px" loading="lazy" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span style=font-size:24px>' + (isWorking?'👨‍💻':isIdle?'☕':'😴') + '</span>\'">' +
        '</div>' +
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span class="agent-name">' + esc(a.name) + '</span>' +
            '<span class="agent-status-dot" style="background:' + statusColor + '"></span>' +
            '<span class="agent-status-label" style="color:' + statusColor + '">' + statusLabel + '</span>' +
            (ageText ? '<span style="margin-left:auto;font-size:9px;color:var(--dim);flex-shrink:0">' + esc(ageText) + '</span>' : '') +
          '</div>' +
          '<div class="agent-role">' + esc(a.role||'Agent') + '</div>' +
          (a.lastMessage ? '<div class="agent-activity">' + esc((a.lastMessage||'').replace(/\n/g,' ').slice(0,60)) + '</div>' : '') +
          '<div class="agent-meta">' +
            '<span>↗ ' + tokIn + '</span><span>↙ ' + tokOut + '</span>' +
            (cost ? '<span style="color:var(--green)">' + cost + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });
  }
  el.innerHTML = html;
}
async function switchOfficeView(view, opts = {}) {
  const explicit = !!opts.explicit;
  if (window.innerWidth <= 768 && view === '2d' && !explicit) view = 'grid';
  const useReal3D = view === '2d' && window.innerWidth > 768 && window.Office3D;
  _officeView = view;
  localStorage.setItem('office-view', view);
  if (window.innerWidth <= 768 && explicit) localStorage.setItem(_mobileOfficeViewKey, view);
  const canvas2d = document.getElementById('office-canvas');
  const flat2d = document.getElementById('office-2d-flat');
  const container3d = document.getElementById('office-3d-container');
  const btn2d = document.getElementById('view-2d-btn');
  const btnGrid = document.getElementById('view-grid-btn');
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Card-based elements to hide in canvas view
  const cardElements = ['office-quickstats','agent-search-bar','agent-search-results-count','agent-status-cards','agent-timeline','agent-uptime','heatmap-calendar','live-logs-panel','office-ticker'];

  // Hide all canvas views
  canvas2d.style.display = 'none';
  flat2d.style.display = 'none';
  container3d.style.display = 'none';
  btn2d.style.opacity = '0.5';
  btnGrid.style.opacity = '0.5';

  if (view === '2d') {
    btn2d.style.opacity = '1';
    // Hide card-based content
    cardElements.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });

    if (useReal3D) {
      container3d.style.display = 'block';
      container3d.style.width = '100%';
      container3d.style.minHeight = window.innerWidth > 1200 ? '760px' : '640px';
      requestAnimationFrame(async () => {
        try {
          if (window.Office3D && typeof window.Office3D.start === 'function') {
            await window.Office3D.start(container3d);
          }
        } catch (e) {
          console.warn('Office3D start failed, falling back to canvas:', e?.message || e);
          container3d.style.display = 'none';
          canvas2d.style.display = 'block';
          resizeCanvas();
          invalidateStaticCache();
          if (typeof _canvasVisible !== 'undefined') _canvasVisible = true;
          if (typeof drawOffice === 'function') {
            drawOffice(performance.now());
            setTimeout(() => drawOffice(performance.now()), 40);
            setTimeout(() => drawOffice(performance.now()), 140);
          }
          if (typeof officeLoop === 'function') requestAnimationFrame(officeLoop);
        }
      });
    } else {
      canvas2d.style.display = 'block';
      invalidateStaticCache();
      if (typeof _canvasVisible !== 'undefined') _canvasVisible = true;
      requestAnimationFrame(() => {
        resizeCanvas();
        invalidateStaticCache();
        if (typeof _canvasVisible !== 'undefined') _canvasVisible = true;
        if (typeof drawOffice === 'function') {
          drawOffice(performance.now());
          setTimeout(() => drawOffice(performance.now()), 40);
          setTimeout(() => drawOffice(performance.now()), 140);
        }
        if (typeof officeLoop === 'function') requestAnimationFrame(officeLoop);
      });
    }
  } else {
    if (window.Office3D && typeof window.Office3D.stop === 'function') {
      try { window.Office3D.stop(); } catch (e) {}
    }
    // grid (default) — show card content
    cardElements.forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.display = '';
    });
    // Restore display types that get cleared
    const qs = document.getElementById('office-quickstats');
    if (qs) qs.style.display = 'grid';
    const sb = document.getElementById('agent-search-bar');
    if (sb) sb.style.display = 'flex';
    const sc = document.getElementById('agent-status-cards');
    if (sc) sc.style.display = 'grid';
    const tk = document.getElementById('office-ticker');
    if (tk) tk.style.display = 'flex';
    btnGrid.style.opacity = '1';
    renderGridView();
  }
}

// Restore view preference on load
setTimeout(() => {
  // Migrate old preferences — 3d/pixel/old 2d → new 2d
  if (_officeView === '3d' || _officeView === 'pixel') _officeView = '2d';
  if (window.innerWidth <= 768) {
    const savedMobile = localStorage.getItem(_mobileOfficeViewKey);
    _officeView = savedMobile || 'grid';
  }
  switchOfficeView(_officeView);
}, 500);

window.addEventListener('resize', () => {
  if (window.innerWidth <= 768 && _officeView === '2d') {
    if (typeof drawOffice === 'function') requestAnimationFrame(() => drawOffice(performance.now()));
    return;
  }
});
