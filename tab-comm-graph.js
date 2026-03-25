// ===== COMMUNICATION GRAPH =====
let _commFilterMode = 'active'; // 'active' = hide baseline/zero-count, 'all' = show everything
function toggleCommFilter(mode) {
  _commFilterMode = mode;
  document.getElementById('comm-filter-active').style.opacity = mode === 'active' ? '1' : '0.5';
  document.getElementById('comm-filter-all').style.opacity = mode === 'all' ? '1' : '0.5';
  refreshCommGraph();
}

async function refreshCommGraph() {
  const svg = document.getElementById('comm-graph-svg');
  const table = document.getElementById('comm-graph-table');
  if (!svg) return;
  try {
    const r = await fetchWithTimeout(API+'/comm-graph', {}, 10000);
    const d = await r.json();

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
      const emptyLabel = _commFilterMode === 'active' ? 'No active communication in the last period' : 'No communication data yet';
      svg.innerHTML = '<defs><pattern id="comm-grid" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(148,163,184,0.08)"/></pattern></defs>' +
        '<rect x="12" y="12" width="96%" height="476" rx="16" fill="url(#comm-grid)" stroke="rgba(148,163,184,0.25)" stroke-dasharray="6,6"/>' +
        '<text x="50%" y="230" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">' + emptyLabel + '</text>' +
        '<text x="50%" y="252" text-anchor="middle" fill="#64748b" font-size="11">Waiting for sessions_send / tool traffic…</text>' +
        '<circle cx="42%" cy="305" r="16" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" />' +
        '<text x="42%" y="335" text-anchor="middle" fill="#93c5fd" font-size="10" font-weight="600">Agent</text>' +
        '<circle cx="58%" cy="305" r="16" fill="rgba(34,197,94,0.15)" stroke="#22c55e" stroke-width="2" />' +
        '<text x="58%" y="335" text-anchor="middle" fill="#86efac" font-size="10" font-weight="600">Agent</text>' +
        '<line x1="46%" y1="305" x2="54%" y2="305" stroke="#64748b" stroke-width="2" stroke-dasharray="4,4" />' +
        '<text x="50%" y="322" text-anchor="middle" fill="#64748b" font-size="9">messages</text>';
      table.innerHTML = '<h3>📊 Communication Edges</h3><div class="sub">No communication edges yet — once agents exchange messages or spawns, links will appear here.</div>';
      return;
    }

    const W = svg.clientWidth || 800;
    const H = 500;
    const cx = W / 2, cy = H / 2;
    const baseRadius = Math.min(W, H) * 0.36;
    const radius = baseRadius + Math.min(140, activeNodes.length * 6);

    // Position nodes in a circle
    const nodePos = {};
    activeNodes.forEach((n, i) => {
      const angle = (i / activeNodes.length) * 2 * Math.PI - Math.PI / 2;
      nodePos[n.name] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), color: n.color, role: n.role };
    });

    // Stronger repulsion to reduce dense-cluster overlap
    const degree = {};
    for (const n of activeNodes) degree[n.name] = 0;
    for (const e of edges) {
      if (degree[e.from] !== undefined) degree[e.from] += Math.max(1, e.count || 1);
      if (degree[e.to] !== undefined) degree[e.to] += Math.max(1, e.count || 1);
    }

    const minDist = 146;
    for (let iter = 0; iter < 54; iter++) {
      let moved = false;
      for (let i = 0; i < activeNodes.length; i++) {
        for (let j = i + 1; j < activeNodes.length; j++) {
          const ai = activeNodes[i].name;
          const bj = activeNodes[j].name;
          const a = nodePos[ai];
          const b = nodePos[bj];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const pairTarget = minDist + Math.min(28, ((degree[ai] || 0) + (degree[bj] || 0)) * 0.03);
          if (dist < pairTarget) {
            const clusterBoost = dist < pairTarget * 0.72 ? 1.6 : 1;
            const push = (pairTarget - dist) * 0.46 * clusterBoost;
            const ux = dx / dist;
            const uy = dy / dist;
            a.x -= ux * push;
            a.y -= uy * push;
            b.x += ux * push;
            b.y += uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
      // Degree-aware centering: high-degree nodes stay a bit farther out to reduce center pile-up
      activeNodes.forEach(n => {
        const p = nodePos[n.name];
        const deg = degree[n.name] || 0;
        const centerPull = deg > 120 ? 0.008 : deg > 60 ? 0.012 : 0.018;
        p.x += (cx - p.x) * centerPull;
        p.y += (cy - p.y) * centerPull;
      });
    }

    const maxCount = Math.max(...edges.map(e => e.count), 1);
    let svgContent = '';

    // Explicit graph background so theme always applies (fixes white canvas in dark mode)
    const bgColor = (getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#0c0c0e').trim();
    svgContent += `<rect x="0" y="0" width="${W}" height="${H}" fill="${bgColor}"/>`;

    // Defs for arrow markers
    svgContent += '<defs>';
    for (const n of nodes) {
      svgContent += `<marker id="arrow-${n.name.replace(/\s/g,'')}" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,3 L0,6 Z" fill="${n.color}" opacity="0.6"/></marker>`;
    }
    svgContent += '</defs>';

    const edgeLabels = [];

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

      // Prepare count labels for collision-avoidance pass
      if (!isBaseline) {
        const mx = (sx+ex)/2;
        const my = (sy+ey)/2;
        // Start label offset away from graph center + perpendicular to edge
        const cdx = mx - cx, cdy = my - cy;
        const clen = Math.sqrt(cdx*cdx + cdy*cdy) || 1;
        const ux = cdx / clen, uy = cdy / clen;
        // Dynamic label size for dense center: smaller when midpoint is closer to center
        const centerDist = Math.sqrt((mx - cx) * (mx - cx) + (my - cy) * (my - cy));
        const dense = centerDist < Math.min(W, H) * 0.28;
        const fs = dense ? 9.5 : 11;
        const digits = String(e.count).length;
        const w = Math.max(18, 10 + digits * (dense ? 4.5 : 5.2));
        edgeLabels.push({
          text: String(e.count),
          color: from.color,
          x: mx + ux * (dense ? 22 : 18) + nx * 2.2,
          y: my + uy * (dense ? 22 : 18) + ny * 2.2,
          w,
          h: dense ? 11 : 12,
          fs,
        });
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

    // Collision-avoidance pass for edge weight labels
    const nodeAvoidR = 78;
    for (let iter = 0; iter < 68; iter++) {
      // repel from nodes (including name area below circles)
      for (const l of edgeLabels) {
        for (const n of activeNodes) {
          const p = nodePos[n.name];
          const dx = l.x - p.x;
          const dy = l.y - (p.y + 18);
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          if (dist < nodeAvoidR) {
            const push = (nodeAvoidR - dist) * 0.3;
            l.x += (dx / dist) * push;
            l.y += (dy / dist) * push;
          }
        }
      }
      // repel labels from each other
      for (let i = 0; i < edgeLabels.length; i++) {
        for (let j = i + 1; j < edgeLabels.length; j++) {
          const a = edgeLabels[i], b = edgeLabels[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minX = (a.w + b.w) / 2 + 4;
          const minY = (a.h + b.h) / 2 + 4;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            a.x -= dx * 0.12; a.y -= dy * 0.12;
            b.x += dx * 0.12; b.y += dy * 0.12;
          }
        }
      }
      // keep labels in frame
      for (const l of edgeLabels) {
        l.x = Math.max(22, Math.min(W - 22, l.x));
        l.y = Math.max(18, Math.min(H - 12, l.y));
      }
    }

    // Secondary de-overlap: if labels still collide, push outward radially in rounds
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let i = 0; i < edgeLabels.length; i++) {
        for (let j = i + 1; j < edgeLabels.length; j++) {
          const a = edgeLabels[i], b = edgeLabels[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minX = (a.w + b.w) / 2 + 2;
          const minY = (a.h + b.h) / 2 + 2;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            const pick = (Math.hypot(a.x - cx, a.y - cy) > Math.hypot(b.x - cx, b.y - cy)) ? a : b;
            const vx = pick.x - cx;
            const vy = pick.y - cy;
            const vlen = Math.sqrt(vx * vx + vy * vy) || 1;
            pick.x += (vx / vlen) * 10;
            pick.y += (vy / vlen) * 10;
            pick.fs = Math.max(8.5, (pick.fs || 11) - 0.4);
            moved = true;
          }
        }
      }
      if (!moved) break;
      for (const l of edgeLabels) {
        l.x = Math.max(22, Math.min(W - 22, l.x));
        l.y = Math.max(18, Math.min(H - 12, l.y));
      }
    }

    // Draw edge labels on top after stabilization
    for (const l of edgeLabels) {
      svgContent += `<rect x="${l.x - l.w/2}" y="${l.y - l.h/2 - 1}" width="${l.w}" height="${l.h + 2}" rx="7" fill="rgba(15,23,42,0.86)" stroke="rgba(148,163,184,0.35)" stroke-width="0.8"/>`;
      svgContent += `<text x="${l.x}" y="${l.y + 0.5}" text-anchor="middle" dominant-baseline="central" fill="${l.color}" font-size="${l.fs || 11}" font-weight="800">${l.text}</text>`;
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
  } catch {
    const svg = document.getElementById('comm-graph-svg');
    const table = document.getElementById('comm-graph-table');
    if (svg) {
      svg.innerHTML = '<rect x="12" y="12" width="96%" height="476" rx="16" fill="rgba(255,255,255,0.02)" stroke="rgba(148,163,184,0.25)" stroke-dasharray="6,6"/>' +
        '<text x="50%" y="235" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">Comm graph unavailable</text>' +
        '<text x="50%" y="257" text-anchor="middle" fill="#64748b" font-size="11">API did not respond — will retry on refresh.</text>';
    }
    if (table) {
      table.innerHTML = '<h3>📊 Communication Edges</h3><div class="sub">Unable to load communication data right now.</div>';
    }
  }
}

// If the page loaded directly on this tab before scripts were ready, hydrate now
setTimeout(() => {
  if (location.hash === '#comm-graph') {
    try { refreshCommGraph(); } catch {}
  }
}, 0);

