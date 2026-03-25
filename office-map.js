// ===== OFFICE MAP (Leaflet + SVG floorplan) =====
let _officeMap = null;
let _officeMapLayer = null;
let _officeMarkers = new Map();
let _officeMapReady = false;
let _officeSpotByKey = new Map();
let _officeLastHash = '';
let _officeLastIsMobile = null;

const OFFICE_MAP_SIZE = { w: 1600, h: 1000 };
window.OFFICE_MAP_BOUNDS = [[60, 60], [OFFICE_MAP_SIZE.h - 60, OFFICE_MAP_SIZE.w - 60]];
const ZONE_DEFS = [
  { key: 'Engineering', x: 40, y: 70, w: 520, h: 360 },
  { key: 'Content', x: 590, y: 70, w: 520, h: 360 },
  { key: 'Leadership', x: 1140, y: 70, w: 420, h: 360 },
  { key: 'Support', x: 1140, y: 520, w: 420, h: 360 },
  { key: 'Mail', x: 40, y: 520, w: 520, h: 360 },
  { key: 'Labs', x: 590, y: 520, w: 520, h: 360 },
];

const ZONE_COLORS = {
  Engineering: '#E3F4FF',
  Content: '#FFE9DE',
  Leadership: '#F1E9FF',
  Support: '#E6FFF1',
  Mail: '#FFF5D6',
  Labs: '#E4EDFF'
};

let _officeOverlayEl = null;
function setOfficeMapOverlay(message, subtext) {
  const el = document.getElementById('office-map');
  if (!el) return;
  if (!_officeOverlayEl) {
    _officeOverlayEl = document.createElement('div');
    _officeOverlayEl.className = 'office-map-overlay';
    _officeOverlayEl.innerHTML = '<div class="overlay-card"></div>';
    el.appendChild(_officeOverlayEl);
  }
  const card = _officeOverlayEl.querySelector('.overlay-card');
  if (card) {
    const sub = subtext ? `<div style="margin-top:6px;color:#64748b;font-size:11px">${subtext}</div>` : '';
    card.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:4px">${message}</div>${sub}`;
  }
  _officeOverlayEl.style.display = 'flex';
}
function clearOfficeMapOverlay() {
  if (_officeOverlayEl) _officeOverlayEl.style.display = 'none';
}

function resetOfficeMapView() {
  if (!_officeMap || !window.OFFICE_MAP_BOUNDS) return;
  const pad = window.innerWidth <= 640 ? [24, 24] : [12, 12];
  _officeMap.fitBounds(window.OFFICE_MAP_BOUNDS, { padding: pad });
}

function zoomIn() {
  if (_officeMap) _officeMap.zoomIn();
}

function zoomOut() {
  if (_officeMap) _officeMap.zoomOut();
}

function zoomReset() {
  resetOfficeMapView();
}

function updateOfficeMapLegend(agents = []) {
  const legend = document.getElementById('office-map-legend');
  if (!legend) return;
  const counts = { working: 0, idle: 0, sleeping: 0 };
  (agents || []).forEach(agent => {
    if (agent.status === 'working') counts.working += 1;
    else if (agent.status === 'idle') counts.idle += 1;
    else counts.sleeping += 1;
  });
  const workingEl = document.getElementById('office-map-count-working');
  const idleEl = document.getElementById('office-map-count-idle');
  const sleepingEl = document.getElementById('office-map-count-sleeping');
  const totalEl = document.getElementById('office-map-count-total');
  const updatedEl = document.getElementById('office-map-updated');
  if (workingEl) workingEl.textContent = counts.working;
  if (idleEl) idleEl.textContent = counts.idle;
  if (sleepingEl) sleepingEl.textContent = counts.sleeping;
  if (totalEl) totalEl.textContent = counts.working + counts.idle + counts.sleeping;
  if (updatedEl) {
    const now = new Date();
    updatedEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function buildOfficeSvg() {
  const { w, h } = OFFICE_MAP_SIZE;
  const zones = ZONE_DEFS.map(z => ({ ...z, name: z.key, color: ZONE_COLORS[z.key] || '#E4EDFF' }));

  const zoneRects = zones.map(z => `
    <g filter="url(#zoneShadow)">
      <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="30" fill="${z.color}" />
      <rect x="${z.x + 10}" y="${z.y + 10}" width="${z.w - 20}" height="${z.h - 20}" rx="24" fill="url(#zoneInner)" opacity="0.35" />
    </g>
  `).join('');
  const zoneLabels = zones.map(z => `
    <g>
      <text x="${z.x + 28}" y="${z.y + 34}" font-family="Inter, system-ui" font-size="20" font-weight="800" fill="#0f172a">${z.name}</text>
      <text x="${z.x + 28}" y="${z.y + 34}" font-family="Inter, system-ui" font-size="20" font-weight="800" fill="#0f172a" opacity="0.15" transform="translate(0 1)">${z.name}</text>
    </g>
  `).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F8FAFC" />
        <stop offset="100%" stop-color="#E2E8F0" />
      </linearGradient>
      <linearGradient id="zoneInner" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="#CBD5E1" />
      </linearGradient>
      <filter id="zoneShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.12" />
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#floor)" />
    <rect x="0" y="0" width="${w}" height="${h}" rx="28" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
    ${zoneRects}
    ${zoneLabels}
    <text x="50" y="970" font-family="Inter, system-ui" font-size="13" fill="#64748B">Agent Space · Live Office Map</text>
  </svg>`;
}

function officeMapSvgUrl() {
  const svg = buildOfficeSvg();
  const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

function resetOfficeMap() {
  try {
    if (_officeMap && typeof _officeMap.remove === 'function') {
      _officeMap.remove();
    }
  } catch (err) {
    console.warn('resetOfficeMap failed', err);
  }
  _officeMap = null;
  _officeMapLayer = null;
  _officeMapReady = false;
}

function ensureOfficeMap() {
  const el = document.getElementById('office-map');
  if (!el || typeof L === 'undefined') {
    setOfficeMapOverlay('Office map is loading…', 'Leaflet is not ready yet.');
    return false;
  }
  const hasLeaflet = !!el.querySelector('.leaflet-pane');
  if (_officeMapReady && _officeMap && hasLeaflet && _officeMapLayer) return true;
  resetOfficeMap();
  return initOfficeMap();
}

function initOfficeMap() {
  const el = document.getElementById('office-map');
  if (!el || typeof L === 'undefined') return false;
  if (_officeMapReady && _officeMap) return true;

  _officeMap = L.map('office-map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: true,
    attributionControl: false,
    zoomSnap: 0.25,
  });
  window._officeMap = _officeMap;

  const bounds = window.OFFICE_MAP_BOUNDS;
  const img = officeMapSvgUrl();
  _officeMapLayer = L.imageOverlay(img, bounds).addTo(_officeMap);
  _officeMap.setMaxBounds(bounds);
  const pad = window.innerWidth <= 640 ? [24, 24] : [12, 12];
  _officeMap.fitBounds(bounds, { padding: pad });
  setTimeout(() => {
    _officeMap.fitBounds(bounds, { padding: pad });
  }, 120);

  _officeMapReady = true;
  clearOfficeMapOverlay();
  return true;
}

function pickMarkerColor(status) {
  if (status === 'working') return '#22c55e';
  if (status === 'idle') return '#f59e0b';
  if (status === 'sleeping') return '#94a3b8';
  if (status === 'error') return '#ef4444';
  return '#64748b';
}

function statusLabel(status) {
  if (status === 'working') return 'Active';
  if (status === 'idle') return 'Idle';
  if (status === 'sleeping') return 'Sleeping';
  if (status === 'error') return 'Error';
  return 'Unknown';
}

function statusClass(status) {
  if (status === 'working') return 'status-working';
  if (status === 'idle') return 'status-idle';
  if (status === 'sleeping') return 'status-sleeping';
  if (status === 'error') return 'status-error';
  return 'status-unknown';
}

function getInitials(name) {
  if (!name) return 'A';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name) {
  const palette = ['#6366f1', '#f97316', '#10b981', '#0ea5e9', '#a855f7', '#ec4899', '#f59e0b'];
  const idx = hashString(name || 'agent') % palette.length;
  return palette[idx];
}

function formatActivity(agent, compact = false) {
  const raw = agent.lastMessage || '';
  const text = String(raw || '').replace(/\n/g, ' ').trim();
  if (text.length) return text.slice(0, compact ? 40 : 64);
  if (agent.ageMin != null) {
    if (agent.ageMin < 1) return 'Active just now';
    if (agent.ageMin < 60) return `Idle ${Math.round(agent.ageMin)}m`;
    return `Idle ${Math.round(agent.ageMin / 60)}h`;
  }
  return compact ? 'No recent' : 'No recent activity';
}

function computeAgentHash(agents = [], isMobile = false) {
  let hash = isMobile ? 'm' : 'd';
  const highlightKey = window._officeHighlightKey || '';
  hash += `|h:${highlightKey}`;
  for (const agent of agents) {
    const name = agent.name || '';
    const status = agent.status || '';
    const role = agent.role || agent.team || agent.zone || '';
    const msg = (agent.lastMessage || '').slice(0, 80);
    const age = agent.ageMin != null ? Math.round(agent.ageMin) : '';
    hash += `|${name}:${status}:${role}:${msg}:${age}`;
  }
  return hash;
}

function getDeskSpotsByZone(agentCounts = {}) {
  const spotsByZone = {};
  ZONE_DEFS.forEach(z => {
    const count = agentCounts[z.key] || 0;
    const cols = count > 4 ? 3 : 2;
    const rows = count > 4 ? 2 : 2;
    const padX = 120;
    const padY = 90;
    const usableW = Math.max(120, z.w - padX * 2);
    const usableH = Math.max(120, z.h - padY * 2);
    const spots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = z.x + padX + c * (usableW / (cols - 1 || 1));
        const y = z.y + padY + r * (usableH / (rows - 1 || 1));
        spots.push({ x, y });
      }
    }
    spotsByZone[z.key] = spots;
  });
  return spotsByZone;
}

let _deskSpotsByZone = getDeskSpotsByZone();
let _allDeskSpots = Object.values(_deskSpotsByZone).flat();

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash >>> 0;
}

function getZoneKeyForAgent(agent) {
  const name = (agent.name || '').toLowerCase();
  const role = (agent.role || '').toLowerCase();
  if (name.includes('benmac') || role.includes('ceo') || role.includes('main agent')) return 'Leadership';
  if (name.includes('qa') || role.includes('quality') || role.includes('support')) return 'Support';
  if (name.includes('mail') || role.includes('email') || role.includes('ops')) return 'Mail';
  if (name.includes('research') || role.includes('phd')) return 'Labs';
  if (role.includes('writer') || role.includes('designer') || role.includes('producer') || role.includes('director') || role.includes('publisher') || role.includes('content')) return 'Content';
  if (name.includes('coding') || role.includes('developer') || role.includes('engineer') || role.includes('dashboard')) return 'Engineering';
  return 'Engineering';
}

function assignDeskSpot(key, zoneKey, usedIndexesByZone) {
  const zoneSpots = _deskSpotsByZone[zoneKey] || _allDeskSpots;
  const usedIndexes = usedIndexesByZone.get(zoneKey) || new Set();
  usedIndexesByZone.set(zoneKey, usedIndexes);

  if (_officeSpotByKey.has(key)) {
    const existing = _officeSpotByKey.get(key);
    if (existing && existing.zone === zoneKey && !usedIndexes.has(existing.idx) && zoneSpots[existing.idx]) {
      usedIndexes.add(existing.idx);
      return zoneSpots[existing.idx];
    }
  }

  const start = hashString(key) % zoneSpots.length;
  let idx = start;
  for (let step = 0; step < zoneSpots.length; step++) {
    if (!usedIndexes.has(idx)) {
      usedIndexes.add(idx);
      _officeSpotByKey.set(key, { zone: zoneKey, idx });
      return zoneSpots[idx];
    }
    idx = (idx + 1) % zoneSpots.length;
  }

  const fallback = start;
  usedIndexes.add(fallback);
  _officeSpotByKey.set(key, { zone: zoneKey, idx: fallback });
  return zoneSpots[fallback];
}

function renderDeskCard(agent, opts = {}) {
  const compact = !!opts.compact;
  const color = pickMarkerColor(agent.status);
  const initials = getInitials(agent.name || 'Agent');
  const activity = formatActivity(agent, compact);
  const role = agent.role || agent.team || agent.zone || 'Agent';
  const statLabel = statusLabel(agent.status);
  const statClass = statusClass(agent.status);
  const highlighted = window._highlightedAgents && window._highlightedAgents.has(agent.name);
  const highlightClass = highlighted ? ' highlighted' : '';

  if (compact) {
    return `
      <div class="agent-dot ${statClass}${highlightClass}" style="border-color:${color}">
        <span class="agent-dot-initials">${esc(initials)}</span>
      </div>
    `;
  }

  return `
    <div class="agent-desk ${statClass}${highlightClass}">
      <div class="agent-avatar" style="background:${avatarColor(agent.name || 'Agent')}">${esc(initials)}</div>
      <div class="agent-info">
        <div class="agent-row">
          <div class="agent-name">${esc(agent.name || 'Agent')}</div>
          <div class="agent-status">
            <span class="status-dot" style="background:${color}"></span>
            <span class="status-label">${esc(statLabel)}</span>
          </div>
        </div>
        <div class="agent-role">${esc(role)}</div>
        <div class="agent-activity">${esc(activity)}</div>
      </div>
    </div>
  `;
}

function updateOfficeMap(agents = []) {
  if (!ensureOfficeMap()) return;
  updateOfficeMapLegend(agents);

  if (!agents || !agents.length) {
    if (_officeMarkers.size) {
      clearOfficeMapOverlay();
      return;
    }
    setOfficeMapOverlay('No agents detected yet', 'Waiting for live agent data…');
    return;
  }
  clearOfficeMapOverlay();

  const used = new Set();
  const usedIndexesByZone = new Map();
  const zoneCounts = agents.reduce((acc, agent) => {
    const zoneKey = getZoneKeyForAgent(agent);
    acc[zoneKey] = (acc[zoneKey] || 0) + 1;
    return acc;
  }, {});
  _deskSpotsByZone = getDeskSpotsByZone(zoneCounts);
  _allDeskSpots = Object.values(_deskSpotsByZone).flat();

  const isMobile = window.innerWidth <= 640;
  const hash = computeAgentHash(agents, isMobile);
  if (hash === _officeLastHash && _officeLastIsMobile === isMobile && _officeMarkers.size === agents.length) {
    return;
  }
  _officeLastHash = hash;
  _officeLastIsMobile = isMobile;

  agents.forEach((a, idx) => {
    const key = a.name || `agent-${idx}`;
    const zoneKey = getZoneKeyForAgent(a);
    const spot = assignDeskSpot(key, zoneKey, usedIndexesByZone);
    used.add(key);

    const zone = ZONE_DEFS.find(z => z.key === zoneKey) || ZONE_DEFS[0];
    const cardW = isMobile ? 36 : 190;
    const cardH = isMobile ? 36 : 84;
    const margin = 18;
    const clampedX = zone ? Math.min(zone.x + zone.w - cardW / 2 - margin, Math.max(zone.x + cardW / 2 + margin, spot.x)) : spot.x;
    const clampedY = zone ? Math.min(zone.y + zone.h - cardH / 2 - margin, Math.max(zone.y + cardH / 2 + margin, spot.y)) : spot.y;

    let marker = _officeMarkers.get(key);
    const icon = L.divIcon({
      className: `agent-marker${isMobile ? ' compact' : ''}`,
      html: renderDeskCard(a, { compact: isMobile }),
      iconSize: isMobile ? [36, 36] : [cardW, cardH],
      iconAnchor: isMobile ? [18, 18] : [cardW / 2, cardH / 2],
    });

    if (!marker) {
      marker = L.marker([clampedY, clampedX], { icon });
      marker.addTo(_officeMap);
      _officeMarkers.set(key, marker);
    } else {
      marker.setLatLng([clampedY, clampedX]);
      marker.setIcon(icon);
    }

    if (isMobile) {
      marker.bindPopup(renderDeskCard(a, { compact: false }), { className: 'agent-popup', closeButton: false, offset: [0, -10] });
    } else {
      marker.bindTooltip(`${esc(a.name || 'Agent')} • ${esc(a.role || 'Agent')} • ${esc(a.status || 'unknown')}`, {
        direction: 'top',
        opacity: 0.9,
        className: 'agent-tooltip'
      });
    }
  });

  for (const [key, marker] of _officeMarkers.entries()) {
    if (!used.has(key)) {
      _officeMap.removeLayer(marker);
      _officeMarkers.delete(key);
      _officeSpotByKey.delete(key);
    }
  }
}

window.initOfficeMap = initOfficeMap;
window.ensureOfficeMap = ensureOfficeMap;
window.resetOfficeMap = resetOfficeMap;
window.updateOfficeMap = updateOfficeMap;
window.setOfficeMapOverlay = setOfficeMapOverlay;
window.clearOfficeMapOverlay = clearOfficeMapOverlay;
