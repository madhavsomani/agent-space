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
async function refreshProcessUptime() {
  try {
    const r = await fetch(API.replace('/api','') + '/healthz');
    const d = await r.json();
    if(d.uptime) document.getElementById('ss-uptime').textContent = fmtUptime(d.uptime);
  } catch {}
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
      // Feed 3D office with updated agent data
      
      // Update grid view
      if (_officeView === 'grid') renderGridView();
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

// ===== STATUS CHANGE NOTIFICATION SOUNDS =====
let notifSoundsOn = localStorage.getItem('hq-notif-sounds') !== '0'; // on by default
let notifCtx = null;

function getNotifCtx() {
  if (!notifCtx) notifCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (notifCtx.state === 'suspended') notifCtx.resume();
  return notifCtx;
}

// Browser notifications for backgrounded tab
function sendBrowserNotif(title, body, icon) {
  if (document.visibilityState !== 'hidden') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: icon || '/favicon.ico', tag: 'hq-' + title, renotify: true });
  }
}
// Request permission on first interaction
document.addEventListener('click', function _reqNotif() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  document.removeEventListener('click', _reqNotif);
}, { once: true });

function playStatusChangeSound(oldStatus, newStatus, agentName, agentColor) {
  // Browser notification when tab is backgrounded
  const verb = newStatus === 'working' ? 'started working' : newStatus === 'idle' ? 'went idle' : 'fell asleep';
  sendBrowserNotif(`${agentName} ${verb}`, `Status: ${oldStatus} → ${newStatus}`, '⚡');
  if (!notifSoundsOn) return;
  const ctx = getNotifCtx();
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);

  if (newStatus === 'working') {
    // Rising chime — agent woke up / started working
    [660, 880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.08);
      g.gain.linearRampToValueAtTime(0.3, t + i * 0.08 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
      osc.connect(g); g.connect(master);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.25);
    });
  } else if (newStatus === 'sleeping' || newStatus === 'idle') {
    // Descending soft tone — agent went idle/sleeping
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(350, t + 0.3);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.35);
  }

  // Show toast for status change
  showToast(`${agentName}: ${oldStatus} → ${newStatus}`, agentColor);
}

// Notification Center state
let _notifications = [];
const MAX_NOTIFICATIONS = 50;
let _notifUnread = 0;

function showToast(nameOrMsg, colorOrText, textOrBorder, icon) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  // Detect calling convention:
  // 4-arg: showToast(name, color, text, icon) — agent status changes
  // 3-arg: showToast(icon, text, borderColor) — activity feed style
  // 2-arg: showToast(msg, color) — simple message
  // 1-arg: showToast(msg) — minimal
  let displayMsg, dotColor;
  if (icon !== undefined && textOrBorder !== undefined) {
    // 4-arg: (name, color, text, icon)
    displayMsg = `${icon} <strong style="color:${colorOrText}">${nameOrMsg}</strong> ${textOrBorder}`;
    dotColor = colorOrText;
  } else if (textOrBorder !== undefined) {
    // 3-arg: (icon, text, borderColor)
    displayMsg = `${nameOrMsg} ${colorOrText}`;
    dotColor = textOrBorder;
  } else {
    // 2-arg or 1-arg
    displayMsg = nameOrMsg;
    dotColor = colorOrText || 'var(--accent)';
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<div class="toast-dot" style="background:${dotColor||'var(--accent)'}"></div><div class="toast-text">${esc(displayMsg)}</div>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4000);
  while (c.children.length > 6) c.removeChild(c.firstChild);
  // Store in notification center
  addNotification(displayMsg, dotColor);
}

function addNotification(text, color) {
  const now = new Date();
  _notifications.unshift({ text, color: color || 'var(--accent)', ts: now });
  if (_notifications.length > MAX_NOTIFICATIONS) _notifications.pop();
  _notifUnread++;
  updateNotifBadge();
  renderNotifCenter();
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (_notifUnread > 0) {
    badge.textContent = _notifUnread > 99 ? '99+' : _notifUnread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifCenter() {
  const overlay = document.getElementById('notif-center-overlay');
  const isOpen = overlay.classList.contains('visible');
  if (isOpen) {
    overlay.classList.remove('visible');
  } else {
    overlay.classList.add('visible');
    _notifUnread = 0;
    updateNotifBadge();
  }
}

function clearNotifCenter() {
  _notifications = [];
  _notifUnread = 0;
  updateNotifBadge();
  renderNotifCenter();
}

function renderNotifCenter() {
  const body = document.getElementById('notif-center-body');
  if (!body) return;
  if (!_notifications.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--dim);font-size:12px">No notifications yet</div>';
    return;
  }
  body.innerHTML = _notifications.map(n => {
    const t = n.ts;
    const timeStr = t.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    const ago = timeAgo(t);
    return `<div class="notif-item" style="border-left-color:${n.color}"><div class="notif-body"><div class="notif-text">${n.text || '(empty notification)'}</div><div class="notif-time">${timeStr} · ${ago}</div></div></div>`;
  }).join('');
}

function toggleNotifSounds() {
  notifSoundsOn = !notifSoundsOn;
  document.getElementById('notif-sound-icon').textContent = notifSoundsOn ? '🔔' : '🔕';
  localStorage.setItem('hq-notif-sounds', notifSoundsOn ? '1' : '0');
}

// ===== AMBIENT SOUND ENGINE (Web Audio API, procedural) =====
let ambientCtx = null;
let ambientOn = false;
let ambientNodes = {};

function createAmbientSound() {
  if (ambientCtx) return;
  ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ambientCtx.createGain();
  master.gain.value = 0.15;
  master.connect(ambientCtx.destination);
  ambientNodes.master = master;

  // 1. Office hum (low brown noise)
  const humSize = ambientCtx.sampleRate * 2;
  const humBuf = ambientCtx.createBuffer(1, humSize, ambientCtx.sampleRate);
  const humData = humBuf.getChannelData(0);
  let lastHum = 0;
  for (let i = 0; i < humSize; i++) {
    const white = Math.random() * 2 - 1;
    lastHum = (lastHum + (0.02 * white)) / 1.02;
    humData[i] = lastHum * 3.5;
  }
  const humSrc = ambientCtx.createBufferSource();
  humSrc.buffer = humBuf;
  humSrc.loop = true;
  const humFilter = ambientCtx.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 150;
  const humGain = ambientCtx.createGain();
  humGain.gain.value = 0.6;
  humSrc.connect(humFilter);
  humFilter.connect(humGain);
  humGain.connect(master);
  humSrc.start();
  ambientNodes.hum = { src: humSrc, gain: humGain };

  // 2. Keyboard clicks (randomized periodic clicks)
  function scheduleClick() {
    if (!ambientOn) return;
    // Only click when agents are working
    const workingCount = agentData.filter(a => a.status === 'working').length;
    if (workingCount === 0) { setTimeout(scheduleClick, 2000); return; }

    const osc = ambientCtx.createOscillator();
    const clickGain = ambientCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 800 + Math.random() * 1200;
    clickGain.gain.setValueAtTime(0.03 + Math.random() * 0.02, ambientCtx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, ambientCtx.currentTime + 0.03);
    osc.connect(clickGain);
    clickGain.connect(master);
    osc.start();
    osc.stop(ambientCtx.currentTime + 0.03);

    // More clicks when more agents working
    const baseDelay = 200 / Math.max(1, workingCount);
    const delay = baseDelay + Math.random() * baseDelay * 2;
    setTimeout(scheduleClick, delay);
  }
  scheduleClick();
  ambientNodes.clickScheduler = true;

  // 3. Soft ambient tone (gentle pad)
  const pad = ambientCtx.createOscillator();
  pad.type = 'sine';
  pad.frequency.value = 220;
  const padGain = ambientCtx.createGain();
  padGain.gain.value = 0.04;
  const padFilter = ambientCtx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 300;
  pad.connect(padFilter);
  padFilter.connect(padGain);
  padGain.connect(master);
  pad.start();
  ambientNodes.pad = { osc: pad, gain: padGain };

  // 4. Occasional notification blip
  function scheduleBlip() {
    if (!ambientOn) return;
    const osc = ambientCtx.createOscillator();
    const blipGain = ambientCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ambientCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ambientCtx.currentTime + 0.05);
    blipGain.gain.setValueAtTime(0.015, ambientCtx.currentTime);
    blipGain.gain.exponentialRampToValueAtTime(0.001, ambientCtx.currentTime + 0.15);
    osc.connect(blipGain);
    blipGain.connect(master);
    osc.start();
    osc.stop(ambientCtx.currentTime + 0.15);
    setTimeout(scheduleBlip, 8000 + Math.random() * 20000);
  }
  setTimeout(scheduleBlip, 3000);
}

function toggleAmbientSound() {
  ambientOn = !ambientOn;
  const icon = document.getElementById('sound-icon');
  if (ambientOn) {
    icon.textContent = '🔊';
    createAmbientSound();
    if (ambientCtx.state === 'suspended') ambientCtx.resume();
    if (ambientNodes.master) ambientNodes.master.gain.setTargetAtTime(0.15, ambientCtx.currentTime, 0.3);
  } else {
    icon.textContent = '🔇';
    if (ambientCtx && ambientNodes.master) {
      ambientNodes.master.gain.setTargetAtTime(0, ambientCtx.currentTime, 0.3);
    }
  }
  localStorage.setItem('hq-ambient', ambientOn ? '1' : '0');
}

// Restore ambient preference
if (localStorage.getItem('hq-ambient') === '1') {
  // Auto-enable on first user interaction (browser policy)
  const enableOnInteraction = () => {
    toggleAmbientSound();
    document.removeEventListener('click', enableOnInteraction);
    document.removeEventListener('keydown', enableOnInteraction);
  };
  document.addEventListener('click', enableOnInteraction, { once: true });
  document.addEventListener('keydown', enableOnInteraction, { once: true });
}

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
