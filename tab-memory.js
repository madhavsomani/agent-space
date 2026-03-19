// tab-memory.js — Memory tab renderer (extracted from app.js)
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

