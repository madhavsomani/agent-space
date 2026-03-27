// ===== TOKENS =====
async function refreshTokens() {
  try {
    const r = await fetchWithTimeout(API+'/tokens', {}, 10000); const d = await r.json();
    const cost = parseFloat(d.estimatedCostUSD || 0) || 0;
    document.getElementById('ss-cost').textContent = '$' + cost.toFixed(2);
    const qsc = document.getElementById('qs-cost'); if(qsc) animateValue(qsc, '$' + cost.toFixed(2));
    const fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
    const totalTok = (d.totals.input||0) + (d.totals.output||0);
    const tokLabel = totalTok >= 1e6 ? (totalTok/1e6).toFixed(1)+'M' : totalTok >= 1000 ? (totalTok/1000).toFixed(1)+'K' : String(totalTok);
    const qst = document.getElementById('qs-tokens'); if(qst) animateValue(qst, tokLabel);
    const cacheRatio = (d.totals.input + d.totals.cached) > 0 ? Math.min(100, Math.round((d.totals.cached / (d.totals.input + d.totals.cached)) * 100)) : 0;
    document.getElementById('tok-top').innerHTML=`
      <div class="card" style="padding:16px 18px"><h3 style="margin-bottom:6px">Input Tokens</h3><div class="metric blue">${fmtK(d.totals.input)}</div><div class="sub">Cached: ${fmtK(d.totals.cached)}${cacheRatio > 0 ? ` (${cacheRatio}% hit rate)` : ''}</div>${d.totals.input > 0 ? `<div class="bar-bg" style="margin-top:8px"><div class="bar-fill green" style="width:${Math.min(100, cacheRatio)}%"></div></div><div class="sub" style="font-size:10px;margin-top:4px">Cache utilization</div>` : ''}</div>
      <div class="card" style="padding:16px 18px"><h3 style="margin-bottom:6px">Output Tokens</h3><div class="metric blue">${fmtK(d.totals.output)}</div>${totalTok > 0 ? `<div class="sub">I/O ratio: ${d.totals.input > 0 ? (d.totals.output / d.totals.input).toFixed(1) : '—'}x</div>` : '<div class="sub" style="color:var(--dim)">No session data yet</div>'}</div>
      <div class="card" style="padding:16px 18px"><h3 style="margin-bottom:6px">Estimated Cost</h3><div class="metric green">$${d.estimatedCostUSD.toFixed(2)}</div><div class="sub">${d.note||'Live estimate for current tracked usage'}</div></div>`;
    const agents=Object.entries(d.byAgent).sort((a,b)=>(b[1].input+b[1].output)-(a[1].input+a[1].output));
    const byCost = Object.entries(d.byAgent).sort((a,b)=>(b[1].cost||0)-(a[1].cost||0));
    const totalCostByAgent = byCost.reduce((s,[,v]) => s + (v.cost || 0), 0);
    document.getElementById('tok-agents').innerHTML=`<h3 style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span>💰 Usage by Agent</span><span style="font-size:10px;color:var(--dim);font-weight:600">Ranked by total token volume</span></h3>${agents.length?`<ul class="service-list" style="margin-top:10px">${agents.map(([n,v])=>{
      const total = v.input+v.output;
      const pct = d.totals.input+d.totals.output > 0 ? Math.round(total/(d.totals.input+d.totals.output)*100) : 0;
      return `<li style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:8px;width:100%"><span>${esc(n)}</span><span style="margin-left:auto;font-weight:600">${fmtK(total)}</span><span style="color:var(--dim);margin-left:8px;font-size:11px">${pct}%</span></div><div class="bar-bg" style="width:100%;margin-top:4px"><div class="bar-fill green" style="width:${Math.max(pct,2)}%"></div></div></li>`;
    }).join('')}</ul>`:'<div class="sub">No per-agent data</div>'}
      <h3 style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px"><span>🧾 Cost by Agent</span><span style="font-size:10px;color:var(--dim);font-weight:600">Share of estimated spend</span></h3>
      ${byCost.length ? `<ul class="service-list" style="margin-top:10px">${byCost.map(([n,v]) => {
        const c = Number(v.cost||0);
        const pct = totalCostByAgent > 0 ? Math.round((c/totalCostByAgent)*100) : 0;
        return `<li style="flex-wrap:wrap"><div style="display:flex;align-items:center;gap:8px;width:100%"><span>${esc(n)}</span><span style="margin-left:auto;font-weight:700;color:var(--green)">$${c.toFixed(2)}</span><span style="color:var(--dim);margin-left:8px;font-size:11px">${pct}%</span></div><div class="bar-bg" style="width:100%;margin-top:4px"><div class="bar-fill green" style="width:${Math.max(pct,2)}%"></div></div></li>`;
      }).join('')}</ul>` : '<div class="sub">No cost data by agent yet</div>'}`;
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
    const isMobile = window.innerWidth <= 640;
    const agentColors = {};
    const palette = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#d946ef'];
    (d.agents||[]).forEach((a,i) => agentColors[a] = palette[i % palette.length]);
    const barW = isMobile ? Math.max(28, Math.min(48, Math.floor(520 / d.days.length) - 4)) : Math.max(24, Math.min(54, Math.floor(700 / d.days.length) - 4));
    const chartH = 170;
    const costFont = isMobile ? 17 : 9;
    const labelFont = isMobile ? 15 : 8;
    const showWeekday = !isMobile;
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
              const weekday = showWeekday ? new Date(day.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'}) : '';
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
                <div style="font-size:${costFont}px;color:var(--accent);font-weight:700;margin-bottom:2px;font-variant-numeric:tabular-nums">$${day.cost < 1 ? day.cost.toFixed(2) : day.cost.toFixed(1)}</div>
                <div style="display:flex;flex-direction:column;width:100%;justify-content:flex-end;height:${chartH-30}px">${segments}</div>
                <div style="font-size:${labelFont}px;color:var(--dim);margin-top:3px;font-family:'SF Mono',Menlo,monospace;white-space:nowrap;font-weight:700;line-height:1.2;${isMobile ? 'padding:2px 4px;border-radius:6px;background:rgba(0,0,0,0.18);' : ''}">${showWeekday ? `${weekday}<br>${label}` : label}</div>
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
      const chartW = isMobile ? 520 : 700;
      const chartH = isMobile ? 200 : 180;
      const padL = isMobile ? 46 : 50;
      const padR = 20, padT = 10, padB = isMobile ? 46 : 30;
      const w = chartW - padL - padR, h = chartH - padT - padB;
      const maxIn = Math.max(...days.map(x=>x.input), 1);
      const maxOut = Math.max(...days.map(x=>x.output), 1);
      const maxCached = Math.max(...days.map(x=>x.cached||0), 1);
      const maxVal = Math.max(maxIn, maxOut, maxCached);
      const fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(n);
      const axisFont = isMobile ? 16 : 8;
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
          <text x="${padL-6}" y="${yy+3}" text-anchor="end" fill="var(--dim)" font-size="${axisFont}" font-family="'SF Mono',Menlo,monospace">${val}</text>`;
      }).join('');

      // X-axis labels (every 2-3 days)
      const step = isMobile ? (days.length <= 5 ? 1 : 3) : (days.length <= 7 ? 1 : days.length <= 14 ? 2 : 3);
      const xLabels = days.filter((_,i) => i % step === 0 || i === days.length-1).map((d,_,arr) => {
        const idx = days.indexOf(d);
        const label = d.date.slice(5);
        return `<text x="${x(idx)}" y="${padT+h+20}" text-anchor="middle" fill="var(--dim)" font-size="${axisFont}" font-family="'SF Mono',Menlo,monospace" font-weight="600">${label}</text>`;
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

