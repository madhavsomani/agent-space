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

// ===== HIGH-FIVE CELEBRATIONS =====
// When an agent finishes work (working→idle), they high-five the nearest available agent
const highFives = []; // {agent1, agent2, startTime, duration, x, y, color1, color2, confetti:[]}
function triggerHighFive(agentName, color) {
  const desk = deskPositions[agentName];
  if (!desk) return;
  // Find nearest desk agent that isn't the same agent
  let bestDist = Infinity, bestName = null;
  for (const [name, pos] of Object.entries(deskPositions)) {
    if (name === agentName) continue;
    const d = Math.abs(pos.gx - desk.gx) + Math.abs(pos.gy - desk.gy);
    if (d < bestDist) { bestDist = d; bestName = name; }
  }
  if (!bestName) return;
  const partner = deskPositions[bestName];
  const p1 = isoToScreen(desk.gx, desk.gy);
  const p2 = isoToScreen(partner.gx, partner.gy);
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - 20;
  // Generate confetti
  const confetti = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 3;
    confetti.push({
      x: mx, y: my, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
      life: 1, color: ['#FFD700','#FF6B6B','#4ECDC4','#A78BFA','#F97316','#34D399','#00D4FF','#FF69B4'][i % 8],
      size: 2 + Math.random() * 3, rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.3
    });
  }
  const partnerAgent = agentData.find(a => a.name === bestName);
  if (highFives.length >= 10) { highFives[0] = highFives[highFives.length - 1]; highFives.pop(); }
  highFives.push({
    agent1: agentName, agent2: bestName,
    startTime: Date.now(), duration: 2500,
    x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, mx, my,
    color1: color, color2: partnerAgent?.color || '#888',
    confetti
  });
  showToast(agentName, color, 'finished work! 🎉✋', '✅');
}

function drawHighFives(time) {
  for (let i = highFives.length - 1; i >= 0; i--) {
    const hf = highFives[i];
    const elapsed = time - hf.startTime;
    if (elapsed > hf.duration) { highFives[i]=highFives[highFives.length-1]; highFives.pop(); continue; }
    const progress = elapsed / hf.duration;

    // Phase 1 (0-0.3): hands reach toward middle
    // Phase 2 (0.3-0.5): CLAP + burst
    // Phase 3 (0.5-1): confetti falls, fades out
    const fadeOut = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;

    oCtx.save();
    oCtx.globalAlpha = fadeOut;

    // Draw reaching hands
    if (progress < 0.5) {
      const reach = progress < 0.3 ? progress / 0.3 : 1;
      const ease = 1 - Math.pow(1 - reach, 3);
      // Hand 1 (from agent1 toward middle)
      const h1x = hf.x1 + (hf.mx - hf.x1) * ease;
      const h1y = hf.y1 - 20 + (hf.my - (hf.y1 - 20)) * ease;
      // Hand 2 (from agent2 toward middle)
      const h2x = hf.x2 + (hf.mx - hf.x2) * ease;
      const h2y = hf.y2 - 20 + (hf.my - (hf.y2 - 20)) * ease;
      // Arms
      oCtx.strokeStyle = hf.color1; oCtx.lineWidth = 3; oCtx.lineCap = 'round';
      oCtx.beginPath(); oCtx.moveTo(hf.x1, hf.y1 - 20); oCtx.lineTo(h1x, h1y); oCtx.stroke();
      oCtx.strokeStyle = hf.color2;
      oCtx.beginPath(); oCtx.moveTo(hf.x2, hf.y2 - 20); oCtx.lineTo(h2x, h2y); oCtx.stroke();
      // Hands
      oCtx.fillStyle = '#ffe0b2';
      oCtx.beginPath(); oCtx.arc(h1x, h1y, 4, 0, Math.PI * 2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(h2x, h2y, 4, 0, Math.PI * 2); oCtx.fill();
    }

    // Clap impact burst (at phase 0.3)
    if (progress >= 0.28 && progress < 0.55) {
      const burstP = (progress - 0.28) / 0.27;
      const burstR = 8 + burstP * 30;
      const burstA = (1 - burstP) * 0.5;
      oCtx.beginPath(); oCtx.arc(hf.mx, hf.my, burstR, 0, Math.PI * 2);
      oCtx.fillStyle = `rgba(255,215,0,${burstA})`; oCtx.fill();
      // Star burst lines
      if (burstP < 0.5) {
        oCtx.strokeStyle = `rgba(255,215,0,${(0.5 - burstP) * 0.8})`;
        oCtx.lineWidth = 2;
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2;
          const r1 = burstR * 0.5, r2 = burstR;
          oCtx.beginPath();
          oCtx.moveTo(hf.mx + Math.cos(a) * r1, hf.my + Math.sin(a) * r1);
          oCtx.lineTo(hf.mx + Math.cos(a) * r2, hf.my + Math.sin(a) * r2);
          oCtx.stroke();
        }
      }
      // "✋" emoji at impact
      if (burstP < 0.4) {
        oCtx.font = `${14 + burstP * 8}px serif`; oCtx.textAlign = 'center';
        oCtx.globalAlpha = (0.4 - burstP) * 2.5 * fadeOut;
        oCtx.fillText('🙏', hf.mx, hf.my - 5);
        oCtx.globalAlpha = fadeOut;
      }
    }

    // Confetti particles
    hf.confetti.forEach(c => {
      c.x += c.vx; c.y += c.vy; c.vy += 0.12; c.vx *= 0.98;
      c.life -= 0.012; c.rot += c.rotSpeed;
      if (c.life <= 0) return;
      oCtx.save();
      oCtx.globalAlpha = c.life * fadeOut;
      oCtx.translate(c.x, c.y);
      oCtx.rotate(c.rot);
      oCtx.fillStyle = c.color;
      oCtx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      oCtx.restore();
    });

    oCtx.restore();
  }
}

// ===== PRE-SLEEP STRETCH & YAWN =====
const preSleepAnimations = {}; // {agentName: {startTime, duration, color}}
function triggerPreSleep(agentName, color) {
  preSleepAnimations[agentName] = { startTime: Date.now(), duration: 3000, color };
}
function isInPreSleep(agentName) {
  const ps = preSleepAnimations[agentName];
  if (!ps) return false;
  if (Date.now() - ps.startTime > ps.duration) { delete preSleepAnimations[agentName]; return false; }
  return true;
}
function drawPreSleepAgent(agent, gx, gy, time) {
  const ps = preSleepAnimations[agent.name];
  if (!ps) return;
  const elapsed = time - ps.startTime;
  const progress = Math.min(1, elapsed / ps.duration);
  const baseP = isoToScreen(gx, gy);
  const px = baseP.x;
  const baseY = baseP.y - 20;

  // Phase 1 (0-0.4): Arms rise up in stretch
  // Phase 2 (0.4-0.7): Big yawn, arms out
  // Phase 3 (0.7-1.0): Slump down toward desk

  // Shadow
  oCtx.beginPath(); oCtx.ellipse(px, baseP.y+4, 10, 4, 0, 0, Math.PI*2);
  oCtx.fillStyle = 'rgba(0,0,0,0.2)'; oCtx.fill();

  // Body sway as they get sleepy
  const sway = progress > 0.5 ? Math.sin(time/300) * (progress-0.5)*6 : 0;
  const slumpY = progress > 0.7 ? (progress-0.7)/0.3 * 12 : 0;

  oCtx.save();
  oCtx.translate(px + sway, baseY + slumpY);

  // Legs
  oCtx.fillStyle = '#1e293b';
  oCtx.fillRect(-5, 24, 4, 10);
  oCtx.fillRect(1, 24, 4, 10);

  // Body
  const grad = oCtx.createLinearGradient(-10, 6, 10, 24);
  grad.addColorStop(0, agent.color); grad.addColorStop(1, shadeColor(agent.color, -25));
  oCtx.fillStyle = grad;
  roundRect(oCtx, -10, 6, 20, 18, 4); oCtx.fill();

  // Arms — stretch up then droop
  const armRaise = progress < 0.4 ? progress/0.4 : progress < 0.7 ? 1 - (progress-0.4)/0.3*0.3 : 0.7 - (progress-0.7)/0.3*0.7;
  const armAngle = -Math.PI/2 * armRaise;
  const armLen = 16;
  oCtx.fillStyle = shadeColor(agent.color, -15);
  // Left arm
  const laX = -12 + Math.cos(armAngle-0.3)*armLen;
  const laY = 10 + Math.sin(armAngle-0.3)*armLen;
  oCtx.save(); oCtx.lineWidth=5; oCtx.lineCap='round'; oCtx.strokeStyle=shadeColor(agent.color,-15);
  oCtx.beginPath(); oCtx.moveTo(-10,12); oCtx.lineTo(laX, laY); oCtx.stroke(); oCtx.restore();
  // Right arm
  const raX = 12 + Math.cos(-armAngle+0.3+Math.PI)*-armLen;
  const raY = 10 + Math.sin(-armAngle+0.3+Math.PI)*-armLen;
  oCtx.save(); oCtx.lineWidth=5; oCtx.lineCap='round'; oCtx.strokeStyle=shadeColor(agent.color,-15);
  oCtx.beginPath(); oCtx.moveTo(10,12); oCtx.lineTo(raX, raY); oCtx.stroke(); oCtx.restore();
  // Hands
  oCtx.fillStyle='#ffe0b2';
  oCtx.beginPath(); oCtx.arc(laX, laY, 3, 0, Math.PI*2); oCtx.fill();
  oCtx.beginPath(); oCtx.arc(raX, raY, 3, 0, Math.PI*2); oCtx.fill();

  // Head — tilts back during yawn
  const headTilt = progress > 0.3 && progress < 0.75 ? Math.sin((progress-0.3)/0.45*Math.PI)*0.2 : 0;
  oCtx.save(); oCtx.rotate(-headTilt);
  oCtx.beginPath(); oCtx.arc(0, 0, 10, 0, Math.PI*2);
  oCtx.fillStyle='#d4a574'; oCtx.fill();
  oCtx.beginPath(); oCtx.arc(0, -4, 10, Math.PI, Math.PI*2);
  oCtx.fillStyle='#1e293b'; oCtx.fill();

  // Eyes — squeezing shut during yawn
  const eyeSquint = progress > 0.35 && progress < 0.75;
  if (eyeSquint) {
    // Tight shut eyes with crinkle lines
    oCtx.strokeStyle='#333'; oCtx.lineWidth=1.5; oCtx.lineCap='round';
    oCtx.beginPath(); oCtx.moveTo(-5,-1); oCtx.lineTo(-1,0); oCtx.stroke();
    oCtx.beginPath(); oCtx.moveTo(1,0); oCtx.lineTo(5,-1); oCtx.stroke();
    // Crinkle lines
    oCtx.lineWidth=0.5; oCtx.globalAlpha=0.4;
    oCtx.beginPath(); oCtx.moveTo(-6,-3); oCtx.lineTo(-5,-1.5); oCtx.stroke();
    oCtx.beginPath(); oCtx.moveTo(6,-3); oCtx.lineTo(5,-1.5); oCtx.stroke();
    oCtx.globalAlpha=1;
  } else if (progress > 0.75) {
    // Drowsy half-closed eyes
    oCtx.strokeStyle='#333'; oCtx.lineWidth=1;
    const droop = (progress-0.75)/0.25;
    oCtx.beginPath(); oCtx.moveTo(-5,-1); oCtx.lineTo(-1,-1+droop); oCtx.stroke();
    oCtx.beginPath(); oCtx.moveTo(1,-1+droop); oCtx.lineTo(5,-1); oCtx.stroke();
  } else {
    // Normal eyes getting heavy
    oCtx.fillStyle='#1e293b';
    oCtx.beginPath(); oCtx.arc(-3,-1, 1.5, 0, Math.PI*2); oCtx.fill();
    oCtx.beginPath(); oCtx.arc(3,-1, 1.5, 0, Math.PI*2); oCtx.fill();
  }

  // Mouth — big yawn
  if (progress > 0.35 && progress < 0.75) {
    const yawnP = (progress - 0.35) / 0.4;
    const yawnSize = Math.sin(yawnP * Math.PI) * 5 + 1;
    oCtx.fillStyle='#4a2020';
    oCtx.beginPath(); oCtx.ellipse(0, 4, yawnSize*0.8, yawnSize, 0, 0, Math.PI*2); oCtx.fill();
    // Tongue hint
    if (yawnSize > 3) {
      oCtx.fillStyle='#c06060';
      oCtx.beginPath(); oCtx.ellipse(0, 4+yawnSize*0.3, yawnSize*0.4, yawnSize*0.3, 0, 0, Math.PI); oCtx.fill();
    }
  } else {
    oCtx.strokeStyle='#8B4513'; oCtx.lineWidth=1;
    oCtx.beginPath(); oCtx.moveTo(-2,4); oCtx.lineTo(2,4); oCtx.stroke();
  }
  oCtx.restore(); // head tilt

  oCtx.restore(); // main translate

  // Floating yawn text / emoji
  if (progress > 0.3 && progress < 0.8) {
    const tp = (progress - 0.3) / 0.5;
    const ta = tp < 0.2 ? tp/0.2 : tp > 0.7 ? (1-tp)/0.3 : 1;
    oCtx.globalAlpha = ta * 0.7;
    oCtx.font = `${12+tp*4}px serif`; oCtx.textAlign='center';
    oCtx.fillText('🥱', px + 18, baseY - 14 - tp*12);
    oCtx.globalAlpha = 1;
  }

  // "Getting sleepy..." bubble
  if (progress > 0.5 && progress < 0.95) {
    const ba = progress < 0.6 ? (progress-0.5)*10 : progress > 0.85 ? (0.95-progress)*10 : 1;
    oCtx.globalAlpha = ba * 0.6;
    const txt = progress > 0.8 ? '💤 Goodnight...' : '😴 Getting sleepy...';
    oCtx.font = '8px system-ui'; oCtx.textAlign = 'center';
    const tw = oCtx.measureText(txt).width + 12;
    const bx = px - tw/2, by = baseP.y - 55;
    oCtx.fillStyle = 'rgba(30,20,60,0.8)';
    roundRect(oCtx, bx, by, tw, 14, 7); oCtx.fill();
    oCtx.strokeStyle = agent.color; oCtx.lineWidth = 0.5;
    roundRect(oCtx, bx, by, tw, 14, 7); oCtx.stroke();
    oCtx.fillStyle = '#e0d8f0';
    oCtx.fillText(txt, px, by + 10);
    oCtx.globalAlpha = 1;
  }

  // Name
  oCtx.font='bold 10px system-ui'; oCtx.textAlign='center'; oCtx.fillStyle=agent.color;
  oCtx.fillText(agent.name, baseP.x, baseP.y+48);
  oCtx.font='8px system-ui'; oCtx.fillStyle='#64748b';
  oCtx.fillText(agent.role, baseP.x, baseP.y+58);
}

// ===== GOODBYE WAVE ANIMATIONS =====
const goodbyeWaves = []; // {agentName, color, startTime, duration, x, y, armAngle, moon/stars particles}
function triggerGoodbyeWave(agentName, color) {
  const desk = deskPositions[agentName] || getAutoDesk(agentName);
  if (!desk) return;
  const p = isoToScreen(desk.gx, desk.gy);
  // Create moon & stars particles that drift up
  const particles = [];
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: p.x - 15 + Math.random() * 30,
      y: p.y - 30,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -0.5 - Math.random() * 1.2,
      life: 1,
      char: ['✨','⭐','🌙','💤','🌟'][i % 5],
      size: 8 + Math.random() * 6,
    });
  }
  if (goodbyeWaves.length >= 10) { goodbyeWaves[0] = goodbyeWaves[goodbyeWaves.length - 1]; goodbyeWaves.pop(); }
  goodbyeWaves.push({
    agentName, color, startTime: Date.now(), duration: 3000,
    x: p.x, y: p.y - 20, particles
  });
}

function drawGoodbyeWaves(time) {
  for (let i = goodbyeWaves.length - 1; i >= 0; i--) {
    const gw = goodbyeWaves[i];
    const elapsed = time - gw.startTime;
    if (elapsed > gw.duration) { goodbyeWaves[i]=goodbyeWaves[goodbyeWaves.length-1]; goodbyeWaves.pop(); continue; }
    const progress = elapsed / gw.duration;
    const fadeOut = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;

    oCtx.save();
    oCtx.globalAlpha = fadeOut;

    // Waving arm (right arm swings back and forth)
    if (progress < 0.8) {
      const wavePhase = elapsed / 200; // fast wave
      const armAngle = Math.sin(wavePhase) * 0.6 - 0.8; // wave arc
      const armLen = 14;
      const shoulderX = gw.x + 9, shoulderY = gw.y + 8;
      const handX = shoulderX + Math.cos(armAngle) * armLen;
      const handY = shoulderY + Math.sin(armAngle) * armLen;

      // Arm
      oCtx.strokeStyle = gw.color;
      oCtx.lineWidth = 4;
      oCtx.lineCap = 'round';
      oCtx.beginPath();
      oCtx.moveTo(shoulderX, shoulderY);
      oCtx.lineTo(handX, handY);
      oCtx.stroke();

      // Hand
      oCtx.fillStyle = '#ffe0b2';
      oCtx.beginPath(); oCtx.arc(handX, handY, 3.5, 0, Math.PI * 2); oCtx.fill();

      // Motion lines near hand
      const lineAlpha = (1 - progress) * 0.4;
      oCtx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
      oCtx.lineWidth = 1;
      for (let l = 0; l < 3; l++) {
        const lx = handX + 5 + l * 4;
        const ly = handY - 3 + l * 3;
        oCtx.beginPath();
        oCtx.moveTo(lx, ly);
        oCtx.lineTo(lx + 4, ly - 1);
        oCtx.stroke();
      }
    }

    // "👋 Goodnight!" text bubble
    if (progress < 0.6) {
      const bubbleAlpha = progress < 0.1 ? progress / 0.1 : progress > 0.45 ? (0.6 - progress) / 0.15 : 1;
      const bubbleY = gw.y - 25 - progress * 15;
      oCtx.globalAlpha = bubbleAlpha * fadeOut;
      oCtx.fillStyle = 'rgba(30,20,60,0.85)';
      roundRect(oCtx, gw.x - 32, bubbleY - 10, 64, 20, 8);
      oCtx.fill();
      oCtx.strokeStyle = gw.color;
      oCtx.lineWidth = 1;
      roundRect(oCtx, gw.x - 32, bubbleY - 10, 64, 20, 8);
      oCtx.stroke();
      oCtx.font = '10px system-ui';
      oCtx.fillStyle = '#fff';
      oCtx.textAlign = 'center';
      oCtx.fillText('👋 Goodnight!', gw.x, bubbleY + 4);
      oCtx.globalAlpha = fadeOut;
    }

    // Drifting particles (stars, moon, sparkles)
    gw.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.008;
      if (p.life <= 0) return;
      oCtx.globalAlpha = p.life * fadeOut * 0.8;
      oCtx.font = `${p.size}px serif`;
      oCtx.textAlign = 'center';
      oCtx.fillText(p.char, p.x, p.y);
    });

    oCtx.restore();
  }
}

// ===== STATUS CHANGE SPARKLES =====
const statusSparkles = [];
const MAX_SPARKLES = 80;
function emitSparkles(agentName, color) {
  const pos = deskPositions[agentName];
  if(!pos) return;
  const p = isoToScreen(pos.gx, pos.gy);
  for(let i=0;i<12;i++){
    if(statusSparkles.length>=MAX_SPARKLES){ statusSparkles[0]=statusSparkles[statusSparkles.length-1]; statusSparkles.pop(); }
    const angle = (i/12)*Math.PI*2 + Math.random()*0.5;
    const speed = 1.5+Math.random()*2;
    statusSparkles.push({x:p.x,y:p.y-20,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,color,size:2+Math.random()*2});
  }
}

// ===== TOAST NOTIFICATIONS =====
const prevAgentStatus = {};
// showToast is defined once near end of file — this call-site uses the hoisted version
function checkStatusChanges(agents) {
  agents.forEach(a => {
    const prev = prevAgentStatus[a.name];
    if (prev && prev !== a.status) {
      emitSparkles(a.name, a.color);
      if (a.status === 'working') showToast(a.name, a.color, 'started working', '🟢');
      else if (a.status === 'sleeping') { triggerPreSleep(a.name, a.color); triggerGoodbyeWave(a.name, a.color); showToast(a.name, a.color, 'went to sleep', '💤'); }
      else if (a.status === 'idle' && prev === 'working') {
        // Agent just finished work — celebrate with a high-five!
        triggerHighFive(a.name, a.color);
      }
      else if (a.status === 'idle') showToast(a.name, a.color, 'is idle', '🟡');
    }
    prevAgentStatus[a.name] = a.status;
  });
}

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
function renderWorkload(wrs) {
  const body = document.getElementById('queue-workload-body');
  if (!body) return;
  if (!wrs || !wrs.length) { body.innerHTML = '<div style="text-align:center;padding:12px;color:var(--dim)">No work requests yet</div>'; return; }
  // Count WRs per owner
  const byOwner = {};
  wrs.forEach(w => {
    const owner = w.owner || 'Unassigned';
    if (!byOwner[owner]) byOwner[owner] = { total: 0, active: 0, done: 0 };
    byOwner[owner].total++;
    if (['complete', 'done'].includes(w.status)) byOwner[owner].done++;
    else byOwner[owner].active++;
  });
  const entries = Object.entries(byOwner).sort((a, b) => b[1].active - a[1].active);
  const maxTotal = Math.max(...entries.map(e => e[1].total), 1);
  let html = '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">';
  entries.forEach(([owner, counts]) => {
    const agent = agentData.find(a => a.name === owner);
    const color = agent ? agent.color : 'var(--dim)';
    const activePct = Math.round((counts.active / maxTotal) * 100);
    const donePct = Math.round((counts.done / maxTotal) * 100);
    html += `<div style="display:flex;align-items:center;gap:8px">
      <span style="width:100px;text-align:right;font-weight:600;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${owner}</span>
      <div style="flex:1;display:flex;gap:1px;height:16px;background:var(--border);border-radius:4px;overflow:hidden">
        ${counts.active > 0 ? `<div style="width:${activePct}%;background:${color};border-radius:3px;transition:width .5s" title="${counts.active} active"></div>` : ''}
        ${counts.done > 0 ? `<div style="width:${donePct}%;background:${color};opacity:0.3;border-radius:3px;transition:width .5s" title="${counts.done} done"></div>` : ''}
      </div>
      <span style="font-size:10px;color:var(--dim);white-space:nowrap;min-width:50px">${counts.active} active · ${counts.done} done</span>
    </div>`;
  });
  html += '</div>';
  body.innerHTML = html;
}

// ===== QUEUE =====
async function refreshQueue() {
  try {
    const r = await fetchWithTimeout(API+'/queue', {}, 10000); const d = await r.json();
    let html = '';
    if(d.active?.length) {
      html += `<div class="queue-section"><div class="card"><h3>🔥 Active Work</h3>`;
      d.active.forEach(w => {
        const badge = w.complete ? 'state-complete' : 'state-active';
        const label = w.complete ? '✅ Done' : '⚡ Active';
        html += `<div class="queue-row"><span class="state-badge ${badge}">${label}</span><strong>${w.file.replace(/`/g,'')}</strong><span style="color:var(--dim);margin-left:auto">${w.type} · ${w.owner}</span></div>`;
      });
      html += `</div></div>`;
    }
    if(d.review?.length) {
      html += `<div class="queue-section"><div class="card"><h3>⏳ Awaiting Review</h3>`;
      d.review.forEach(w => {
        html += `<div class="queue-row"><span class="state-badge state-review">Review</span><strong>${w.file.replace(/`/g,'')}</strong><span style="color:var(--dim);margin-left:auto">${w.type} · ${w.since}</span></div>`;
      });
      html += `</div></div>`;
    }
    if(d.wrs?.length) {
      const cols = {created:'To Do',queued:'To Do',active:'In Progress','in_progress':'In Progress',awaiting_qa:'In Review',qa_complete:'In Review',complete:'Done',done:'Done',failed:'To Do'};
      const buckets = {'To Do':[],'In Progress':[],'In Review':[],'Done':[]};
      d.wrs.forEach(w => {
        const s = (w.status||'').toLowerCase();
        let col = cols[s];
        if (!col) {
          // Fuzzy match for custom statuses
          if (s.includes('complete') || s.includes('done') || s.includes('delivered')) col = 'Done';
          else if (s.includes('review') || s.includes('awaiting') || s.includes('qa')) col = 'In Review';
          else if (s.includes('progress') || s.includes('active') || s.includes('filming')) col = 'In Progress';
          else col = 'To Do';
        }
        buckets[col].push(w);
      });
      const icons = {'To Do':'📝','In Progress':'⚡','In Review':'🔍','Done':'✅'};
      html += `<div class="queue-section" style="margin-top:16px"><div class="kanban">`;
      Object.entries(buckets).forEach(([name,items])=>{
        html += `<div><div class="card"><h3>${icons[name]||''} ${name} (${items.length})</h3>${items.map(w=>`<div class="wr-card"><div class="title">${w.title}</div><div class="meta">${w.type} · ${w.priority||''}</div></div>`).join('')||'<div style="color:var(--dim);font-size:11px;text-align:center;padding:16px">Empty</div>'}</div></div>`;
      });
      html += `</div></div>`;
    }
    // Update badge
    const activeCount = (d.active||[]).filter(w=>!w.complete).length;
    const qsw = document.getElementById('qs-wrs'); if(qsw) { animateValue(qsw, String(activeCount)); qsw.style.color = activeCount > 0 ? 'var(--green)' : 'var(--dim)'; }
    const queueBtn = document.querySelector('[data-tab="queue"]');
    if(activeCount > 0) queueBtn.innerHTML = `📋 Queue <span class="badge">${activeCount}</span>`;
    else queueBtn.innerHTML = '📋 Queue';

    document.getElementById('queue-content').innerHTML = html || '<div class="card"><h3>Queue Empty</h3><div class="sub">No active work requests</div></div>';
    renderWorkload(d.wrs);
  } catch {}
}

// ===== MEMORY =====
let _memFilterMode = 'all'; // 'all', 'collections', 'files'
let _memSearchQuery = '';
let _memCachedCollections = [];
let _memCachedFiles = [];

function setMemFilter(mode, btn) {
  _memFilterMode = mode;
  document.querySelectorAll('[data-mem-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.memFilter === mode);
    b.style.background = b.dataset.memFilter === mode ? 'var(--accent)' : 'var(--card)';
    b.style.color = b.dataset.memFilter === mode ? '#fff' : 'var(--dim)';
  });
  applyMemoryFilter();
}

function filterMemory(query) {
  _memSearchQuery = query.toLowerCase().trim();
  const clearBtn = document.getElementById('mem-search-clear');
  if (clearBtn) clearBtn.style.display = _memSearchQuery ? 'block' : 'none';
  applyMemoryFilter();
}

function applyMemoryFilter() {
  const q = _memSearchQuery;
  const mode = _memFilterMode;
  const collectionsEl = document.getElementById('mem-collections');
  if (!collectionsEl) return;

  // Filter collections
  let filteredCols = _memCachedCollections;
  if (q) filteredCols = filteredCols.filter(c => c.name.toLowerCase().includes(q));
  
  // Filter files
  let filteredFiles = _memCachedFiles;
  if (q) filteredFiles = filteredFiles.filter(f => f.name.toLowerCase().includes(q));

  const maxPts = Math.max(...(_memCachedCollections.map(c=>c.points)||[1]), 1);
  let html = '';

  if (mode === 'all' || mode === 'collections') {
    const showCols = filteredCols;
    html += `<h3>📦 Collections${q ? ` (${showCols.length}/${_memCachedCollections.length})` : ''}</h3>`;
    if (showCols.length) {
      html += `<ul class="service-list">${showCols.map(c => {
        const pct = Math.max((c.points/maxPts)*100, 2);
        const statusDot = c.status==='green' ? 'running' : 'stopped';
        return `<li style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:8px;width:100%"><span class="dot ${statusDot}"></span><span>${q ? c.name.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark style="background:var(--accent-glow);color:var(--accent);border-radius:2px;padding:0 2px">$1</mark>') : c.name}</span><span style="margin-left:auto;font-weight:600">${c.points.toLocaleString()} pts</span></div><div class="bar-bg" style="width:100%;margin-top:4px"><div class="bar-fill green" style="width:${pct}%"></div></div></li>`;
      }).join('')}</ul>`;
    } else {
      html += `<div style="color:var(--dim);font-size:11px;padding:10px;text-align:center">No matching collections</div>`;
    }
  }

  if (mode === 'all' || mode === 'files') {
    const showFiles = filteredFiles;
    if (showFiles.length || _memCachedFiles.length) {
      html += `<h3 style="margin-top:16px">📁 Memory Files${q ? ` (${showFiles.length}/${_memCachedFiles.length})` : ` (${_memCachedFiles.length})`}</h3>`;
      if (showFiles.length) {
        const fileIcon = name => {
          const ext = (name.split('.').pop()||'').toLowerCase();
          const icons = {md:'📝',json:'🔧',yaml:'⚙️',yml:'⚙️',txt:'📄',js:'🟨',ts:'🔷',csv:'📊',log:'📃',sh:'🐚',py:'🐍'};
          return icons[ext] || '📄';
        };
        html += `<ul class="service-list">${showFiles.map(f => {
          const age = f.mtime ? timeAgo(new Date(f.mtime)) : '';
          const displayName = q ? f.name.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark style="background:var(--accent-glow);color:var(--accent);border-radius:2px;padding:0 2px">$1</mark>') : f.name;
          return `<li><span>${fileIcon(f.name)}</span><span>${displayName}</span><span style="margin-left:auto;color:var(--dim);font-size:11px">${f.sizeKB} KB · ${age}</span></li>`;
        }).join('')}</ul>`;
      } else {
        html += `<div style="color:var(--dim);font-size:11px;padding:10px;text-align:center">No matching files</div>`;
      }
    }
  }

  collectionsEl.innerHTML = html;

  // Show results count
  const resultsEl = document.getElementById('mem-search-results');
  if (q && resultsEl) {
    const totalMatches = (mode==='all'||mode==='collections' ? filteredCols.length : 0) + (mode==='all'||mode==='files' ? filteredFiles.length : 0);
    resultsEl.style.display = 'block';
    resultsEl.textContent = `${totalMatches} result${totalMatches!==1?'s':''} for "${_memSearchQuery}"`;
  } else if (resultsEl) {
    resultsEl.style.display = 'none';
  }
}

function renderDonutChart(collections) {
  const svg = document.getElementById('mem-donut-svg');
  const legend = document.getElementById('mem-donut-legend');
  if(!svg || !collections?.length) return;
  const colors = ['#3b82f6','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4'];
  const total = collections.reduce((s,c) => s + c.points, 0);
  if(!total) { svg.innerHTML = '<text x="80" y="85" text-anchor="middle" fill="#64748b" font-size="12">No data</text>'; return; }
  const cx=80, cy=80, r=55, stroke=16;
  let cumAngle = -Math.PI/2;
  let paths = '';
  collections.forEach((c, i) => {
    const frac = c.points / total;
    const angle = frac * 2 * Math.PI;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = cx + r * Math.cos(cumAngle);
    const y2 = cy + r * Math.sin(cumAngle);
    const col = colors[i % colors.length];
    if(frac >= 0.999) {
      paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" opacity="0.85"/>`;
    } else {
      paths += `<path d="M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" opacity="0.85"/>`;
    }
  });
  // center label
  paths += `<text x="${cx}" y="${cy-4}" text-anchor="middle" fill="#e2e8f0" font-size="18" font-weight="800">${total >= 1e6 ? (total/1e6).toFixed(1)+'M' : total >= 1e3 ? (total/1e3).toFixed(1)+'K' : total}</text>`;
  paths += `<text x="${cx}" y="${cy+12}" text-anchor="middle" fill="#64748b" font-size="9">vectors</text>`;
  svg.innerHTML = paths;
  legend.innerHTML = collections.map((c,i) => {
    const pct = ((c.points/total)*100).toFixed(1);
    return `<span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:${colors[i%colors.length]}"></span>${c.name} (${pct}%)</span>`;
  }).join('');
}

async function refreshMemory() {
  try {
    const r = await fetchWithTimeout(API+'/memory', {}, 10000); const d = await r.json();
    document.getElementById('ss-memories').textContent = d.totalPoints?.toLocaleString() || '0';
    const qsm = document.getElementById('qs-memories'); if(qsm) animateValue(qsm, d.totalPoints?.toLocaleString() || '0');
    if(d.status==='offline'){
      document.getElementById('mem-stats').innerHTML=`<div class="card" style="grid-column:span 2"><h3>Vector Memory</h3><div class="sub" style="color:var(--dim)">Vector database not available — this section is hidden when no vector DB is configured.</div></div>`;
      // Hide the memory sub-sections when offline
      ['mem-donut','mem-collections','mem-growth-chart'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
      return;
    }
    // Show memory sub-sections if they were hidden
    ['mem-donut','mem-collections','mem-growth-chart'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='';});
    document.getElementById('mem-stats').innerHTML=`
      <div class="card"><h3>Total Memories</h3><div class="metric blue">${(d.totalPoints||0).toLocaleString()}</div><div class="sub">Vector embeddings stored</div></div>
      <div class="card"><h3>Collections</h3><div class="metric blue">${d.count||0}</div><div class="sub">Active vector collections</div></div>`;
    // Cache data for filtering
    _memCachedCollections = d.collections || [];
    _memCachedFiles = d.memFiles || [];
    // Apply current filter (or render all)
    applyMemoryFilter();
    renderDonutChart(d.collections);
    // Per-agent memory breakdown
    if (d.agentBreakdown && Object.keys(d.agentBreakdown).length > 0) {
      let breakdownEl = document.getElementById('mem-agent-breakdown');
      if (!breakdownEl) {
        breakdownEl = document.createElement('div');
        breakdownEl.id = 'mem-agent-breakdown';
        breakdownEl.className = 'card';
        breakdownEl.style.marginTop = '12px';
        const memTab = document.getElementById('tab-memory');
        if (memTab) memTab.appendChild(breakdownEl);
      }
      const agents = Object.entries(d.agentBreakdown).sort((a,b) => b[1].totalKB - a[1].totalKB);
      const maxKB = Math.max(...agents.map(([,v]) => v.totalKB), 1);
      breakdownEl.innerHTML = `<h3>👤 Memory by Agent</h3>
        <ul class="service-list">${agents.map(([name, info]) => {
          const pct = Math.max(Math.round((info.totalKB / maxKB) * 100), 5);
          return `<li><div style="display:flex;justify-content:space-between;width:100%"><span style="font-weight:700">${name}</span><span style="color:var(--dim)">${info.files} files · ${info.totalKB} KB</span></div><div class="bar-bg" style="margin-top:3px"><div class="bar-fill blue" style="width:${pct}%"></div></div></li>`;
        }).join('')}</ul>`;
    }
    refreshMemoryGrowth();
  } catch{}
}

async function refreshMemoryGrowth() {
  try {
    const r = await fetchWithTimeout(API+'/memory/history', {}, 10000);
    const d = await r.json();
    const hist = d.history || [];
    const body = document.getElementById('mem-growth-body');
    if (hist.length < 2) { body.innerHTML = '<div style="color:var(--dim);text-align:center;padding:40px 0">Not enough data yet — chart will appear after a few snapshots</div>'; return; }

    const W = 560, H = 150, PAD = { top: 20, right: 20, bottom: 30, left: 50 };
    const pw = W - PAD.left - PAD.right, ph = H - PAD.top - PAD.bottom;
    const pts = hist.map(h => h.totalPoints);
    const minV = Math.min(...pts) * 0.98, maxV = Math.max(...pts) * 1.02;
    const rangeV = maxV - minV || 1;
    const minT = hist[0].ts, maxT = hist[hist.length - 1].ts;
    const rangeT = maxT - minT || 1;

    const x = i => PAD.left + ((hist[i].ts - minT) / rangeT) * pw;
    const y = i => PAD.top + ph - ((pts[i] - minV) / rangeV) * ph;

    // Build path
    let pathD = `M${x(0)},${y(0)}`;
    for (let i = 1; i < hist.length; i++) pathD += ` L${x(i)},${y(i)}`;
    // Area fill
    let areaD = pathD + ` L${x(hist.length-1)},${PAD.top+ph} L${x(0)},${PAD.top+ph} Z`;

    // Grid lines (4 horizontal)
    let gridLines = '';
    for (let g = 0; g <= 4; g++) {
      const gy = PAD.top + (g / 4) * ph;
      const gv = maxV - (g / 4) * rangeV;
      gridLines += `<line x1="${PAD.left}" y1="${gy}" x2="${PAD.left+pw}" y2="${gy}" stroke="var(--border)" stroke-width="0.5"/>`;
      gridLines += `<text x="${PAD.left-6}" y="${gy+3}" text-anchor="end" fill="var(--dim)" font-size="9">${(gv/1000).toFixed(1)}k</text>`;
    }

    // Time labels (up to 5)
    let timeLabels = '';
    const labelCount = Math.min(5, hist.length);
    for (let l = 0; l < labelCount; l++) {
      const idx = Math.floor(l * (hist.length - 1) / (labelCount - 1));
      const dt = new Date(hist[idx].ts);
      const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      timeLabels += `<text x="${x(idx)}" y="${H-4}" text-anchor="middle" fill="var(--dim)" font-size="9">${label}</text>`;
    }

    // Dots on last point
    const lastX = x(hist.length - 1), lastY = y(hist.length - 1);

    // Collection breakdown lines if available
    let collectionPaths = '';
    const collNames = new Set();
    hist.forEach(h => { if (h.collections) Object.keys(h.collections).forEach(k => collNames.add(k)); });
    const collColors = ['#3b82f6', '#a78bfa', '#f59e0b', '#ef4444', '#34d399'];
    let ci = 0;
    for (const cn of collNames) {
      if (cn === 'mem0migrations' || cn === 'memory_migrations') continue;
      const color = collColors[ci++ % collColors.length];
      let cp = '';
      for (let i = 0; i < hist.length; i++) {
        const v = hist[i].collections?.[cn] || 0;
        const cy = PAD.top + ph - ((v - minV) / rangeV) * ph;
        cp += i === 0 ? `M${x(i)},${cy}` : ` L${x(i)},${cy}`;
      }
      if (cp) collectionPaths += `<path d="${cp}" fill="none" stroke="${color}" stroke-width="1" opacity="0.4" stroke-dasharray="3,3"/>`;
    }

    body.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${W}px">
        ${gridLines}
        <path d="${areaD}" fill="url(#memGrowthGrad)" opacity="0.3"/>
        ${collectionPaths}
        <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2"/>
        <circle cx="${lastX}" cy="${lastY}" r="3" fill="var(--accent)"/>
        <text x="${lastX+6}" y="${lastY-4}" fill="var(--accent)" font-size="10" font-weight="700">${pts[pts.length-1].toLocaleString()}</text>
        ${timeLabels}
        <defs><linearGradient id="memGrowthGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      </svg>
      <div style="margin-top:6px;font-size:10px;color:var(--dim);display:flex;gap:12px;flex-wrap:wrap">
        <span>📊 ${hist.length} snapshots</span>
        <span>📈 ${pts[pts.length-1] > pts[0] ? '+' : ''}${(pts[pts.length-1] - pts[0]).toLocaleString()} since first snapshot</span>
        <span>⏱️ ${((maxT - minT) / 3600000).toFixed(1)}h window</span>
      </div>`;
  } catch {}
}

// ===== TOKENS =====
async function refreshTokens() {
  try {
    const r = await fetchWithTimeout(API+'/tokens', {}, 10000); const d = await r.json();
    document.getElementById('ss-cost').textContent = '$' + d.estimatedCostUSD.toFixed(2);
    const qsc = document.getElementById('qs-cost'); if(qsc) animateValue(qsc, '$' + d.estimatedCostUSD.toFixed(2));
    const fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
    const totalTok = (d.totals.input||0) + (d.totals.output||0);
    const tokLabel = totalTok >= 1e6 ? (totalTok/1e6).toFixed(1)+'M' : totalTok >= 1000 ? (totalTok/1000).toFixed(1)+'K' : String(totalTok);
    const qst = document.getElementById('qs-tokens'); if(qst) animateValue(qst, tokLabel);
    const cacheRatio = d.totals.input > 0 ? Math.round((d.totals.cached / d.totals.input) * 100) : 0;
    document.getElementById('tok-top').innerHTML=`
      <div class="card"><h3>Input Tokens</h3><div class="metric blue">${fmtK(d.totals.input)}</div><div class="sub">Cached: ${fmtK(d.totals.cached)}${cacheRatio > 0 ? ` (${cacheRatio}% hit rate)` : ''}</div>${d.totals.input > 0 ? `<div class="bar-bg"><div class="bar-fill green" style="width:${cacheRatio}%"></div></div><div class="sub" style="font-size:10px;margin-top:2px">Cache utilization</div>` : ''}</div>
      <div class="card"><h3>Output Tokens</h3><div class="metric blue">${fmtK(d.totals.output)}</div>${totalTok > 0 ? `<div class="sub">I/O ratio: ${d.totals.input > 0 ? (d.totals.output / d.totals.input).toFixed(1) : '—'}x</div>` : '<div class="sub" style="color:var(--dim)">No session data yet</div>'}</div>
      <div class="card"><h3>Est. Cost</h3><div class="metric green">$${d.estimatedCostUSD.toFixed(2)}</div><div class="sub">${d.note||''}</div></div>`;
    const agents=Object.entries(d.byAgent).sort((a,b)=>(b[1].input+b[1].output)-(a[1].input+a[1].output));
    document.getElementById('tok-agents').innerHTML=`<h3>💰 By Agent</h3>${agents.length?`<ul class="service-list">${agents.map(([n,v])=>{
      const total = v.input+v.output;
      const pct = d.totals.input+d.totals.output > 0 ? Math.round(total/(d.totals.input+d.totals.output)*100) : 0;
      return `<li style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:8px;width:100%"><span>${esc(n)}</span><span style="margin-left:auto;font-weight:600">${fmtK(total)}</span><span style="color:var(--dim);margin-left:8px;font-size:11px">${pct}%</span></div><div class="bar-bg" style="width:100%;margin-top:4px"><div class="bar-fill green" style="width:${Math.max(pct,2)}%"></div></div></li>`;
    }).join('')}</ul>`:'<div class="sub">No per-agent data</div>'}`;
    // Model pricing reference
    let pricingEl = document.getElementById('tok-pricing');
    if(d.pricing && Object.keys(d.pricing).length) {
      if(!pricingEl) {
        pricingEl = document.createElement('div');
        pricingEl.id = 'tok-pricing';
        pricingEl.className = 'card'; pricingEl.style.marginTop = '12px';
        document.getElementById('tok-agents').parentNode.appendChild(pricingEl);
      }
      pricingEl.innerHTML = `<h3>📊 Model Pricing ($/1M tokens)</h3><ul class="service-list">${Object.entries(d.pricing).map(([model,p])=>{
        const cached = p.cachedInput ? ` · cached $${p.cachedInput}` : '';
        return `<li style="font-size:12px"><span style="color:var(--accent);font-weight:600">${model}</span><span style="margin-left:auto;color:var(--dim)">in $${p.input} · out $${p.output}${cached}</span></li>`;
      }).join('')}</ul>`;
    } else if(pricingEl) { pricingEl.remove(); }
  } catch{}
}

// ===== DAILY COST TREND =====
async function refreshDailyCost() {
  try {
    const r = await fetchWithTimeout(API+'/tokens/daily', {}, 10000); const d = await r.json();
    let el = document.getElementById('tok-daily-cost');
    if(!el) {
      el = document.createElement('div'); el.id = 'tok-daily-cost'; el.className = 'card'; el.style.marginTop = '12px';
      document.getElementById('tok-agents').parentNode.appendChild(el);
    }
    if(!d.days?.length) { el.innerHTML='<h3>📈 Daily Cost Trend</h3><div class="sub">No data</div>'; return; }
    const maxCost = Math.max(...d.days.map(x=>x.cost), 0.01);
    const maxTok = Math.max(...d.days.map(x=>x.input+x.output), 1);
    const agentColors = {};
    const palette = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#d946ef'];
    (d.agents||[]).forEach((a,i) => agentColors[a] = palette[i % palette.length]);
    const barW = Math.max(20, Math.min(48, Math.floor(700 / d.days.length) - 4));
    const chartH = 160;
    const totalCost = d.days.reduce((s,x)=>s+x.cost, 0);
    const avgCost = totalCost / d.days.length;
    el.innerHTML = `
      <h3>📈 Daily Cost Trend <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;color:var(--dim)">(last ${d.days.length} days · total $${totalCost.toFixed(2)} · avg $${avgCost.toFixed(2)}/day)</span></h3>
      <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:300px">
          <div style="display:flex;align-items:flex-end;gap:3px;height:${chartH}px;padding:0 4px">
            ${d.days.map(day => {
              const h = Math.max(2, (day.cost / maxCost) * (chartH - 20));
              const label = day.date.slice(5); // MM-DD
              const weekday = new Date(day.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'});
              // Stacked by agent
              const agents = Object.entries(day.byAgent).sort((a,b)=>(b[1].input+b[1].output)-(a[1].input+a[1].output));
              const totalDay = day.input+day.output||1;
              let segments = '';
              let yOff = 0;
              for(const [aName, aData] of agents) {
                const frac = (aData.input+aData.output)/totalDay;
                const segH = Math.max(1, frac * h);
                segments += `<div style="width:100%;height:${segH}px;background:${agentColors[aName]||'#555'};opacity:0.85;border-radius:${yOff===0?'3px 3px ':''}0 0" title="${aName}: ${((aData.input+aData.output)/1000).toFixed(0)}K tokens"></div>`;
                yOff += segH;
              }
              if(!agents.length) segments = `<div style="width:100%;height:${h}px;background:var(--border);border-radius:3px 3px 0 0"></div>`;
              return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:${barW}px;max-width:60px" title="${day.date}: $${day.cost.toFixed(2)}">
                <div style="font-size:9px;color:var(--accent);font-weight:700;margin-bottom:2px;font-variant-numeric:tabular-nums">$${day.cost < 1 ? day.cost.toFixed(2) : day.cost.toFixed(1)}</div>
                <div style="display:flex;flex-direction:column;width:100%;justify-content:flex-end;height:${chartH-30}px">${segments}</div>
                <div style="font-size:8px;color:var(--dim);margin-top:3px;font-family:'SF Mono',Menlo,monospace;white-space:nowrap">${weekday}<br>${label}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div style="min-width:140px">
          <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">By Agent</div>
          ${(d.agents||[]).map(a => `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:4px"><span style="width:8px;height:8px;border-radius:2px;background:${agentColors[a]};flex-shrink:0"></span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a}</span></div>`).join('')}
        </div>
      </div>`;
    // ===== TOKEN USAGE OVER TIME (input vs output line chart) =====
    let tokTrendEl = document.getElementById('tok-usage-trend');
    if(!tokTrendEl) {
      tokTrendEl = document.createElement('div'); tokTrendEl.id = 'tok-usage-trend'; tokTrendEl.className = 'card'; tokTrendEl.style.marginTop = '12px';
      document.getElementById('tok-agents').parentNode.appendChild(tokTrendEl);
    }
    if(d.days?.length >= 2) {
      const days = d.days;
      const chartW = 700, chartH = 180, padL = 50, padR = 20, padT = 10, padB = 30;
      const w = chartW - padL - padR, h = chartH - padT - padB;
      const maxIn = Math.max(...days.map(x=>x.input), 1);
      const maxOut = Math.max(...days.map(x=>x.output), 1);
      const maxCached = Math.max(...days.map(x=>x.cached||0), 1);
      const maxVal = Math.max(maxIn, maxOut, maxCached);
      const fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(n);
      const x = i => padL + (i / (days.length - 1)) * w;
      const y = v => padT + h - (v / maxVal) * h;

      const mkLine = (key, color) => days.map((d,i) => `${i===0?'M':'L'}${x(i).toFixed(1)},${y(d[key]||0).toFixed(1)}`).join(' ');
      const mkArea = (key, color) => {
        const pts = days.map((d,i) => `${x(i).toFixed(1)},${y(d[key]||0).toFixed(1)}`);
        return `M${pts[0]} L${pts.join(' L')} L${x(days.length-1).toFixed(1)},${(padT+h).toFixed(1)} L${padL},${(padT+h).toFixed(1)} Z`;
      };

      // Grid lines
      const gridLines = [0, 0.25, 0.5, 0.75, 1].map(frac => {
        const yy = padT + h - frac * h;
        const val = fmtK(Math.round(frac * maxVal));
        return `<line x1="${padL}" y1="${yy}" x2="${padL+w}" y2="${yy}" stroke="var(--border)" stroke-width="0.5"/>
          <text x="${padL-6}" y="${yy+3}" text-anchor="end" fill="var(--dim)" font-size="8" font-family="'SF Mono',Menlo,monospace">${val}</text>`;
      }).join('');

      // X-axis labels (every 2-3 days)
      const step = days.length <= 7 ? 1 : days.length <= 14 ? 2 : 3;
      const xLabels = days.filter((_,i) => i % step === 0 || i === days.length-1).map((d,_,arr) => {
        const idx = days.indexOf(d);
        const label = d.date.slice(5);
        return `<text x="${x(idx)}" y="${padT+h+16}" text-anchor="middle" fill="var(--dim)" font-size="8" font-family="'SF Mono',Menlo,monospace">${label}</text>`;
      }).join('');

      // Totals for summary
      const totalIn = days.reduce((s,d)=>s+d.input,0);
      const totalOut = days.reduce((s,d)=>s+d.output,0);
      const totalCachedAll = days.reduce((s,d)=>s+(d.cached||0),0);

      tokTrendEl.innerHTML = `
        <h3>📊 Token Usage Over Time <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;color:var(--dim)">(input vs output vs cached, ${days.length} days)</span></h3>
        <div style="display:flex;gap:16px;align-items:center;margin:8px 0;flex-wrap:wrap">
          <span style="display:flex;align-items:center;gap:4px;font-size:11px"><span style="width:12px;height:3px;background:#3b82f6;border-radius:2px"></span> Input <span style="color:var(--dim)">(${fmtK(totalIn)})</span></span>
          <span style="display:flex;align-items:center;gap:4px;font-size:11px"><span style="width:12px;height:3px;background:#22c55e;border-radius:2px"></span> Output <span style="color:var(--dim)">(${fmtK(totalOut)})</span></span>
          <span style="display:flex;align-items:center;gap:4px;font-size:11px"><span style="width:12px;height:3px;background:#a78bfa;border-radius:2px"></span> Cached <span style="color:var(--dim)">(${fmtK(totalCachedAll)})</span></span>
        </div>
        <div style="overflow-x:auto">
          <svg viewBox="0 0 ${chartW} ${chartH}" width="100%" style="max-height:220px;display:block">
            ${gridLines}
            <path d="${mkArea('cached','#a78bfa')}" fill="rgba(167,139,250,0.08)"/>
            <path d="${mkArea('output','#22c55e')}" fill="rgba(34,197,94,0.08)"/>
            <path d="${mkArea('input','#3b82f6')}" fill="rgba(59,130,246,0.08)"/>
            <path d="${mkLine('cached','#a78bfa')}" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
            <path d="${mkLine('output','#22c55e')}" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${mkLine('input','#3b82f6')}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${days.map((d,i) => `<circle cx="${x(i)}" cy="${y(d.input)}" r="2.5" fill="#3b82f6" opacity="0.8"/><circle cx="${x(i)}" cy="${y(d.output)}" r="2.5" fill="#22c55e" opacity="0.8"/>`).join('')}
            ${xLabels}
          </svg>
        </div>`;
    } else {
      tokTrendEl.innerHTML = '<h3>📊 Token Usage Over Time</h3><div class="sub">Need at least 2 days of data</div>';
    }
  } catch(e) { console.error('Daily cost error:', e); }
}

// ===== PERFORMANCE =====
async function refreshPerformance() {
  try {
    const r = await fetchWithTimeout(API+'/performance', {}, 10000); const d = await r.json();
    const s = d.summary || {};
    const fmtDur = ms => ms >= 60000 ? (ms/60000).toFixed(1)+'m' : ms >= 1000 ? (ms/1000).toFixed(1)+'s' : ms+'ms';
    const avgDurAll = d.agents?.length ? Math.round(d.agents.reduce((a,x)=>a+x.avgDurationMs,0)/d.agents.length) : 0;
    document.getElementById('perf-summary').innerHTML = `
      <div class="card"><h3>Total Runs</h3><div class="metric blue">${s.totalRuns||0}</div><div class="sub">${s.totalSucceeded||0} succeeded · ${s.totalFailed||0} failed</div></div>
      <div class="card"><h3>Success Rate</h3><div class="metric ${(s.overallSuccessRate||0)>=90?'green':(s.overallSuccessRate||0)>=70?'orange':'red'}">${s.overallSuccessRate||0}%</div><div class="bar-bg"><div class="bar-fill ${(s.overallSuccessRate||0)>=90?'green':(s.overallSuccessRate||0)>=70?'orange':'red'}" style="width:${s.overallSuccessRate||0}%"></div></div></div>
      <div class="card"><h3>Avg Duration</h3><div class="metric blue">${fmtDur(avgDurAll)}</div><div class="sub">Across all cron agents</div></div>`;
    // Workload Distribution Donut
    if(d.agents?.length) {
      const donutSvg = document.getElementById('perf-donut-svg');
      const donutLegend = document.getElementById('perf-donut-legend');
      const totalRuns = d.agents.reduce((s,a) => s + a.total, 0);
      if(donutSvg && totalRuns > 0) {
        const cx2=80, cy2=80, r2=55, sw=16;
        let cumA = -Math.PI/2;
        let paths = '';
        d.agents.forEach((a,i) => {
          const frac = a.total / totalRuns;
          const angle = frac * 2 * Math.PI;
          const large = angle > Math.PI ? 1 : 0;
          const x1 = cx2 + r2 * Math.cos(cumA), y1 = cy2 + r2 * Math.sin(cumA);
          cumA += angle;
          const x2 = cx2 + r2 * Math.cos(cumA), y2 = cy2 + r2 * Math.sin(cumA);
          if(frac >= 0.999) paths += `<circle cx="${cx2}" cy="${cy2}" r="${r2}" fill="none" stroke="${a.color}" stroke-width="${sw}" opacity="0.85"/>`;
          else if(frac > 0.005) paths += `<path d="M${x1},${y1} A${r2},${r2} 0 ${large} 1 ${x2},${y2}" fill="none" stroke="${a.color}" stroke-width="${sw}" stroke-linecap="round" opacity="0.85"/>`;
        });
        paths += `<text x="${cx2}" y="${cy2-4}" text-anchor="middle" fill="#e2e8f0" font-size="18" font-weight="800">${totalRuns}</text>`;
        paths += `<text x="${cx2}" y="${cy2+12}" text-anchor="middle" fill="#64748b" font-size="9">total runs</text>`;
        donutSvg.innerHTML = paths;
        donutLegend.innerHTML = d.agents.map(a => {
          const pct = ((a.total/totalRuns)*100).toFixed(1);
          return `<span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:${a.color}"></span>${a.name} (${pct}%)</span>`;
        }).join('');
      }
      // Reliability Ranking
      const relBody = document.getElementById('perf-reliability-body');
      if(relBody) {
        const sorted = [...d.agents].sort((a,b) => b.successRate - a.successRate || a.avgDurationMs - b.avgDurationMs);
        relBody.innerHTML = sorted.map((a,i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span style="width:18px;display:inline-block;text-align:center;font-size:10px;color:var(--dim)">#${i+1}</span>`;
          const rateCol = a.successRate >= 95 ? 'var(--green)' : a.successRate >= 80 ? 'var(--orange)' : 'var(--red)';
          const fmtD = ms => ms >= 60000 ? (ms/60000).toFixed(1)+'m' : (ms/1000).toFixed(1)+'s';
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="flex-shrink:0">${medal}</span>
            <span style="font-weight:700;color:${a.color};flex:1">${a.name}</span>
            <span style="font-weight:700;color:${rateCol};font-variant-numeric:tabular-nums">${a.successRate}%</span>
            <span style="color:var(--dim);font-size:10px;min-width:40px;text-align:right">${fmtD(a.avgDurationMs)}</span>
          </div>`;
        }).join('');
      }
    }
    // Response Time Histogram
    const histBody = document.getElementById('perf-histogram-body');
    if(histBody && d.agents?.length) {
      // Collect all durations across agents
      const allDurations = [];
      d.agents.forEach(a => {
        (a.durationTrend||[]).forEach(t => allDurations.push({ms:t.ms, agent:a.name, color:a.color}));
      });
      if(allDurations.length >= 2) {
        // Create logarithmic-ish buckets: 0-10s, 10-30s, 30-60s, 1-2m, 2-5m, 5-10m, 10+m
        const buckets = [
          {label:'0-10s', min:0, max:10000},
          {label:'10-30s', min:10000, max:30000},
          {label:'30s-1m', min:30000, max:60000},
          {label:'1-2m', min:60000, max:120000},
          {label:'2-5m', min:120000, max:300000},
          {label:'5-10m', min:300000, max:600000},
          {label:'10m+', min:600000, max:Infinity}
        ];
        // Count per bucket per agent
        const agentNames = d.agents.map(a=>a.name);
        const agentColors = {}; d.agents.forEach(a=>agentColors[a.name]=a.color);
        const counts = buckets.map(()=>{const o={};agentNames.forEach(n=>o[n]=0);return o;});
        allDurations.forEach(d=>{
          const bi = buckets.findIndex(b=>d.ms>=b.min&&d.ms<b.max);
          if(bi>=0) counts[bi][d.agent]++;
        });
        const maxCount = Math.max(...counts.map(c=>Object.values(c).reduce((a,b)=>a+b,0)),1);
        const barH = 140, barW = 100/(buckets.length);
        // SVG histogram
        const svgW = 600, svgH = 180, padL = 30, padB = 30, padT = 10, padR = 10;
        const chartW = svgW-padL-padR, chartH = svgH-padT-padB;
        const bw = chartW/buckets.length;
        let bars = '';
        // Grid lines
        for(let i=0;i<=4;i++){
          const y = padT + (i/4)*chartH;
          const val = Math.round(maxCount*(1-i/4));
          bars += `<line x1="${padL}" y1="${y}" x2="${svgW-padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
          bars += `<text x="${padL-4}" y="${y+3}" text-anchor="end" fill="var(--dim)" font-size="8">${val}</text>`;
        }
        buckets.forEach((b,bi)=>{
          const total = Object.values(counts[bi]).reduce((a,b)=>a+b,0);
          const x = padL + bi*bw;
          let stackY = padT + chartH; // bottom
          agentNames.forEach(name=>{
            const c = counts[bi][name];
            if(c===0) return;
            const h = (c/maxCount)*chartH;
            stackY -= h;
            bars += `<rect x="${x+2}" y="${stackY}" width="${bw-4}" height="${h}" rx="2" fill="${agentColors[name]}" opacity="0.8"><title>${name}: ${c} runs (${b.label})</title></rect>`;
          });
          // Total count label on top
          if(total>0) bars += `<text x="${x+bw/2}" y="${stackY-3}" text-anchor="middle" fill="var(--text)" font-size="8" font-weight="700">${total}</text>`;
          // Bucket label
          bars += `<text x="${x+bw/2}" y="${svgH-padB+14}" text-anchor="middle" fill="var(--dim)" font-size="8">${b.label}</text>`;
        });
        // Stats summary
        const allMs = allDurations.map(d=>d.ms).sort((a,b)=>a-b);
        const p50 = allMs[Math.floor(allMs.length*0.5)];
        const p90 = allMs[Math.floor(allMs.length*0.9)];
        const p99 = allMs[Math.floor(allMs.length*0.99)];
        histBody.innerHTML = `
          <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap">
            <span>P50: <b style="color:var(--green)">${fmtDur(p50)}</b></span>
            <span>P90: <b style="color:var(--orange)">${fmtDur(p90)}</b></span>
            <span>P99: <b style="color:var(--red)">${fmtDur(p99)}</b></span>
            <span style="color:var(--dim)">${allDurations.length} samples</span>
          </div>
          <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="display:block">${bars}</svg>
          <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;justify-content:center">${agentNames.map(n=>`<span style="display:flex;align-items:center;gap:4px;font-size:10px"><span style="width:8px;height:8px;border-radius:2px;background:${agentColors[n]}"></span>${n}</span>`).join('')}</div>`;
      } else {
        histBody.innerHTML = '<div style="color:var(--dim)">Not enough data for histogram</div>';
      }
    }

    // Overall Success Rate Trend (aggregate)
    const otBody = document.getElementById('perf-overall-trend-body');
    if(otBody && d.agents?.length) {
      // Merge all agents' successRateTrend into time-bucketed aggregate
      const allPts = [];
      d.agents.forEach(a => (a.successRateTrend||[]).forEach(p => allPts.push(p)));
      allPts.sort((a,b) => a.ts - b.ts);
      if(allPts.length >= 3) {
        // Bucket by ~5min windows, average the rates
        const bucketMs = 300000;
        const buckets = [];
        let curBucket = null;
        allPts.forEach(p => {
          const bk = Math.floor(p.ts / bucketMs) * bucketMs;
          if(!curBucket || curBucket.ts !== bk) { curBucket = {ts:bk, rates:[], sum:0}; buckets.push(curBucket); }
          curBucket.rates.push(p.rate); curBucket.sum += p.rate;
        });
        const pts = buckets.map(b => ({ts:b.ts, rate:Math.round(b.sum/b.rates.length)}));
        const svgW=600, svgH=160, padL=35, padR=10, padT=15, padB=30;
        const cW=svgW-padL-padR, cH=svgH-padT-padB;
        // Y axis: 0-100%
        let svg = '';
        // Grid
        for(let i=0;i<=4;i++){
          const y=padT+(i/4)*cH;
          const val=100-i*25;
          svg+=`<line x1="${padL}" y1="${y}" x2="${svgW-padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
          svg+=`<text x="${padL-4}" y="${y+3}" text-anchor="end" fill="var(--dim)" font-size="8">${val}%</text>`;
        }
        // Danger zone fill below 80%
        const y80=padT+(1-80/100)*cH;
        svg+=`<rect x="${padL}" y="${y80}" width="${cW}" height="${padT+cH-y80}" fill="var(--red)" opacity="0.04"/>`;
        // Line + area
        const xScale=i=>padL+(i/(pts.length-1))*cW;
        const yScale=v=>padT+(1-v/100)*cH;
        const lineP=pts.map((p,i)=>`${xScale(i)},${yScale(p.rate)}`).join(' ');
        const areaP=lineP+` ${xScale(pts.length-1)},${padT+cH} ${padL},${padT+cH}`;
        svg+=`<defs><linearGradient id="otg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--green)" stop-opacity="0.2"/><stop offset="100%" stop-color="var(--green)" stop-opacity="0.01"/></linearGradient></defs>`;
        svg+=`<polygon points="${areaP}" fill="url(#otg)"/>`;
        svg+=`<polyline points="${lineP}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        // Dots
        pts.forEach((p,i)=>{
          const col=p.rate>=90?'var(--green)':p.rate>=70?'var(--orange)':'var(--red)';
          svg+=`<circle cx="${xScale(i)}" cy="${yScale(p.rate)}" r="2.5" fill="${col}" opacity="0.8"><title>${p.rate}% — ${new Date(p.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</title></circle>`;
        });
        // Time labels
        const first=pts[0], last=pts[pts.length-1];
        const timeFmt=ts=>new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        svg+=`<text x="${padL}" y="${svgH-padB+16}" fill="var(--dim)" font-size="8">${timeFmt(first.ts)}</text>`;
        svg+=`<text x="${svgW-padR}" y="${svgH-padB+16}" text-anchor="end" fill="var(--dim)" font-size="8">${timeFmt(last.ts)}</text>`;
        // Current rate highlight
        const curRate=pts[pts.length-1].rate;
        const curCol=curRate>=90?'var(--green)':curRate>=70?'var(--orange)':'var(--red)';
        otBody.innerHTML=`<div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
          <span style="font-size:24px;font-weight:800;color:${curCol}">${curRate}%</span>
          <span style="color:var(--dim);font-size:11px">current · ${pts.length} data points</span>
          <span style="margin-left:auto;font-size:10px;color:var(--dim)">🔴 &lt;80% danger zone shaded</span>
        </div>
        <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="display:block">${svg}</svg>`;
      } else {
        otBody.innerHTML='<div style="color:var(--dim)">Not enough data points yet</div>';
      }
    }

    if(!d.agents?.length) { document.getElementById('perf-agents').innerHTML='<h3>📊 Agent Performance</h3><div class="sub">No cron agent data</div>'; return; }
    document.getElementById('perf-agents').innerHTML = '<h3>📊 Agent Performance</h3>' + d.agents.map(a => {
      const rateColor = a.successRate>=90?'var(--green)':a.successRate>=70?'var(--orange)':'var(--red)';
      // Mini bar chart from hourBuckets
      const maxB = Math.max(...(a.hourBuckets||[]), 1);
      const barsHtml = (a.hourBuckets||[]).map(b => {
        const h = b > 0 ? Math.max(Math.round((b/maxB)*20), 2) : 1;
        return `<div style="flex:1;height:${h}px;background:${b>0?a.color:'var(--border)'};border-radius:1px;opacity:${b>0?0.8:0.2}"></div>`;
      }).join('');
      // Duration trend SVG line chart
      const trend = a.durationTrend || [];
      let trendHtml = '';
      if (trend.length >= 2) {
        const tw = 280, th = 50, pad = 2;
        const maxMs = Math.max(...trend.map(t=>t.ms), 1);
        const minMs = Math.min(...trend.map(t=>t.ms), 0);
        const range = maxMs - minMs || 1;
        const pts = trend.map((t,i) => `${pad + (i/(Math.max(trend.length-1,1)))*(tw-pad*2)},${pad + (1 - (t.ms-minMs)/range)*(th-pad*2)}`).join(' ');
        // Area fill
        const areaPts = pts + ` ${pad+(trend.length-1)/(trend.length-1)*(tw-pad*2)},${th-pad} ${pad},${th-pad}`;
        // Avg line
        const avgY = pad + (1 - (a.avgDurationMs-minMs)/range)*(th-pad*2);
        trendHtml = `<div style="margin:8px 0 4px"><div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">⏱ Response Time Trend</div>
          <svg width="100%" viewBox="0 0 ${tw} ${th+10}" style="display:block;max-width:100%">
            <defs><linearGradient id="tg-${a.name.replace(/\s/g,'')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${a.color}" stop-opacity="0.25"/><stop offset="100%" stop-color="${a.color}" stop-opacity="0.02"/></linearGradient></defs>
            <polygon points="${areaPts}" fill="url(#tg-${a.name.replace(/\s/g,'')})" />
            <line x1="${pad}" y1="${avgY}" x2="${tw-pad}" y2="${avgY}" stroke="${a.color}" stroke-width="0.5" stroke-dasharray="3,2" opacity="0.5"/>
            <polyline points="${pts}" fill="none" stroke="${a.color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            ${trend.map((t,i) => {
              const cx = pad + (i/(Math.max(trend.length-1,1)))*(tw-pad*2);
              const cy = pad + (1 - (t.ms-minMs)/range)*(th-pad*2);
              return `<circle cx="${cx}" cy="${cy}" r="2" fill="${a.color}" opacity="0.7"><title>${fmtDur(t.ms)} — ${new Date(t.ts).toLocaleTimeString()}</title></circle>`;
            }).join('')}
            <text x="${tw-pad}" y="${avgY-3}" text-anchor="end" fill="${a.color}" font-size="7" opacity="0.6">avg ${fmtDur(a.avgDurationMs)}</text>
            <text x="${pad}" y="${th+8}" fill="#64748b" font-size="7">${trend.length > 0 ? new Date(trend[0].ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</text>
            <text x="${tw-pad}" y="${th+8}" text-anchor="end" fill="#64748b" font-size="7">${trend.length > 0 ? new Date(trend[trend.length-1].ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</text>
          </svg></div>`;
      }
      // Error log section
      const errors = a.errorLog || [];
      let errorHtml = '';
      if (errors.length > 0) {
        errorHtml = `<details style="margin-top:6px"><summary style="font-size:10px;color:var(--red);cursor:pointer;font-weight:600">⚠️ ${errors.length} Error${errors.length>1?'s':''}</summary>
          <div style="margin-top:4px;max-height:120px;overflow-y:auto">${errors.map(e => {
            const time = e.ts ? new Date(e.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '?';
            const summary = e.summary ? e.summary.replace(/</g,'&lt;').slice(0,200) : 'No details';
            return `<div style="padding:4px 6px;margin-bottom:3px;background:var(--red-dim);border-radius:6px;border-left:2px solid var(--red);font-size:10px">
              <div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="color:var(--red);font-weight:600">${time}</span>${e.durationMs?`<span style="color:var(--dim)">⏱${fmtDur(e.durationMs)}</span>`:''}</div>
              <div style="color:var(--dim);word-break:break-word">${summary}</div></div>`;
          }).join('')}</div></details>`;
      }
      return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="width:10px;height:10px;border-radius:3px;background:${a.color};flex-shrink:0"></span>
          <span style="font-weight:700;color:${a.color}">${a.name}</span>
          <span style="font-size:10px;padding:1px 8px;border-radius:10px;background:${rateColor}22;color:${rateColor};font-weight:700">${a.successRate}%</span>
          <span style="margin-left:auto;font-size:11px;color:var(--dim)">${a.total} runs</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:11px;margin-bottom:6px">
          <div style="text-align:center"><div style="color:var(--dim);font-size:9px;text-transform:uppercase">Avg</div><div style="font-weight:700">${fmtDur(a.avgDurationMs)}</div></div>
          <div style="text-align:center"><div style="color:var(--dim);font-size:9px;text-transform:uppercase">Min</div><div style="font-weight:700">${fmtDur(a.minDurationMs)}</div></div>
          <div style="text-align:center"><div style="color:var(--dim);font-size:9px;text-transform:uppercase">Max</div><div style="font-weight:700">${fmtDur(a.maxDurationMs)}</div></div>
          <div style="text-align:center"><div style="color:var(--dim);font-size:9px;text-transform:uppercase">Last 1h</div><div style="font-weight:700;color:var(--accent)">${a.last1h}</div></div>
        </div>
        <div style="display:flex;gap:1px;align-items:end;height:20px" title="Runs per hour (last 24h)">${barsHtml}</div>
        <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--dim);margin-top:2px"><span>24h ago</span><span>now</span></div>
        ${trendHtml}
        ${(() => {
          const srt = a.successRateTrend || [];
          if (srt.length < 2) return '';
          const sw = 280, sh = 40, pad = 2;
          const pts = srt.map((t,i) => `${pad + (i/(srt.length-1))*(sw-pad*2)},${pad + (1 - t.rate/100)*(sh-pad*2)}`).join(' ');
          const areaPts = pts + ` ${pad+(srt.length-1)/(srt.length-1)*(sw-pad*2)},${sh-pad} ${pad},${sh-pad}`;
          const latestRate = srt[srt.length-1].rate;
          const lineColor = latestRate >= 90 ? 'var(--green)' : latestRate >= 70 ? 'var(--orange)' : 'var(--red)';
          return `<div style="margin:8px 0 4px"><div style="font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">✅ Success Rate Over Time <span style="font-weight:700;color:${lineColor}">${latestRate}%</span></div>
            <svg width="100%" viewBox="0 0 ${sw} ${sh+10}" style="display:block;max-width:100%">
              <defs><linearGradient id="sr-${a.name.replace(/\s/g,'')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lineColor}" stop-opacity="0.2"/><stop offset="100%" stop-color="${lineColor}" stop-opacity="0.02"/></linearGradient></defs>
              <line x1="${pad}" y1="${pad}" x2="${sw-pad}" y2="${pad}" stroke="var(--border)" stroke-width="0.3" stroke-dasharray="2,2"/>
              <line x1="${pad}" y1="${sh/2}" x2="${sw-pad}" y2="${sh/2}" stroke="var(--border)" stroke-width="0.3" stroke-dasharray="2,2"/>
              <text x="${pad}" y="${pad+3}" fill="var(--dim)" font-size="6">100%</text>
              <text x="${pad}" y="${sh/2+3}" fill="var(--dim)" font-size="6">50%</text>
              <polygon points="${areaPts}" fill="url(#sr-${a.name.replace(/\s/g,'')})" />
              <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              ${srt.map((t,i) => {
                const cx = pad + (i/(srt.length-1))*(sw-pad*2);
                const cy = pad + (1 - t.rate/100)*(sh-pad*2);
                return `<circle cx="${cx}" cy="${cy}" r="1.5" fill="${lineColor}" opacity="0.7"><title>${t.rate}% — ${new Date(t.ts).toLocaleTimeString()}</title></circle>`;
              }).join('')}
              <text x="${pad}" y="${sh+8}" fill="#64748b" font-size="7">${srt.length>0?new Date(srt[0].ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</text>
              <text x="${sw-pad}" y="${sh+8}" text-anchor="end" fill="#64748b" font-size="7">${srt.length>0?new Date(srt[srt.length-1].ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</text>
            </svg></div>`;
        })()}
        ${errorHtml}
      </div>`;
    }).join('');
  } catch {}
}

// ===== TASK COMPLETION STATS =====
async function refreshCompletionStats() {
  try {
    const r = await fetchWithTimeout(API+'/completion-stats', {}, 10000);
    const d = await r.json();
    const el = document.getElementById('completion-stats');
    if (!el) return;

    const fmtDur = ms => {
      if (!ms) return 'N/A';
      if (ms < 3600000) return Math.round(ms/60000) + 'm';
      if (ms < 86400000) return (ms/3600000).toFixed(1) + 'h';
      return (ms/86400000).toFixed(1) + 'd';
    };

    const rateColor = d.rate >= 70 ? 'var(--green)' : d.rate >= 40 ? 'var(--orange)' : 'var(--dim)';

    // Summary row
    let html = `<h3>✅ Task Completion</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0">
        <div style="text-align:center"><div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Rate</div><div style="font-size:22px;font-weight:800;color:${rateColor}">${d.rate}%</div></div>
        <div style="text-align:center"><div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Completed</div><div style="font-size:22px;font-weight:800;color:var(--green)">${d.completed}</div></div>
        <div style="text-align:center"><div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Open</div><div style="font-size:22px;font-weight:800;color:var(--accent)">${d.open}</div></div>
        <div style="text-align:center"><div style="font-size:9px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Avg Time</div><div style="font-size:22px;font-weight:800;color:var(--text)">${fmtDur(d.avgDurationMs)}</div></div>
      </div>
      <div class="bar-bg" style="margin-bottom:12px"><div class="bar-fill ${d.rate>=70?'green':d.rate>=40?'orange':'red'}" style="width:${d.rate}%"></div></div>`;

    // By owner
    const owners = Object.entries(d.byOwner || {}).sort((a,b) => b[1].total - a[1].total);
    if (owners.length) {
      html += `<div style="margin-top:8px"><div style="font-size:10px;color:var(--dim);text-transform:uppercase;margin-bottom:6px;font-weight:600">By Owner</div>`;
      for (const [name, v] of owners) {
        const pct = v.total > 0 ? Math.round((v.completed/v.total)*100) : 0;
        const col = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--orange)' : 'var(--dim)';
        html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px">
          <span style="width:90px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col};border-radius:3px"></div></div>
          <span style="min-width:60px;text-align:right;color:${col};font-weight:700;font-variant-numeric:tabular-nums">${v.completed}/${v.total}</span>
        </div>`;
      }
      html += '</div>';
    }

    // Recent completions
    if (d.recentCompletions?.length) {
      html += `<div style="margin-top:12px"><div style="font-size:10px;color:var(--dim);text-transform:uppercase;margin-bottom:6px;font-weight:600">Recent Completions</div>`;
      for (const c of d.recentCompletions) {
        const ago = c.completedAt ? timeAgo(new Date(c.completedAt)) : '';
        html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid var(--border)">
          <span>✅ ${c.title.slice(0,50)}</span>
          <span style="color:var(--dim)">${c.owner || '—'} · ${ago}${c.durationMs > 60000 ? ' · ⏱'+fmtDur(c.durationMs) : ''}</span>
        </div>`;
      }
      html += '</div>';
    }

    el.innerHTML = html;
  } catch {}
}

// ===== COMMUNICATION GRAPH =====
let _commFilterMode = 'active'; // 'active' = hide baseline/zero-count, 'all' = show everything
function toggleCommFilter(mode) {
  _commFilterMode = mode;
  document.getElementById('comm-filter-active').style.opacity = mode === 'active' ? '1' : '0.5';
  document.getElementById('comm-filter-all').style.opacity = mode === 'all' ? '1' : '0.5';
  refreshCommGraph();
}

async function refreshCommGraph() {
  try {
    const r = await fetchWithTimeout(API+'/comm-graph', {}, 10000);
    const d = await r.json();
    const svg = document.getElementById('comm-graph-svg');
    const table = document.getElementById('comm-graph-table');
    if (!svg) return;

    const nodes = d.nodes || [];
    let edges = d.edges || [];

    // Filter edges based on comm filter mode
    if (_commFilterMode === 'active') {
      edges = edges.filter(e => e.count > 0 && !e.baseline);
    }

    // In active mode, only show nodes that participate in at least one edge
    const activeNodes = _commFilterMode === 'active'
      ? nodes.filter(n => edges.some(e => e.from === n.name || e.to === n.name))
      : nodes;

    if (!activeNodes.length) {
      svg.innerHTML = '<text x="50%" y="250" text-anchor="middle" fill="#64748b" font-size="14">' + (_commFilterMode === 'active' ? 'No active communication in the last period' : 'No communication data yet') + '</text>';
      table.innerHTML = '<h3>📊 Communication Edges</h3><div class="sub">No data</div>';
      return;
    }

    const W = svg.clientWidth || 800;
    const H = 500;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * 0.35;

    // Position nodes in a circle
    const nodePos = {};
    activeNodes.forEach((n, i) => {
      const angle = (i / activeNodes.length) * 2 * Math.PI - Math.PI / 2;
      nodePos[n.name] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), color: n.color, role: n.role };
    });

    const maxCount = Math.max(...edges.map(e => e.count), 1);
    let svgContent = '';

    // Defs for arrow markers
    svgContent += '<defs>';
    for (const n of nodes) {
      svgContent += `<marker id="arrow-${n.name.replace(/\s/g,'')}" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,3 L0,6 Z" fill="${n.color}" opacity="0.6"/></marker>`;
    }
    svgContent += '</defs>';

    // Draw edges
    for (const e of edges) {
      const from = nodePos[e.from];
      const to = nodePos[e.to];
      if (!from || !to) continue;
      const isBaseline = e.baseline || e.count === 0;
      const strokeW = isBaseline ? 1 : Math.max(1.5, Math.min(6, (e.count / maxCount) * 6));
      const opacity = isBaseline ? 0.25 : Math.max(0.3, Math.min(0.8, (e.count / maxCount) * 0.8));
      const dashAttr = isBaseline ? ' stroke-dasharray="4,4"' : '';
      // Offset line slightly so bidirectional edges don't overlap
      const dx = to.x - from.x, dy = to.y - from.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const nx = -dy / len * 4, ny = dx / len * 4;
      // Shorten line to not overlap node circles
      const nodeR = 22;
      const sx = from.x + (dx/len)*nodeR + nx, sy = from.y + (dy/len)*nodeR + ny;
      const ex = to.x - (dx/len)*nodeR + nx, ey = to.y - (dy/len)*nodeR + ny;
      const markerId = `arrow-${e.from.replace(/\s/g,'')}`;
      const titleText = isBaseline ? `${e.from} → ${e.to}: configured` : `${e.from} → ${e.to}: ${e.count} messages`;
      svgContent += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${from.color}" stroke-width="${strokeW}" opacity="${opacity}" stroke-linecap="round"${dashAttr} marker-end="url(#${markerId})"><title>${titleText}</title></line>`;
      // Count label at midpoint (skip for baseline-only edges)
      if (!isBaseline) {
        const mx = (sx+ex)/2 + nx*1.5, my = (sy+ey)/2 + ny*1.5;
        svgContent += `<text x="${mx}" y="${my}" text-anchor="middle" fill="${from.color}" font-size="9" font-weight="700" opacity="0.7">${e.count}</text>`;
      }
    }

    // Draw nodes
    for (const n of activeNodes) {
      const p = nodePos[n.name];
      // Glow
      svgContent += `<circle cx="${p.x}" cy="${p.y}" r="28" fill="${p.color}" opacity="0.1"/>`;
      // Node circle
      svgContent += `<circle cx="${p.x}" cy="${p.y}" r="20" fill="var(--card)" stroke="${p.color}" stroke-width="2.5"/>`;
      // Emoji/initial
      const initial = n.name.charAt(0).toUpperCase();
      svgContent += `<text x="${p.x}" y="${p.y+1}" text-anchor="middle" dominant-baseline="central" fill="${p.color}" font-size="14" font-weight="800">${initial}</text>`;
      // Label
      svgContent += `<text x="${p.x}" y="${p.y+34}" text-anchor="middle" fill="${p.color}" font-size="10" font-weight="700">${n.name}</text>`;
      svgContent += `<text x="${p.x}" y="${p.y+45}" text-anchor="middle" fill="var(--dim)" font-size="8">${p.role}</text>`;
    }

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = svgContent;

    // Table
    if (edges.length) {
      const maxE = edges[0].count;
      table.innerHTML = `<h3>📊 Communication Edges (${edges.length})</h3><ul class="service-list">${edges.map(e => {
        const pct = Math.max(Math.round((e.count/maxE)*100), 5);
        const fromColor = nodePos[e.from]?.color || 'var(--dim)';
        return `<li style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:6px;width:100%"><span style="color:${fromColor};font-weight:700">${e.from}</span><span style="color:var(--dim)">→</span><span style="color:${nodePos[e.to]?.color||'var(--dim)'};font-weight:700">${e.to}</span><span style="margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums">${e.count}</span></div><div class="bar-bg" style="width:100%;margin-top:3px"><div class="bar-fill green" style="width:${pct}%;background:${fromColor}"></div></div></li>`;
      }).join('')}</ul>`;
    } else {
      table.innerHTML = '<h3>📊 Communication Edges</h3><div class="sub">No communication detected yet</div>';
    }
  } catch {}
}

// ===== DEPENDENCY GRAPH =====
// ===== HEATMAP CALENDAR =====
let _heatmapData = null;
let _heatmapAgentFilter = 'all';

async function refreshHeatmapCalendar() {
  try {
    const r = await fetchWithTimeout(API+'/heatmap-calendar', {}, 10000);
    _heatmapData = await r.json();
    renderHeatmapCalendar();
  } catch {
    // Retry once after 5s on failure (cold-start resilience)
    setTimeout(async () => {
      try {
        const r = await fetchWithTimeout(API+'/heatmap-calendar', {}, 10000);
        _heatmapData = await r.json();
        renderHeatmapCalendar();
      } catch {}
    }, 5000);
  }
}

function setHeatmapAgent(name) {
  _heatmapAgentFilter = name;
  document.querySelectorAll('.heatmap-agent-btn').forEach(b => {
    b.style.background = b.dataset.agent === name ? 'var(--accent)' : 'var(--card)';
    b.style.color = b.dataset.agent === name ? '#fff' : 'var(--dim)';
  });
  renderHeatmapCalendar();
}

function renderHeatmapCalendar() {
  const d = _heatmapData;
  if (!d || !d.dates) return;

  // Agent filter buttons
  const filterEl = document.getElementById('heatmap-agent-filter');
  const agentNames = Object.keys(d.agents);
  filterEl.innerHTML = `<button class="heatmap-agent-btn activity-filter ${_heatmapAgentFilter==='all'?'active':''}" data-agent="all" onclick="setHeatmapAgent('all')">All Agents</button>` +
    agentNames.map(n => `<button class="heatmap-agent-btn activity-filter ${_heatmapAgentFilter===n?'active':''}" data-agent="${n}" onclick="setHeatmapAgent('${n.replace(/'/g,"\\'")}')" style="border-color:${d.agents[n].color}40">${n}</button>`).join('');

  // Get counts per day based on filter
  const dayCounts = {};
  if (_heatmapAgentFilter === 'all') {
    Object.assign(dayCounts, d.totalDays);
  } else if (d.agents[_heatmapAgentFilter]) {
    Object.assign(dayCounts, d.agents[_heatmapAgentFilter].counts);
  }

  const maxCount = Math.max(1, ...Object.values(dayCounts));
  const agentColor = _heatmapAgentFilter !== 'all' && d.agents[_heatmapAgentFilter] ? d.agents[_heatmapAgentFilter].color : '#39ff14';

  // Build week columns (Sun=0 start)
  // dates[0] is startDay. Find its day-of-week.
  const startDate = new Date(d.dates[0] + 'T00:00:00');
  const startDow = startDate.getDay(); // 0=Sun

  // We need cells: leading empties + actual days
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null); // empty cells before first day
  for (const date of d.dates) cells.push(date);

  // Pad to fill last week
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Month labels
  const monthLabels = [];
  let lastMonth = '';
  weeks.forEach((week, wi) => {
    const firstDay = week.find(d => d);
    if (firstDay) {
      const m = firstDay.slice(0, 7);
      if (m !== lastMonth) {
        const mName = new Date(firstDay + 'T00:00:00').toLocaleString('en-US', { month: 'short' });
        monthLabels.push({ col: wi, label: mName });
        lastMonth = m;
      }
    }
  });

  const cellSize = 11;
  const cellGap = 2;
  const dayLabelW = 20;
  const monthLabelH = 14;
  const totalW = dayLabelW + weeks.length * (cellSize + cellGap);
  const totalH = monthLabelH + 7 * (cellSize + cellGap);
  const dayNames = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  // Color function: map count 0..max to opacity of agentColor
  function cellColor(count) {
    if (!count) return 'var(--border)';
    const intensity = Math.min(1, count / maxCount);
    // 4 levels like GitHub
    if (intensity < 0.25) return agentColor + '40';
    if (intensity < 0.5) return agentColor + '80';
    if (intensity < 0.75) return agentColor + 'bb';
    return agentColor;
  }

  let svg = `<svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" style="display:block">`;

  // Month labels
  monthLabels.forEach(m => {
    svg += `<text x="${dayLabelW + m.col * (cellSize + cellGap)}" y="10" font-size="9" fill="var(--dim)" font-family="system-ui">${m.label}</text>`;
  });

  // Day labels
  dayNames.forEach((name, i) => {
    if (name) svg += `<text x="0" y="${monthLabelH + i * (cellSize + cellGap) + cellSize - 1}" font-size="8" fill="var(--dim)" font-family="'SF Mono',Menlo,monospace">${name}</text>`;
  });

  // Cells
  weeks.forEach((week, wi) => {
    week.forEach((date, di) => {
      const x = dayLabelW + wi * (cellSize + cellGap);
      const y = monthLabelH + di * (cellSize + cellGap);
      if (!date) {
        // empty
        return;
      }
      const count = dayCounts[date] || 0;
      const fill = cellColor(count);
      const title = `${date}: ${count} activities`;
      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fill}" style="cursor:default"><title>${title}</title></rect>`;
    });
  });

  svg += '</svg>';

  // Stats summary
  const totalActivity = Object.values(dayCounts).reduce((a, b) => a + b, 0);
  const activeDays = Object.values(dayCounts).filter(v => v > 0).length;
  const streak = (() => {
    let s = 0;
    for (let i = d.dates.length - 1; i >= 0; i--) {
      if (dayCounts[d.dates[i]] > 0) s++;
      else break;
    }
    return s;
  })();
  const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

  const statsHtml = `<div style="display:flex;gap:16px;margin-top:8px;font-size:10px;color:var(--dim);flex-wrap:wrap">
    <span>📊 <strong style="color:var(--text)">${totalActivity.toLocaleString()}</strong> total activities</span>
    <span>📅 <strong style="color:var(--text)">${activeDays}</strong>/${d.dates.length} active days</span>
    <span>🔥 <strong style="color:var(--text)">${streak}</strong> day streak</span>
    ${bestDay ? `<span>🏆 Best: <strong style="color:var(--text)">${bestDay[1]}</strong> on ${bestDay[0]}</span>` : ''}
    <span style="margin-left:auto;display:flex;align-items:center;gap:3px">Less <span style="display:inline-block;width:${cellSize}px;height:${cellSize}px;background:var(--border);border-radius:2px"></span><span style="display:inline-block;width:${cellSize}px;height:${cellSize}px;background:${agentColor}40;border-radius:2px"></span><span style="display:inline-block;width:${cellSize}px;height:${cellSize}px;background:${agentColor}80;border-radius:2px"></span><span style="display:inline-block;width:${cellSize}px;height:${cellSize}px;background:${agentColor}bb;border-radius:2px"></span><span style="display:inline-block;width:${cellSize}px;height:${cellSize}px;background:${agentColor};border-radius:2px"></span> More</span>
  </div>`;

  document.getElementById('heatmap-content').innerHTML = svg + statsHtml;
}

async function refreshDepGraph() {
  try {
    const r = await fetchWithTimeout(API+'/dependency-graph', {}, 10000);
    const d = await r.json();
    const svg = document.getElementById('dep-graph-svg');
    const details = document.getElementById('dep-graph-details');
    if (!svg) return;

    const nodes = d.nodes || [];
    const edges = d.edges || [];

    if (!nodes.length) {
      svg.innerHTML = '<text x="50%" y="220" text-anchor="middle" fill="#64748b" font-size="14">No spawn relationships detected yet</text>';
      details.innerHTML = '<h3>📊 Spawn Relationships</h3><div class="sub">No data — agents haven\'t spawned sub-agents recently</div>';
      return;
    }

    const W = svg.clientWidth || 800;
    const H = 450;

    // Build tree structure: find roots (nodes not spawned by anyone)
    const childSet = new Set(edges.map(e => e.to));
    const parentSet = new Set(edges.map(e => e.from));
    const roots = nodes.filter(n => !childSet.has(n.name));
    if (!roots.length) roots.push(nodes[0]); // fallback

    // Build adjacency: parent -> [children]
    const children = {};
    edges.forEach(e => { if (!children[e.from]) children[e.from] = []; children[e.from].push(e.to); });

    // Layout: hierarchical top-down tree
    const levels = {}; // name -> level
    const visited = new Set();
    function assignLevel(name, level) {
      if (visited.has(name)) return;
      visited.add(name);
      levels[name] = Math.max(levels[name] || 0, level);
      (children[name] || []).forEach(c => assignLevel(c, level + 1));
    }
    roots.forEach(r => assignLevel(r.name, 0));
    // Assign unvisited nodes
    nodes.forEach(n => { if (!visited.has(n.name)) levels[n.name] = 0; });

    const maxLevel = Math.max(...Object.values(levels), 0);
    const levelGroups = {};
    for (const [name, lvl] of Object.entries(levels)) {
      if (!levelGroups[lvl]) levelGroups[lvl] = [];
      levelGroups[lvl].push(name);
    }

    // Position nodes
    const nodePos = {};
    const padX = 60, padY = 70;
    const usableW = W - padX * 2;
    const usableH = H - padY * 2;
    const levelH = maxLevel > 0 ? usableH / maxLevel : 0;

    for (const [lvlStr, names] of Object.entries(levelGroups)) {
      const lvl = parseInt(lvlStr);
      const y = padY + lvl * levelH;
      const gap = usableW / (names.length + 1);
      names.forEach((name, i) => {
        nodePos[name] = { x: padX + gap * (i + 1), y };
      });
    }

    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.name] = n);

    let svgContent = '<defs>';
    // Arrow markers
    nodes.forEach(n => {
      svgContent += `<marker id="dep-arrow-${n.name.replace(/[^a-zA-Z0-9]/g,'')}" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="5" orient="auto"><path d="M0,0 L10,3 L0,6 Z" fill="${n.color}" opacity="0.6"/></marker>`;
    });
    // Glow filter
    svgContent += '<filter id="dep-glow"><feGaussianBlur stdDeviation="3" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    svgContent += '</defs>';

    // Draw edges as curved paths
    const maxCount = Math.max(...edges.map(e => e.count), 1);
    for (const e of edges) {
      const from = nodePos[e.from];
      const to = nodePos[e.to];
      if (!from || !to) continue;
      const strokeW = Math.max(1.5, Math.min(5, (e.count / maxCount) * 5));
      const opacity = Math.max(0.3, Math.min(0.8, 0.3 + (e.count / maxCount) * 0.5));
      const fromNode = nodeMap[e.from];
      const color = fromNode?.color || '#64748b';
      // Curved path
      const midY = (from.y + to.y) / 2;
      const dx = to.x - from.x;
      const cp1x = from.x + dx * 0.1;
      const cp2x = from.x + dx * 0.9;
      const markerId = `dep-arrow-${(e.from).replace(/[^a-zA-Z0-9]/g,'')}`;
      const dashAttr = e.baseline && e.count === 0 ? ' stroke-dasharray="6,4"' : '';
      const titleText = e.baseline && e.count === 0 ? `${e.from} → ${e.label || 'manages'} → ${e.to}` : `${e.from} spawns ${e.to}: ${e.count}x`;
      svgContent += `<path d="M${from.x},${from.y + 22} C${cp1x},${midY} ${cp2x},${midY} ${to.x},${to.y - 22}" fill="none" stroke="${color}" stroke-width="${strokeW}" opacity="${opacity}"${dashAttr} marker-end="url(#${markerId})"><title>${titleText}</title></path>`;
      // Count label or relationship label
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const edgeLabel = e.baseline && e.count === 0 ? (e.label || '') : `${e.count}x`;
      svgContent += `<text x="${mx + 8}" y="${my}" text-anchor="start" fill="${color}" font-size="9" font-weight="700" opacity="0.7">${edgeLabel}</text>`;
    }

    // Draw nodes
    for (const n of nodes) {
      const p = nodePos[n.name];
      if (!p) continue;
      const isRoot = !childSet.has(n.name);
      const r = isRoot ? 24 : 18;
      // Type indicator shapes
      const typeIcon = n.type === 'cron' ? '⏰' : n.type === 'persistent' ? '🏢' : n.type === 'subagent' ? '🔧' : '●';
      // Glow for roots
      if (isRoot) {
        svgContent += `<circle cx="${p.x}" cy="${p.y}" r="${r + 8}" fill="${n.color}" opacity="0.08"/>`;
      }
      // Node circle
      svgContent += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="var(--card)" stroke="${n.color}" stroke-width="${isRoot ? 3 : 2}"/>`;
      // Icon
      svgContent += `<text x="${p.x}" y="${p.y + 1}" text-anchor="middle" dominant-baseline="central" font-size="${isRoot ? 14 : 11}">${typeIcon}</text>`;
      // Name
      svgContent += `<text x="${p.x}" y="${p.y + r + 14}" text-anchor="middle" fill="${n.color}" font-size="10" font-weight="700">${n.name}</text>`;
      // Spawn count badge
      if (n.spawns > 0) {
        svgContent += `<circle cx="${p.x + r - 2}" cy="${p.y - r + 2}" r="8" fill="${n.color}" opacity="0.9"/>`;
        svgContent += `<text x="${p.x + r - 2}" y="${p.y - r + 2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="8" font-weight="800">${n.spawns}</text>`;
      }
    }

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = svgContent;

    // Details table
    if (edges.length) {
      const maxE = edges[0].count;
      details.innerHTML = `<h3>📊 Spawn Relationships (${edges.length})</h3>
        <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <span style="font-size:10px;color:var(--dim)">🏢 Persistent &nbsp;⏰ Cron &nbsp;🔧 Sub-agent</span>
        </div>
        <ul class="service-list">${edges.map(e => {
          const fromColor = nodeMap[e.from]?.color || 'var(--dim)';
          const toColor = nodeMap[e.to]?.color || 'var(--dim)';
          const pct = Math.max(Math.round((e.count/maxE)*100), 5);
          const ago = e.lastTs ? timeAgo(new Date(e.lastTs)) : '';
          const taskHtml = e.tasks?.length ? `<div style="margin-top:4px;font-size:10px;color:var(--dim)">${e.tasks.map(t => `<div style="margin:2px 0;padding:2px 6px;background:rgba(255,255,255,0.03);border-radius:4px;border-left:2px solid ${fromColor}">${t.slice(0,80)}</div>`).join('')}</div>` : '';
          const relLabel = e.baseline && e.count === 0 ? `→ ${e.label || 'manages'} →` : '→ spawns →';
          const countLabel = e.baseline && e.count === 0 ? '<span style="font-size:10px;color:var(--dim)">config</span>' : `${e.count}x`;
          return `<li style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:6px;width:100%"><span style="color:${fromColor};font-weight:700">${e.from}</span><span style="color:var(--dim)">${relLabel}</span><span style="color:${toColor};font-weight:700">${e.to}</span><span style="margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums">${countLabel}</span>${ago ? `<span style="color:var(--dim);font-size:10px;margin-left:6px">${ago}</span>` : ''}</div>${e.count > 0 ? `<div class="bar-bg" style="width:100%;margin-top:3px"><div class="bar-fill green" style="width:${pct}%;background:${fromColor}"></div></div>` : ''}${taskHtml}</li>`;
        }).join('')}</ul>`;
    } else {
      details.innerHTML = '<h3>📊 Spawn Relationships</h3><div class="sub">No spawn relationships detected yet</div>';
    }
  } catch {}
}

// ===== SYSTEM =====
let _healthHistory = [];
async function refreshHealthScore() {
  try {
    const r = await fetchWithTimeout(API+'/health-score', {}, 10000); const d = await r.json();
    if (d.score < 0) return;
    _healthHistory.push(d.score); if(_healthHistory.length>30) _healthHistory.shift();
    const color = d.score >= 90 ? 'var(--green)' : d.score >= 75 ? 'var(--orange)' : 'var(--red)';
    const emoji = d.score >= 90 ? '💚' : d.score >= 75 ? '💛' : '❤️';
    animateValue(document.getElementById('ss-health'), `${d.grade} ${d.score}`);
    const el = document.getElementById('sys-health');
    if (!el) return;
    const breakdownHtml = (d.breakdown||[]).map(b =>
      `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px solid var(--border)"><span>${b.label}</span><span style="color:var(--red);font-weight:700">${b.impact}</span></div>`
    ).join('') || '<div style="font-size:11px;color:var(--green);padding:4px 0">✅ All systems nominal</div>';
    el.innerHTML = `<h3>${emoji} System Health Score ${sparklineSVG(_healthHistory,80,20,d.score>=90?'#22c55e':d.score>=75?'#f59e0b':'#ef4444')}</h3>
      <div style="display:flex;align-items:center;gap:16px;margin:10px 0">
        <div style="font-size:48px;font-weight:900;color:${color};line-height:1">${d.score}</div>
        <div>
          <div style="font-size:24px;font-weight:800;color:${color}">${d.grade}</div>
          <div style="font-size:11px;color:var(--dim)">CPU ${d.cpu}% · MEM ${d.memPct}% · DISK ${d.diskPct}%</div>
          <div style="font-size:11px;color:var(--dim)">${d.working}/${d.total} agents working</div>
        </div>
      </div>
      <div class="bar-bg" style="height:8px"><div class="bar-fill ${d.score>=90?'green':d.score>=75?'orange':'red'}" style="width:${d.score}%"></div></div>
      <div style="margin-top:10px">${breakdownHtml}</div>`;
  } catch {}
}

async function refreshSystem() {
  try {
    const r = await fetchWithTimeout(API+'/system', {}, 10000); const d = await r.json();
    if(d.error) return;
    const cpuPct = +(d.cpu.user+d.cpu.sys).toFixed(1);
    const memPct = +((d.memory.used/d.memory.total)*100).toFixed(1);
    const diskPct = parseInt(d.disk.percent);

    cpuHistory.push(cpuPct); if(cpuHistory.length>MAX_HISTORY) cpuHistory.shift();
    memHistory.push(memPct); if(memHistory.length>MAX_HISTORY) memHistory.shift();

    document.getElementById('ss-cpu').textContent = cpuPct + '%';
    document.getElementById('ss-cpu').style.color = cpuPct > 80 ? 'var(--red)' : cpuPct > 50 ? 'var(--orange)' : 'var(--green)';
    document.getElementById('ss-mem').textContent = d.memory.usedGB + 'GB';
    document.getElementById('ss-mem').style.color = memPct > 80 ? 'var(--red)' : memPct > 50 ? 'var(--orange)' : 'var(--green)';
    document.getElementById('ss-disk').textContent = d.disk.percent;
    document.getElementById('ss-disk').style.color = diskPct > 80 ? 'var(--red)' : diskPct > 50 ? 'var(--orange)' : 'var(--green)';

    document.getElementById('sys-top').innerHTML=`
      <div class="card"><h3>CPU ${sparklineSVG(cpuHistory,60,20,cpuPct>80?'#ef4444':cpuPct>50?'#f59e0b':'#22c55e')}</h3><div class="metric ${barColor(cpuPct)}">${cpuPct}%</div><div class="sub">User ${d.cpu.user}% · Sys ${d.cpu.sys}% · Idle ${d.cpu.idle}%</div><div class="bar-bg"><div class="bar-fill ${barColor(cpuPct)}" style="width:${cpuPct}%"></div></div></div>
      <div class="card"><h3>Memory ${sparklineSVG(memHistory,60,20,memPct>80?'#ef4444':'#3b82f6')}</h3><div class="metric ${barColor(memPct)}">${d.memory.usedGB} GB</div><div class="sub">${memPct}% of ${d.memory.totalGB} GB</div><div class="bar-bg"><div class="bar-fill ${barColor(memPct)}" style="width:${memPct}%"></div></div></div>
      <div class="card"><h3>Disk</h3><div class="metric ${barColor(diskPct)}">${d.disk.used}</div><div class="sub">${diskPct}% of ${d.disk.total}</div><div class="bar-bg"><div class="bar-fill ${barColor(diskPct)}" style="width:${diskPct}%"></div></div></div>`;
    _cachedSystem = d;
    document.getElementById('sys-services').innerHTML=`<h3>🔌 Services</h3><ul class="service-list">${d.services.map(s=>`<li><span class="dot ${s.status}"></span>${esc(s.name)}<span style="margin-left:auto;color:${s.status==='running'?'var(--green)':'var(--red)'}">:${esc(String(s.port))} ${esc(s.status)}</span></li>`).join('')}</ul>`;

    // Processes
    try {
      const pr = await fetchWithTimeout(API+'/processes', {}, 10000); const pd = await pr.json();
      if (pd.processes?.length) {
        document.getElementById('sys-processes').innerHTML = '<h3>⚙️ Top Processes</h3>' + pd.processes.map(p=>`<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border)"><span style="color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${esc((p.command||String(p.pid)).slice(0,40))}</span><span style="white-space:nowrap;font-variant-numeric:tabular-nums">${esc(p.cpu)}% CPU · ${esc(p.mem)}% MEM</span></div>`).join('');
      }
    } catch{}

    // Network I/O
    if (d.network) {
      const n = d.network;
      const nr = d.netRate;
      const fmtPkts = p => p >= 1e6 ? (p/1e6).toFixed(1)+'M' : p >= 1e3 ? (p/1e3).toFixed(1)+'K' : String(p);
      const total = n.inBytes + n.outBytes;
      const inPct = total > 0 ? Math.round(n.inBytes / total * 100) : 50;
      const rateHtml = nr ? `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">📈 Throughput Rate</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:800;color:var(--accent)">⬇ ${nr.inRateFmt}</div>
              <div style="margin-top:4px">${sparklineSVG(nr.history.inRate,80,24,'#00e5ff')}</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:800;color:var(--purple)">⬆ ${nr.outRateFmt}</div>
              <div style="margin-top:4px">${sparklineSVG(nr.history.outRate,80,24,'#bf5fff')}</div>
            </div>
          </div>
        </div>` : '<div style="margin-top:8px;font-size:10px;color:var(--dim);text-align:center">Rate tracking starts after 2nd poll…</div>';
      document.getElementById('network-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
          <div style="text-align:center">
            <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">⬇ Received</div>
            <div style="font-size:22px;font-weight:800;color:var(--accent)">${n.inFmt}</div>
            <div style="font-size:10px;color:var(--dim);margin-top:2px">${fmtPkts(n.ipkts)} packets</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">⬆ Sent</div>
            <div style="font-size:22px;font-weight:800;color:var(--purple)">${n.outFmt}</div>
            <div style="font-size:10px;color:var(--dim);margin-top:2px">${fmtPkts(n.opkts)} packets</div>
          </div>
        </div>
        <div class="bar-bg" style="margin-top:10px;height:8px">
          <div style="display:flex;height:100%;border-radius:6px;overflow:hidden">
            <div style="width:${inPct}%;background:linear-gradient(90deg,var(--accent),#60a5fa);border-radius:6px 0 0 6px" title="Received ${inPct}%"></div>
            <div style="width:${100-inPct}%;background:linear-gradient(90deg,#a78bfa,var(--purple));border-radius:0 6px 6px 0" title="Sent ${100-inPct}%"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:4px">
          <span>⬇ ${inPct}% in</span>
          <span style="font-weight:600">${n.iface}</span>
          <span>⬆ ${100-inPct}% out</span>
        </div>
        ${rateHtml}`;
    } else {
      document.getElementById('network-body').innerHTML = '<span style="color:var(--dim)">No network data available</span>';
    }
  } catch(e){
    const el = document.getElementById('live-status');
    el.className = 'live offline'; el.innerHTML = '<span class="pulse"></span>OFFLINE';
  }
}

async function refreshDiskBreakdown() {
  try {
    const r = await fetchWithTimeout(API + '/disk-breakdown', {}, 10000);
    const d = await r.json();
    const body = document.getElementById('disk-breakdown-body');
    if (d.error || !d.breakdown?.length) { body.innerHTML = '<span style="color:var(--dim)">No disk data available</span>'; return; }
    const total = d.total;
    const colors = ['#3b82f6','#8b5cf6','#f59e0b','#22c55e','#ef4444','#06b6d4','#ec4899','#84cc16'];
    // Stacked bar
    const usedKB = total.usedKB;
    let html = `<div style="font-size:12px;margin-bottom:8px;color:var(--text)">Total: <strong>${total.totalGB} GB</strong> · Used: <strong>${total.usedGB} GB</strong> · Free: <strong>${total.availGB} GB</strong></div>`;
    // Stacked horizontal bar
    html += `<div style="display:flex;height:24px;border-radius:8px;overflow:hidden;background:var(--border);margin-bottom:12px">`;
    d.breakdown.forEach((item, i) => {
      const pct = (item.sizeKB / (total.totalKB || 1)) * 100;
      if (pct < 0.5) return;
      html += `<div title="${item.label}: ${item.sizeGB} GB (${pct.toFixed(1)}%)" style="width:${pct}%;background:${colors[i % colors.length]};transition:width .5s;min-width:2px"></div>`;
    });
    const freePct = ((total.availKB || 0) / (total.totalKB || 1)) * 100;
    html += `<div title="Free: ${total.availGB} GB" style="width:${freePct}%;background:rgba(255,255,255,0.05)"></div>`;
    html += `</div>`;
    // Individual rows
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">`;
    d.breakdown.forEach((item, i) => {
      const pct = (item.sizeKB / (total.totalKB || 1)) * 100;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:12px">
        <span style="width:10px;height:10px;border-radius:3px;background:${colors[i % colors.length]};flex-shrink:0"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.path}">${item.label}</span>
        <span style="font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap">${item.sizeGB} GB</span>
        <span style="font-size:10px;color:var(--dim)">${pct.toFixed(1)}%</span>
      </div>`;
    });
    html += `</div>`;
    body.innerHTML = html;
  } catch {}
}

async function refreshLatency() {
  try {
    const r = await fetchWithTimeout(API + '/latency', {}, 5000);
    const d = await r.json();
    const body = document.getElementById('latency-body');
    if (!d.endpoints || !Object.keys(d.endpoints).length) { body.innerHTML = '<span style="color:var(--dim)">No latency data yet</span>'; return; }
    const entries = Object.entries(d.endpoints).sort((a,b) => b[1].p95Ms - a[1].p95Ms);
    let html = '<div style="display:grid;grid-template-columns:1fr repeat(4,auto);gap:4px 12px;font-size:11px;align-items:center">';
    html += '<div style="font-weight:700;color:var(--dim)">Endpoint</div><div style="font-weight:700;color:var(--dim);text-align:right">Calls</div><div style="font-weight:700;color:var(--dim);text-align:right">p50</div><div style="font-weight:700;color:var(--dim);text-align:right">p95</div><div style="font-weight:700;color:var(--dim);text-align:right">p99</div>';
    entries.forEach(([ep, s]) => {
      const p95c = s.p95Ms > 500 ? 'var(--red)' : s.p95Ms > 100 ? 'var(--orange)' : 'var(--green)';
      html += `<div style="font-family:'SF Mono',Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${ep}">${ep}</div>`;
      html += `<div style="text-align:right;color:var(--dim)">${s.count}</div>`;
      html += `<div style="text-align:right;font-variant-numeric:tabular-nums">${s.p50Ms}ms</div>`;
      html += `<div style="text-align:right;font-variant-numeric:tabular-nums;color:${p95c};font-weight:600">${s.p95Ms}ms</div>`;
      html += `<div style="text-align:right;font-variant-numeric:tabular-nums">${s.p99Ms}ms</div>`;
    });
    html += '</div>';
    body.innerHTML = html;
  } catch {}
}

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

// ===== AGENT DETAIL PANEL =====
let _detailAgent = null;
// Mini 24h bar chart for agent detail panel
function buildDetailBarChart(agent) {
  const uAgent = (window._uptimeData?.agents || []).find(u => u.name === agent.name);
  if (!uAgent || !uAgent.slots || !uAgent.slots.some(s => s > 0)) {
    // Fallback to 6h timeline
    const tData = (window.timelineData?.agents || []).find(t => t.name === agent.name);
    if (!tData || !tData.slots || !tData.slots.some(s => s > 0)) return '';
    const slots = tData.slots;
    return `<div class="agent-detail-section"><h4>📊 Activity (6h, 15-min buckets)</h4>
      <div style="display:flex;gap:1.5px;align-items:end;height:40px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px">${slots.map((s, i) => {
        return `<div style="flex:1;height:${s > 0 ? '100%' : '4px'};background:${s > 0 ? agent.color : 'var(--border)'};border-radius:2px;opacity:${s > 0 ? 0.8 : 0.2};transition:height .3s" title="Bucket ${i + 1}: ${s > 0 ? 'active' : 'inactive'}"></div>`;
      }).join('')}</div></div>`;
  }
  // Aggregate 96 15-min slots into 24 hourly bars (4 slots each)
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const chunk = uAgent.slots.slice(h * 4, h * 4 + 4);
    const active = chunk.filter(s => s > 0).length;
    hourly.push(Math.round((active / 4) * 100));
  }
  const now = new Date();
  return `<div class="agent-detail-section"><h4>📊 Activity (24h, hourly)</h4>
    <div style="display:flex;gap:2px;align-items:end;height:48px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px">${hourly.map((v, i) => {
      const h = v > 0 ? Math.max(10, v) : 4;
      const hr = (now.getHours() - (23 - i) + 48) % 24;
      const label = `${String(hr).padStart(2,'0')}:00 — ${v > 0 ? v + '% active' : 'inactive'}`;
      return `<div style="flex:1;height:${h}%;background:${v > 0 ? agent.color : 'var(--border)'};border-radius:2px;opacity:${v > 0 ? 0.8 : 0.2};transition:height .3s;cursor:default" title="${label}"></div>`;
    }).join('')}</div>
    <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--dim);margin-top:3px;font-family:'SF Mono',Menlo,monospace;padding:0 8px"><span>24h ago</span><span>now</span></div></div>`;
}

// Parse tasks from state.md for agent detail panel
function buildDetailTaskList(stateContent, color) {
  if (!stateContent) return '';
  const lines = stateContent.split('\n');
  const tasks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Match "- ✅ ...", "- [ ] ...", "- [x] ...", "1. ...", "- ..."
    const checkMatch = trimmed.match(/^[-*]\s*(\[([xX ])\]|✅|☑️|✓)\s+(.+)/);
    const numMatch = !checkMatch && trimmed.match(/^\d+\.\s+(?:\*\*)?(.+?)(?:\*\*)?(?:\s*[-—].*)?$/);
    const bulletMatch = !checkMatch && !numMatch && trimmed.match(/^[-*]\s+(.+)/);
    if (checkMatch) {
      const done = checkMatch[2] ? checkMatch[2].toLowerCase() === 'x' : true;
      tasks.push({ text: checkMatch[3], done });
    } else if (numMatch) {
      tasks.push({ text: numMatch[1], done: false, priority: true });
    } else if (bulletMatch && tasks.length < 12) {
      // Only include bullets that look like tasks (short, actionable)
      const t = bulletMatch[1];
      if (t.length < 120 && !t.startsWith('#')) tasks.push({ text: t, done: false });
    }
  }
  if (!tasks.length) return '';
  return `<div class="agent-detail-section"><h4>📋 Tasks</h4>
    <div style="display:flex;flex-direction:column;gap:3px">${tasks.slice(0, 10).map(t => {
      const icon = t.done ? '✅' : t.priority ? '🔹' : '⬜';
      const style = t.done ? 'text-decoration:line-through;opacity:0.5' : '';
      return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 0;${style}"><span style="flex-shrink:0">${icon}</span><span style="line-height:1.3">${t.text.replace(/\*\*/g,'')}</span></div>`;
    }).join('')}</div></div>`;
}

async function openAgentDetail(agentName) {
  const agent = agentData.find(a => a.name === agentName);
  if (!agent) return;
  _detailAgent = agent;
  const overlay = document.getElementById('agent-detail-overlay');
  const panel = document.getElementById('agent-detail-panel');
  const statusIcon = agent.status === 'working' ? '🟢' : agent.status === 'idle' ? '🟡' : '💤';
  const age = !agent.ageMin ? '' : agent.ageMin < 1 ? 'just now' : agent.ageMin < 60 ? agent.ageMin + 'm ago' : Math.round(agent.ageMin/60) + 'h ago';

  // Show skeleton immediately
  panel.innerHTML = `
    <div class="agent-detail-header">
      <span style="font-size:20px">${statusIcon}</span>
      <div>
        <div style="font-size:15px;font-weight:700;color:${agent.color}">${agent.name}</div>
        <div style="font-size:11px;color:var(--dim)">${agent.role} · ${age}</div>
      </div>
      <button class="close-btn" onclick="closeAgentDetail()" aria-label="Close agent detail panel">✕</button>
    </div>
    <div class="agent-detail-body">
      <div class="skeleton" style="height:60px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:120px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:80px"></div>
    </div>`;
  overlay.classList.add('visible');

  // Fetch detail
  try {
    const dir = agent.sessionDir || agent.name.toLowerCase().replace(/\s+/g, '-');
    const r = await fetch('/api/agent-detail/' + encodeURIComponent(dir));
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    // Stats row
    const tData = timelineData?.agents?.find(t => t.name === agent.name);
    const activeSlots = tData ? tData.slots.filter(s => s > 0).length : 0;
    const totalSlots = tData ? tData.slots.length : 24;
    const uptimePct = Math.round((activeSlots / totalSlots) * 100);
    const historyCount = d.history?.length || 0;
    const stateAge = d.stateMtime ? timeAgo(new Date(d.stateMtime)) : 'N/A';

    // Timeline sparkline (full width)
    let sparkHtml = '';
    if (tData && tData.slots.some(s => s > 0)) {
      sparkHtml = `<div style="display:flex;gap:1.5px;align-items:end;height:24px;margin-bottom:14px" title="Activity last 6h">${tData.slots.map(s => `<div style="flex:1;height:${s > 0 ? '100%' : '3px'};background:${s > 0 ? agent.color : 'var(--border)'};border-radius:2px;opacity:${s > 0 ? '0.8' : '0.3'};transition:height .3s"></div>`).join('')}</div>`;
    }

    // State.md preview
    let stateHtml = '';
    if (d.stateContent) {
      const escaped = d.stateContent.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      stateHtml = `<div class="agent-detail-section"><h4>📋 State (${stateAge})</h4><pre style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:11px;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;font-family:'SF Mono',Menlo,monospace;color:var(--text);line-height:1.4">${escaped}</pre></div>`;
    }

    // History
    let historyHtml = '';
    if (d.history?.length) {
      historyHtml = `<div class="agent-detail-section"><h4>💬 Recent Messages (${d.history.length})</h4><div style="max-height:220px;overflow-y:auto">${d.history.map(h => {
        const t = h.ts ? new Date(h.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}) : '';
        return `<div class="agent-detail-history-item"><span class="time">${t}</span><span class="msg">${h.text}</span></div>`;
      }).join('')}</div></div>`;
    }

    // Session files
    let filesHtml = '';
    if (d.sessionFiles?.length) {
      filesHtml = `<div class="agent-detail-section"><h4>📁 Session Files</h4>${d.sessionFiles.map(f => {
        const fAge = timeAgo(new Date(f.mtime));
        const sizeKB = (f.size/1024).toFixed(1);
        return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid var(--border)"><span>📄 ${f.name}</span><span style="color:var(--dim)">${sizeKB}KB · ${fAge}</span></div>`;
      }).join('')}</div>`;
    }

    // Cron runs
    let cronHtml = '';
    if (d.cronRuns?.length) {
      cronHtml = `<div class="agent-detail-section"><h4>🔄 Recent Cron Runs</h4>${d.cronRuns.map(r => {
        const t = r.ts ? new Date(r.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}) : '';
        const dur = r.durationMs ? (r.durationMs/1000).toFixed(1)+'s' : '';
        return `<div style="display:flex;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid var(--border)"><span class="state-badge ${r.status==='complete'?'state-complete':'state-active'}" style="font-size:9px">${r.status||'run'}</span><span style="color:var(--dim);font-family:monospace">${t}</span><span style="color:var(--dim)">${dur}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.summary}</span></div>`;
      }).join('')}</div>`;
    }

    // Last message
    const hasMsg = agent.lastMessage && agent.lastMessage !== 'ANNOUNCE_SKIP' && agent.lastMessage !== 'NO_REPLY' && agent.lastMessage.length >= 5;
    const lastMsgHtml = hasMsg ? `<div class="agent-detail-section"><h4>💭 Current Activity</h4><div style="background:var(--bg);border-left:3px solid ${agent.color};padding:8px 12px;border-radius:0 8px 8px 0;font-size:12px;color:var(--text);line-height:1.4">${agent.lastMessage.slice(0,300)}</div></div>` : '';

    // Fetch agent-specific live logs (1h window)
    let logsHtml = '';
    try {
      const lr = await fetch('/api/agent-logs/' + encodeURIComponent(dir));
      const ld = await lr.json();
      if (ld.logs?.length) {
        const roleIcons = { assistant: '🤖', user: '👤', system: '⚙️', tool: '🔧' };
        const roleColors = { assistant: agent.color, user: 'var(--accent)', system: 'var(--orange)', tool: 'var(--dim)' };
        logsHtml = `<div class="agent-detail-section"><h4>📜 Recent Logs <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:9px;color:var(--dim)">(last 1h, ${ld.logs.length} entries)</span></h4>
          <div style="max-height:260px;overflow-y:auto;scroll-behavior:smooth">${ld.logs.map(l => {
            const t = l.ts ? new Date(l.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '';
            const icon = roleIcons[l.role] || '📌';
            const color = roleColors[l.role] || 'var(--dim)';
            return `<div style="display:flex;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;align-items:flex-start">
              <span style="flex-shrink:0;font-size:12px">${icon}</span>
              <span style="color:var(--dim);font-size:9px;font-family:'SF Mono',Menlo,monospace;flex-shrink:0;min-width:55px;padding-top:1px">${t}</span>
              <span style="color:var(--text);line-height:1.35;word-break:break-word">${l.text.replace(/</g,'&lt;')}</span>
            </div>`;
          }).join('')}</div></div>`;
      }
    } catch {};

    panel.innerHTML = `
      <div class="agent-detail-header">
        <span style="font-size:20px">${statusIcon}</span>
        <div>
          <div style="font-size:15px;font-weight:700;color:${agent.color}">${agent.name}</div>
          <div style="font-size:11px;color:var(--dim)">${agent.role} · ${age}${d.discovered ? ' · <span style="color:var(--accent)">discovered</span>' : ''}</div>
        </div>
        ${agent.cronJobId && agent.status !== 'working' ? `<button onclick="wakeAgent('${agent.cronJobId}','${agent.name.replace(/'/g,"\\'")}','${agent.color}')" style="background:linear-gradient(135deg,var(--green),#16a34a);border:none;color:#fff;padding:4px 12px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;margin-left:8px;transition:transform .15s,box-shadow .15s" onmouseenter="this.style.transform='scale(1.05)';this.style.boxShadow='0 2px 12px rgba(34,197,94,0.4)'" onmouseleave="this.style.transform='';this.style.boxShadow=''">⚡ Wake</button>` : ''}
        <button class="close-btn" onclick="closeAgentDetail()" aria-label="Close agent detail panel">✕</button>
      </div>
      <div class="agent-detail-body">
        <div class="agent-detail-stats">
          <div class="agent-detail-stat"><div class="label">Uptime 6h</div><div class="value" style="color:${uptimePct>=50?'var(--green)':uptimePct>=20?'var(--orange)':'var(--dim)'}">${uptimePct}%</div></div>
          <div class="agent-detail-stat"><div class="label">Messages</div><div class="value" style="color:var(--accent)">${historyCount}</div></div>
          <div class="agent-detail-stat"><div class="label">Status</div><div class="value" style="color:${agent.status==='working'?'var(--green)':agent.status==='idle'?'var(--orange)':'var(--dim)'}; font-size:12px">${agent.status}</div></div>
        </div>
        ${sparkHtml}
        ${buildDetailBarChart(agent)}
        ${buildDetailTaskList(d.stateContent, agent.color)}
        ${lastMsgHtml}
        ${logsHtml}
        ${stateHtml}
        ${historyHtml}
        ${cronHtml}
        ${filesHtml}
      </div>`;
  } catch(e) {
    panel.querySelector('.agent-detail-body').innerHTML = `<div style="text-align:center;padding:20px;color:var(--dim)">Could not load detail: ${esc(e.message)}</div>`;
  }
}

// Inline wake from agent card (⚡ button)
async function wakeAgentCard(btn, cronJobId, agentName) {
  btn.disabled = true; btn.textContent = '⏳'; btn.style.opacity = '0.6';
  try {
    const r = await fetch('/api/wake-agent', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cronJobId }) });
    const d = await r.json();
    if (d.ok) { btn.textContent = '✓'; btn.style.color = 'var(--green)'; showToast(`⚡ Woke ${agentName}`, 'info'); }
    else { btn.textContent = '✗'; btn.style.color = 'var(--red,#ef4444)'; showToast(`Failed to wake ${agentName}: ${d.error||'unknown'}`, 'error'); }
  } catch (e) { btn.textContent = '✗'; btn.style.color = 'var(--red,#ef4444)'; }
  setTimeout(() => { btn.textContent = '⚡'; btn.disabled = false; btn.style.opacity = '1'; btn.style.color = ''; }, 3000);
}

async function wakeAgent(cronJobId, agentName, color) {
  showToast('⚡', `Waking <strong>${agentName}</strong>...`, color);
  try {
    const r = await fetch('/api/wake-agent', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cronJobId }) });
    const d = await r.json();
    if (d.ok) {
      showToast('🟢', `<strong>${agentName}</strong> triggered!`, color);
      closeAgentDetail();
      setTimeout(refreshAll, 2000);
    } else {
      showToast('❌', `Failed to wake ${agentName}: ${d.error || 'unknown'}`, '#ef4444');
    }
  } catch(e) {
    showToast('❌', `Wake failed: ${e.message}`, '#ef4444');
  }
}

function closeAgentDetail() {
  document.getElementById('agent-detail-overlay').classList.remove('visible');
  _detailAgent = null;
}

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _detailAgent) closeAgentDetail();
});

// (keyboard shortcuts consolidated in the earlier listener)

// ===== COMMAND PALETTE (Ctrl+K / Cmd+K) =====
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
