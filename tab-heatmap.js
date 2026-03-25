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
    const fetchFn = (typeof fetchWithTimeout === 'function') ? fetchWithTimeout : (url, _opts, _ms) => fetch(url);
    const r = await fetchFn(API+'/dependency-graph', {}, 10000);
    const d = await r.json();
    const svg = document.getElementById('dep-graph-svg');
    const details = document.getElementById('dep-graph-details');
    if (!svg) return;

    const nodes = d.nodes || [];
    const edges = d.edges || [];
    const edgeNodes = new Set();
    edges.forEach(e => { if (e.from) edgeNodes.add(e.from); if (e.to) edgeNodes.add(e.to); });
    const graphNodes = edges.length ? nodes.filter(n => edgeNodes.has(n.name)) : [];
    const orphanNodes = edges.length ? nodes.filter(n => !edgeNodes.has(n.name)) : nodes;

    if (!nodes.length) {
      svg.innerHTML = '<rect x="12" y="12" width="96%" height="426" rx="16" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.25)" stroke-dasharray="6,6"/>' +
        '<text x="50%" y="205" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">No spawn relationships detected yet</text>' +
        '<text x="50%" y="228" text-anchor="middle" fill="#64748b" font-size="11">When agents spawn sub-agents, the tree will render here.</text>' +
        '<circle cx="40%" cy="290" r="18" fill="rgba(168,85,247,0.15)" stroke="#a855f7" stroke-width="2" />' +
        '<circle cx="60%" cy="330" r="14" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" />' +
        '<path d="M40% 308 C46% 320 54% 320 60% 316" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="4,4" />';
      details.innerHTML = '<h3>📊 Spawn Relationships</h3><div class="sub">No spawn data yet — this section auto-populates once sub-agents are created.</div>';
      return;
    }

    if (!edges.length) {
      svg.innerHTML = '<rect x="12" y="12" width="96%" height="426" rx="16" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.25)" stroke-dasharray="6,6"/>' +
        '<text x="50%" y="205" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">0 spawn relationships found (last 45d)</text>' +
        '<text x="50%" y="228" text-anchor="middle" fill="#64748b" font-size="11">Agents discovered: ' + nodes.length + '</text>' +
        '<circle cx="40%" cy="290" r="18" fill="rgba(168,85,247,0.15)" stroke="#a855f7" stroke-width="2" />' +
        '<circle cx="60%" cy="330" r="14" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" />' +
        '<path d="M40% 308 C46% 320 54% 320 60% 316" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="4,4" />';
      details.innerHTML = '<h3>📊 Spawn Relationships</h3><div class="sub">0 spawn relationships detected in the last 45 days.</div>';
      return;
    }

    const W = svg.clientWidth || 800;
    const H = 450;

    // Build tree structure: find roots (nodes not spawned by anyone)
    const childSet = new Set(edges.map(e => e.to));
    const roots = graphNodes.filter(n => !childSet.has(n.name));
    if (!roots.length && graphNodes.length) roots.push(graphNodes[0]); // fallback

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
    // Assign unvisited nodes (edge nodes only)
    graphNodes.forEach(n => { if (!visited.has(n.name)) levels[n.name] = 0; });

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
    graphNodes.forEach(n => nodeMap[n.name] = n);

    const typeCounts = { persistent: 0, cron: 0, subagent: 0, unknown: 0 };
    nodes.forEach(n => { typeCounts[n.type || 'unknown'] = (typeCounts[n.type || 'unknown'] || 0) + 1; });

    let svgContent = '<defs>';
    // Arrow markers
    graphNodes.forEach(n => {
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
    for (const n of graphNodes) {
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
      const orphanNote = orphanNodes.length ? ` · ${orphanNodes.length} agents with no spawns` : '';
      const orphanList = orphanNodes.length ? `<div style="margin-top:10px;font-size:10px;color:var(--dim)">Other agents (no spawns): ${orphanNodes.map(o => esc(o.name)).join(', ')}</div>` : '';
      details.innerHTML = `<h3>📊 Spawn Relationships (${edges.length})</h3>
        <div class="sub" style="margin-top:-4px;margin-bottom:10px">Showing ${edges.length} relationships in last 45 days${orphanNote}</div>
        <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
          <span style="font-size:10px;color:var(--dim)">🏢 Persistent &nbsp;⏰ Cron &nbsp;🔧 Sub-agent</span>
          <span style="margin-left:auto;font-size:10px;color:var(--dim)">Totals:</span>
          <span style="font-size:10px;background:rgba(34,197,94,0.15);color:#86efac;padding:2px 6px;border-radius:10px">🏢 ${typeCounts.persistent || 0}</span>
          <span style="font-size:10px;background:rgba(59,130,246,0.15);color:#93c5fd;padding:2px 6px;border-radius:10px">⏰ ${typeCounts.cron || 0}</span>
          <span style="font-size:10px;background:rgba(245,158,11,0.15);color:#fbbf24;padding:2px 6px;border-radius:10px">🔧 ${typeCounts.subagent || 0}</span>
          ${typeCounts.unknown ? `<span style="font-size:10px;background:rgba(148,163,184,0.15);color:#cbd5f5;padding:2px 6px;border-radius:10px">• ${typeCounts.unknown}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin:6px 0 10px">
          <input id="dep-graph-filter" type="search" placeholder="Filter by agent or task..." style="flex:1;min-width:180px;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 8px;font-size:11px" />
          <span id="dep-graph-filter-count" style="font-size:10px;color:var(--dim);white-space:nowrap">${edges.length}</span>
        </div>
        <ul class="service-list">${edges.map(e => {
          const fromColor = nodeMap[e.from]?.color || 'var(--dim)';
          const toColor = nodeMap[e.to]?.color || 'var(--dim)';
          const pct = Math.max(Math.round((e.count/maxE)*100), 5);
          const ago = e.lastTs ? timeAgo(new Date(e.lastTs)) : '';
          const taskHtml = e.tasks?.length ? `<div style="margin-top:4px;font-size:10px;color:var(--dim)">${e.tasks.map(t => `<div style="margin:2px 0;padding:2px 6px;background:rgba(255,255,255,0.03);border-radius:4px;border-left:2px solid ${fromColor}">${t.slice(0,80)}</div>`).join('')}</div>` : '';
          const relLabel = e.baseline && e.count === 0 ? `→ ${e.label || 'manages'} →` : '→ spawns →';
          const countLabel = e.baseline && e.count === 0 ? '<span style="font-size:10px;color:var(--dim)">config</span>' : `${e.count}x`;
          const searchText = `${e.from} ${e.to} ${(e.tasks || []).join(' ')}`.toLowerCase();
          const searchAttr = esc(searchText);
          return `<li style="flex-wrap:wrap" data-search="${searchAttr}"><div style="display:flex;align-items:center;gap:6px;width:100%"><span style="color:${fromColor};font-weight:700">${e.from}</span><span style="color:var(--dim)">${relLabel}</span><span style="color:${toColor};font-weight:700">${e.to}</span><span style="margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums">${countLabel}</span>${ago ? `<span style="color:var(--dim);font-size:10px;margin-left:6px">${ago}</span>` : ''}</div>${e.count > 0 ? `<div class="bar-bg" style="width:100%;margin-top:3px"><div class="bar-fill green" style="width:${pct}%;background:${fromColor}"></div></div>` : ''}${taskHtml}</li>`;
        }).join('')}</ul>${orphanList}`;

      const filterInput = document.getElementById('dep-graph-filter');
      const filterCount = document.getElementById('dep-graph-filter-count');
      if (filterInput) {
        const applyFilter = () => {
          const q = (filterInput.value || '').trim().toLowerCase();
          let visible = 0;
          document.querySelectorAll('#dep-graph-details .service-list li').forEach(li => {
            const hay = (li.dataset.search || '').toLowerCase();
            const show = !q || hay.includes(q);
            li.style.display = show ? '' : 'none';
            if (show) visible++;
          });
          if (filterCount) filterCount.textContent = q ? `${visible}/${edges.length}` : `${edges.length}`;
        };
        filterInput.addEventListener('input', applyFilter);
        applyFilter();
      }
    } else {
      details.innerHTML = '<h3>📊 Spawn Relationships</h3><div class="sub">No spawn relationships detected yet</div>';
    }
  } catch {
    const svg = document.getElementById('dep-graph-svg');
    const details = document.getElementById('dep-graph-details');
    if (svg) {
      svg.innerHTML = '<rect x="12" y="12" width="96%" height="426" rx="16" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.25)" stroke-dasharray="6,6"/>' +
        '<text x="50%" y="210" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">Dependency graph unavailable</text>' +
        '<text x="50%" y="232" text-anchor="middle" fill="#64748b" font-size="11">API did not respond — will retry on refresh.</text>';
    }
    if (details) {
      details.innerHTML = '<h3>📊 Spawn Relationships</h3><div class="sub">Unable to load dependency data right now.</div>';
    }
  }
}

// If the page loaded directly on this tab before scripts were ready, hydrate now
setTimeout(() => {
  if (location.hash === '#dep-graph') {
    try { refreshDepGraph(); } catch {}
  }
}, 0);

