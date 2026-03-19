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

// ===== COMMUNICATION GRAPH ===== (extracted to tab-comm-graph.js)
// ===== DEPENDENCY GRAPH =====
