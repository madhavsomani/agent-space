// Theme
let _tabLoaded = {};
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function getTheme() { return localStorage.getItem('hq-theme') || 'dark'; }
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); document.getElementById('theme-icon').textContent = t === 'dark' ? '🌙' : '☀️'; if (typeof invalidateStaticCache === 'function') invalidateStaticCache(); }
function toggleTheme() { const t = getTheme() === 'dark' ? 'light' : 'dark'; localStorage.setItem('hq-theme', t); applyTheme(t); }
applyTheme(getTheme());

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
const _tabOrder = ['office','activity','queue','memory','tokens','performance','comm-graph','dep-graph','system'];
let _currentTab = 'office';
function switchTab(tabName) {
  // Always scroll to top — even when re-clicking the same tab (fixes canvas appearing off-screen)
  window.scrollTo({ top: 0, behavior: 'instant' });
  if(tabName === _currentTab) return;
  const oldIdx = _tabOrder.indexOf(_currentTab);
  const newIdx = _tabOrder.indexOf(tabName);
  const direction = newIdx > oldIdx ? 'right' : 'left';
  document.querySelectorAll('#tabs-nav button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
  document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active','slide-in-right','slide-in-left'); });
  // Also update mobile nav
  document.querySelectorAll('.mobile-nav button').forEach(b => b.classList.remove('active'));
  const mobBtn = document.querySelector(`.mobile-nav [data-tab="${tabName}"]`);
  if(mobBtn) mobBtn.classList.add('active');
  const btn = document.querySelector(`#tabs-nav [data-tab="${tabName}"]`);
  const tabEl = document.getElementById('tab-' + tabName);
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
    else if (tabName === 'system') { refreshSystem(); refreshDiskBreakdown(); refreshLatency(); }
  }
}
document.querySelectorAll('#tabs-nav button').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});
// Restore tab from URL hash on load
(function(){
  const hash = location.hash.replace('#','');
  const validTabs = ['office','activity','queue','memory','tokens','performance','comm-graph','dep-graph','system'];
  if(hash && validTabs.includes(hash)) switchTab(hash);
})();

// Keyboard shortcuts: 1-6 for tabs, R for refresh
document.addEventListener('keydown', e => {
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  const tabs = ['office','activity','queue','memory','tokens','performance','system'];
  const idx = parseInt(e.key) - 1;
  if(idx >= 0 && idx < tabs.length) {
    switchTab(tabs[idx]);
  }
  if(e.key === 'r' || e.key === 'R') refreshAll();
  if(e.key === 'p' || e.key === 'P') togglePause();
  if(e.key === '?') document.getElementById('help-overlay').classList.toggle('visible');
  if(e.key === 't' || e.key === 'T') toggleTheme();
  if(e.key === 's' || e.key === 'S') toggleAmbientSound();
  if(e.key === 'v' || e.key === 'V') { switchOfficeView(_officeView === '2d' ? 'grid' : '2d'); }
  if(e.key === 'n' || e.key === 'N') toggleNotifSounds();
  if(e.key === 'i' || e.key === 'I') toggleNotifCenter();
  if(e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
  if(e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
  if(e.key === '`') { zoomReset(); }
  if(e.key === 'Escape') document.getElementById('help-overlay').classList.remove('visible');
});

// Swipe navigation for mobile
(function() {
  let touchStartX = 0, touchStartY = 0;
  const tabs = ['office','activity','queue','memory','tokens','performance','system'];
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
  await Promise.allSettled([refreshAgents(), refreshHealthScore(), refreshQueue(), refreshMemory(), refreshTokens(), refreshDailyCost(), refreshActivity(), refreshTimeline(), refreshPerformance(), refreshUptime(), refreshCompletionStats(), refreshHeatmapCalendar(), refreshLiveLogs()]);
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

function sparklineSVG(data, w=60, h=20, color='#3b82f6') {
  if(!data.length) return '';
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v,i) => `${(i/(data.length-1||1))*w},${h - ((v-min)/range)*h}`).join(' ');
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ===== STATUS STRIP =====
function updateStatusStrip() {
  const counts = {working:0, idle:0, sleeping:0};
  const workingNames = [];
  agentData.forEach(a => { counts[a.status] = (counts[a.status]||0) + 1; if(a.status==='working') workingNames.push(a.name); });
  document.getElementById('ss-working').textContent = counts.working;
  document.getElementById('ss-idle').textContent = counts.idle;
  document.getElementById('ss-sleeping').textContent = counts.sleeping;
  const namesEl = document.getElementById('ss-working-names');
  if(namesEl) namesEl.textContent = workingNames.length ? '(' + workingNames.join(', ') + ')' : '';
}

// ===== ANIMATIONS (extracted to animations.js) =====

// ===== AGENTS =====
async function refreshAgents() {
  try {
    const r = await fetchWithTimeout(API + '/agents', {}, 8000);
    const d = await r.json();
    checkStatusChanges(d.agents);
    agentData = d.agents || [];
    
    if (_officeView === 'grid' && typeof renderGridView === 'function') renderGridView();
    apiOnline = true;
    const el = document.getElementById('live-status');
    el.className = 'live online'; el.innerHTML = '<span class="pulse"></span>LIVE';
  } catch {
    apiOnline = false;
    const el = document.getElementById('live-status');
    el.className = 'live offline'; el.innerHTML = '<span class="pulse"></span>OFFLINE';
  }
  updateStatusStrip();
  renderAgentCards();
}

// ===== AGENT SEARCH & FILTER =====
let _agentSearchQuery = '';
let _agentStatusFilter = 'all';
let _highlightedAgents = new Set(); // names of agents matching search for canvas highlight

function filterAgents(query) {
  _agentSearchQuery = (query || '').toLowerCase().trim();
  document.getElementById('agent-search-clear').style.display = _agentSearchQuery ? 'block' : 'none';
  applyAgentFilter();
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
    const matchesStatus = _agentStatusFilter === 'all' || status === _agentStatusFilter;
    const visible = matchesQuery && matchesStatus;
    card.style.display = visible ? '' : 'none';
    if (visible) {
      shown++;
      // Extract agent name for canvas highlight
      const nameEl = card.querySelector('span[style*="font-weight:700"]');
      if (nameEl) _highlightedAgents.add(nameEl.textContent);
    }
  });

  const countEl = document.getElementById('agent-search-results-count');
  if (q || _agentStatusFilter !== 'all') {
    countEl.style.display = 'block';
    countEl.textContent = `Showing ${shown} of ${cards.length} agents`;
  } else {
    countEl.style.display = 'none';
  }
}

function buildLegend() {
  const agents = agentData.length ? agentData : [{name:'Loading...',color:'#475569',status:'sleeping',ageMin:0}];
  document.getElementById('office-legend').innerHTML = agents.map(a => {
    const icon = a.status === 'working' ? '🟢' : a.status === 'idle' ? '🟡' : '💤';
    const age = a.ageMin !== undefined ? (!a.ageMin ? '' : a.ageMin < 1 ? 'now' : a.ageMin < 60 ? a.ageMin + 'm' : Math.round(a.ageMin / 60) + 'h') : '';
    return `<div class="legend-item" onclick="document.querySelector('[data-tab=activity]').click()"><div class="legend-dot" style="background:${a.color}"></div>${icon} ${esc(a.name)}${age ? `<span class="legend-age">${age}</span>` : ''}</div>`;
  }).join('');
}

let activityFilter = 'all';
let activityAgentFilter = '';
let activityCache = [];
let lastActivityTs = null;

function setActivityAgentFilter(val) {
  activityAgentFilter = val;
  renderActivityFeed(activityCache);
}

let timelineData = null; // cached timeline heatmap for sparklines
const MAX_TOASTS = 3;

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
    document.getElementById('activity-feed').innerHTML = '<h3>📡 Agent Activity Feed</h3><div class="sub">No ' + (activityFilter === 'all' ? '' : activityFilter + ' ') + 'activity' + filterNote + '</div>';
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

// ===== ACTIVITY FEED =====
async function refreshActivity() {
  try {
    const r = await fetchWithTimeout(API+'/activity', {}, 10000);
    const d = await r.json();
    const items = d.activity || [];
    activityCache = items;
    // Toast for new activity items
    const typeIcons = { wr:'📋', agent:'🤖', commit:'💾', system:'⚙️' };
    const typeColors = { wr:'#3b82f6', agent:'#22c55e', commit:'#a78bfa', system:'#f59e0b' };
    if(lastActivityTs && items.length) {
      const newItems = items.filter(i => i.ts && new Date(i.ts).getTime() > lastActivityTs);
      newItems.slice(0,2).forEach(i => {
        showToast(typeIcons[i.type]||'📌', `<strong>${i.agent||'system'}</strong> ${(i.text||'').slice(0,60)}`, typeColors[i.type]);
      });
    }
    if(items.length && items[0].ts) lastActivityTs = new Date(items[0].ts).getTime();
    if(!items.length) {
      document.getElementById('activity-feed').innerHTML = '<h3>Agent Activity Feed</h3><div class="sub">No recent activity</div>';
      return;
    }
    const colors = { wr:'#3b82f6', agent:'#22c55e', commit:'#a78bfa', system:'#f59e0b' };
    // Update activity badge
    const actBtn = document.querySelector('[data-tab="activity"]');
    const recentCount = items.filter(i => i.ts && (Date.now() - new Date(i.ts).getTime()) < 3600000).length;
    actBtn.innerHTML = recentCount > 0 ? `📡 Activity <span class="badge" style="background:var(--accent)">${recentCount}</span>` : '📡 Activity';

    // Update office ticker with latest item
    const latest = items[0];
    if(latest) {
      document.getElementById('office-ticker-text').innerHTML = `<span style="color:${colors[latest.type]||'var(--dim)'};font-weight:600">${esc(latest.agent||'system')}</span> <span style="color:var(--text)">${esc((latest.text||'').slice(0,80))}</span>`;
      document.getElementById('office-ticker-time').textContent = latest.ts ? timeAgo(new Date(latest.ts)) : '';
    }
    renderActivityFeed(items);
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
// ===== CANVAS HOVER TOOLTIP =====
const canvasTooltip = document.createElement('div');
canvasTooltip.style.cssText = 'position:fixed;display:none;background:rgba(15,20,30,0.95);border:1px solid var(--border);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--text);pointer-events:none;z-index:250;backdrop-filter:blur(12px);box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:220px;transition:opacity 0.15s;';
document.body.appendChild(canvasTooltip);

function getAgentAtCanvasPos(mx, my) {
  const rect = oCanvas.getBoundingClientRect();
  const scaleX = 1000 / rect.width;
  const scaleY = 620 / (rect.height || 1);
  const cx = (mx - rect.left) * scaleX;
  const cy = (my - rect.top) * scaleY;
  const agents = agentData.length ? agentData : [];
  for (const a of agents) {
    const pos = deskPositions[a.name];
    if (!pos) continue;
    const p = isoToScreen(pos.gx, pos.gy);
    // Hit area around agent (roughly 30x60 centered above the desk)
    if (cx > p.x - 24 && cx < p.x + 24 && cy > p.y - 55 && cy < p.y + 20) return a;
  }
  return null;
}

oCanvas.addEventListener('mousemove', e => {
  const agent = getAgentAtCanvasPos(e.clientX, e.clientY);
  if (agent) {
    const statusIcon = agent.status === 'working' ? '🟢' : agent.status === 'idle' ? '🟡' : '💤';
    const age = agent.ageMin !== undefined ? (!agent.ageMin ? '' : agent.ageMin < 1 ? 'just now' : agent.ageMin < 60 ? agent.ageMin + 'm ago' : Math.round(agent.ageMin / 60) + 'h ago') : '';
    canvasTooltip.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="color:${agent.color};font-weight:700;font-size:13px">${esc(agent.name)}</span>${statusIcon}</div><div style="color:var(--dim);font-size:11px;margin-bottom:4px">${esc(agent.role)}</div>${agent.lastMessage ? `<div style="font-size:11px;color:var(--text);border-left:2px solid ${agent.color};padding-left:6px;margin-top:6px">${esc(agent.lastMessage.slice(0, 80))}${agent.lastMessage.length > 80 ? '…' : ''}</div>` : ''}<div style="font-size:10px;color:var(--dim);margin-top:4px">${age}</div><div style="font-size:9px;color:var(--accent);margin-top:6px;opacity:0.7">Click to view details →</div>`;
    canvasTooltip.style.display = 'block';
    canvasTooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 240) + 'px';
    canvasTooltip.style.top = (e.clientY - 10) + 'px';
    oCanvas.style.cursor = 'pointer';
  } else {
    canvasTooltip.style.display = 'none';
    oCanvas.style.cursor = camZoom > 1 ? 'grab' : 'default';
  }
});
oCanvas.addEventListener('mouseleave', () => { canvasTooltip.style.display = 'none'; oCanvas.style.cursor = 'default'; });

// Click agent in office → jump to Activity tab filtered by that agent
oCanvas.addEventListener('click', e => {
  const agent = getAgentAtCanvasPos(e.clientX, e.clientY);
  if (agent) {
    openAgentDetail(agent.name);
    showToast('🏢', `Opened detail for <strong>${agent.name}</strong>`, agent.color);
  }
});

// Touch support for canvas tooltips on mobile
oCanvas.addEventListener('touchstart', e => {
  const touch = e.touches[0];
  const agent = getAgentAtCanvasPos(touch.clientX, touch.clientY);
  if (agent) {
    e.preventDefault();
    const statusIcon = agent.status === 'working' ? '🟢' : agent.status === 'idle' ? '🟡' : '💤';
    const age = agent.ageMin !== undefined ? (!agent.ageMin ? '' : agent.ageMin < 1 ? 'just now' : agent.ageMin < 60 ? agent.ageMin + 'm ago' : Math.round(agent.ageMin / 60) + 'h ago') : '';
    canvasTooltip.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="color:${agent.color};font-weight:700;font-size:13px">${esc(agent.name)}</span>${statusIcon}</div><div style="color:var(--dim);font-size:11px;margin-bottom:4px">${esc(agent.role)}</div>${agent.lastMessage ? `<div style="font-size:11px;color:var(--text);border-left:2px solid ${agent.color};padding-left:6px;margin-top:6px">${esc(agent.lastMessage.slice(0, 80))}${agent.lastMessage.length > 80 ? '…' : ''}</div>` : ''}<div style="font-size:10px;color:var(--dim);margin-top:4px">${age}</div><div style="font-size:9px;color:var(--accent);margin-top:6px">Tap again to view activity →</div>`;
    canvasTooltip.style.display = 'block';
    canvasTooltip.style.left = Math.min(touch.clientX + 12, window.innerWidth - 240) + 'px';
    canvasTooltip.style.top = (touch.clientY - 10) + 'px';
    // Auto-hide after 3s
    setTimeout(() => { canvasTooltip.style.display = 'none'; }, 3000);
  } else {
    canvasTooltip.style.display = 'none';
  }
}, { passive: false });

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
let _timelineFilter = null;
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
      { icon:'🌓', label:'Toggle Theme', action:()=>{ const t=document.body.dataset.theme==='light'?'dark':'light'; document.body.dataset.theme=t; localStorage.setItem('hq-theme',t); }, hint:'action' },
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
