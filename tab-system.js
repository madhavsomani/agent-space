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

