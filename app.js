// Theme
let _tabLoaded = {};
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function sanitizeAgentText(text) { const s = String(text || '').replace(/\[\[\s*reply_to(?:_[^\]]+|:[^\]]+)?\s*\]\]/gi, '').replace(/\s+/g, ' ').trim(); if (/^(HEARTBEAT_OK|NO_REPLY)$/i.test(s)) return ''; return s; }
const THEME_KEY = 'hq-theme';
const THEME_PREFS = ['dark', 'light', 'system'];
function getThemePref() {
  const t = (localStorage.getItem(THEME_KEY) || 'system').toLowerCase();
  return THEME_PREFS.includes(t) ? t : 'system';
}
function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function resolveTheme(pref) {
  return pref === 'system' ? getSystemTheme() : (pref === 'dark' ? 'dark' : 'light');
}
function getTheme() { return resolveTheme(getThemePref()); }
window.invalidateStaticCache = window.invalidateStaticCache || function(){};

function setThemeColorMeta(t) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = t === 'dark' ? '#0c0c0e' : '#f0f2f5';
}

function updateThemeButton(pref, resolved) {
  const iconEl = document.getElementById('theme-icon');
  const btn = document.getElementById('theme-btn');
  if (iconEl) {
    if (pref === 'system') iconEl.textContent = '🖥️';
    else iconEl.textContent = resolved === 'dark' ? '🌙' : '☀️';
  }
  if (btn) {
    const modeLabel = pref === 'system' ? `System (${resolved})` : pref[0].toUpperCase() + pref.slice(1);
    btn.title = `Theme: ${modeLabel}. Press T to cycle`;
    btn.setAttribute('aria-label', `Theme mode ${modeLabel}. Press T to cycle`);
  }
}

function applyTheme(pref = getThemePref()) {
  const preference = THEME_PREFS.includes(pref) ? pref : getThemePref();
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-theme-pref', preference);
  document.body.setAttribute('data-theme', resolved); // keep body/html in sync for CSS variable inheritance
  document.body.setAttribute('data-theme-pref', preference);
  updateThemeButton(preference, resolved);
  setThemeColorMeta(resolved);
  if (typeof invalidateStaticCache === 'function') invalidateStaticCache();
  window.dispatchEvent(new CustomEvent('hq-theme-changed', { detail: { theme: resolved, preference } }));
}
function toggleTheme() {
  const current = getThemePref();
  const idx = THEME_PREFS.indexOf(current);
  const next = THEME_PREFS[(idx + 1) % THEME_PREFS.length];
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}
applyTheme(getThemePref());
if (window.matchMedia) {
  const _themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const _syncSystemTheme = () => { if (getThemePref() === 'system') applyTheme('system'); };
  if (typeof _themeMedia.addEventListener === 'function') _themeMedia.addEventListener('change', _syncSystemTheme);
  else if (typeof _themeMedia.addListener === 'function') _themeMedia.addListener(_syncSystemTheme);
}

const API = '/api';

// Data export helper
function exportData(type, format = 'csv') {
  const tokenParam = _authToken ? `&token=${encodeURIComponent(_authToken)}` : '';
  const url = `${API}/export/${type}?format=${format}${tokenParam}`;
  const a = document.createElement('a');
  a.href = url; a.download = `${type}.${format}`; a.click();
}
// Fetch with timeout — prevents widgets hanging forever on slow/stalled requests
// Auth: reads token from localStorage or ?token= URL param
const _authToken = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('agent-space-token') || '';
if (_authToken && !localStorage.getItem('agent-space-token')) localStorage.setItem('agent-space-token', _authToken);

function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  if (_authToken) {
    opts.headers = { ...(opts.headers || {}), 'X-API-Key': _authToken };
  }
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(tid));
}
let agentData = [];
let apiOnline = true;
let autoRefreshPaused = false;
let cpuHistory = [], memHistory = [];
const MAX_HISTORY = 30;
let _cachedSystem = null;

// Clock
function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleString('en-US', { timeZone:'America/Los_Angeles', weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
setInterval(updateClock, 1000); updateClock();

// Tabs
const _tabOrder = ['office','activity','queue','memory','tokens','performance','comm-graph','dep-graph','system','plan'];
let _currentTab = 'office';

window.addEventListener('hq-theme-changed', () => {
  // Repaint tab-specific visuals that cache explicit colors/SVG backgrounds
  try {
    if (_currentTab === 'comm-graph' && typeof refreshCommGraph === 'function') refreshCommGraph();
    if (_currentTab === 'queue' && typeof refreshQueue === 'function') refreshQueue();
    if (_currentTab === 'tokens') {
      if (typeof refreshTokens === 'function') refreshTokens();
      if (typeof refreshDailyCost === 'function') refreshDailyCost();
    }
    if (_currentTab === 'office' && typeof updateOfficeMap === 'function') updateOfficeMap(agentData || []);
  } catch (e) {
    console.warn('theme repaint failed', e);
  }
});

window.addEventListener('storage', (e) => {
  if (e.key === THEME_KEY) applyTheme(e.newValue || 'system');
});

function switchTab(tabName) {
  // Always scroll to top — even when re-clicking the same tab (fixes canvas appearing off-screen)
  window.scrollTo({ top: 0, behavior: 'instant' });
  if(tabName === _currentTab) return;
  const oldIdx = _tabOrder.indexOf(_currentTab);
  const newIdx = _tabOrder.indexOf(tabName);
  const direction = newIdx > oldIdx ? 'right' : 'left';
  document.querySelectorAll('#tabs-nav button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
  document.querySelectorAll('body > .tab').forEach(t => { t.classList.remove('active','slide-in-right','slide-in-left'); });
  // Also update mobile nav
  document.querySelectorAll('.mobile-nav button').forEach(b => b.classList.remove('active'));
  const mobBtn = document.querySelector(`.mobile-nav [data-tab="${tabName}"]`);
  if(mobBtn) mobBtn.classList.add('active');
  const btn = document.querySelector(`#tabs-nav [data-tab="${tabName}"]`);
  const tabEl = document.querySelector(`body > .tab#tab-${tabName}`) || document.getElementById('tab-' + tabName);
  if(btn) { btn.classList.add('active'); btn.setAttribute('aria-selected','true'); }
  const sel = document.getElementById('tab-select');
  if(sel) sel.value = tabName;
  if(tabEl) {
    tabEl.classList.add('active', direction === 'right' ? 'slide-in-right' : 'slide-in-left');
  }
  history.replaceState(null, '', '#' + tabName);
  _currentTab = tabName;
  // Lazy-load heavy tabs on first visit
  if (!_tabLoaded[tabName]) {
    _tabLoaded[tabName] = true;
    if (tabName === 'comm-graph') refreshCommGraph();
    else if (tabName === 'dep-graph') refreshDepGraph();
    else if (tabName === 'system') { refreshSystem(); refreshDiskBreakdown(); refreshLatency(); }
  }
}
document.querySelectorAll('#tabs-nav button').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});
// Restore tab from URL hash on load
(function(){
  const hash = location.hash.replace('#','');
  const validTabs = ['office','activity','queue','memory','tokens','performance','comm-graph','dep-graph','system','plan'];
  if(hash && validTabs.includes(hash)) switchTab(hash);
})();

// Keyboard shortcuts: 1-6 for tabs, R for refresh
document.addEventListener('keydown', e => {
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  const tabs = ['office','activity','queue','memory','tokens','performance','comm-graph','dep-graph','system','plan'];
  const idx = parseInt(e.key) - 1;
  if(idx >= 0 && idx < tabs.length) {
    switchTab(tabs[idx]);
  }
  if(e.key === 'r' || e.key === 'R') refreshAll();
  if(e.key === 'p' || e.key === 'P') togglePause();
  if(e.key === '/') {
    e.preventDefault();
    const input = document.getElementById('agent-search-input');
    if (input) { input.focus(); input.select(); }
  }
  if(e.key === '0' && _currentTab === 'office') {
    const filteringActive = _agentSearchQuery || _agentStatusFilter !== 'all' || _agentTypeFilter !== 'all';
    if (filteringActive) resetAgentFilters();
  }
  if((e.key === 'c' || e.key === 'C') && _currentTab === 'office') {
    collapseAllTeams();
  }
  if((e.key === 'e' || e.key === 'E') && _currentTab === 'office') {
    expandAllTeams();
  }
  if((e.key === 'b' || e.key === 'B') && _currentTab === 'office' && typeof setLogFilter === 'function') {
    const btn = document.querySelector('[data-log-filter="assistant"]');
    setLogFilter('assistant', btn || null);
  }
  if((e.key === 'u' || e.key === 'U') && _currentTab === 'office' && typeof setLogFilter === 'function') {
    const btn = document.querySelector('[data-log-filter="user"]');
    setLogFilter('user', btn || null);
  }
  if((e.key === 'a' || e.key === 'A') && _currentTab === 'office' && typeof setLogFilter === 'function') {
    const btn = document.querySelector('[data-log-filter="all"]');
    setLogFilter('all', btn || null);
  }
  if((e.key === 'l' || e.key === 'L') && _currentTab === 'office' && typeof toggleLiveLogs === 'function') {
    toggleLiveLogs();
  }
  if(e.key === '?') document.getElementById('help-overlay').classList.toggle('visible');
  if(e.key === 't' || e.key === 'T') toggleTheme();
  if(e.key === 's' || e.key === 'S') toggleAmbientSound();
  if(e.key === 'v' || e.key === 'V') { switchOfficeView(_officeView === '2d' ? 'grid' : '2d'); }
  if(e.key === 'f' || e.key === 'F') { toggleMapControls(); }
  if(e.key === 'n' || e.key === 'N') toggleNotifSounds();
  if(e.key === 'i' || e.key === 'I') toggleNotifCenter();
  if(e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
  if(e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
  if(e.key === '`') { zoomReset(); }
  if(e.key === 'Escape') {
    const overlay = document.getElementById('help-overlay');
    if (overlay) overlay.classList.remove('visible');
    if (_currentTab === 'office') {
      const filteringActive = _agentSearchQuery || _agentStatusFilter !== 'all' || _agentTypeFilter !== 'all';
      if (filteringActive) resetAgentFilters();
    }
  }
});

// Swipe navigation for mobile
(function() {
  let touchStartX = 0, touchStartY = 0;
  const tabs = ['office','activity','queue','memory','tokens','performance','comm-graph','dep-graph','system','plan'];
  document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, {passive:true});
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return; // too short or too vertical
    const cur = tabs.indexOf(document.querySelector('.tab.active')?.id.replace('tab-',''));
    if (cur < 0) return;
    const next = dx < 0 ? Math.min(cur+1, tabs.length-1) : Math.max(cur-1, 0);
    if (next !== cur) { switchTab(tabs[next]); const btn = document.querySelector(`[data-tab="${tabs[next]}"]`); if(btn) btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}); }
  }, {passive:true});
})();

async function refreshAll() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  await Promise.allSettled([
    refreshAgents(),
    refreshHealthScore(),
    refreshQueue(),
    refreshMemory(),
    refreshTokens(),
    refreshDailyCost(),
    refreshActivity(),
    refreshTimeline(),
    refreshPerformance(),
    refreshUptime(),
    refreshCompletionStats(),
    refreshHeatmapCalendar(),
    refreshLiveLogs(),
    (typeof refreshCommGraph === 'function' ? refreshCommGraph() : null),
    (typeof refreshDepGraph === 'function' ? refreshDepGraph() : null)
  ]);
  if (typeof loadDeskLayout === 'function') loadDeskLayout();
  buildLegend(); renderAgentCards(); markUpdated();
  setTimeout(() => btn.classList.remove('spinning'), 600);
}
document.getElementById('refresh-btn').onclick = refreshAll;

function togglePause() {
  autoRefreshPaused = !autoRefreshPaused;
  document.getElementById('pause-icon').textContent = autoRefreshPaused ? '▶' : '⏸';
  document.getElementById('pause-label').textContent = autoRefreshPaused ? 'Paused' : 'Auto';
  const btn = document.getElementById('pause-btn');
  btn.style.borderColor = autoRefreshPaused ? 'var(--orange)' : '';
  btn.style.color = autoRefreshPaused ? 'var(--orange)' : '';
  if(autoRefreshPaused) showToast('⏸', 'Auto-refresh paused', '#f59e0b');
  else showToast('▶', 'Auto-refresh resumed', '#22c55e');
}
document.getElementById('pause-btn').onclick = togglePause;

function toggleMapControls() {
  const next = !(window._officeMapControlsVisible === true);
  if (typeof setOfficeMapControlsVisible === 'function') {
    setOfficeMapControlsVisible(next);
  } else {
    window._officeMapControlsVisible = next;
  }
  const mapLegend = document.getElementById('office-map-legend');
  if (mapLegend && _officeView === '2d' && window.innerWidth > 640) {
    mapLegend.style.display = next ? 'flex' : 'none';
  }
  showToast('🗺️', next ? 'Map controls shown' : 'Map controls hidden', next ? '#3b82f6' : '#64748b');
}

function animateValue(el, newText) {
  if (!el || el.textContent === newText) return;
  const oldText = el.textContent;
  // Try smooth numeric counter for integer-like values
  const oldNum = parseFloat(oldText.replace(/[^0-9.-]/g,''));
  const newNum = parseFloat(newText.replace(/[^0-9.-]/g,''));
  const suffix = newText.replace(/[0-9,.-]+/,'');
  const prefix = newText.match(/^[^0-9.-]*/)?.[0]||'';
  const cleanNew = newText.replace(/^[^0-9.-]*/,'').replace(/[^0-9.-]+$/,'');
  if(oldText !== '--' && !isNaN(oldNum) && !isNaN(newNum) && oldNum !== newNum && Math.abs(newNum-oldNum)<1e6) {
    const duration = 400;
    const start = performance.now();
    const isInt = cleanNew.indexOf('.')<0;
    const dec = isInt ? 0 : (cleanNew.split('.')[1]||'').length;
    function step(ts) {
      const p = Math.min((ts-start)/duration,1);
      const ease = 1-Math.pow(1-p,3); // easeOutCubic
      const cur = oldNum+(newNum-oldNum)*ease;
      el.textContent = prefix+(isInt?Math.round(cur).toLocaleString():cur.toFixed(dec))+suffix;
      if(p<1) requestAnimationFrame(step);
      else { el.textContent=newText; el.classList.add('count-pulse'); setTimeout(()=>el.classList.remove('count-pulse'),500); }
    }
    requestAnimationFrame(step);
    return;
  }
  el.classList.add('updating');
  setTimeout(() => {
    el.textContent = newText;
    el.classList.remove('updating');
    el.classList.add('popped');
    if(oldText !== '--' && oldText !== newText) el.classList.add('count-pulse');
    setTimeout(()=>{ el.classList.remove('popped'); el.classList.remove('count-pulse'); }, 500);
  }, 150);
}

function barColor(pct) { return pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'; }

function isOfficeTabActive() {
  const tab = document.getElementById('tab-office');
  return !!(tab && tab.classList.contains('active'));
}
window.isOfficeTabActive = isOfficeTabActive;

function sparklineSVG(data, w=60, h=20, color='#3b82f6') {
  if(!data.length) return '';
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v,i) => `${(i/(data.length-1||1))*w},${h - ((v-min)/range)*h}`).join(' ');
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ===== STATUS STRIP =====
function updateStatusStrip() {
  const counts = {working:0, idle:0, sleeping:0, error:0};
  const workingNames = [];
  agentData.forEach(a => { counts[a.status] = (counts[a.status]||0) + 1; if(a.status==='working') workingNames.push(a.name); });
  document.getElementById('ss-working').textContent = counts.working;
  document.getElementById('ss-idle').textContent = counts.idle + counts.error;
  document.getElementById('ss-sleeping').textContent = counts.sleeping;
  const namesEl = document.getElementById('ss-working-names');
  if(namesEl) namesEl.textContent = workingNames.length ? '(' + workingNames.join(', ') + ')' : '';
}

function summarizeNowTask(text, status = 'working') {
  const fallback = status === 'working' ? 'Processing current task…' : 'No active task';
  let msg = sanitizeAgentText(text || '');
  if (!msg) return fallback;
  msg = msg
    .replace(/^\s*(heartbeat(?:_ok)?|status)\s*[:\-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!msg) return fallback;
  msg = msg.split(/(?:\.\s+|\n|;\s+)/)[0].trim() || msg;
  if (msg.length > 96) msg = msg.slice(0, 95).trimEnd() + '…';
  return msg;
}

function updateLiveNowBoard() {
  const board = document.getElementById('live-now-board');
  if (!board) return;

  if (!agentData.length) {
    board.innerHTML = `<div style="grid-column:1/-1;padding:8px 10px;border:1px dashed var(--border);border-radius:8px;color:var(--dim);font-size:11px">Waiting for agent status…</div>`;
    return;
  }

  const working = agentData
    .filter(a => a.status === 'working')
    .sort((a, b) => (a.ageMin || 0) - (b.ageMin || 0));

  if (!working.length) {
    board.innerHTML = `<div style="grid-column:1/-1;padding:8px 10px;border:1px dashed var(--border);border-radius:8px;color:var(--dim);font-size:11px">No agents are actively working right now.</div>`;
    return;
  }

  const staleThresholdMin = 15;
  const cards = working.slice(0, 6).map(a => {
    const ageMin = Math.max(0, Number(a.ageMin || 0));
    const isStale = ageMin >= staleThresholdMin;
    const freshnessText = ageMin < 1 ? 'live' : `${Math.round(ageMin)}m`;
    const freshnessColor = isStale ? 'var(--orange)' : ageMin >= 5 ? 'var(--dim)' : 'var(--green)';
    const task = summarizeNowTask(a.lastMessage, a.status);
    const safeName = a.name.replace(/'/g, String.fromCharCode(92) + String.fromCharCode(39));
    const quietBadge = isStale ? `<span style="margin-left:6px;font-size:9px;color:var(--orange);font-weight:700">⚠ quiet</span>` : '';

    return `<div tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" onclick="openAgentDetail('${safeName}')" title="${esc(task)}" style="background:var(--glass);border:1px solid var(--border);border-left:3px solid ${a.color};border-radius:8px;padding:8px 9px;cursor:pointer;transition:transform .12s,border-color .12s" onmouseenter="this.style.transform='translateY(-1px)';this.style.borderColor='${a.color}'" onmouseleave="this.style.transform='';this.style.borderColor='var(--border)'">
      <div style="display:flex;align-items:center;gap:6px;min-width:0">
        <span style="font-size:10px;color:${a.color};font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%">${esc(a.name)}</span>
        <span style="margin-left:auto;font-size:9px;color:${freshnessColor};font-family:'SF Mono',Menlo,monospace">${freshnessText}</span>${quietBadge}
      </div>
      <div style="margin-top:4px;font-size:10px;color:var(--text);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(task)}</div>
    </div>`;
  });

  if (working.length > 6) {
    cards.push(`<div style="display:flex;align-items:center;justify-content:center;padding:8px;border:1px dashed var(--border);border-radius:8px;font-size:10px;color:var(--dim)">+${working.length - 6} more working agents</div>`);
  }

  board.innerHTML = cards.join('');
}

// ===== AGENTS =====
async function refreshAgents() {
  try {
    const r = await fetchWithTimeout(API + '/agents', {}, 8000);
    const d = await r.json();
    if (typeof checkStatusChanges === 'function') {
      try { checkStatusChanges(d.agents); } catch (err) { console.warn('checkStatusChanges failed', err); }
    }
    agentData = d.agents || [];
    window.agentData = agentData;
    
    if (isOfficeTabActive()) {
      if (_officeView === 'grid' && typeof renderGridView === 'function') renderGridView();
      if (_officeView === '2d') {
        if (typeof updateOfficeMap === 'function') updateOfficeMap(agentData);
      }
    }
    apiOnline = true;
    const el = document.getElementById('live-status');
    el.className = 'live online'; el.innerHTML = '<span class="pulse"></span>LIVE';
  } catch (err) {
    console.warn('refreshAgents failed', err);
    apiOnline = false;
    const el = document.getElementById('live-status');
    el.className = 'live offline'; el.innerHTML = '<span class="pulse"></span>OFFLINE';
  }
  updateStatusStrip();
  renderAgentCards();
  updateLiveNowBoard();
}

// ===== AGENT SEARCH & FILTER =====
let _agentSearchQuery = '';
let _agentStatusFilter = 'all';
let _agentTypeFilter = 'all';
let _highlightedAgents = new Set(); // names of agents matching search for canvas highlight
let _agentFilterTimer = null;
window._highlightedAgents = _highlightedAgents;

function filterAgents(query, opts = {}) {
  _agentSearchQuery = (query || '').toLowerCase().trim();
  document.getElementById('agent-search-clear').style.display = _agentSearchQuery ? 'block' : 'none';
  if (opts.immediate) {
    applyAgentFilter();
    return;
  }
  if (_agentFilterTimer) clearTimeout(_agentFilterTimer);
  _agentFilterTimer = setTimeout(() => applyAgentFilter(), 120);
}

function resetAgentFilters() {
  const input = document.getElementById('agent-search-input');
  if (input) input.value = '';
  filterAgents('', { immediate: true });
  setStatusFilter('all');
  setTypeFilter('all');
}

const agentSearchInput = document.getElementById('agent-search-input');
if (agentSearchInput) {
  agentSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      resetAgentFilters();
      agentSearchInput.blur();
    }
  });
}

function setStatusFilter(status) {
  _agentStatusFilter = status;
  document.querySelectorAll('.agent-status-filter').forEach(btn => {
    const isActive = btn.dataset.status === status;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? 'var(--accent)' : 'var(--card)';
    btn.style.color = isActive ? '#fff' : (btn.dataset.status === 'working' ? 'var(--green)' : btn.dataset.status === 'idle' ? 'var(--orange)' : btn.dataset.status === 'sleeping' ? 'var(--dim)' : 'var(--text)');
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  applyAgentFilter();
}

function setTypeFilter(type) {
  _agentTypeFilter = type;
  document.querySelectorAll('.agent-type-filter').forEach(btn => {
    const isActive = btn.dataset.type === type;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? 'var(--purple)' : 'var(--card)';
    btn.style.color = isActive ? '#fff' : (btn.dataset.type === 'core' ? 'var(--accent)' : btn.dataset.type === 'cron' ? 'var(--green)' : btn.dataset.type === 'visitor' ? 'var(--orange)' : 'var(--text)');
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  applyAgentFilter();
}

function updateTypeFilterCounts() {
  const counts = { all: agentData.length || 0, core: 0, cron: 0, visitor: 0 };
  (agentData || []).forEach(a => {
    const type = a.cronJobId ? 'cron' : a.discovered ? 'visitor' : 'core';
    if (counts[type] !== undefined) counts[type]++;
  });
  document.querySelectorAll('.agent-type-filter').forEach(btn => {
    const type = btn.dataset.type || 'all';
    const base = btn.dataset.label || btn.textContent.replace(/\s*\(\d+\)\s*$/, '').trim();
    btn.dataset.label = base;
    const count = counts[type] ?? 0;
    btn.innerHTML = `${base} <span class="filter-count">(${count})</span>`;
  });
}

function applyAgentFilter() {
  const cards = document.querySelectorAll('.agent-card-item');
  const q = _agentSearchQuery;
  let shown = 0;
  _highlightedAgents.clear();

  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    const matchesQuery = !q || text.includes(q);
    // Extract status from the card's icon
    const icon = card.querySelector('span')?.textContent;
    let status = 'sleeping';
    if (icon === '🟢') status = 'working';
    else if (icon === '🟡') status = 'idle';
    else if (icon === '🔴') status = 'error';
    const matchesStatus = _agentStatusFilter === 'all' || status === _agentStatusFilter;
    const type = card.dataset.type || 'core';
    const matchesType = _agentTypeFilter === 'all' || type === _agentTypeFilter;
    const visible = matchesQuery && matchesStatus && matchesType;
    card.style.display = visible ? '' : 'none';
    if (visible) {
      shown++;
      // Extract agent name for canvas highlight
      const nameEl = card.querySelector('span[style*="font-weight:700"]');
      if (nameEl) _highlightedAgents.add(nameEl.textContent);
    }
  });

  const countEl = document.getElementById('agent-search-results-count');
  const emptyEl = document.getElementById('agent-search-empty');
  const filteringActive = q || _agentStatusFilter !== 'all' || _agentTypeFilter !== 'all';
  if (filteringActive) {
    countEl.style.display = 'block';
    countEl.textContent = `Showing ${shown} of ${cards.length} agents`;
  } else {
    countEl.style.display = 'none';
  }

  if (emptyEl) {
    emptyEl.style.display = filteringActive && shown === 0 ? 'block' : 'none';
  }

  if (isOfficeTabActive() && _officeView === '2d') {
    if (filteringActive && shown === 0 && (agentData || []).length) {
      if (typeof setOfficeMapOverlay === 'function') {
        setOfficeMapOverlay('No agents match filters', 'Try clearing search or filters to see the full office.');
      }
    } else if (typeof clearOfficeMapOverlay === 'function') {
      clearOfficeMapOverlay();
    }
  }

  document.querySelectorAll('.team-group').forEach(group => {
    if (!filteringActive) { group.style.display = ''; return; }
    const anyVisible = Array.from(group.querySelectorAll('.agent-card-item')).some(card => card.style.display !== 'none');
    group.style.display = anyVisible ? '' : 'none';
  });

  window._officeHighlightKey = `${_agentSearchQuery}|${_agentStatusFilter}|${_agentTypeFilter}`;
  if (isOfficeTabActive() && _officeView === '2d' && typeof updateOfficeMap === 'function') {
    updateOfficeMap(agentData || []);
  }
}

function buildLegend() {
  const agents = agentData.length ? agentData : [{name:'Loading...',color:'#475569',status:'sleeping',ageMin:0}];
  document.getElementById('office-legend').innerHTML = agents.map(a => {
    const icon = a.status === 'working' ? '🟢' : a.status === 'idle' ? '🟡' : a.status === 'error' ? '🔴' : '💤';
    const age = a.ageMin !== undefined ? (!a.ageMin ? '' : a.ageMin < 1 ? 'now' : a.ageMin < 60 ? a.ageMin + 'm' : Math.round(a.ageMin / 60) + 'h') : '';
    return `<div class="legend-item" onclick="document.querySelector('[data-tab=activity]').click()"><div class="legend-dot" style="background:${a.color}"></div>${icon} ${esc(a.name)}${age ? `<span class="legend-age">${age}</span>` : ''}</div>`;
  }).join('');
}

let activityFilter = 'all';
let activityAgentFilter = '';
let activityCache = [];
let activityEventCache = [];
let lastActivityTs = null;

function setActivityAgentFilter(val) {
  activityAgentFilter = val;
  renderActivityFeed(activityCache);
  renderActivityTimeline24h(activityCache, activityEventCache);
}

let timelineData = null; // cached timeline heatmap for sparklines
let _timelineFilter = null;
let _renderCardsTimer = null;
const MAX_TOASTS = 3;

function isInternalActivityItem(i) {
  const agent = String(i?.agent || '').toLowerCase();
  const text = String(i?.text || '').toLowerCase();
  if (!text) return false;
  if (agent.includes('qa agent') || agent.includes('coding agent')) return true;
  return [
    'heartbeat acknowledged',
    'qa fault',
    'screenshot proof sent',
    'no new commits on either repo',
    'check #',
    'i’m switching from',
    'patches are in',
    "i've identified the root issue",
    'updating state and notifying',
    'report to ',
    'sending screenshot',
    'read memory/state.md'
  ].some(s => text.includes(s));
}

function getPublicActivityItems(items) {
  return (items || []).filter(i => !isInternalActivityItem(i));
}

// showToast is defined once near end of file — this call-site uses the hoisted version

// Activity filter buttons
document.querySelectorAll('.activity-filter[data-filter]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.activity-filter[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activityFilter = btn.dataset.filter;
    renderActivityFeed(activityCache);
  };
});

function renderActivityFeed(items) {
  // Populate agent filter dropdown with unique agents
  const agentNames = [...new Set(items.map(i => i.agent).filter(Boolean))].sort();
  const sel = document.getElementById('activity-agent-filter');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = '<option value="">All Agents</option>' + agentNames.map(n => `<option value="${esc(n)}"${n===prev?' selected':''}>${esc(n)}</option>`).join('');
  }
  // Update filter button counts
  const counts = {all: items.length, wr:0, agent:0, commit:0, system:0};
  items.forEach(i => { if(i.type && counts[i.type] !== undefined) counts[i.type]++; });
  document.querySelectorAll('.activity-filter[data-filter]').forEach(btn => {
    const f = btn.dataset.filter;
    const base = {all:'All', wr:'📋 WR', agent:'🤖 Agent', commit:'💾 Commit', system:'⚙️ System'}[f] || f;
    const c = counts[f] || 0;
    btn.innerHTML = c > 0 ? `${base} <span style="font-size:9px;opacity:0.7;font-weight:700">${c}</span>` : base;
  });
  const filtered = activityFilter === 'all' ? items : items.filter(i => i.type === activityFilter);
  // Apply agent name filter
  let agentFiltered = activityAgentFilter ? filtered.filter(i => i.agent === activityAgentFilter) : filtered;
  // Apply timeline click filter if active
  let timeFiltered = agentFiltered;
  if (_timelineFilter) {
    const tf = _timelineFilter;
    timeFiltered = filtered.filter(i => {
      if (!i.ts) return false;
      const t = new Date(i.ts).getTime();
      const nameMatch = !tf.agentName || (i.agent||'').toLowerCase().includes(tf.agentName.toLowerCase());
      const timeMatch = t >= tf.start.getTime() && t < tf.end.getTime();
      return timeMatch && nameMatch;
    });
  }
  if(!timeFiltered.length) {
    const filterNote = _timelineFilter ? ` for ${_timelineFilter.agentName} at ${_timelineFilter.label}` : '';
    const emptyIcons = { wr:'📋', agent:'🤖', commit:'💾', system:'⚙️', all:'📡' };
    const emptyHints = { wr:'Work requests will appear here as agents pick up tasks.', agent:'Agent messages and status updates will stream here.', commit:'Git commits from coding agents will show here.', system:'System events like restarts and alerts will appear here.', all:'Activity will appear here as agents start working.' };
    const ek = activityFilter || 'all';
    document.getElementById('activity-feed').innerHTML = '<h3>📡 Agent Activity Feed</h3><div style="text-align:center;padding:48px 16px;color:var(--dim)"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">' + (emptyIcons[ek]||'📡') + '</div><div style="font-size:14px;font-weight:600;margin-bottom:6px">No ' + (ek === 'all' ? '' : ek + ' ') + 'activity' + filterNote + '</div><div style="font-size:12px;opacity:0.7">' + (emptyHints[ek]||'') + '</div></div>';
    return;
  }
  const icons = { wr:'📋', agent:'🤖', commit:'💾', system:'⚙️' };
  const colors = { wr:'#3b82f6', agent:'#22c55e', commit:'#a78bfa', system:'#f59e0b' };
  document.getElementById('activity-feed').innerHTML = '<h3>📡 Agent Activity Feed' + (_timelineFilter ? ` <span style="font-size:10px;color:var(--dim)">(filtered)</span>` : '') + '</h3><div class="feed-scroll">' +
    timeFiltered.map((i, idx) => {
      const ago = i.ts ? timeAgo(new Date(i.ts)) : '';
      const icon = icons[i.type] || '📌';
      const typeLabel = i.type ? `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:${colors[i.type]||'#475569'}22;color:${colors[i.type]||'#64748b'};font-weight:600;text-transform:uppercase;margin-left:6px">${i.type}</span>` : '';
      return `<div class="feed-item" style="animation-delay:${idx*40}ms"><span style="font-size:14px;flex-shrink:0">${icon}</span><div><span class="feed-agent">${esc(i.agent||'system')}</span>${typeLabel}<br><span style="color:var(--dim)">${esc(i.text||'')}</span></div><span class="feed-time">${ago}</span></div>`;
    }).join('') + '</div>';
}

function normalizeEventTs(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    if (raw > 1e12) return raw; // ms
    if (raw > 1e9) return raw * 1000; // seconds
    return null;
  }
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function renderActivityTimeline24h(activityItems = [], agentEvents = []) {
  const body = document.getElementById('activity-timeline-24h-body');
  const meta = document.getElementById('activity-timeline-24h-meta');
  if (!body || !meta) return;

  const now = Date.now();
  const cutoff = now - 24 * 3600000;
  const typeColors = { wr:'#3b82f6', agent:'#22c55e', commit:'#a78bfa', system:'#f59e0b' };

  const merged = [];
  (activityItems || []).forEach(i => {
    const ts = normalizeEventTs(i.ts);
    if (!ts || ts < cutoff) return;
    const agent = String(i.agent || 'system').trim() || 'system';
    const text = String(i.text || '').trim();
    if (!text) return;
    merged.push({ ts, agent, text, type: i.type || 'agent', source: 'activity' });
  });

  (agentEvents || []).forEach(e => {
    const ts = normalizeEventTs(e.ts);
    if (!ts || ts < cutoff) return;
    const agent = String(e.agent || 'system').trim() || 'system';
    const detail = String(e.detail || '').trim();
    const evt = String(e.event || 'event').trim();
    const text = detail ? `${evt}: ${detail}` : evt;
    merged.push({ ts, agent, text, type: 'system', source: 'eventdb' });
  });

  const dedup = new Map();
  merged.sort((a, b) => b.ts - a.ts);
  for (const e of merged) {
    const key = `${e.agent.toLowerCase()}|${e.text.slice(0,90).toLowerCase()}|${Math.floor(e.ts / 60000)}`;
    if (!dedup.has(key)) dedup.set(key, e);
  }
  let rows = Array.from(dedup.values());

  if (activityAgentFilter) rows = rows.filter(r => r.agent === activityAgentFilter);

  const groups = {};
  rows.forEach(r => {
    if (!groups[r.agent]) groups[r.agent] = [];
    if (groups[r.agent].length < 8) groups[r.agent].push(r);
  });

  const agentNames = Object.keys(groups).sort((a, b) => {
    const ta = groups[a][0]?.ts || 0;
    const tb = groups[b][0]?.ts || 0;
    return tb - ta;
  });

  meta.textContent = `${rows.length} events · ${agentNames.length} agents`;

  if (!agentNames.length) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim)">No timeline events in last 24h.</div>';
    return;
  }

  body.innerHTML = agentNames.map(name => {
    const entries = groups[name];
    const lastTs = entries[0]?.ts;
    const lastAgo = lastTs ? timeAgo(new Date(lastTs)) : '';
    const itemsHtml = entries.map(e => {
      const ago = timeAgo(new Date(e.ts));
      const color = typeColors[e.type] || '#64748b';
      const stamp = new Date(e.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      return `<div class="activity-timeline-entry"><span class="dot" style="background:${color}"></span><div class="txt">${esc(e.text)}</div><span class="when" title="${stamp}">${ago}</span></div>`;
    }).join('');
    return `<div class="activity-timeline-agent"><div class="head"><span class="name">${esc(name)}</span><span class="ago">${lastAgo}</span></div><div class="entries">${itemsHtml}</div></div>`;
  }).join('');
}

// ===== ACTIVITY FEED =====
async function refreshActivity() {
  try {
    const r = await fetchWithTimeout(API+'/activity', {}, 10000);
    const d = await r.json();
    const items = d.activity || [];
    activityCache = items;

    let agentEvents = [];
    try {
      const er = await fetchWithTimeout(API + '/agent-events', {}, 8000);
      const ed = await er.json();
      agentEvents = ed.events || [];
    } catch {}
    activityEventCache = agentEvents;

    // Toast for new activity items
    const typeIcons = { wr:'📋', agent:'🤖', commit:'💾', system:'⚙️' };
    const typeColors = { wr:'#3b82f6', agent:'#22c55e', commit:'#a78bfa', system:'#f59e0b' };
    if(lastActivityTs && items.length) {
      const newItems = getPublicActivityItems(items.filter(i => i.ts && new Date(i.ts).getTime() > lastActivityTs));
      newItems.slice(0,2).forEach(i => {
        showToast(typeIcons[i.type]||'📌', `<strong>${i.agent||'system'}</strong> ${(i.text||'').slice(0,60)}`, typeColors[i.type]);
      });
    }
    if(items.length && items[0].ts) lastActivityTs = new Date(items[0].ts).getTime();
    if(!items.length) {
      document.getElementById('activity-feed').innerHTML = '<h3>Agent Activity Feed</h3><div style="text-align:center;padding:48px 16px;color:var(--dim)"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">📡</div><div style="font-size:14px;font-weight:600;margin-bottom:6px">No recent activity</div><div style="font-size:12px;opacity:0.7">Activity will appear here as agents start working.</div></div>';
      renderActivityTimeline24h([], agentEvents);
      return;
    }
    const colors = { wr:'#3b82f6', agent:'#22c55e', commit:'#a78bfa', system:'#f59e0b' };
    // Update activity badge
    const actBtn = document.querySelector('[data-tab="activity"]');
    const recentCount = items.filter(i => i.ts && (Date.now() - new Date(i.ts).getTime()) < 3600000).length;
    actBtn.innerHTML = recentCount > 0 ? `📡 Activity <span class="badge" style="background:var(--accent)">${recentCount}</span>` : '📡 Activity';

    // Update office ticker with latest user-relevant item (filter internal agent chatter)
    const latest = getPublicActivityItems(items)[0];
    if(latest) {
      document.getElementById('office-ticker-text').innerHTML = `<span style="color:${colors[latest.type]||'var(--dim)'};font-weight:600">${esc(latest.agent||'system')}</span> <span style="color:var(--text)">${esc((latest.text||'').slice(0,80))}</span>`;
      document.getElementById('office-ticker-time').textContent = latest.ts ? timeAgo(new Date(latest.ts)) : '';
    }
    renderActivityFeed(items);
    renderActivityTimeline24h(items, agentEvents);
    // Update 3D activity overlay
    const overlay = document.getElementById('activity-overlay');
    if (overlay && items.length) {
      const top3 = items.slice(0, 3);
      overlay.innerHTML = top3.map(it => `<div style="background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);padding:4px 10px;border-radius:6px;font-size:11px;color:#e2e8f0;border-left:3px solid ${colors[it.type]||'#64748b'}"><span style="color:${colors[it.type]||'#94a3b8'};font-weight:600">${esc(it.agent||'system')}</span> ${esc((it.text||'').slice(0,60))} <span style="color:#64748b;font-size:10px">${it.ts ? timeAgo(new Date(it.ts)) : ''}</span></div>`).join('');
// ===== HEATMAP CALENDAR (extracted to tab-heatmap.js) =====
    }
  } catch {}
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if(s < 60) return 'just now';
  if(s < 3600) return Math.floor(s/60) + 'm ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// ===== WR FORM & WORKLOAD =====
function toggleWrForm() {
  const body = document.getElementById('wr-form-body');
  const toggle = document.getElementById('wr-form-toggle');
  const show = body.style.display === 'none';
  body.style.display = show ? 'block' : 'none';
  toggle.style.transform = show ? 'rotate(180deg)' : '';
  if (show) populateOwnerDropdown();
}
function populateOwnerDropdown() {
  const sel = document.getElementById('wr-owner');
  if (!sel || sel.options.length > 1) return;
  agentData.forEach(a => { const o = document.createElement('option'); o.value = a.name; o.textContent = a.name + ' (' + a.role + ')'; sel.appendChild(o); });
}
async function submitWr() {
  const title = document.getElementById('wr-title').value.trim();
  const msg = document.getElementById('wr-form-msg');
  if (!title) { msg.style.display = 'block'; msg.style.background = 'var(--red-dim)'; msg.style.color = 'var(--red)'; msg.textContent = 'Title is required'; setTimeout(() => msg.style.display = 'none', 3000); return; }
  const btn = document.getElementById('wr-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating...';
  try {
    const _postHeaders = { 'Content-Type': 'application/json' };
    if (_authToken) _postHeaders['X-API-Key'] = _authToken;
    const r = await fetch(API + '/queue', {
      method: 'POST', headers: _postHeaders,
      body: JSON.stringify({
        title,
        type: document.getElementById('wr-type').value,
        priority: document.getElementById('wr-priority').value,
        owner: document.getElementById('wr-owner').value,
        description: document.getElementById('wr-desc').value.trim()
      })
    });
    const d = await r.json();
    if (d.ok) {
      msg.style.display = 'block'; msg.style.background = 'var(--green-dim)'; msg.style.color = 'var(--green)'; msg.textContent = '✅ Created: ' + d.file;
      document.getElementById('wr-title').value = '';
      document.getElementById('wr-desc').value = '';
      showToast('📋', 'var(--green)', 'WR created: ' + title, '✅');
      setTimeout(() => { msg.style.display = 'none'; refreshQueue(); }, 1500);
    } else { throw new Error(d.error || 'Unknown error'); }
  } catch (e) {
    msg.style.display = 'block'; msg.style.background = 'var(--red-dim)'; msg.style.color = 'var(--red)'; msg.textContent = '❌ ' + e.message;
    setTimeout(() => msg.style.display = 'none', 4000);
  } finally { btn.disabled = false; btn.textContent = 'Create WR'; }
}
// ===== QUEUE ===== (extracted to tab-queue.js)
// ===== MEMORY ===== (extracted to tab-memory.js)
// ===== TOKENS + DAILY COST ===== (extracted to tab-tokens.js)
// ===== SYSTEM ===== (extracted to tab-system.js)
// Init
function setFavicon(emoji) {
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`;
}

function updateTabTitle() {
  const working = agentData.filter(a => a.status === 'working').length;
  const idle = agentData.filter(a => a.status === 'idle').length;
  const activeWRs = document.getElementById('qs-wrs')?.textContent || '0';
  if (working > 0) {
    document.title = `🟢 ${working} active | MC HQ`;
    setFavicon('🟢');
  } else if (parseInt(activeWRs) > 0) {
    document.title = `📋 ${activeWRs} WRs | MC HQ`;
    setFavicon('📋');
  } else if (idle > 0) {
    document.title = `🟡 Agent Space`;
    setFavicon('🟡');
  } else {
    document.title = `💤 Agent Space`;
    setFavicon('💤');
  }
}

function fmtUptime(sec) {
  if(sec < 60) return Math.floor(sec) + 's';
  if(sec < 3600) return Math.floor(sec/60) + 'm ' + Math.floor(sec%60) + 's';
  if(sec < 86400) return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm';
  return Math.floor(sec/86400) + 'd ' + Math.floor((sec%86400)/3600) + 'h';
}
function markUpdated() {
  const el = document.getElementById('ss-updated');
  el.textContent = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  el.style.animation = 'refreshBlink 0.4s ease';
  setTimeout(() => el.style.animation = '', 400);
  updateTabTitle();
  refreshUptime();
}

// Refresh progress bar
const refreshBar = document.getElementById('refresh-bar');
let refreshCycle = 0;
const REFRESH_INTERVAL = 8000;
function tickRefreshBar() {
  if(autoRefreshPaused) { document.getElementById('ss-next').textContent = 'paused'; return; }
  if(document.hidden) return; // skip cosmetic tick when tab hidden
  refreshCycle += 500;
  const pct = Math.min((refreshCycle / REFRESH_INTERVAL) * 100, 100);
  refreshBar.style.width = pct + '%';
  const remaining = Math.max(0, Math.ceil((REFRESH_INTERVAL - refreshCycle) / 1000));
  document.getElementById('ss-next').textContent = remaining + 's';
  if (refreshCycle >= REFRESH_INTERVAL) {
    refreshBar.classList.add('reset');
    refreshBar.style.width = '0%';
    requestAnimationFrame(() => { refreshBar.classList.remove('reset'); });
    refreshCycle = 0;
  }
}
setInterval(tickRefreshBar, 500);

// ===== TIMELINE CLICK FILTER =====
function filterByTimeSlot(agentName, startISO, endISO, label, color) {
  _timelineFilter = { agentName, start: new Date(startISO), end: new Date(endISO), label, color };
  const bar = document.getElementById('timeline-filter-bar');
  document.getElementById('timeline-filter-label').innerHTML = `<b style="color:${color}">${esc(agentName)}</b> at ${esc(label)}`;
  bar.classList.add('visible');
  // Filter activity feed
  if (activityCache.length) renderActivityFeed(activityCache);
  // Switch to Office tab to see results
  const actTab = document.querySelector('nav button[data-tab="office"]');
  if (actTab) actTab.click();
}
function clearTimelineFilter() {
  _timelineFilter = null;
  document.getElementById('timeline-filter-bar').classList.remove('visible');
  if (activityCache.length) renderActivityFeed(activityCache);
}

// ===== HEALTH ALERTS + BROWSER NOTIFICATIONS + FAVICON (extracted to alerts.js) =====

// ===== CONSOLIDATED POLLING (single 5s tick, counters gate each task) =====
let _pollTick = 0;
setInterval(() => {
  _pollTick++;
  if (autoRefreshPaused || document.hidden) return;
  // 5s — alerts + tab title (every tick)
  refreshAlerts(); updateTabTitle();
  // 10s — SSE fallback (agents/system/activity)
  if (_pollTick % 2 === 0 && !_sseConnected) {
    refreshAgents().then(()=>{buildLegend();scheduleRenderAgentCards();});
    refreshSystem(); refreshHealthScore(); refreshActivity(); markUpdated();
  }
  // 15s — live logs
  if (_pollTick % 3 === 0) refreshLiveLogs();
  // 20s — queue
  if (_pollTick % 4 === 0) refreshQueue();
  // 45s (~every 9 ticks) — memory, tokens, cost
  if (_pollTick % 9 === 0) { refreshMemory(); refreshTokens(); refreshDailyCost(); }
  // 60s — timeline, completion stats, perf alerts
  if (_pollTick % 12 === 0) { refreshTimeline(); refreshCompletionStats(); fetchPerfForAlerts(); }
  // 120s — uptime, dep graph
  if (_pollTick % 24 === 0) { refreshUptime(); refreshDepGraph(); }
  // 30s — re-render cached timestamps
  if (_pollTick % 6 === 0) {
    if(activityCache.length) renderActivityFeed(activityCache);
    if(_notifications.length) renderNotifCenter();
  }
}, 5000);

// ===== AGENT DETAIL PANEL ===== (extracted to agent-detail.js)
(function() {
  // Inject HTML
  const overlay = document.createElement('div');
  overlay.className = 'cmd-palette-overlay';
  overlay.id = 'cmd-palette-overlay';
  overlay.innerHTML = `<div class="cmd-palette"><input id="cmd-input" type="text" placeholder="Search agents, tabs, actions…" autocomplete="off" spellcheck="false"><div class="cmd-results" id="cmd-results"></div><div class="cmd-footer"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> select</span><span><kbd>esc</kbd> close</span></div></div>`;
  document.body.appendChild(overlay);

  const input = document.getElementById('cmd-input');
  const results = document.getElementById('cmd-results');
  let activeIdx = 0;
  let items = [];

  function getCommands(q) {
    const cmds = [];
    // Tabs
    const tabs = [
      { icon:'🏢', label:'Office View', action:()=>document.querySelector('[data-tab="office"]')?.click(), hint:'tab' },
      { icon:'📡', label:'Activity Feed', action:()=>document.querySelector('[data-tab="activity"]')?.click(), hint:'tab' },
      { icon:'📋', label:'Queue / WRs', action:()=>document.querySelector('[data-tab="queue"]')?.click(), hint:'tab' },
      { icon:'🧠', label:'Memory', action:()=>document.querySelector('[data-tab="memory"]')?.click(), hint:'tab' },
      { icon:'💰', label:'Tokens & Cost', action:()=>document.querySelector('[data-tab="tokens"]')?.click(), hint:'tab' },
      { icon:'📊', label:'Performance', action:()=>document.querySelector('[data-tab="performance"]')?.click(), hint:'tab' },
      { icon:'🔗', label:'Comm Graph', action:()=>document.querySelector('[data-tab="comm-graph"]')?.click(), hint:'tab' },
      { icon:'🌳', label:'Dependencies', action:()=>document.querySelector('[data-tab="dep-graph"]')?.click(), hint:'tab' },
      { icon:'⚙️', label:'System', action:()=>document.querySelector('[data-tab="system"]')?.click(), hint:'tab' },
    ];
    cmds.push(...tabs);

    // Agents
    if (typeof agentData !== 'undefined' && agentData.length) {
      agentData.forEach(a => {
        const statusIcon = a.status === 'working' ? '🟢' : a.status === 'idle' ? '🟡' : '💤';
        cmds.push({
          icon: statusIcon,
          label: a.name,
          sub: a.role,
          action: () => { if (typeof openAgentDetail === 'function') openAgentDetail(a.sessionDir || a.name.toLowerCase().replace(/\s+/g,'-')); },
          hint: 'agent'
        });
        if (a.cronJobId && a.status !== 'working') {
          cmds.push({
            icon: '⚡',
            label: `Wake ${a.name}`,
            sub: 'trigger cron',
            action: () => { if (typeof wakeAgent === 'function') wakeAgent(a.cronJobId, a.name, a.color); closePalette(); },
            hint: 'action'
          });
        }
      });
    }

    // Actions
    cmds.push(
      { icon:'🔄', label:'Refresh All', action:()=>{ if(typeof refreshAll==='function') refreshAll(); else location.reload(); }, hint:'action' },
      { icon:'🔊', label:'Toggle Ambient Sound', action:()=>{ if(typeof toggleAmbientSound==='function') toggleAmbientSound(); }, hint:'action' },
      { icon:'🔔', label:'Toggle Notification Sounds', action:()=>{ if(typeof toggleNotifSounds==='function') toggleNotifSounds(); }, hint:'action' },
      { icon:'📬', label:'Notification Center', action:()=>{ if(typeof toggleNotifCenter==='function') toggleNotifCenter(); }, hint:'action' },
      { icon:'🌓', label:'Toggle Theme', action:()=>{ toggleTheme(); }, hint:'action' },
    );

    if (!q) return cmds;
    const lower = q.toLowerCase();
    return cmds.filter(c => c.label.toLowerCase().includes(lower) || (c.sub||'').toLowerCase().includes(lower) || (c.hint||'').includes(lower));
  }

  function render() {
    const q = input.value.trim();
    items = getCommands(q);
    if (activeIdx >= items.length) activeIdx = Math.max(0, items.length - 1);
    results.innerHTML = items.length ? items.map((c, i) =>
      `<div class="cmd-item${i===activeIdx?' active':''}" data-idx="${i}"><span class="icon">${c.icon}</span><span class="label">${c.label}</span>${c.sub?`<span class="sub">${c.sub}</span>`:''}<span class="hint">${c.hint||''}</span></div>`
    ).join('') : '<div style="padding:20px;text-align:center;color:var(--dim);font-size:12px">No results</div>';
  }

  function openPalette() {
    overlay.classList.add('visible');
    input.value = '';
    activeIdx = 0;
    render();
    input.focus();
  }

  function closePalette() {
    overlay.classList.remove('visible');
  }

  function selectItem() {
    if (items[activeIdx]) { items[activeIdx].action(); closePalette(); }
  }

  input.addEventListener('input', () => { activeIdx = 0; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); render(); results.children[activeIdx]?.scrollIntoView({block:'nearest'}); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); render(); results.children[activeIdx]?.scrollIntoView({block:'nearest'}); }
    else if (e.key === 'Enter') { e.preventDefault(); selectItem(); }
    else if (e.key === 'Escape') { closePalette(); }
  });
  results.addEventListener('click', e => {
    const item = e.target.closest('.cmd-item');
    if (item) { activeIdx = +item.dataset.idx; selectItem(); }
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closePalette(); });

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.classList.contains('visible') ? closePalette() : openPalette();
    }
    if (e.key === 'Escape' && overlay.classList.contains('visible')) closePalette();
  });
})();

// ===== LIVE LOGS (extracted to live-logs.js) =====
function getTeamGroups() {
  const groups = {};
  const teamMap = {
    ceo: '🏢 Leadership', director: '🏢 Leadership',
    writer: '🎨 Content Team', designer: '🎨 Content Team', producer: '🎨 Content Team', publisher: '🎨 Content Team',
    dev: '💻 Engineering',
    mail: '📬 Support', qa: '📬 Support',
  };
  for (const a of agentData) {
    const r = (a.role || '').toLowerCase();
    let cat = 'default';
    if (r.includes('ceo') || r.includes('mc') || r.includes('owner')) cat = 'ceo';
    else if (r.includes('director') || r.includes('lead')) cat = 'director';
    else if (r.includes('write') || r.includes('content') || r.includes('research')) cat = 'writer';
    else if (r.includes('design') || r.includes('art')) cat = 'designer';
    else if (r.includes('produce') || r.includes('video') || r.includes('media')) cat = 'producer';
    else if (r.includes('publish') || r.includes('deploy') || r.includes('social')) cat = 'publisher';
    else if (r.includes('code') || r.includes('dev') || r.includes('engineer')) cat = 'dev';
    else if (r.includes('mail') || r.includes('email')) cat = 'mail';
    else if (r.includes('qa') || r.includes('test') || r.includes('quality')) cat = 'qa';
    const team = teamMap[cat] || '🔮 Other Agents';
    if (!groups[team]) groups[team] = [];
    groups[team].push(a);
  }
  return groups;
}

function scheduleRenderAgentCards() { if (_renderCardsTimer) return; _renderCardsTimer = setTimeout(() => { _renderCardsTimer = null; renderAgentCards(); }, 200); }
function renderAgentCards() {
  const container = document.getElementById('agent-status-cards');
  if (!container) return;

  updateTypeFilterCounts();
  if (!agentData.length) return;

  // Group agents by team — fully dynamic from role, no hardcoded names
  const grouped = getTeamGroups();

  // Collapsed state persisted in localStorage
  const collapsed = JSON.parse(localStorage.getItem('hq-collapsed-teams') || '{}');

  let html = '';
  for (const [team, agents] of Object.entries(grouped)) {
    const working = agents.filter(a => a.status === 'working').length;
    const total = agents.length;
    const isCollapsed = collapsed[team] === true;
    const teamId = team.replace(/[^a-zA-Z]/g,'');
    html += `<div class="team-group" style="grid-column:1/-1;margin:4px 0 0">
      <div class="team-group-header" onclick="toggleTeamGroup('${teamId}','${team.replace(/'/g,'\\\'')}')" style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;border-radius:6px;transition:background .15s;font-size:11px;color:var(--dim);user-select:none" onmouseenter="this.style.background='rgba(255,255,255,0.03)'" onmouseleave="this.style.background=''">
        <span style="font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(${isCollapsed?'-90':'0'}deg)" id="team-arrow-${teamId}">▼</span>
        <span style="font-weight:700;font-size:12px;color:var(--text)">${team}</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:${working>0?'var(--green-dim)':'rgba(100,100,100,0.1)'};color:${working>0?'var(--green)':'var(--dim)'};font-weight:600">${working}/${total} active</span>
      </div>
      <div id="team-body-${teamId}" style="display:${isCollapsed?'none':'grid'};grid-template-columns:repeat(2,1fr);gap:8px;margin-top:4px">`;
    html += agents.map(a => {
    const moodEmoji = a.mood === 'happy' ? '😊' : a.mood === 'stressed' ? '😰' : a.mood === 'tired' ? '😴' : '';
    const icon = a.status === 'working' ? '🟢' : a.status === 'idle' ? '🟡' : a.status === 'error' ? '🔴' : '💤';
    const age = !a.ageMin ? '' : a.ageMin < 1 ? 'just now' : a.ageMin < 60 ? a.ageMin + 'm ago' : Math.round(a.ageMin / 60) + 'h ago';
    // Elapsed status timer data
    const sinceTs = a.lastActivity || (Date.now() - (a.ageMin||0)*60000);
    const statusVerb = a.status === 'working' ? 'Working' : a.status === 'idle' ? 'Idle' : a.status === 'error' ? 'Error' : 'Sleeping';
    const statusTimerColor = a.status === 'working' ? 'var(--green)' : a.status === 'idle' ? 'var(--orange)' : a.status === 'error' ? 'var(--red)' : 'var(--dim)';
    const hasMsg = a.lastMessage && a.lastMessage !== 'ANNOUNCE_SKIP' && a.lastMessage !== 'NO_REPLY' && a.lastMessage.length >= 5;
    const msg = hasMsg
      ? a.lastMessage.slice(0, 120) + (a.lastMessage.length > 120 ? '…' : '')
      : (a.status === 'working'
        ? '<span style="color:var(--green);font-style:italic">Active — processing...</span>'
        : a.status === 'error'
          ? '<span style="color:var(--red);font-style:italic">Error state detected — needs attention</span>'
          : '<span style="color:var(--dim);font-style:italic">No recent activity</span>');
    const borderL = a.status === 'working' ? a.color : a.status === 'idle' ? 'var(--orange)' : a.status === 'error' ? 'var(--red)' : 'transparent';
    const cronInfo = a.cronStatus ? `<span style="font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(255,255,255,0.05);color:var(--dim);margin-left:4px">${a.cronStatus}</span>` : '';
    const durInfo = a.durationMs ? `<span style="font-size:9px;color:var(--dim);margin-left:4px" title="Last run duration">⏱${(a.durationMs/1000).toFixed(0)}s</span>` : '';
    const type = a.cronJobId ? 'cron' : a.discovered ? 'visitor' : 'core';
    // Live countdown for cron agents
    const nextRunHtml = a.nextRunAtMs ? (() => {
      const d = a.nextRunAtMs - Date.now();
      if (d <= 0) return '<div style="font-size:9px;color:var(--green);margin-top:3px;font-weight:600">⚡ Running now or imminent</div>';
      const sec = Math.ceil(d / 1000);
      const mm = Math.floor(sec / 60);
      const ss = sec % 60;
      return `<div style="font-size:9px;color:var(--dim);margin-top:3px;display:flex;align-items:center;gap:4px"><span>Next run:</span><span class="next-run-countdown" data-next="${a.nextRunAtMs}" style="font-family:'SF Mono',Menlo,monospace;font-weight:600;color:var(--accent)">${mm}:${String(ss).padStart(2,'0')}</span></div>`;
    })() : '';
    // Activity bar for working agents
    const activityBar = a.status === 'working' ? `<div style="margin-top:4px;height:2px;border-radius:1px;background:var(--border);overflow:hidden"><div style="height:100%;width:60%;background:${a.color};border-radius:1px;animation:activityPulse 1.5s ease-in-out infinite"></div></div>` : '';
    // Activity sparkline + uptime badge from timeline heatmap data
    let sparkHtml = '';
    let uptimeBadge = '';
    if (timelineData && timelineData.agents) {
      const ta = timelineData.agents.find(t => t.name === a.name);
      if (ta) {
        const activeSlots = ta.slots.filter(s => s > 0).length;
        const totalSlots = ta.slots.length;
        const uptimePct = Math.round((activeSlots / totalSlots) * 100);
        const uptimeColor = uptimePct >= 50 ? 'var(--green)' : uptimePct >= 20 ? 'var(--orange)' : 'var(--dim)';
        const uptimeBg = uptimePct >= 50 ? 'var(--green-dim)' : uptimePct >= 20 ? 'var(--orange-dim)' : 'rgba(100,100,100,0.1)';
        uptimeBadge = `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:${uptimeBg};color:${uptimeColor};font-weight:700;margin-left:4px;font-variant-numeric:tabular-nums" title="Active ${activeSlots}/${totalSlots} slots (last 6h)">${uptimePct}% ⬆</span>`;
        if (ta.slots.some(s => s > 0)) {
          sparkHtml = `<div style="margin-top:5px;display:flex;gap:1px;align-items:end;height:12px" title="Activity last 6h (15-min buckets)">${ta.slots.map(s => `<div style="flex:1;height:${s > 0 ? '100%' : '2px'};background:${s > 0 ? a.color : 'var(--border)'};border-radius:1px;opacity:${s > 0 ? '0.7' : '0.3'};transition:height .3s"></div>`).join('')}</div>`;
        }
      }
    }
    return `<div class="agent-card-item" data-type="${type}" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" style="background:var(--card);border:1px solid var(--border);border-left:3px solid ${borderL};border-radius:10px;padding:12px 14px;font-size:11px;transition:border-color .2s,background .2s,transform .15s;cursor:pointer" onclick="openAgentDetail('${a.name.replace(/'/g,String.fromCharCode(92)+String.fromCharCode(39))}')" onmouseenter="this.style.borderColor='${a.color}';this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseleave="this.style.borderColor='var(--border)';this.style.borderLeftColor='${borderL}';this.style.transform='';this.style.boxShadow=''">
      <div class="agent-card-head" style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div class="agent-card-avatar-wrap" style="position:relative;flex-shrink:0">
          <img class="agent-card-avatar" src="https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(a.name)}&backgroundColor=transparent" alt="${a.name}" style="width:40px;height:40px;border-radius:50%;border:2px solid ${a.status === 'working' ? a.color : a.status === 'idle' ? 'var(--orange)' : a.status === 'error' ? 'var(--red)' : 'var(--border)'};background:rgba(255,255,255,0.05)" loading="lazy" onerror="this.style.display='none'">
          <span class="agent-card-status-icon" style="position:absolute;bottom:-1px;right:-1px;font-size:11px;line-height:1">${icon}</span>
        </div>
        <div class="agent-card-main" style="flex:1;min-width:0">
          <div class="agent-card-title-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="agent-card-name" style="font-weight:700;font-size:13px;color:${a.color}">${a.name}</span>${moodEmoji ? `<span class="agent-card-mood" style="font-size:11px" title="Mood: ${a.mood}">${moodEmoji}</span>` : ''}${uptimeBadge}${cronInfo}${durInfo}
            ${a.cronJobId && a.status !== 'working' ? `<button class="agent-card-wake" onclick="event.stopPropagation();wakeAgentCard(this,'${a.cronJobId}','${a.name.replace(/'/g,String.fromCharCode(92)+String.fromCharCode(39))}')" style="background:var(--green-dim,rgba(34,197,94,0.15));border:1px solid var(--green,#22c55e);color:var(--green,#22c55e);padding:1px 8px;border-radius:6px;cursor:pointer;font-size:9px;font-weight:700;font-family:inherit;margin-left:4px;transition:all .15s;white-space:nowrap" onmouseenter="this.style.background='var(--green,#22c55e)';this.style.color='#fff'" onmouseleave="this.style.background='var(--green-dim,rgba(34,197,94,0.15))';this.style.color='var(--green,#22c55e)'" title="Wake agent now">⚡</button>` : ''}
          </div>
          <div class="agent-card-subrow" style="display:flex;align-items:center;gap:4px;margin-top:2px">
            <span class="status-timer" data-since="${sinceTs}" data-verb="${statusVerb}" style="color:${statusTimerColor};font-size:10px;font-family:'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums">${statusVerb} ${age}</span>
          </div>
        </div>
      </div>
      <div class="agent-card-message" style="color:var(--text);line-height:1.4;font-size:11px;padding-left:50px">${msg}</div>${nextRunHtml ? `<div class="agent-card-next-run" style="padding-left:50px">${nextRunHtml}</div>` : ''}${sparkHtml ? `<div class="agent-card-spark" style="padding-left:50px">${sparkHtml}</div>` : ''}<div class="agent-card-activity-bar">${activityBar}</div>
    </div>`;
  }).join('');
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

function toggleTeamGroup(teamId, teamName) {
  const body = document.getElementById('team-body-' + teamId);
  const arrow = document.getElementById('team-arrow-' + teamId);
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'grid' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
  const collapsed = JSON.parse(localStorage.getItem('hq-collapsed-teams') || '{}');
  collapsed[teamName] = !isHidden;
  localStorage.setItem('hq-collapsed-teams', JSON.stringify(collapsed));
}

function collapseAllTeams() {
  const grouped = getTeamGroups();
  const collapsed = {};
  Object.keys(grouped).forEach(team => { collapsed[team] = true; });
  localStorage.setItem('hq-collapsed-teams', JSON.stringify(collapsed));
  renderAgentCards();
  showToast('📂', 'Collapsed all teams', '#64748b');
}

function expandAllTeams() {
  localStorage.setItem('hq-collapsed-teams', JSON.stringify({}));
  renderAgentCards();
  showToast('📂', 'Expanded all teams', '#22c55e');
}

window.addEventListener('load', () => {
  setTimeout(() => {
    refreshActivity();
    refreshTimeline();
    refreshUptime();
  }, 250);
  setTimeout(() => {
    refreshActivity();
    refreshTimeline();
  }, 2500);
});

// Live elapsed status timers + cron countdown (combined 1s interval)
setInterval(() => {
  if (document.hidden) return; // skip when tab not visible
  document.querySelectorAll('.status-timer').forEach(el => {
    const since = parseInt(el.dataset.since);
    const verb = el.dataset.verb || '';
    if (!since) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - since) / 1000));
    let label;
    if (elapsed < 60) label = elapsed + 's';
    else if (elapsed < 3600) label = Math.floor(elapsed/60) + 'm ' + (elapsed%60) + 's';
    else if (elapsed < 86400) label = Math.floor(elapsed/3600) + 'h ' + Math.floor((elapsed%3600)/60) + 'm';
    else label = Math.floor(elapsed/86400) + 'd ' + Math.floor((elapsed%86400)/3600) + 'h';
    el.textContent = verb + ' ' + label;
  });
  document.querySelectorAll('.next-run-countdown').forEach(el => {
    const next = parseInt(el.dataset.next);
    if (!next) return;
    const d = next - Date.now();
    if (d <= 0) { el.textContent = 'now!'; el.style.color = 'var(--green)'; return; }
    const sec = Math.ceil(d / 1000);
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    el.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
  });
}, 1000);

// Initial bootstrap — load data immediately on first paint
setTimeout(() => {
  if (typeof refreshAll === 'function') refreshAll();
  if (typeof initOfficeMap === 'function') initOfficeMap();
}, 300);

// === PLAN TAB ===
function escHtml(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parsePlanMarkdown(markdown) {
  const lines = String(markdown || '').split('\n');
  const projects = [];
  let currentProject = null;
  let currentPhase = null;
  const agentStatusTable = [];
  let inAgentStatus = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const projectMatch = line.match(/^##\s+Project\s+\d+\s*:\s*(.+)$/i);
    if (projectMatch) {
      currentProject = {
        title: projectMatch[1].trim(),
        phases: [],
        vision: '',
        model: '',
      };
      projects.push(currentProject);
      currentPhase = null;
      inAgentStatus = false;
      continue;
    }

    if (/^###\s+Agent Status/i.test(line)) {
      inAgentStatus = true;
      currentPhase = null;
      continue;
    }

    if (inAgentStatus && line.startsWith('|') && line.endsWith('|')) {
      const cols = line.split('|').slice(1, -1).map(c => c.trim());
      if (cols.length >= 4 && !/^[-]+$/.test(cols[0].replace(/\s/g, ''))) agentStatusTable.push(cols);
      continue;
    }

    const phaseMatch = line.match(/^###\s+(Phase\s+\d+\s*:\s*.+)$/i);
    if (phaseMatch && currentProject) {
      currentPhase = { title: phaseMatch[1].trim(), items: [] };
      currentProject.phases.push(currentPhase);
      continue;
    }

    const visionMatch = line.match(/^\*\*Vision:\*\*\s*(.+)$/i);
    if (visionMatch && currentProject) { currentProject.vision = visionMatch[1].trim(); continue; }
    const modelMatch = line.match(/^\*\*Model:\*\*\s*(.+)$/i);
    if (modelMatch && currentProject) { currentProject.model = modelMatch[1].trim(); continue; }

    const itemMatch = line.match(/^-\s+\[(x| )\]\s+(.+)$/i);
    if (itemMatch && currentPhase) {
      currentPhase.items.push({ done: itemMatch[1].toLowerCase() === 'x', text: itemMatch[2].trim() });
      continue;
    }
  }

  return { projects, agentStatusTable };
}

function phaseHtml(phase, isCurrent) {
  const done = phase.items.filter(i => i.done).length;
  const total = phase.items.length || 1;
  const pct = Math.round((done / total) * 100);
  const items = phase.items.map(i => `
    <div style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;color:${i.done ? 'var(--text)' : 'var(--dim)'}">
      <span style="font-size:13px;line-height:1.2">${i.done ? '✅' : '⬜'}</span>
      <span style="font-size:12px;line-height:1.45">${escHtml(i.text)}</span>
    </div>`).join('');

  return `
    <div class="card" style="margin-top:8px;border:${isCurrent ? '1px solid rgba(34,197,94,0.55)' : '1px solid var(--border)'};box-shadow:${isCurrent ? '0 0 0 1px rgba(34,197,94,0.2) inset' : 'none'}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <strong style="font-size:13px;color:${isCurrent ? 'var(--green)' : 'var(--text)'}">${escHtml(phase.title)}</strong>
        ${isCurrent ? '<span style="font-size:10px;padding:3px 8px;border-radius:999px;background:rgba(34,197,94,0.16);color:var(--green);font-weight:700">CURRENT</span>' : ''}
      </div>
      <div style="margin-top:6px;font-size:11px;color:var(--dim)">${done}/${phase.items.length} done (${pct}%)</div>
      <div style="margin-top:6px;height:7px;background:var(--surface);border-radius:999px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#22c55e,#10b981)"></div></div>
      <div style="margin-top:8px">${items || '<div style="font-size:11px;color:var(--dim)">No checklist items</div>'}</div>
    </div>`;
}

async function loadPlan() {
  const container = document.getElementById('plan-content');
  try {
    const r = await fetch('/api/plan');
    const d = await r.json();
    if (!d.ok) { container.innerHTML = '<div class="card">Error loading plan</div>'; return; }

    document.getElementById('plan-progress-text').textContent = d.totalDone + '/' + d.totalAll + ' done (' + d.totalPercent + '%)';
    document.getElementById('plan-progress-bar').style.width = d.totalPercent + '%';

    const LABELS = { 'coding-agent-1': '\U0001f528 CA1 — ItineraryWala', 'coding-agent-2': '\U0001f5a5 CA2 — Agent Space', 'qa': '\U0001f50d QA Agent', 'writer': '\u270d Writer Agent' };

    function renderPlanMd(md) {
      return md.split('\n').map(function(l) {
        if (/^- \[x\]/.test(l)) return '<div style="color:var(--green);font-size:12px;padding:2px 0">\u2705 ' + l.replace(/^- \[x\] /,'') + '</div>';
        if (/^- \[ \].*BLOCKED|^- \[ \].*\u26a0/.test(l)) return '<div style="color:var(--red);font-size:12px;padding:2px 0">\U0001f534 ' + l.replace(/^- \[ \] /,'') + '</div>';
        if (/^- \[ \]/.test(l)) return '<div style="color:var(--dim);font-size:12px;padding:2px 0">\u2610 ' + l.replace(/^- \[ \] /,'') + '</div>';
        if (/^## /.test(l)) return '<div style="font-weight:600;color:var(--text);margin-top:8px;font-size:12px">' + l.replace(/^## /,'') + '</div>';
        if (/^### /.test(l)) return '<div style="font-weight:600;color:var(--accent);margin-top:6px;font-size:11px">' + l.replace(/^### /,'') + '</div>';
        return '';
      }).filter(Boolean).join('');
    }

    function renderStateMd(md) {
      return md.split('\n').map(function(l) {
        if (/^## /.test(l)) {
          var parts = l.replace(/^## /,'').split(':');
          if (parts.length >= 2) return '<div style="font-size:12px;line-height:1.5"><span style="color:var(--accent);font-weight:600">' + parts[0].trim() + ':</span> ' + parts.slice(1).join(':').trim() + '</div>';
          return '<div style="font-weight:600;color:var(--text);font-size:12px;margin-top:4px">' + parts[0] + '</div>';
        }
        if (/^- /.test(l)) return '<div style="font-size:12px;padding-left:12px;color:var(--text)">' + l + '</div>';
        return '';
      }).filter(Boolean).join('');
    }

    var html = '';
    for (var name in d.agents) {
      var a = d.agents[name];
      var label = LABELS[name] || name;
      var statusMatch = a.state.match(/## Status: (.+)/);
      var itemMatch = a.state.match(/## Current Item: (.+)/);
      var status = statusMatch ? statusMatch[1] : '?';
      var item = itemMatch ? itemMatch[1] : '?';
      var dot = status.toLowerCase().indexOf('active') >= 0 ? '\U0001f7e2' : '\u26aa';
      var statusColor = status.toLowerCase().indexOf('active') >= 0 ? 'var(--green)' : 'var(--dim)';
      html += '<div class="card" style="min-height:100px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
      html += '<h3 style="font-size:14px;margin:0">' + dot + ' ' + label + '</h3>';
      html += '<span style="font-size:12px;color:var(--green);font-weight:600">' + a.done + '/' + a.total + ' (' + a.percent + '%)</span>';
      html += '</div>';
      html += '<div style="background:var(--surface);border-radius:4px;height:4px;margin-bottom:8px;overflow:hidden"><div style="background:var(--green);height:100%;width:' + a.percent + '%"></div></div>';
      html += '<div style="border-left:3px solid ' + statusColor + ';padding-left:8px;margin-bottom:8px">';
      html += '<div style="font-size:12px;color:var(--text);font-weight:600">\u2192 ' + item + '</div>';
      html += '<div style="font-size:11px;color:var(--dim)">' + status + '</div>';
      html += '</div>';
      html += '<details style="margin-top:4px"><summary style="font-size:11px;color:var(--dim);cursor:pointer">State</summary>' + renderStateMd(a.state) + '</details>';
      html += '<details style="margin-top:4px"><summary style="font-size:11px;color:var(--dim);cursor:pointer">Plan</summary>' + renderPlanMd(a.plan) + '</details>';
      html += '</div>';
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div class="card">Failed to load: ' + e.message + '</div>';
  }
}
loadPlan();
setInterval(loadPlan, 30000);
