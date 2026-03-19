// ===== STATUS CHANGE NOTIFICATION SOUNDS =====
let notifSoundsOn = localStorage.getItem('hq-notif-sounds') !== '0'; // on by default
let notifCtx = null;

function getNotifCtx() {
  if (!notifCtx) notifCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (notifCtx.state === 'suspended') notifCtx.resume();
  return notifCtx;
}

// Browser notifications for backgrounded tab
function sendBrowserNotif(title, body, icon) {
  if (document.visibilityState !== 'hidden') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: icon || '/favicon.ico', tag: 'hq-' + title, renotify: true });
  }
}
// Request permission on first interaction
document.addEventListener('click', function _reqNotif() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  document.removeEventListener('click', _reqNotif);
}, { once: true });

function playStatusChangeSound(oldStatus, newStatus, agentName, agentColor) {
  // Browser notification when tab is backgrounded
  const verb = newStatus === 'working' ? 'started working' : newStatus === 'idle' ? 'went idle' : 'fell asleep';
  sendBrowserNotif(`${agentName} ${verb}`, `Status: ${oldStatus} → ${newStatus}`, '⚡');
  if (!notifSoundsOn) return;
  const ctx = getNotifCtx();
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);

  if (newStatus === 'working') {
    // Rising chime — agent woke up / started working
    [660, 880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.08);
      g.gain.linearRampToValueAtTime(0.3, t + i * 0.08 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
      osc.connect(g); g.connect(master);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.25);
    });
  } else if (newStatus === 'sleeping' || newStatus === 'idle') {
    // Descending soft tone — agent went idle/sleeping
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(350, t + 0.3);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.35);
  }

  // Show toast for status change
  showToast(`${agentName}: ${oldStatus} → ${newStatus}`, agentColor);
}

// Notification Center state
let _notifications = [];
const MAX_NOTIFICATIONS = 50;
let _notifUnread = 0;

function showToast(nameOrMsg, colorOrText, textOrBorder, icon) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  // Detect calling convention:
  // 4-arg: showToast(name, color, text, icon) — agent status changes
  // 3-arg: showToast(icon, text, borderColor) — activity feed style
  // 2-arg: showToast(msg, color) — simple message
  // 1-arg: showToast(msg) — minimal
  let displayMsg, dotColor;
  if (icon !== undefined && textOrBorder !== undefined) {
    // 4-arg: (name, color, text, icon)
    displayMsg = `${icon} <strong style="color:${colorOrText}">${nameOrMsg}</strong> ${textOrBorder}`;
    dotColor = colorOrText;
  } else if (textOrBorder !== undefined) {
    // 3-arg: (icon, text, borderColor)
    displayMsg = `${nameOrMsg} ${colorOrText}`;
    dotColor = textOrBorder;
  } else {
    // 2-arg or 1-arg
    displayMsg = nameOrMsg;
    dotColor = colorOrText || 'var(--accent)';
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<div class="toast-dot" style="background:${dotColor||'var(--accent)'}"></div><div class="toast-text">${esc(displayMsg)}</div>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4000);
  while (c.children.length > 6) c.removeChild(c.firstChild);
  // Store in notification center
  addNotification(displayMsg, dotColor);
}

function addNotification(text, color) {
  const now = new Date();
  _notifications.unshift({ text, color: color || 'var(--accent)', ts: now });
  if (_notifications.length > MAX_NOTIFICATIONS) _notifications.pop();
  _notifUnread++;
  updateNotifBadge();
  renderNotifCenter();
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (_notifUnread > 0) {
    badge.textContent = _notifUnread > 99 ? '99+' : _notifUnread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifCenter() {
  const overlay = document.getElementById('notif-center-overlay');
  const isOpen = overlay.classList.contains('visible');
  if (isOpen) {
    overlay.classList.remove('visible');
  } else {
    overlay.classList.add('visible');
    _notifUnread = 0;
    updateNotifBadge();
  }
}

function clearNotifCenter() {
  _notifications = [];
  _notifUnread = 0;
  updateNotifBadge();
  renderNotifCenter();
}

function renderNotifCenter() {
  const body = document.getElementById('notif-center-body');
  if (!body) return;
  if (!_notifications.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--dim);font-size:12px">No notifications yet</div>';
    return;
  }
  body.innerHTML = _notifications.map(n => {
    const t = n.ts;
    const timeStr = t.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    const ago = timeAgo(t);
    return `<div class="notif-item" style="border-left-color:${n.color}"><div class="notif-body"><div class="notif-text">${n.text || '(empty notification)'}</div><div class="notif-time">${timeStr} · ${ago}</div></div></div>`;
  }).join('');
}

function toggleNotifSounds() {
  notifSoundsOn = !notifSoundsOn;
  document.getElementById('notif-sound-icon').textContent = notifSoundsOn ? '🔔' : '🔕';
  localStorage.setItem('hq-notif-sounds', notifSoundsOn ? '1' : '0');
}

// ===== AMBIENT SOUND ENGINE (Web Audio API, procedural) =====
let ambientCtx = null;
let ambientOn = false;
let ambientNodes = {};

function createAmbientSound() {
  if (ambientCtx) return;
  ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ambientCtx.createGain();
  master.gain.value = 0.15;
  master.connect(ambientCtx.destination);
  ambientNodes.master = master;

  // 1. Office hum (low brown noise)
  const humSize = ambientCtx.sampleRate * 2;
  const humBuf = ambientCtx.createBuffer(1, humSize, ambientCtx.sampleRate);
  const humData = humBuf.getChannelData(0);
  let lastHum = 0;
  for (let i = 0; i < humSize; i++) {
    const white = Math.random() * 2 - 1;
    lastHum = (lastHum + (0.02 * white)) / 1.02;
    humData[i] = lastHum * 3.5;
  }
  const humSrc = ambientCtx.createBufferSource();
  humSrc.buffer = humBuf;
  humSrc.loop = true;
  const humFilter = ambientCtx.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 150;
  const humGain = ambientCtx.createGain();
  humGain.gain.value = 0.6;
  humSrc.connect(humFilter);
  humFilter.connect(humGain);
  humGain.connect(master);
  humSrc.start();
  ambientNodes.hum = { src: humSrc, gain: humGain };

  // 2. Keyboard clicks (randomized periodic clicks)
  function scheduleClick() {
    if (!ambientOn) return;
    // Only click when agents are working
    const workingCount = agentData.filter(a => a.status === 'working').length;
    if (workingCount === 0) { setTimeout(scheduleClick, 2000); return; }

    const osc = ambientCtx.createOscillator();
    const clickGain = ambientCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 800 + Math.random() * 1200;
    clickGain.gain.setValueAtTime(0.03 + Math.random() * 0.02, ambientCtx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, ambientCtx.currentTime + 0.03);
    osc.connect(clickGain);
    clickGain.connect(master);
    osc.start();
    osc.stop(ambientCtx.currentTime + 0.03);

    // More clicks when more agents working
    const baseDelay = 200 / Math.max(1, workingCount);
    const delay = baseDelay + Math.random() * baseDelay * 2;
    setTimeout(scheduleClick, delay);
  }
  scheduleClick();
  ambientNodes.clickScheduler = true;

  // 3. Soft ambient tone (gentle pad)
  const pad = ambientCtx.createOscillator();
  pad.type = 'sine';
  pad.frequency.value = 220;
  const padGain = ambientCtx.createGain();
  padGain.gain.value = 0.04;
  const padFilter = ambientCtx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 300;
  pad.connect(padFilter);
  padFilter.connect(padGain);
  padGain.connect(master);
  pad.start();
  ambientNodes.pad = { osc: pad, gain: padGain };

  // 4. Occasional notification blip
  function scheduleBlip() {
    if (!ambientOn) return;
    const osc = ambientCtx.createOscillator();
    const blipGain = ambientCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ambientCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ambientCtx.currentTime + 0.05);
    blipGain.gain.setValueAtTime(0.015, ambientCtx.currentTime);
    blipGain.gain.exponentialRampToValueAtTime(0.001, ambientCtx.currentTime + 0.15);
    osc.connect(blipGain);
    blipGain.connect(master);
    osc.start();
    osc.stop(ambientCtx.currentTime + 0.15);
    setTimeout(scheduleBlip, 8000 + Math.random() * 20000);
  }
  setTimeout(scheduleBlip, 3000);
}

function toggleAmbientSound() {
  ambientOn = !ambientOn;
  const icon = document.getElementById('sound-icon');
  if (ambientOn) {
    icon.textContent = '🔊';
    createAmbientSound();
    if (ambientCtx.state === 'suspended') ambientCtx.resume();
    if (ambientNodes.master) ambientNodes.master.gain.setTargetAtTime(0.15, ambientCtx.currentTime, 0.3);
  } else {
    icon.textContent = '🔇';
    if (ambientCtx && ambientNodes.master) {
      ambientNodes.master.gain.setTargetAtTime(0, ambientCtx.currentTime, 0.3);
    }
  }
  localStorage.setItem('hq-ambient', ambientOn ? '1' : '0');
}

// Restore ambient preference
if (localStorage.getItem('hq-ambient') === '1') {
  // Auto-enable on first user interaction (browser policy)
  const enableOnInteraction = () => {
    toggleAmbientSound();
    document.removeEventListener('click', enableOnInteraction);
    document.removeEventListener('keydown', enableOnInteraction);
  };
  document.addEventListener('click', enableOnInteraction, { once: true });
  document.addEventListener('keydown', enableOnInteraction, { once: true });
}

