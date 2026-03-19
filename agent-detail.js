// agent-detail.js — Agent detail panel (extracted from app.js)
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
