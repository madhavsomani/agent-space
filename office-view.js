let _officeView = localStorage.getItem('office-view') || '2d';
const _mobileOfficeViewKey = 'office-view-mobile';
let _officeMapControlsVisible = localStorage.getItem('office-map-controls') !== 'hidden';
window._officeMapControlsVisible = _officeMapControlsVisible;

function setOfficeMapControlsVisible(visible) {
  _officeMapControlsVisible = !!visible;
  window._officeMapControlsVisible = _officeMapControlsVisible;
  localStorage.setItem('office-map-controls', _officeMapControlsVisible ? 'show' : 'hidden');
  const mapLegend = document.getElementById('office-map-legend');
  if (!mapLegend) return;
  const isMobile = window.innerWidth <= 640;
  if (_officeView === '2d' && !isMobile) {
    mapLegend.style.display = _officeMapControlsVisible ? 'flex' : 'none';
  }
}
window.setOfficeMapControlsVisible = setOfficeMapControlsVisible;

// ── Grid View Renderer ──
function renderGridView() {
  const el = document.getElementById('office-2d-flat');
  if (!el) return;
  const agents = typeof agentData !== 'undefined' ? agentData : [];
  if (!agents.length) { el.innerHTML = '<div style="text-align:center;color:var(--dim);padding:40px;grid-column:1/-1">No agents discovered</div>'; return; }
  
  const zones = { Engineering: [], Content: [], Leadership: [], Support: [], Mail: [], Labs: [], Other: [] };
  agents.forEach(a => {
    const name = (a.name || '').toLowerCase();
    const role = (a.role || '').toLowerCase();
    let z = 'Engineering';
    if (name.includes('benmac') || role.includes('ceo') || role.includes('main agent')) z = 'Leadership';
    else if (name.includes('qa') || role.includes('quality') || role.includes('support')) z = 'Support';
    else if (name.includes('mail') || role.includes('email') || role.includes('ops')) z = 'Mail';
    else if (name.includes('research') || role.includes('phd')) z = 'Labs';
    else if (role.includes('writer') || role.includes('designer') || role.includes('producer') || role.includes('director') || role.includes('publisher') || role.includes('content')) z = 'Content';
    if (zones[z]) zones[z].push(a); else zones.Other.push(a);
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
  _officeView = view;
  window._officeView = view;
  localStorage.setItem('office-view', view);
  if (window.innerWidth <= 768 && explicit) localStorage.setItem(_mobileOfficeViewKey, view);
  
  const officeMap = document.getElementById('office-map');
  const flat2d = document.getElementById('office-2d-flat');
  const mapLegend = document.getElementById('office-map-legend');
  const btn2d = document.getElementById('view-2d-btn');
  const btnGrid = document.getElementById('view-grid-btn');
  window.scrollTo({ top: 0, behavior: 'instant' });

  const cardElements = ['office-quickstats','agent-search-bar','agent-search-results-count','agent-status-cards','agent-timeline','agent-uptime','heatmap-calendar','live-logs-panel','office-ticker'];

  officeMap.style.display = 'none';
  flat2d.style.display = 'none';
  if (mapLegend) mapLegend.style.display = 'none';
  btn2d.style.opacity = '0.5';
  btn2d.style.background = 'var(--card)';
  btn2d.style.color = 'var(--dim)';
  btn2d.style.borderColor = 'var(--border)';
  btn2d.style.boxShadow = 'none';
  btnGrid.style.opacity = '0.5';
  btnGrid.style.background = 'var(--card)';
  btnGrid.style.color = 'var(--dim)';
  btnGrid.style.borderColor = 'var(--border)';
  btnGrid.style.boxShadow = 'none';

  if (view === '2d') {
    btn2d.style.opacity = '1';
    btn2d.style.background = 'var(--accent)';
    btn2d.style.color = '#fff';
    btn2d.style.borderColor = 'var(--accent)';
    btn2d.style.boxShadow = '0 6px 16px rgba(37,99,235,0.25)';
    const isMobile = window.innerWidth <= 640;
    const keepVisible = isMobile ? ['office-ticker','office-quickstats','agent-search-bar'] : [];
    cardElements.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = keepVisible.includes(id) ? '' : 'none'; });
    if (mapLegend) mapLegend.style.display = isMobile ? 'none' : (_officeMapControlsVisible ? 'flex' : 'none');
    if (isMobile) {
      const qs = document.getElementById('office-quickstats');
      if (qs) qs.style.display = 'grid';
      const tk = document.getElementById('office-ticker');
      if (tk) tk.style.display = 'flex';
      const sb = document.getElementById('agent-search-bar');
      if (sb) sb.style.display = 'flex';
      officeMap.style.display = 'none';
      flat2d.style.display = 'grid';
      renderGridView();
      return;
    }

    flat2d.style.display = 'none';
    officeMap.style.display = 'block';
    const bootMap = () => {
      if (typeof ensureOfficeMap === 'function') ensureOfficeMap();
      else if (typeof initOfficeMap === 'function') initOfficeMap();
      if (window._officeMap && window.OFFICE_MAP_BOUNDS) {
        const pad = window.innerWidth <= 640 ? [24, 24] : [12, 12];
        window._officeMap.invalidateSize();
        window._officeMap.fitBounds(window.OFFICE_MAP_BOUNDS, { padding: pad });
      }
      if (typeof updateOfficeMap === 'function') updateOfficeMap(agentData || []);
    };
    bootMap();
    setTimeout(bootMap, 250);
    setTimeout(bootMap, 800);
  } else {
    // grid view
    if (mapLegend) mapLegend.style.display = 'none';
    cardElements.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = ''; });
    const qs = document.getElementById('office-quickstats');
    if (qs) qs.style.display = 'grid';
    const sb = document.getElementById('agent-search-bar');
    if (sb) sb.style.display = 'flex';
    const sc = document.getElementById('agent-status-cards');
    if (sc) sc.style.display = 'grid';
    const tk = document.getElementById('office-ticker');
    if (tk) tk.style.display = 'flex';
    btnGrid.style.opacity = '1';
    btnGrid.style.background = 'var(--accent)';
    btnGrid.style.color = '#fff';
    btnGrid.style.borderColor = 'var(--accent)';
    btnGrid.style.boxShadow = '0 6px 16px rgba(37,99,235,0.25)';
    renderGridView();
  }
}

// Restore view preference on load
setTimeout(() => {
  if (_officeView !== '2d' && _officeView !== 'grid') _officeView = '2d';
  if (window.innerWidth <= 768) {
    const savedMobile = localStorage.getItem(_mobileOfficeViewKey);
    _officeView = savedMobile || 'grid';
  }
  switchOfficeView(_officeView);
}, 500);

window.addEventListener('resize', () => {
  if (_officeView === '2d') {
    setTimeout(() => {
      if (window.innerWidth <= 640) {
        const officeMap = document.getElementById('office-map');
        const flat2d = document.getElementById('office-2d-flat');
        const mapLegend = document.getElementById('office-map-legend');
        if (officeMap) officeMap.style.display = 'none';
        if (mapLegend) mapLegend.style.display = 'none';
        if (flat2d) { flat2d.style.display = 'grid'; renderGridView(); }
        return;
      }
      const officeMap = document.getElementById('office-map');
      const mapLegend = document.getElementById('office-map-legend');
      if (officeMap) officeMap.style.display = 'block';
      if (mapLegend) mapLegend.style.display = _officeMapControlsVisible ? 'flex' : 'none';
      const bootMap = () => {
        if (typeof ensureOfficeMap === 'function') ensureOfficeMap();
        else if (typeof initOfficeMap === 'function') initOfficeMap();
        if (window._officeMap && window.OFFICE_MAP_BOUNDS) {
          const pad = window.innerWidth <= 640 ? [24, 24] : [12, 12];
          window._officeMap.invalidateSize();
          window._officeMap.fitBounds(window.OFFICE_MAP_BOUNDS, { padding: pad });
        }
        if (typeof updateOfficeMap === 'function') updateOfficeMap(agentData || []);
      };
      bootMap();
    }, 140);
  }
});
