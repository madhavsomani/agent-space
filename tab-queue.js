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
  let html = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">';
  entries.forEach(([owner, counts]) => {
    const agent = agentData.find(a => a.name === owner);
    const color = agent ? agent.color : 'var(--dim)';
    const activePct = Math.round((counts.active / maxTotal) * 100);
    const donePct = Math.round((counts.done / maxTotal) * 100);
    html += `<div style="display:flex;align-items:center;gap:10px">
      <span style="width:140px;text-align:right;font-weight:700;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;font-size:12px">${owner}</span>
      <div style="flex:1;display:flex;gap:2px;height:18px;background:var(--border);border-radius:6px;overflow:hidden">
        ${counts.active > 0 ? `<div style="width:${activePct}%;background:${color};border-radius:5px;transition:width .5s" title="${counts.active} active"></div>` : ''}
        ${counts.done > 0 ? `<div style="width:${donePct}%;background:${color};opacity:0.35;border-radius:5px;transition:width .5s" title="${counts.done} done"></div>` : ''}
      </div>
      <span style="font-size:11px;color:var(--dim);white-space:nowrap;min-width:70px">${counts.active} active · ${counts.done} done</span>
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
    const allWrs = d.wrs || [];
    const activeCount = (d.active||[]).filter(w=>!w.complete).length;
    const reviewCount = (d.review||[]).length;
    const doneCount = allWrs.filter(w => ['complete','done'].includes((w.status||'').toLowerCase())).length;
    const backlogCount = Math.max(allWrs.length - doneCount - activeCount - reviewCount, 0);

    html += `<div class="queue-section queue-focus">
      <div class="queue-metrics">
        <div class="card queue-hero">
          <div style="font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:var(--dim);font-weight:700">🔥 Active Work</div>
          <div class="queue-metric-val" style="color:var(--green)">${activeCount}</div>
          <div class="sub">Currently in progress</div>
        </div>
        <div class="card queue-hero">
          <div style="font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:var(--dim);font-weight:700">⏳ Awaiting Review</div>
          <div class="queue-metric-val" style="color:var(--orange)">${reviewCount}</div>
          <div class="sub">Needs QA / human eyes</div>
        </div>
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div>
              <div style="font-size:10px;letter-spacing:0.8px;text-transform:uppercase;color:var(--dim);font-weight:700">Backlog</div>
              <div style="font-size:20px;font-weight:800;color:var(--text);margin-top:4px">${backlogCount}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:10px;color:var(--dim)">Done</div>
              <div style="font-size:16px;font-weight:800;color:var(--text)">${doneCount}</div>
            </div>
          </div>
          <div class="sub">Total WRs: ${allWrs.length}</div>
        </div>
      </div>
    </div>`;

    const assignOwners = ['Unassigned', ...Array.from(new Set((agentData || []).map(a => a.name))).sort()];
    html += `<div class="queue-section"><div class="card" style="padding:14px 16px"><h3 class="queue-title" style="margin-bottom:8px"><span>🎯 Task Assignment</span><span class="queue-pill">Drag card → owner</span></h3><div class="sub" style="margin-bottom:10px">Drag work cards from the board onto an owner lane to assign instantly.</div><div style="display:flex;gap:8px;flex-wrap:wrap">${assignOwners.map(owner => {
      const key = owner === 'Unassigned' ? '__unassigned__' : encodeURIComponent(owner);
      const tone = owner === 'Unassigned' ? 'var(--dim)' : ((agentData.find(a => a.name === owner) || {}).color || 'var(--accent)');
      return `<button ondragover="allowWrDrop(event)" ondrop="dropWrToOwner(event,'${key}')" style="padding:6px 10px;border-radius:999px;border:1px dashed ${tone};background:color-mix(in srgb, ${tone} 12%, transparent);color:${tone};font-size:11px;font-weight:700;cursor:copy;white-space:nowrap">${owner}</button>`;
    }).join('')}</div></div></div>`;

    if(d.active?.length) {
      html += `<div class="queue-section"><div class="card" style="padding:18px 20px"><h3 class="queue-title"><span>🔥 Active Work</span><span class="queue-pill">Live queue</span></h3><div class="sub" style="margin-bottom:10px">Current work running across the agent fleet</div>`;
      d.active.forEach(w => {
        const badge = w.complete ? 'state-complete' : 'state-active';
        const label = w.complete ? '✅ Done' : '⚡ Active';
        html += `<div class="queue-row"><span class="state-badge ${badge}">${label}</span><strong>${w.file.replace(/`/g,'')}</strong><span class="queue-row-meta">${w.type} · ${w.owner}</span></div>`;
      });
      html += `</div></div>`;
    }
    if(d.review?.length) {
      html += `<div class="queue-section"><div class="card" style="padding:18px 20px"><h3 class="queue-title"><span>⏳ Awaiting Review</span><span class="queue-pill">Needs review</span></h3><div class="sub" style="margin-bottom:10px">Items blocked on review or QA confirmation</div>`;
      d.review.forEach(w => {
        html += `<div class="queue-row"><span class="state-badge state-review">Review</span><strong>${w.file.replace(/`/g,'')}</strong><span class="queue-row-meta">${w.type} · ${w.since}</span></div>`;
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
        const visible = items.slice(0,7);
        const extra = items.length - visible.length;
        html += `<div><div class="card" style="padding:14px 16px;max-height:420px;display:flex;flex-direction:column"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-shrink:0"><span>${icons[name]||''} ${name}</span><span style="font-size:11px;color:var(--dim);font-weight:700">${items.length}</span></h3><div class="kanban-col" style="overflow-y:auto;flex:1;scrollbar-width:thin">${visible.map(w=>`<div class="wr-card" draggable="true" ondragstart="startWrDrag(event,'${encodeURIComponent(w.file || '')}')" title="Drag to assign owner"><div class="title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.title}</div><div class="meta">${w.type} ${w.priority?`· ${w.priority}`:''}${w.owner?` · 👤 ${w.owner}`:''}</div></div>`).join('')||'<div style="color:var(--dim);font-size:12px;text-align:center;padding:16px;border:1px dashed var(--border);border-radius:10px">Empty</div>'}${extra > 0 ? `<div class="kanban-more">+${extra} more in ${name}</div>` : ''}</div></div></div>`;
      });
      html += `</div></div>`;
    }
    // Update badge
    const qsw = document.getElementById('qs-wrs'); if(qsw) { animateValue(qsw, String(activeCount)); qsw.style.color = activeCount > 0 ? 'var(--green)' : 'var(--dim)'; }
    const queueBtn = document.querySelector('[data-tab="queue"]');
    if(activeCount > 0) queueBtn.innerHTML = `📋 Queue <span class="badge">${activeCount}</span>`;
    else queueBtn.innerHTML = '📋 Queue';

    document.getElementById('queue-content').innerHTML = html || '<div class="card"><h3>Queue Empty</h3><div class="sub">No active work requests</div></div>';
    renderWorkload(d.wrs);
  } catch {}
}

function allowWrDrop(ev) {
  ev.preventDefault();
}

function startWrDrag(ev, encodedFile) {
  try {
    ev.dataTransfer.setData('text/plain', encodedFile || '');
    ev.dataTransfer.effectAllowed = 'move';
  } catch {}
}

async function dropWrToOwner(ev, ownerKey) {
  ev.preventDefault();
  const encodedFile = ev.dataTransfer.getData('text/plain');
  if (!encodedFile) return;
  const file = decodeURIComponent(encodedFile);
  const owner = ownerKey === '__unassigned__' ? '' : decodeURIComponent(ownerKey || '');
  try {
    const r = await fetchWithTimeout(API + '/queue/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, owner })
    }, 10000);
    const d = await r.json();
    if (!d.ok && d.error) throw new Error(d.error);
    if (typeof showToast === 'function') {
      showToast('🎯', owner ? `Assigned to ${owner}` : 'Moved to Unassigned', '#22c55e');
    }
    refreshQueue();
  } catch (e) {
    if (typeof showToast === 'function') showToast('⚠️', `Assignment failed: ${e.message}`, '#ef4444');
  }
}

