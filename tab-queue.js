// tab-queue.js — Queue tab + workload renderer (extracted from app.js)
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
      html += `<div class="queue-section"><div class="card" style="padding:16px 18px"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px"><span>🔥 Active Work</span><span style="font-size:10px;color:var(--dim);font-weight:600">Live queue</span></h3><div class="sub" style="margin-bottom:10px">Current work running across the agent fleet</div>`;
      d.active.forEach(w => {
        const badge = w.complete ? 'state-complete' : 'state-active';
        const label = w.complete ? '✅ Done' : '⚡ Active';
        html += `<div class="queue-row" style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)"><span class="state-badge ${badge}">${label}</span><strong style="font-size:12px">${w.file.replace(/`/g,'')}</strong><span style="color:var(--dim);margin-left:auto;font-size:11px;text-align:right">${w.type} · ${w.owner}</span></div>`;
      });
      html += `</div></div>`;
    }
    if(d.review?.length) {
      html += `<div class="queue-section"><div class="card" style="padding:16px 18px"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px"><span>⏳ Awaiting Review</span><span style="font-size:10px;color:var(--dim);font-weight:600">Needs human eyes</span></h3><div class="sub" style="margin-bottom:10px">Items blocked on review or QA confirmation</div>`;
      d.review.forEach(w => {
        html += `<div class="queue-row" style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)"><span class="state-badge state-review">Review</span><strong style="font-size:12px">${w.file.replace(/`/g,'')}</strong><span style="color:var(--dim);margin-left:auto;font-size:11px;text-align:right">${w.type} · ${w.since}</span></div>`;
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
      html += `<div class="queue-section" style="margin-top:16px"><div style="display:flex;align-items:center;justify-content:space-between;margin:0 2px 10px"><h3 style="margin:0;font-size:14px">📋 Work Request Board</h3><span style="font-size:10px;color:var(--dim);font-weight:600">To Do → In Progress → In Review → Done</span></div><div class="kanban">`;
      Object.entries(buckets).forEach(([name,items])=>{
        html += `<div><div class="card" style="padding:14px 16px"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px"><span>${icons[name]||''} ${name}</span><span style="font-size:10px;color:var(--dim);font-weight:700">${items.length}</span></h3>${items.map(w=>`<div class="wr-card" style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,0.02);margin-bottom:8px"><div class="title" style="font-weight:700;font-size:12px;margin-bottom:4px">${w.title}</div><div class="meta" style="font-size:10px;color:var(--dim)">${w.type} ${w.priority?`· ${w.priority}`:''}</div></div>`).join('')||'<div style="color:var(--dim);font-size:11px;text-align:center;padding:16px;border:1px dashed var(--border);border-radius:10px">Empty</div>'}</div></div>`;
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

