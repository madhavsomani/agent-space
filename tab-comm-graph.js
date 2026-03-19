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

