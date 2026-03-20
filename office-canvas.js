// ===== COZY PIXEL-ART OFFICE =====
// Warm, detailed isometric office with proper desk areas per agent.
// Replaces the old cold-blue scattered layout.

const oCanvas = document.getElementById('office-canvas');
let oCtx = oCanvas ? oCanvas.getContext('2d', { willReadFrequently: false }) : null;
const KENNEY_ISO_ROOT = 'assets/office-source/kenney-furniture/unpacked/Isometric';
const OFFICE_ASSETS = {};

function loadOfficeAsset(key, file) {
  const img = new Image();
  img.src = `${KENNEY_ISO_ROOT}/${file}`;
  img.decoding = 'async';
  img.loading = 'eager';
  img.onload = () => { if (typeof invalidateStaticCache === 'function') invalidateStaticCache(); };
  OFFICE_ASSETS[key] = img;
  return img;
}

function officeAssetReady(key) {
  const img = OFFICE_ASSETS[key];
  return !!(img && img.complete && img.naturalWidth > 0);
}

function drawOfficeAsset(key, x, y, scale = 1, alpha = 1) {
  const img = OFFICE_ASSETS[key];
  if (!officeAssetReady(key)) return false;
  oCtx.save();
  oCtx.globalAlpha = alpha;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  oCtx.drawImage(img, x - w / 2, y - h, w, h);
  oCtx.restore();
  return true;
}

function pickOfficeAsset(keys) {
  for (const key of keys) if (officeAssetReady(key)) return key;
  return keys[0];
}

loadOfficeAsset('desk', 'desk_SW.png');
loadOfficeAsset('deskNE', 'desk_NE.png');
loadOfficeAsset('deskCorner', 'deskCorner_SW.png');
loadOfficeAsset('deskCornerNE', 'deskCorner_NE.png');
loadOfficeAsset('chairDesk', 'chairDesk_SW.png');
loadOfficeAsset('chairDeskNE', 'chairDesk_NE.png');
loadOfficeAsset('chairRounded', 'chairRounded_SW.png');
loadOfficeAsset('chairRoundedNE', 'chairRounded_NE.png');
loadOfficeAsset('chairCushionNE', 'chairCushion_NE.png');
loadOfficeAsset('monitor', 'computerScreen_SW.png');
loadOfficeAsset('monitorNE', 'computerScreen_NE.png');
loadOfficeAsset('keyboard', 'computerKeyboard_SW.png');
loadOfficeAsset('laptop', 'laptop_SW.png');
loadOfficeAsset('laptopNE', 'laptop_NE.png');
loadOfficeAsset('bookshelf', 'bookcaseOpen_SW.png');
loadOfficeAsset('bookshelfNE', 'bookcaseOpen_NE.png');
loadOfficeAsset('bookshelfClosed', 'bookcaseClosedWide_SW.png');
loadOfficeAsset('bookshelfClosedNE', 'bookcaseClosedWide_NE.png');
loadOfficeAsset('bookshelfLow', 'bookcaseOpenLow_SW.png');
loadOfficeAsset('bookshelfLowNE', 'bookcaseOpenLow_NE.png');
loadOfficeAsset('plant', 'pottedPlant_SW.png');
loadOfficeAsset('plantSmall1', 'plantSmall1_SW.png');
loadOfficeAsset('plantSmall2', 'plantSmall2_SW.png');
loadOfficeAsset('plantSmall3', 'plantSmall3_SW.png');
loadOfficeAsset('coffeeMachine', 'kitchenCoffeeMachine_SW.png');
loadOfficeAsset('armchair', 'loungeChair_SW.png');
loadOfficeAsset('armchairAlt', 'loungeChairRelax_SW.png');
loadOfficeAsset('waterCooler', 'kitchenFridgeSmall_SW.png');
loadOfficeAsset('floorTile', 'floorFull_SW.png');
loadOfficeAsset('floorTileSE', 'floorFull_SE.png');
loadOfficeAsset('floorHalf', 'floorHalf_SW.png');
loadOfficeAsset('rugRound', 'rugRound_SW.png');
loadOfficeAsset('rugRect', 'rugRectangle_SW.png');
loadOfficeAsset('books', 'books_SW.png');
loadOfficeAsset('booksNE', 'books_NE.png');
loadOfficeAsset('mouse', 'computerMouse_SW.png');
loadOfficeAsset('sideTable', 'sideTable_SW.png');
loadOfficeAsset('sideTableNE', 'sideTable_NE.png');
loadOfficeAsset('sideTableDrawers', 'sideTableDrawers_SW.png');
loadOfficeAsset('coffeeTable', 'tableCoffee_SW.png');
loadOfficeAsset('coffeeTableNE', 'tableCoffee_NE.png');
loadOfficeAsset('coffeeTableGlass', 'tableCoffeeGlass_SW.png');
loadOfficeAsset('bench', 'bench_SW.png');
loadOfficeAsset('benchNE', 'bench_NE.png');
loadOfficeAsset('box', 'cardboardBoxClosed_SW.png');
loadOfficeAsset('speaker', 'speaker_SW.png');
loadOfficeAsset('lampFloor', 'lampSquareFloor_SW.png');
loadOfficeAsset('lampFloorNE', 'lampSquareFloor_NE.png');
loadOfficeAsset('wallBack', 'wallWindow_SW.png');
loadOfficeAsset('wallBackNE', 'wallWindow_NE.png');
loadOfficeAsset('wallLeft', 'wall_SW.png');
loadOfficeAsset('wallRight', 'wall_SE.png');
loadOfficeAsset('wallCorner', 'wallCorner_SW.png');
loadOfficeAsset('wallCornerNE', 'wallCorner_NE.png');
loadOfficeAsset('doorway', 'doorwayOpen_SW.png');
loadOfficeAsset('doorwayNE', 'doorwayOpen_NE.png');

// ── PALETTE ──
const PAL_LIGHT = {
  // Warm wood floor
  floorA: '#caa982', floorB: '#bb986f',
  floorLine: '#9c7d5c',
  backdropTop: '#efe3d0', backdropBottom: '#d8c1a2',
  vignette: 'rgba(92,62,32,0.16)',
  // Walls
  wallTop: '#8faa8f', wallSide: '#7a9a7a', wallTrim: '#6a886a',
  // Desks
  deskTop: '#b08050', deskFront: '#8a6038', deskSide: '#9a7048',
  // Monitor
  monFrame: '#2a2a2e', monScreen: '#3b82f6', monScreenIdle: '#22c55e', monScreenSleep: '#444',
  // Chair
  chairSeat: '#444', chairBack: '#333', chairLeg: '#555',
  // Labels
  labelBg: 'rgba(58,39,24,0.88)', labelText: '#fff6ea', labelBorder: 'rgba(255,228,190,0.28)',
  // Status dots
  statusWorking: '#22c55e', statusIdle: '#eab308', statusSleeping: '#6b7280',
  // Furniture
  plantPot: '#8B5E3C', leafDark: '#2d6b2d', leafLight: '#4ade80',
  bookColors: ['#e74c3c','#3498db','#f1c40f','#2ecc71','#9b59b6','#e67e22','#1abc9c','#e84393'],
  shelfWood: '#7a5a3a', shelfSide: '#6a4a2a',
  mugBody: '#e8e0d0', mugCoffee: '#6b4226', mugHandle: '#c8b8a0',
  lampPole: '#888', lampShade: '#d4b870',
  rugColors: ['#8b4513','#a0522d','#cd853f','#deb887'],
  catBody: '#666', catEar: '#555',
  posterFrame: '#5a4a3a',
  coffeeMachine: '#444', coffeeMachineLight: '#22c55e',
  // Tooltip
  tooltipBg: 'rgba(30,22,16,0.92)',
  tooltipBorder: 'rgba(255,228,190,0.18)',
  tooltipAccent: '#3b82f6',
};

const PAL_DARK = {
  floorA: '#3a3040', floorB: '#322838',
  floorLine: '#4a3e50',
  backdropTop: '#1a1428', backdropBottom: '#12101e',
  vignette: 'rgba(10,6,20,0.28)',
  wallTop: '#3a4a5a', wallSide: '#2e3e4e', wallTrim: '#243444',
  deskTop: '#5a4838', deskFront: '#483828', deskSide: '#504030',
  monFrame: '#1a1a1e', monScreen: '#3b82f6', monScreenIdle: '#22c55e', monScreenSleep: '#2a2a2e',
  chairSeat: '#2a2a2e', chairBack: '#222', chairLeg: '#3a3a3e',
  labelBg: 'rgba(16,12,24,0.92)', labelText: '#c8c0d8', labelBorder: 'rgba(140,120,180,0.28)',
  statusWorking: '#22c55e', statusIdle: '#eab308', statusSleeping: '#4b5563',
  plantPot: '#5a3e2c', leafDark: '#1a4a1a', leafLight: '#2a8a3a',
  bookColors: ['#a03030','#2870a8','#c0a030','#208848','#7840a0','#b86020','#148870','#b83070'],
  shelfWood: '#4a3828', shelfSide: '#3a2818',
  mugBody: '#6a6060', mugCoffee: '#4a2a16', mugHandle: '#585050',
  lampPole: '#666', lampShade: '#8a7840',
  rugColors: ['#4a2810','#563018','#6a4828','#786040'],
  catBody: '#444', catEar: '#383838',
  posterFrame: '#3a2e28',
  coffeeMachine: '#2a2a2e', coffeeMachineLight: '#22c55e',
  tooltipBg: 'rgba(12,8,20,0.95)',
  tooltipBorder: 'rgba(120,100,180,0.22)',
  tooltipAccent: '#60a5fa',
};

var PAL = { ...PAL_LIGHT };

function _syncThemePalette() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const src = isDark ? PAL_DARK : PAL_LIGHT;
  for (const k in src) PAL[k] = src[k];
}

// ── LAYOUT ──
// Each desk station is a self-contained area with desk, chair, monitor, personal items.
// Grid is in screen pixels (not iso tiles) for simplicity — we draw top-down isometric.
const ISO = { tileW: 64, tileH: 32 };

// Room dimensions
const ROOM = { cols: 26, rows: 18 };

const ZONES = [
  { key: 'engineering', name: 'ENGINEERING', x0: 1, x1: 8, y0: 1, y1: 16, color: 'rgba(93, 126, 201, 0.12)', line: '#6888d8' },
  { key: 'content', name: 'CONTENT', x0: 9, x1: 16, y0: 1, y1: 16, color: 'rgba(207, 153, 94, 0.12)', line: '#c58a4d' },
  { key: 'leadership', name: 'LEADERSHIP', x0: 17, x1: 24, y0: 1, y1: 7, color: 'rgba(151, 116, 204, 0.13)', line: '#9a72d5' },
  { key: 'support', name: 'SUPPORT', x0: 17, x1: 24, y0: 8, y1: 16, color: 'rgba(91, 176, 137, 0.13)', line: '#4aa97e' },
];

// Fixed desk positions — spread across the full floor with corridor gaps
const DESK_SLOTS = [
  // Engineering cluster — spread wider
  { gx: 3, gy: 4, zone: 'engineering' },
  { gx: 7, gy: 4, zone: 'engineering' },
  { gx: 3, gy: 10, zone: 'engineering' },
  { gx: 7, gy: 10, zone: 'engineering' },
  { gx: 5, gy: 15, zone: 'engineering' },
  // Content cluster
  { gx: 11, gy: 3, zone: 'content' },
  { gx: 15, gy: 3, zone: 'content' },
  { gx: 11, gy: 9, zone: 'content' },
  { gx: 15, gy: 9, zone: 'content' },
  { gx: 13, gy: 15, zone: 'content' },
  // Leadership cluster
  { gx: 18, gy: 3, zone: 'leadership' },
  { gx: 22, gy: 3, zone: 'leadership' },
  { gx: 20, gy: 6, zone: 'leadership' },
  // Support cluster
  { gx: 18, gy: 10, zone: 'support' },
  { gx: 22, gy: 10, zone: 'support' },
  { gx: 18, gy: 15, zone: 'support' },
  { gx: 22, gy: 15, zone: 'support' },
];

// Mobile desk slots — must stay within ROOM bounds (22×16)
const MOBILE_DESK_SLOTS = [
  // Engineering cluster
  { gx: 3, gy: 3, zone: 'engineering' },
  { gx: 6, gy: 3, zone: 'engineering' },
  { gx: 3, gy: 8, zone: 'engineering' },
  { gx: 6, gy: 8, zone: 'engineering' },
  { gx: 4, gy: 13, zone: 'engineering' },
  // Content cluster
  { gx: 10, gy: 3, zone: 'content' },
  { gx: 14, gy: 3, zone: 'content' },
  { gx: 10, gy: 8, zone: 'content' },
  { gx: 14, gy: 8, zone: 'content' },
  { gx: 12, gy: 13, zone: 'content' },
  // Leadership cluster
  { gx: 17, gy: 3, zone: 'leadership' },
  { gx: 20, gy: 3, zone: 'leadership' },
  { gx: 18, gy: 7, zone: 'leadership' },
  // Support cluster
  { gx: 17, gy: 10, zone: 'support' },
  { gx: 20, gy: 10, zone: 'support' },
  { gx: 17, gy: 14, zone: 'support' },
  { gx: 20, gy: 14, zone: 'support' },
];

function getActiveDeskSlots() {
  return window.innerWidth <= 768 ? MOBILE_DESK_SLOTS : DESK_SLOTS;
}

// Shared furniture
const SHARED_FURNITURE = [
  // Outer shell / perimeter
  { type: 'bookshelf', gx: 0, gy: 2 },
  { type: 'bookshelfClosed', gx: 0, gy: 6 },
  { type: 'bookshelf', gx: 0, gy: 10 },
  { type: 'plant', gx: 0, gy: 14 },
  { type: 'coffeeMachine', gx: 25, gy: 2 },
  { type: 'plant', gx: 25, gy: 5 },
  { type: 'plant', gx: 25, gy: 10 },
  { type: 'plant', gx: 25, gy: 14 },
  { type: 'lamp', gx: 2, gy: 0 },
  { type: 'lamp', gx: 12, gy: 0 },
  { type: 'lamp', gx: 20, gy: 0 },
  { type: 'clock', gx: 13, gy: 0 },
  { type: 'window', gx: 3, gy: 0 },
  { type: 'window', gx: 7, gy: 0 },
  { type: 'window', gx: 11, gy: 0 },
  { type: 'window', gx: 15, gy: 0 },
  { type: 'window', gx: 19, gy: 0 },
  { type: 'window', gx: 23, gy: 0 },
  // Zone separators / room feel
  { type: 'doorway', gx: 8, gy: 3 },
  { type: 'doorway', gx: 16, gy: 3 },
  { type: 'doorway', gx: 17, gy: 8 },
  // Shared lounge / social space
  { type: 'cat', gx: 12, gy: 17 },
  { type: 'rug', gx: 12, gy: 17 },
  { type: 'armchair', gx: 11, gy: 17 },
  { type: 'armchair', gx: 13, gy: 17 },
  { type: 'coffeeTable', gx: 12, gy: 16 },
  { type: 'sideTable', gx: 10, gy: 17 },
  { type: 'lampProp', gx: 14, gy: 17 },
  { type: 'benchProp', gx: 11, gy: 15 },
  { type: 'waterCooler', gx: 25, gy: 8 },
  // Engineering zone
  { type: 'whiteboard', gx: 2, gy: 0 },
  { type: 'poster', gx: 4, gy: 0, hue: 210 },
  { type: 'bookshelf', gx: 1, gy: 8 },
  { type: 'plant', gx: 1, gy: 2 },
  { type: 'boxProp', gx: 2, gy: 9 },
  { type: 'speakerProp', gx: 3, gy: 1 },
  { type: 'photoFrame', gx: 5, gy: 1 },
  // Content zone
  { type: 'bookshelfClosed', gx: 6, gy: 1 },
  { type: 'poster', gx: 8, gy: 0, hue: 28 },
  { type: 'coffeeCorner', gx: 12, gy: 1 },
  { type: 'plant', gx: 10, gy: 2 },
  { type: 'rug', gx: 8, gy: 9 },
  { type: 'sideTable', gx: 9, gy: 9 },
  { type: 'plant', gx: 6, gy: 10 },
  // Leadership zone
  { type: 'armchair', gx: 19, gy: 7 },
  { type: 'poster', gx: 17, gy: 0, hue: 290 },
  { type: 'plant', gx: 21, gy: 4 },
  { type: 'sideTable', gx: 19, gy: 6 },
  { type: 'lampProp', gx: 21, gy: 6 },
  { type: 'serverRack', gx: 20, gy: 2 },
  // Support zone
  { type: 'bookshelfClosed', gx: 21, gy: 12 },
  { type: 'plant', gx: 15, gy: 12 },
  { type: 'poster', gx: 17, gy: 8, hue: 145 },
  { type: 'boxProp', gx: 19, gy: 12 },
  { type: 'sideTable', gx: 17, gy: 12 },
];

// ── IDLE AGENT WANDERING ──
// Idle agents occasionally leave desks to visit POIs (water cooler, lounge, coffee)
const WANDER_POIS = [
  { gx: 21, gy: 8, label: 'water cooler' },
  { gx: 10, gy: 14, label: 'lounge' },
  { gx: 12, gy: 14, label: 'lounge' },
  { gx: 21, gy: 2, label: 'coffee' },
];
const WANDER_MIN_INTERVAL = 12000; // min 12s between wander decisions
const WANDER_TRIP_DURATION = 3000; // 3s to walk to POI
const WANDER_STAY_DURATION = 6000; // 6s at POI
const _wanderState = {}; // agentName -> { phase:'desk'|'walking'|'atPOI'|'returning', startTime, poi, deskGx, deskGy }

function getWanderPos(agentName, deskGx, deskGy, status, time) {
  // Only idle agents wander
  if (status !== 'idle') {
    delete _wanderState[agentName];
    return { gx: deskGx, gy: deskGy };
  }

  let ws = _wanderState[agentName];
  if (!ws) {
    // Start at desk, schedule first wander
    ws = { phase: 'desk', startTime: time + WANDER_MIN_INTERVAL * (0.5 + Math.random()), deskGx, deskGy };
    _wanderState[agentName] = ws;
  }
  ws.deskGx = deskGx;
  ws.deskGy = deskGy;

  const elapsed = time - ws.startTime;

  switch (ws.phase) {
    case 'desk':
      if (elapsed > 0) {
        // Time to wander — pick a random POI
        ws.phase = 'walking';
        ws.poi = WANDER_POIS[Math.floor(Math.random() * WANDER_POIS.length)];
        ws.startTime = time;
      }
      return { gx: deskGx, gy: deskGy };

    case 'walking': {
      const t = Math.min(1, elapsed / WANDER_TRIP_DURATION);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      if (t >= 1) {
        ws.phase = 'atPOI';
        ws.startTime = time;
      }
      return {
        gx: deskGx + (ws.poi.gx - deskGx) * ease,
        gy: deskGy + (ws.poi.gy - deskGy) * ease
      };
    }

    case 'atPOI':
      if (elapsed > WANDER_STAY_DURATION) {
        ws.phase = 'returning';
        ws.startTime = time;
      }
      return { gx: ws.poi.gx, gy: ws.poi.gy };

    case 'returning': {
      const t = Math.min(1, elapsed / WANDER_TRIP_DURATION);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (t >= 1) {
        ws.phase = 'desk';
        ws.startTime = time + WANDER_MIN_INTERVAL * (0.5 + Math.random());
      }
      return {
        gx: ws.poi.gx + (deskGx - ws.poi.gx) * ease,
        gy: ws.poi.gy + (deskGy - ws.poi.gy) * ease
      };
    }
  }
  return { gx: deskGx, gy: deskGy };
}

// ── ISO PROJECTION ──
let _originX = 0, _originY = 0;

function projectIso(gx, gy) {
  return {
    x: (gx - gy) * ISO.tileW / 2,
    y: (gx + gy) * ISO.tileH / 2
  };
}

function iso(gx, gy) {
  const p = projectIso(gx, gy);
  return {
    x: _originX + p.x,
    y: _originY + p.y
  };
}

function getSceneBounds() {
  const wallH = 40;
  const pts = [
    projectIso(0, 0),
    projectIso(ROOM.cols - 1, 0),
    projectIso(0, ROOM.rows - 1),
    projectIso(ROOM.cols - 1, ROOM.rows - 1),
    projectIso(ROOM.cols, 0),
    projectIso(0, ROOM.rows)
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(p => {
    minX = Math.min(minX, p.x - ISO.tileW / 2 - 50);
    maxX = Math.max(maxX, p.x + ISO.tileW / 2 + 80);
    minY = Math.min(minY, p.y - ISO.tileH / 2 - wallH - 60);
    maxY = Math.max(maxY, p.y + ISO.tileH / 2 + 100);
  });
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function worldToScreen(x, y, cw, ch) {
  return {
    x: cw / 2 + ((x - cw / 2 + camPanX) * camZoom),
    y: ch / 2 + ((y - ch / 2 + camPanY) * camZoom)
  };
}

function hashAgent(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getZoneForAgent(agent) {
  const role = String(agent?.role || '').toLowerCase();
  const name = String(agent?.name || '').toLowerCase();
  if (/engineer|developer|qa|test|android|frontend|backend|dev|coding agent/.test(role) || /coding agent|qa agent/.test(name)) return 'engineering';
  if (/writer|content|research|design|visual|producer|publisher/.test(role) || /writer|designer|publisher|research/.test(name)) return 'content';
  if (/ceo|main|lead|director|manager|founder/.test(role)) return 'leadership';
  return 'support';
}

let _hoverTargets = [];
let _hoveredAgent = null;
let _mouseCanvasX = 0, _mouseCanvasY = 0;
let _pointerDownAgent = null;
let _pointerDownAt = 0;

// ── ZOOM / PAN ──
let camZoom = 1, camPanX = 0, camPanY = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0, ZOOM_STEP = 0.15;
let _dragging = false, _userPanned = false, _dragStartX = 0, _dragStartY = 0, _dragPanStartX = 0, _dragPanStartY = 0;

// ── DRAWING HELPERS ──
function drawIsoDiamond(gx, gy, fillA, fillB, stroke) {
  const p = iso(gx, gy);
  const hw = ISO.tileW / 2, hh = ISO.tileH / 2;
  oCtx.beginPath();
  oCtx.moveTo(p.x, p.y - hh);
  oCtx.lineTo(p.x + hw, p.y);
  oCtx.lineTo(p.x, p.y + hh);
  oCtx.lineTo(p.x - hw, p.y);
  oCtx.closePath();
  oCtx.fillStyle = fillA;
  oCtx.fill();
  if (stroke) { oCtx.strokeStyle = stroke; oCtx.lineWidth = 0.5; oCtx.stroke(); }
}

function drawIsoBox(gx, gy, h, topColor, leftColor, rightColor) {
  const p = iso(gx, gy);
  const hw = ISO.tileW / 2, hh = ISO.tileH / 2;
  // Top face
  oCtx.beginPath();
  oCtx.moveTo(p.x, p.y - hh - h);
  oCtx.lineTo(p.x + hw, p.y - h);
  oCtx.lineTo(p.x, p.y + hh - h);
  oCtx.lineTo(p.x - hw, p.y - h);
  oCtx.closePath();
  oCtx.fillStyle = topColor;
  oCtx.fill();
  // Left face
  oCtx.beginPath();
  oCtx.moveTo(p.x - hw, p.y - h);
  oCtx.lineTo(p.x, p.y + hh - h);
  oCtx.lineTo(p.x, p.y + hh);
  oCtx.lineTo(p.x - hw, p.y);
  oCtx.closePath();
  oCtx.fillStyle = leftColor;
  oCtx.fill();
  // Right face
  oCtx.beginPath();
  oCtx.moveTo(p.x + hw, p.y - h);
  oCtx.lineTo(p.x, p.y + hh - h);
  oCtx.lineTo(p.x, p.y + hh);
  oCtx.lineTo(p.x + hw, p.y);
  oCtx.closePath();
  oCtx.fillStyle = rightColor;
  oCtx.fill();
}

// ── FLOOR ──
function drawFloor() {
  for (let gy = 0; gy < ROOM.rows; gy++) {
    for (let gx = 0; gx < ROOM.cols; gx++) {
      const p = iso(gx, gy);
      if (officeAssetReady('floorTile')) {
        const scale = 1.0;
        drawOfficeAsset((gx + gy) % 3 === 0 && officeAssetReady('floorHalf') ? 'floorHalf' : 'floorTile', p.x, p.y + 18, scale, (gx + gy) % 2 === 0 ? 1 : 0.98);
      } else {
        const isCheck = (gx + gy) % 2 === 0;
        drawIsoDiamond(gx, gy, isCheck ? PAL.floorA : PAL.floorB, null, PAL.floorLine);
      }
    }
  }
}

function drawZoneRect(x0, x1, y0, y1, fill, stroke) {
  const p1 = iso(x0, y0);
  const p2 = iso(x1 + 1, y0);
  const p3 = iso(x1 + 1, y1 + 1);
  const p4 = iso(x0, y1 + 1);
  oCtx.beginPath();
  oCtx.moveTo(p1.x, p1.y);
  oCtx.lineTo(p2.x, p2.y);
  oCtx.lineTo(p3.x, p3.y);
  oCtx.lineTo(p4.x, p4.y);
  oCtx.closePath();
  oCtx.fillStyle = fill;
  oCtx.fill();
  oCtx.strokeStyle = stroke;
  oCtx.lineWidth = 1;
  oCtx.stroke();
}

function drawZoneBoundaries() {
  ZONES.forEach(z => drawZoneRect(z.x0, z.x1, z.y0, z.y1, z.color, z.line));

  const dividers = [
    [[7.5, 1], [7.5, 14]],
    [[14.5, 1], [14.5, 14]],
    [[15, 7.5], [20, 7.5]],
  ];
  oCtx.strokeStyle = 'rgba(92,72,48,0.55)';
  oCtx.lineWidth = 4;
  dividers.forEach(([a,b]) => {
    const p1 = iso(a[0], a[1]);
    const p2 = iso(b[0], b[1]);
    oCtx.beginPath();
    oCtx.moveTo(p1.x, p1.y);
    oCtx.lineTo(p2.x, p2.y);
    oCtx.stroke();
  });
}

function drawZoneLabels() {
  ZONES.forEach(z => {
    const cx = (z.x0 + z.x1 + 1) / 2;
    const cy = (z.y0 + z.y1 + 1) / 2;
    const p = iso(cx, cy);
    oCtx.save();
    oCtx.translate(p.x, p.y);
    oCtx.scale(1, 0.55);
    oCtx.fillStyle = 'rgba(255,255,255,0.14)';
    oCtx.font = 'bold 20px -apple-system, system-ui, sans-serif';
    oCtx.textAlign = 'center';
    oCtx.fillText(z.name, 0, 0);
    oCtx.restore();
  });
}

// ── WALLS ──
function drawWalls() {
  const wallH = 40;
  // Back wall (top edge, gy = -0.5)
  for (let gx = 0; gx < ROOM.cols; gx++) {
    const p = iso(gx, 0);
    const p2 = iso(gx + 1, 0);
    oCtx.fillStyle = PAL.wallTop;
    oCtx.beginPath();
    oCtx.moveTo(p.x, p.y - ISO.tileH / 2 - wallH);
    oCtx.lineTo(p2.x, p2.y - ISO.tileH / 2 - wallH);
    oCtx.lineTo(p2.x, p2.y - ISO.tileH / 2);
    oCtx.lineTo(p.x, p.y - ISO.tileH / 2);
    oCtx.closePath();
    oCtx.fill();
    oCtx.strokeStyle = PAL.wallTrim;
    oCtx.lineWidth = 1;
    oCtx.beginPath();
    oCtx.moveTo(p.x, p.y - ISO.tileH / 2);
    oCtx.lineTo(p2.x, p2.y - ISO.tileH / 2);
    oCtx.stroke();
    if (officeAssetReady('wallBack') && gx > 0 && gx < ROOM.cols - 1) {
      drawOfficeAsset('wallBack', p.x + ISO.tileW / 2, p.y + 2, 0.9, 0.92);
    }
  }
  // Left wall
  for (let gy = 0; gy < ROOM.rows; gy++) {
    const p = iso(0, gy);
    const p2 = iso(0, gy + 1);
    oCtx.fillStyle = PAL.wallSide;
    oCtx.beginPath();
    oCtx.moveTo(p.x - ISO.tileW / 2, p.y - wallH);
    oCtx.lineTo(p2.x - ISO.tileW / 2, p2.y - wallH);
    oCtx.lineTo(p2.x - ISO.tileW / 2, p2.y);
    oCtx.lineTo(p.x - ISO.tileW / 2, p.y);
    oCtx.closePath();
    oCtx.fill();
    oCtx.strokeStyle = PAL.wallTrim;
    oCtx.lineWidth = 1;
    oCtx.beginPath();
    oCtx.moveTo(p.x - ISO.tileW / 2, p.y);
    oCtx.lineTo(p2.x - ISO.tileW / 2, p2.y);
    oCtx.stroke();
    if (officeAssetReady('wallLeft') && gy > 0 && gy < ROOM.rows - 1) {
      drawOfficeAsset('wallLeft', p.x - 18, p.y + 14, 0.88, 0.9);
    }
  }
  if (officeAssetReady('wallCorner')) {
    const c = iso(0, 0);
    drawOfficeAsset('wallCorner', c.x - 12, c.y + 10, 0.92, 0.95);
  }
}

function drawInteriorPartitions() {
  const partitions = [
    // engineering/content divide
    { kind: 'vertical', gx: 7.5, y0: 1, y1: 13, doorwayAt: 7 },
    // content/leadership-support divide
    { kind: 'vertical', gx: 14.5, y0: 1, y1: 13, doorwayAt: 7 },
    // leadership/support split
    { kind: 'horizontal', gy: 7.5, x0: 15, x1: 20, doorwayAt: 17 },
  ];

  partitions.forEach(part => {
    if (part.kind === 'vertical') {
      for (let gy = part.y0; gy <= part.y1; gy++) {
        const p = iso(part.gx, gy);
        const isDoor = gy === part.doorwayAt;
        if (isDoor) {
          const key = pickOfficeAsset(['doorwayNE','doorway']);
          if (officeAssetReady(key)) drawOfficeAsset(key, p.x + 2, p.y + 8, 0.86, 0.72);
        } else {
          // Half-height cubicle divider — subtle glass/wood panel feel
          oCtx.save();
          oCtx.globalAlpha = 0.45;
          // Glass panel top
          oCtx.fillStyle = 'rgba(180,210,200,0.5)';
          oCtx.beginPath();
          oCtx.moveTo(p.x - 3, p.y - 16);
          oCtx.lineTo(p.x + 12, p.y - 9);
          oCtx.lineTo(p.x + 12, p.y + 3);
          oCtx.lineTo(p.x - 3, p.y - 4);
          oCtx.closePath();
          oCtx.fill();
          // Wood trim at bottom
          oCtx.fillStyle = 'rgba(140,105,70,0.6)';
          oCtx.beginPath();
          oCtx.moveTo(p.x - 3, p.y - 4);
          oCtx.lineTo(p.x + 12, p.y + 3);
          oCtx.lineTo(p.x + 12, p.y + 5);
          oCtx.lineTo(p.x - 3, p.y - 2);
          oCtx.closePath();
          oCtx.fill();
          oCtx.restore();
        }
      }
    } else {
      for (let gx = part.x0; gx <= part.x1; gx++) {
        const p = iso(gx, part.gy);
        const isDoor = gx === part.doorwayAt;
        if (isDoor) {
          const key = pickOfficeAsset(['doorway','doorwayNE']);
          if (officeAssetReady(key)) drawOfficeAsset(key, p.x, p.y + 8, 0.86, 0.72);
        } else {
          oCtx.save();
          oCtx.globalAlpha = 0.45;
          oCtx.fillStyle = 'rgba(180,210,200,0.5)';
          oCtx.beginPath();
          oCtx.moveTo(p.x - 16, p.y - 14);
          oCtx.lineTo(p.x + 16, p.y - 14);
          oCtx.lineTo(p.x + 16, p.y + 2);
          oCtx.lineTo(p.x - 16, p.y + 2);
          oCtx.closePath();
          oCtx.fill();
          oCtx.fillStyle = 'rgba(140,105,70,0.6)';
          oCtx.beginPath();
          oCtx.moveTo(p.x - 16, p.y + 2);
          oCtx.lineTo(p.x + 16, p.y + 2);
          oCtx.lineTo(p.x + 16, p.y + 4);
          oCtx.lineTo(p.x - 16, p.y + 4);
          oCtx.closePath();
          oCtx.fill();
          oCtx.restore();
        }
      }
    }
  });
}

// ── DESK STATION ──
function drawDeskStation(gx, gy, agent, time) {
  const p = iso(gx, gy);
  const seed = hashAgent(agent?.name || `${gx},${gy}`);
  const hour = new Date(_frameTime).getHours();
  const nightMode = document.documentElement.getAttribute("data-theme") === "dark" || hour < 7 || hour >= 19;
  const zoneKey = getZoneForAgent(agent);
  const isEngineering = zoneKey === 'engineering';
  const isContent = zoneKey === 'content';
  const isLeadership = zoneKey === 'leadership';
  const isSupport = zoneKey === 'support';
  const deskTop = seed % 3 === 0 ? '#b08050' : seed % 3 === 1 ? '#8f6a46' : '#a77756';
  const deskFront = seed % 3 === 0 ? '#8a6038' : seed % 3 === 1 ? '#725338' : '#855e40';
  const deskSide = seed % 3 === 0 ? '#9a7048' : seed % 3 === 1 ? '#7d5b3e' : '#95694a';

  const deskKey = seed % 5 === 0 ? pickOfficeAsset(seed % 2 === 0 ? ['deskCornerNE','deskCorner'] : ['deskCorner','deskCornerNE']) : pickOfficeAsset(seed % 2 === 0 ? ['deskNE','desk'] : ['desk','deskNE']);
  const chairKey = isLeadership ? pickOfficeAsset(seed % 2 === 0 ? ['chairCushionNE','chairCushion','chairRoundedNE','chairRounded'] : ['chairCushion','chairCushionNE','chairRounded','chairRoundedNE']) : pickOfficeAsset(seed % 2 === 0 ? ['chairDeskNE','chairDesk'] : ['chairDesk','chairDeskNE']);
  const monitorKey = pickOfficeAsset(seed % 2 === 0 ? ['monitorNE','monitor'] : ['monitor','monitorNE']);
  const laptopKey = pickOfficeAsset(seed % 2 === 0 ? ['laptopNE','laptop'] : ['laptop','laptopNE']);
  const hasSpriteDesk = officeAssetReady(deskKey);

  // Workspace boundary / cubicle cue so each desk reads as a separate area
  oCtx.save();
  oCtx.globalAlpha = 0.96;
  oCtx.fillStyle = isEngineering ? 'rgba(104,136,216,0.11)' : isContent ? 'rgba(197,138,77,0.11)' : isLeadership ? 'rgba(154,114,213,0.12)' : isSupport ? 'rgba(74,169,126,0.11)' : 'rgba(255,255,255,0.06)';
  oCtx.beginPath();
  oCtx.moveTo(p.x, p.y - 34);
  oCtx.lineTo(p.x + 54, p.y - 6);
  oCtx.lineTo(p.x, p.y + 24);
  oCtx.lineTo(p.x - 54, p.y - 6);
  oCtx.closePath();
  oCtx.fill();
  oCtx.strokeStyle = isEngineering ? 'rgba(104,136,216,0.28)' : isContent ? 'rgba(197,138,77,0.28)' : isLeadership ? 'rgba(154,114,213,0.30)' : isSupport ? 'rgba(74,169,126,0.28)' : 'rgba(255,255,255,0.1)';
  oCtx.lineWidth = 1.2;
  oCtx.stroke();
  // subtle cubicle divider walls on left/right edges
  oCtx.strokeStyle = 'rgba(108,84,58,0.22)';
  oCtx.lineWidth = 2;
  oCtx.beginPath();
  oCtx.moveTo(p.x - 46, p.y - 4);
  oCtx.lineTo(p.x - 46, p.y - 28);
  oCtx.moveTo(p.x + 46, p.y - 4);
  oCtx.lineTo(p.x + 46, p.y - 28);
  oCtx.stroke();
  oCtx.restore();

  // Personal desk rug / floor accent to make each station feel owned — tune by department
  if (officeAssetReady(isLeadership ? 'rugRound' : isContent ? 'rugRounded' : isSupport ? 'rugSquare' : 'rugRect')) {
    const rugKey = isLeadership ? 'rugRound' : isContent ? 'rugRounded' : isSupport ? 'rugSquare' : 'rugRect';
    drawOfficeAsset(rugKey, p.x, p.y + 18, rugKey === 'rugRound' ? 0.76 : rugKey === 'rugSquare' ? 0.7 : 0.68, isLeadership ? 0.62 : 0.55);
  }

  if (hasSpriteDesk) {
    drawOfficeAsset(deskKey, p.x, p.y + 14, isLeadership ? 0.96 : 0.9);
    if (officeAssetReady(chairKey)) {
      drawOfficeAsset(chairKey, p.x - 10, p.y + 18, isLeadership ? 0.92 : 0.88, 0.95);
    }
    if (officeAssetReady(seed % 4 === 0 ? laptopKey : monitorKey)) {
      const compKey = seed % 4 === 0 ? laptopKey : monitorKey;
      drawOfficeAsset(compKey, p.x + 3, p.y - 1, compKey === 'laptop' ? 0.72 : 0.68);
      if (isEngineering && officeAssetReady('monitor') && seed % 3 === 0) drawOfficeAsset('monitor', p.x - 6, p.y + 1, 0.6);
      if (agent && agent.status === 'working') {
        oCtx.save();
        oCtx.globalAlpha = nightMode ? 0.22 : 0.12;
        oCtx.fillStyle = '#8fd3ff';
        oCtx.beginPath();
        oCtx.ellipse(p.x + 5, p.y + 3, 14, 8, 0, 0, Math.PI * 2);
        oCtx.fill();
        oCtx.restore();
      }
    }
    if (officeAssetReady('keyboard') && seed % 4 !== 0) drawOfficeAsset('keyboard', p.x - 2, p.y + 6, 0.68);
    if (officeAssetReady('mouse') && (seed % 2 === 0 || isEngineering)) drawOfficeAsset('mouse', p.x + 11, p.y + 6, 0.65);
    if (officeAssetReady(isContent ? 'booksNE' : 'books') && (seed % 3 === 0 || isContent || isLeadership)) drawOfficeAsset(isContent ? 'booksNE' : 'books', p.x - 15, p.y + 6, isLeadership ? 0.68 : 0.62, 0.92);
    // Every desk should feel lived in: mug + small plant + task lamp zone
    if (officeAssetReady('plantSmall1')) drawOfficeAsset('plantSmall1', p.x + 18, p.y + 8, 0.56, 0.96);
    if (officeAssetReady('lampSquareTable') && (isLeadership || seed % 2 === 0)) drawOfficeAsset('lampSquareTable', p.x - 18, p.y + 2, 0.56, 0.95);
    // Zone personality props
    if (isEngineering) {
      if (officeAssetReady(seed % 2 === 0 ? 'speakerSmall' : 'speaker') && seed % 3 !== 1) drawOfficeAsset(seed % 2 === 0 ? 'speakerSmall' : 'speaker', p.x - 18, p.y + 1, seed % 2 === 0 ? 0.44 : 0.48, 0.92);
      if (officeAssetReady('trashcan') && seed % 3 === 0) drawOfficeAsset('trashcan', p.x + 18, p.y + 12, 0.48, 0.9);
    }
    if (isContent) {
      if (officeAssetReady((seed % 2 === 0) ? 'plantSmall2' : 'plantSmall3')) drawOfficeAsset((seed % 2 === 0) ? 'plantSmall2' : 'plantSmall3', p.x + 16, p.y + 7, 0.62, 0.95);
      if (officeAssetReady(seed % 2 === 0 ? 'tableCoffeeGlass' : 'tableCoffeeSquare') && seed % 3 === 0) drawOfficeAsset(seed % 2 === 0 ? 'tableCoffeeGlass' : 'tableCoffeeSquare', p.x - 22, p.y + 14, 0.48, 0.78);
    }
    if (isLeadership) {
      if (officeAssetReady('lampSquareTable')) drawOfficeAsset('lampSquareTable', p.x + 16, p.y - 2, 0.6, 0.95);
      if (officeAssetReady(seed % 2 === 0 ? 'speaker' : 'speakerSmall')) drawOfficeAsset(seed % 2 === 0 ? 'speaker' : 'speakerSmall', p.x - 19, p.y + 1, 0.5, 0.92);
      if (officeAssetReady('tableRound') && seed % 3 === 0) drawOfficeAsset('tableRound', p.x + 20, p.y + 14, 0.46, 0.78);
    }
    if (isSupport) {
      if (officeAssetReady('kitchenCoffeeMachine') && seed % 3 !== 2) drawOfficeAsset('kitchenCoffeeMachine', p.x + 18, p.y + 2, 0.54, 0.95);
      if (officeAssetReady('trashcan') && seed % 2 === 0) drawOfficeAsset('trashcan', p.x - 18, p.y + 11, 0.48, 0.9);
    }
  } else {
    // Desk (iso box)
    drawIsoBox(gx, gy, 12, deskTop, deskFront, deskSide);
  }

  if (!hasSpriteDesk) {
    // Monitor setup varies by desk
    const dual = seed % 5 === 0;
    const monW = dual ? 12 : 16, monH = 12;
    const monX = p.x - monW / 2, monY = p.y - ISO.tileH / 2 - 12 - monH;
    oCtx.fillStyle = PAL.monFrame;
    oCtx.fillRect(monX - 1, monY - 1, monW + 2, monH + 2);
    if (dual) oCtx.fillRect(monX + 13, monY - 1, monW + 2, monH + 2);
    // Screen color based on status
    let screenColor = PAL.monScreen;
    if (agent) {
      if (agent.status === 'idle') screenColor = PAL.monScreenIdle;
      else if (agent.status === 'sleeping') screenColor = PAL.monScreenSleep;
      if (agent.status === 'working' && Math.sin(time / 400 + gx) > 0.3) screenColor = '#4a8ff7';
    }
    oCtx.fillStyle = screenColor;
    oCtx.fillRect(monX, monY, monW, monH);
    if (dual) {
      oCtx.fillStyle = agent?.status === 'working' ? '#60a5fa' : '#5eead4';
      oCtx.fillRect(monX + 14, monY, monW, monH);
    }

    // Monitor stand
    oCtx.fillStyle = PAL.monFrame;
    oCtx.fillRect(p.x - 2, monY + monH + 1, 4, 4);
    oCtx.fillRect(p.x - 5, monY + monH + 4, 10, 2);

    // Keyboard
    oCtx.fillStyle = '#555';
    oCtx.fillRect(p.x - 8, p.y - ISO.tileH / 2 - 6, 16, 4);
    oCtx.fillStyle = '#666';
    for (let i = 0; i < 5; i++) {
      oCtx.fillRect(p.x - 7 + i * 3, p.y - ISO.tileH / 2 - 5, 2, 2);
    }
  }

  // Desk accessories — keep only when sprite variants are not already carrying the scene
  const mugX = p.x + 12, mugY = p.y - ISO.tileH / 2 - 10;
  if (!hasSpriteDesk || seed % 3 === 2) {
    oCtx.fillStyle = PAL.mugBody;
    oCtx.fillRect(mugX, mugY, 5, 6);
    oCtx.fillStyle = PAL.mugCoffee;
    oCtx.fillRect(mugX + 1, mugY + 1, 3, 4);
    oCtx.strokeStyle = PAL.mugHandle;
    oCtx.lineWidth = 1;
    oCtx.beginPath();
    oCtx.arc(mugX + 6, mugY + 3, 2, -Math.PI / 2, Math.PI / 2);
    oCtx.stroke();
  }
  if ((!hasSpriteDesk || isContent) && seed % 2 === 0) {
    oCtx.fillStyle = '#d6c0a1';
    oCtx.fillRect(p.x - 16, p.y - ISO.tileH / 2 - 11, 8, 5);
    oCtx.fillStyle = '#b0825d';
    oCtx.fillRect(p.x - 15, p.y - ISO.tileH / 2 - 10, 6, 1);
  }
  if ((!hasSpriteDesk || isContent) && seed % 4 === 0) {
    oCtx.fillStyle = '#7bc96f';
    oCtx.beginPath();
    oCtx.arc(p.x + 2, p.y - ISO.tileH / 2 - 12, 3, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.fillStyle = '#7a5a3a';
    oCtx.fillRect(p.x, p.y - ISO.tileH / 2 - 9, 4, 3);
  }
  // Steam
  if (agent && agent.status === 'working') {
    oCtx.globalAlpha = 0.3;
    oCtx.fillStyle = '#fff';
    const st = time / 1000;
    oCtx.beginPath();
    oCtx.arc(mugX + 2, mugY - 2 - Math.sin(st) * 2, 1.5, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.beginPath();
    oCtx.arc(mugX + 4, mugY - 5 - Math.sin(st + 1) * 2, 1, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.globalAlpha = 1;
  }

  // Small warm lamp glow / task light at active desks
  if (agent && agent.status === 'working') {
    oCtx.save();
    oCtx.globalAlpha = nightMode ? 0.18 : 0.08;
    oCtx.fillStyle = nightMode ? '#ffc977' : '#ffe5a8';
    oCtx.beginPath();
    oCtx.ellipse(p.x, p.y + 8, 22, 12, 0, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.restore();
  }

  // Chair fallback only when sprite chair is unavailable
  if (!hasSpriteDesk || !officeAssetReady(chairKey)) {
    const chairP = iso(gx, gy + 0.6);
    oCtx.fillStyle = PAL.chairSeat;
    oCtx.beginPath();
    oCtx.ellipse(chairP.x, chairP.y - 6, 8, 4, 0, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.fillStyle = PAL.chairBack;
    oCtx.fillRect(chairP.x - 6, chairP.y - 16, 12, 8);
    oCtx.fillStyle = PAL.chairLeg;
    oCtx.fillRect(chairP.x - 5, chairP.y - 2, 1, 4);
    oCtx.fillRect(chairP.x + 4, chairP.y - 2, 1, 4);
  }

  // Agent character (sitting at desk — drawn BEHIND the desk)
  if (agent) {
    // Draw agent slightly above and behind desk center
    drawAgent(p.x, p.y - ISO.tileH / 2 - 22, agent, time);
    // Name labels drawn in separate overlay pass (see _pendingLabels)
  }
}

// ── AGENT CHARACTER ──
function drawAgent(x, y, agent, time) {
  // Hover glow ring
  if (_hoveredAgent && _hoveredAgent.name === agent.name) {
    oCtx.save();
    const grad = oCtx.createRadialGradient(x, y + 8, 8, x, y + 8, 32);
    grad.addColorStop(0, 'rgba(59,130,246,0.35)');
    grad.addColorStop(0.6, 'rgba(59,130,246,0.12)');
    grad.addColorStop(1, 'rgba(59,130,246,0)');
    oCtx.fillStyle = grad;
    oCtx.beginPath();
    oCtx.ellipse(x, y + 8, 32, 18, 0, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.restore();
  }
  const color = agent.color || '#888';
  const role = String(agent?.role || '').toLowerCase();
  const isSleeping = agent.status === 'sleeping';
  const isWorking = agent.status === 'working';
  const isIdle = agent.status === 'idle';
  const hour = new Date(_frameTime).getHours();
  const nightMode = document.documentElement.getAttribute("data-theme") === "dark" || hour < 7 || hour >= 19;
  const seed = hashAgent(agent?.name || 'agent');
  const hairColors = ['#2f2a24','#7c4a2b','#d0a15b','#5b6477','#8a3f54','#5c7f4f'];
  const skinTones = ['#f1d2b0','#e3bc92','#c9966b','#8b5e3c'];
  const hair = hairColors[seed % hairColors.length];
  const skin = skinTones[seed % skinTones.length];
  const accessory = seed % 6;
  const bodyType = seed % 4;
  const torsoW = bodyType === 0 ? 8 : bodyType === 1 ? 9 : 10;
  const shoulderW = bodyType === 2 ? torsoW + 4 : torsoW + 2;
  const headR = bodyType === 3 ? 5 : 6;
  const stance = isWorking ? -2 : isIdle ? 1 : 0;
  // Breathing — subtle torso rise/fall for all agents (slower when sleeping)
  const breathRate = isSleeping ? 1800 : isIdle ? 1200 : 900;
  const breathAmp = isSleeping ? 0.6 : isIdle ? 0.5 : 0.3;
  const breathY = Math.sin(time / breathRate * Math.PI * 2 + seed * 1.7) * breathAmp;
  const poseTilt = isWorking ? Math.sin(time / 240 + seed) * 1.5 : isIdle ? Math.sin(time / 650 + seed) * 0.8 : 0;
  const headBob = isWorking ? Math.sin(time / 300 + seed) * 1 + breathY : breathY;
  const stepSwing = Math.sin(time / 180 + seed) * 1.6;
  // Idle stretch — occasionally agents do a stretch (every ~8s, lasts ~1.5s)
  const stretchCycle = ((time / 1000 + seed * 3.7) % 8) / 1.5; // 0-1 = stretching, >1 = normal
  const isStretching = isIdle && stretchCycle < 1;
  const stretchT = isStretching ? Math.sin(stretchCycle * Math.PI) : 0; // smooth 0→1→0
  const isLeader = /director|lead|ceo|manager|founder/.test(role);
  const isEngineer = /engineer|developer|qa|test|android|frontend|backend|dev/.test(role);
  const isContent = /writer|content|research|design|visual|producer|publisher/.test(role);
  const isSupport = /mail|support|ops|assistant/.test(role);
  const jacket = isLeader ? '#2b1f58' : isEngineer ? '#1f3b5c' : isContent ? '#6a3a24' : isSupport ? '#355e3b' : color;
  const shirt = isLeader ? '#efe2b8' : isEngineer ? '#93c5fd' : isContent ? '#f5d489' : isSupport ? '#c7f0d2' : '#d8d4cf';

  // Soft grounding shadow so characters feel seated in the room
  oCtx.save();
  oCtx.globalAlpha = 0.18;
  oCtx.fillStyle = 'rgba(40,24,14,0.6)';
  oCtx.beginPath();
  oCtx.ellipse(x, y + 12, 8, 4, 0, 0, Math.PI * 2);
  oCtx.fill();
  oCtx.restore();

  // Legs / lower silhouette
  oCtx.fillStyle = '#1f2937';
  if (isSleeping) {
    oCtx.fillRect(x - 6, y + 4, 12, 3);
    oCtx.fillRect(x - 4, y + 7, 8, 2);
  } else if (isIdle) {
    oCtx.fillRect(x - 4, y + 7, 3, 6);
    oCtx.fillRect(x + 1, y + 7, 3, 6);
    oCtx.fillRect(x - 5, y + 12, 4, 2);
    oCtx.fillRect(x + 1, y + 12, 4, 2);
  } else {
    oCtx.fillRect(x - 4, y + 7 + stepSwing * 0.18, 3, 6);
    oCtx.fillRect(x + 1, y + 7 - stepSwing * 0.18, 3, 6);
  }

  // Torso outline for stronger silhouette (with breathing offset)
  const by = breathY * 0.5; // subtle torso shift from breathing
  oCtx.fillStyle = '#2a1a12';
  oCtx.fillRect(x - torsoW / 2 - 1, y + by, torsoW + 2, 11);
  oCtx.fillRect(x - shoulderW / 2 - 1, y - 2 + by, shoulderW + 2, 5);

  // Torso + shoulders
  oCtx.fillStyle = jacket;
  oCtx.fillRect(x - torsoW / 2, y + 1, torsoW, 9);
  oCtx.fillRect(x - shoulderW / 2, y - 1, shoulderW, 4);
  if (bodyType === 2) oCtx.fillRect(x - torsoW / 2 - 1, y + 5, torsoW + 2, 3);
  oCtx.fillStyle = shirt;
  oCtx.fillRect(x - 2, y + 2, 4, 6);
  if (isEngineer) { oCtx.fillStyle = '#0f172a'; oCtx.fillRect(x - 2, y + 4, 4, 2); }
  if (isContent) { oCtx.fillStyle = '#f8d37c'; oCtx.fillRect(x - 1, y + 2, 2, 6); }
  if (isLeader) { oCtx.fillStyle = '#f4e7c2'; oCtx.fillRect(x - 3, y + 1, 6, 1); }
  if (isSupport) { oCtx.fillStyle = '#e5f3ea'; oCtx.fillRect(x - 3, y + 3, 6, 2); }

  // Neck
  oCtx.fillStyle = skin;
  oCtx.fillRect(x - 1, y - 2, 2, 3);

  // Head
  oCtx.beginPath();
  oCtx.arc(x, y - 8 + headBob, headR, 0, Math.PI * 2);
  oCtx.fill();

  // Hair cap
  oCtx.fillStyle = hair;
  oCtx.beginPath();
  oCtx.arc(x, y - 10 + headBob, headR, Math.PI, Math.PI * 2);
  oCtx.fill();
  if (seed % 3 === 1) oCtx.fillRect(x - headR, y - 10 + headBob, 2, 5);
  if (seed % 3 === 2) oCtx.fillRect(x + headR - 2, y - 10 + headBob, 2, 5);

  // Face
  if (isSleeping) {
    oCtx.fillStyle = '#666';
    oCtx.fillRect(x - 3, y - 9, 3, 1);
    oCtx.fillRect(x + 1, y - 9, 3, 1);
    oCtx.font = '8px monospace';
    oCtx.fillStyle = '#999';
    oCtx.textAlign = 'left';
    const zzOff = Math.sin(time / 800) * 2;
    oCtx.fillText('z', x + 7, y - 12 + zzOff);
    oCtx.fillText('Z', x + 10, y - 18 + zzOff);
  } else {
    oCtx.fillStyle = '#333';
    oCtx.fillRect(x - 3, y - 10 + headBob, 2, 2);
    oCtx.fillRect(x + 2, y - 10 + headBob, 2, 2);
    oCtx.fillStyle = isWorking ? '#8b3c2b' : '#6b4b3a';
    oCtx.fillRect(x - 2, y - (isIdle ? 5 : 4) + headBob, 4, 1);
  }

  // Accessories / identity cues
  if (accessory === 0) { oCtx.fillStyle = '#1f2937'; oCtx.fillRect(x - 6, y - 9 + headBob, 1, 2); oCtx.fillRect(x + 5, y - 9 + headBob, 1, 2); oCtx.fillRect(x - 5, y - 8 + headBob, 10, 1); }
  if (accessory === 1) { oCtx.fillStyle = '#ef4444'; oCtx.fillRect(x - 1, y + 1, 2, 7); }
  if (accessory === 2) { oCtx.strokeStyle = '#e5e7eb'; oCtx.lineWidth = 1; oCtx.beginPath(); oCtx.arc(x + 6, y - 12, 2.5, 0, Math.PI * 2); oCtx.stroke(); }
  if (accessory === 3) { oCtx.fillStyle = '#f59e0b'; oCtx.fillRect(x - 5, y - 16 + headBob, 10, 2); }
  if (accessory === 4) { oCtx.fillStyle = '#60a5fa'; oCtx.fillRect(x - 2, y + 3, 4, 2); }
  if (accessory === 5) { oCtx.fillStyle = '#fca5a5'; oCtx.fillRect(x - 4, y + 2, 8, 1); }
  if (isEngineer) {
    oCtx.strokeStyle = '#38bdf8';
    oCtx.lineWidth = 1;
    oCtx.beginPath();
    oCtx.arc(x - 7, y - 10 + headBob, 2.5, 0, Math.PI * 2);
    oCtx.arc(x + 7, y - 10 + headBob, 2.5, 0, Math.PI * 2);
    oCtx.stroke();
    oCtx.beginPath();
    oCtx.moveTo(x - 5, y - 10 + headBob);
    oCtx.lineTo(x + 5, y - 10 + headBob);
    oCtx.stroke();
  }
  if (isContent) {
    oCtx.fillStyle = '#86efac';
    oCtx.beginPath();
    oCtx.arc(x + 7, y - 14 + headBob, 2, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.fillStyle = '#7a5a3a';
    oCtx.fillRect(x + 6, y - 12 + headBob, 2, 3);
  }
  if (isLeader) {
    oCtx.fillStyle = '#d4af37';
    oCtx.fillRect(x - 5, y - 16 + headBob, 10, 2);
    oCtx.fillRect(x - 3, y - 18 + headBob, 6, 2);
  }
  if (isSupport) {
    oCtx.fillStyle = '#fde68a';
    oCtx.fillRect(x + 5, y - 3, 4, 5);
    oCtx.fillStyle = '#8b5a2b';
    oCtx.fillRect(x + 6, y - 1, 2, 1);
  }

  // Warm halo in night mode helps the office feel alive after dark
  if (nightMode && isWorking) {
    oCtx.save();
    oCtx.globalAlpha = 0.12;
    oCtx.fillStyle = '#ffcb7d';
    oCtx.beginPath();
    oCtx.ellipse(x, y - 1, 14, 18, 0, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.restore();
  }

  // Arms / pose
  oCtx.fillStyle = color;
  if (isWorking) {
    const armL = Math.sin(time / 200) * 2;
    const armR = Math.sin(time / 200 + Math.PI) * 2;
    oCtx.fillRect(x - 8, y + stance + poseTilt + armL, 3, 5);
    oCtx.fillRect(x + 5, y + stance - poseTilt + armR, 3, 5);
    // slight lean toward the desk for a more intentional working pose
    oCtx.fillStyle = 'rgba(20,12,10,0.12)';
    oCtx.fillRect(x - torsoW / 2, y + 10, torsoW, 1);
    oCtx.fillStyle = color;
    const sparkPhase = (time / 120) | 0;
    if (sparkPhase % 3 === 0) { oCtx.fillStyle = '#ffa300'; oCtx.fillRect(x - 6 + (sparkPhase % 5), y + 5, 1, 1); }
    if ((sparkPhase + 1) % 4 === 0) { oCtx.fillStyle = '#ffec27'; oCtx.fillRect(x + 6 - (sparkPhase % 4), y + 4, 1, 1); }
    // typing dots / active thought marker
    oCtx.fillStyle = '#93c5fd';
    for (let i = 0; i < 3; i++) {
      const lift = ((time / 180) + i * 0.9 + seed) % 3;
      const alpha = Math.max(0.15, 1 - lift / 3);
      oCtx.save();
      oCtx.globalAlpha = alpha * 0.8;
      oCtx.beginPath();
      oCtx.arc(x + 9 + i * 4, y - 18 - lift * 5, 1.5 + i * 0.3, 0, Math.PI * 2);
      oCtx.fill();
      oCtx.restore();
    }
  } else if (isIdle) {
    // asymmetric casual pose — with occasional stretch
    if (isStretching) {
      // Arms go up in a stretch
      const armUp = stretchT * 12;
      oCtx.fillRect(x - 9, y - 2 - armUp, 3, 5 + armUp * 0.3);
      oCtx.fillRect(x + 6, y - 2 - armUp, 3, 5 + armUp * 0.3);
      // Hands at top
      oCtx.fillStyle = skin;
      oCtx.fillRect(x - 9, y - 3 - armUp, 3, 2);
      oCtx.fillRect(x + 6, y - 3 - armUp, 3, 2);
      oCtx.fillStyle = color;
    } else {
      oCtx.fillRect(x - 8, y + 3 + poseTilt, 3, 5);
      oCtx.fillRect(x + 5, y + 0 - poseTilt, 3, 5);
    }
    oCtx.fillStyle = '#f5d489';
    oCtx.beginPath();
    oCtx.arc(x + 8, y - 18 + Math.sin(time / 400 + seed) * 2, 2.5, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.beginPath();
    oCtx.arc(x + 12, y - 23 + Math.sin(time / 400 + seed + 0.8) * 2, 1.5, 0, Math.PI * 2);
    oCtx.fill();
    if (isSupport) {
      oCtx.fillStyle = '#fcd34d';
      oCtx.beginPath();
      oCtx.arc(x - 10, y - 10 + Math.sin(time / 500 + seed) * 1.4, 2.2, 0, Math.PI * 2);
      oCtx.fill();
    }
  } else {
    oCtx.fillRect(x - 8, y + 3, 3, 4);
    oCtx.fillRect(x + 5, y + 3, 3, 4);
  }

  // tiny status badge above head for clearer readability on desktop
  const badgeColor = isWorking ? '#22c55e' : isIdle ? '#f59e0b' : '#94a3b8';
  oCtx.fillStyle = 'rgba(31,24,20,0.88)';
  oCtx.beginPath();
  oCtx.roundRect(x - 7, y - 24, 14, 7, 3);
  oCtx.fill();
  oCtx.fillStyle = badgeColor;
  oCtx.beginPath();
  oCtx.arc(x - 3, y - 20.5, 1.7, 0, Math.PI * 2);
  oCtx.fill();
  oCtx.fillRect(x, y - 22, 4, 3);
}

// ── NAME LABEL ──
function drawNameLabel(x, y, agent) {
  const isMobileOffice = window.innerWidth <= 480;
  const isRightRoom = x > (_originX + ISO.tileW * 4.5);
  const rawName = agent.name || 'Unknown';
  const maxLen = isMobileOffice ? 12 : 18;
  const name = rawName.length > maxLen ? rawName.slice(0, maxLen - 1) + '…' : rawName;
  oCtx.font = isMobileOffice ? '600 11px -apple-system, system-ui, sans-serif' : `600 ${isRightRoom ? 9 : 10}px -apple-system, system-ui, sans-serif`;
  oCtx.textAlign = 'center';
  const tw = oCtx.measureText(name).width;
  const padX = isMobileOffice ? 6 : (isRightRoom ? 6 : 7);
  const padY = isMobileOffice ? 3 : 3;
  const lw = tw + padX * 2 + (isMobileOffice ? 7 : 8);
  const lh = isMobileOffice ? 16 : (isRightRoom ? 15 : 16);

  let lx = x - tw / 2 - padX;
  // Clamp to visible world-space bounds (accounting for camera pan + zoom)
  const _dprN = window.devicePixelRatio || 1;
  const _cwN = oCanvas.width / _dprN;
  const worldLeftN = (_cwN / 2 - _cwN / 2 / camZoom) - camPanX;
  const worldRightN = (_cwN / 2 + _cwN / 2 / camZoom) - camPanX;
  lx = Math.max(worldLeftN + 4, Math.min(lx, worldRightN - lw - 12));
  const ly = y - padY - (isRightRoom ? 3 : 0);

  // Badge background
  oCtx.fillStyle = isMobileOffice ? 'rgba(43,30,18,0.85)' : 'rgba(43,30,18,0.82)';
  oCtx.beginPath();
  oCtx.roundRect(lx, ly, lw, lh, 5);
  oCtx.fill();

  // Status dot
  const dotR = isMobileOffice ? 2 : 2.5;
  const dotX = lx + (isMobileOffice ? 6.5 : 8);
  const dotY = ly + lh / 2;
  oCtx.fillStyle = agent.status === 'working' ? PAL.statusWorking
    : agent.status === 'idle' ? PAL.statusIdle
    : PAL.statusSleeping;
  oCtx.beginPath();
  oCtx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  oCtx.fill();
  if (agent.status === 'working') {
    oCtx.globalAlpha = isMobileOffice ? 0.22 : 0.3;
    oCtx.beginPath();
    oCtx.arc(dotX, dotY, dotR + (isMobileOffice ? 1.5 : 2), 0, Math.PI * 2);
    oCtx.fill();
    oCtx.globalAlpha = 1;
  }

  // Name text — draw relative to (possibly clamped) badge center
  const textX = lx + lw / 2 + (isMobileOffice ? 1.5 : 2);
  oCtx.fillStyle = '#fffaf2';
  oCtx.fillText(name, textX, y + (isMobileOffice ? 5.8 : (isRightRoom ? 4.8 : 7.5)));
}

// ── SHARED FURNITURE ──
function drawBookshelf(gx, gy, closed = false) {
  const p = iso(gx, gy);
  const shelfKey = closed
    ? pickOfficeAsset((gx + gy) % 2 === 0 ? ['bookshelfClosedNE','bookshelfClosed'] : ['bookshelfClosed','bookshelfClosedNE'])
    : ((gx + gy) % 2 === 0 ? 'bookshelf' : 'bookshelfLow');
  if (officeAssetReady(shelfKey)) {
    drawOfficeAsset(shelfKey, p.x, p.y + 8, shelfKey.includes('Low') ? 0.92 : 1.0);
    return;
  }
  drawIsoBox(gx, gy, 30, PAL.shelfWood, PAL.shelfSide, PAL.shelfWood);
  oCtx.fillStyle = '#5f442a';
  oCtx.fillRect(p.x - 14, p.y - 22, 28, 2);
  oCtx.fillRect(p.x - 14, p.y - 13, 28, 2);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      const bookH = 5 + ((gx + gy + row + i) % 4);
      oCtx.fillStyle = PAL.bookColors[(row * 5 + i + gx * 3) % PAL.bookColors.length];
      const bx = p.x - 12 + i * 5;
      const by = p.y - 27 + row * 9 + (8 - bookH);
      oCtx.fillRect(bx, by, 3, bookH);
      oCtx.fillStyle = 'rgba(255,255,255,0.25)';
      oCtx.fillRect(bx + 1, by + 1, 1, Math.max(1, bookH - 2));
    }
    if (row === 1) {
      oCtx.fillStyle = '#7bc96f';
      oCtx.beginPath();
      oCtx.arc(p.x + 10, p.y - 18, 3, 0, Math.PI * 2);
      oCtx.fill();
      oCtx.fillStyle = '#8b5e3c';
      oCtx.fillRect(p.x + 8, p.y - 15, 4, 2);
    }
  }
}

function drawPlant(gx, gy) {
  const p = iso(gx, gy);
  const big = (gx + gy) % 2 === 0;
  if (officeAssetReady('plant')) {
    drawOfficeAsset('plant', p.x, p.y + 6, big ? 1.15 : 0.95);
    return;
  }
  oCtx.fillStyle = PAL.plantPot;
  oCtx.fillRect(p.x - (big ? 6 : 5), p.y - 4, big ? 12 : 10, 8);
  const time = _frameTime / 1000;
  const leaves = big ? 8 : 5;
  for (let i = 0; i < leaves; i++) {
    const angle = (i / leaves) * Math.PI * 2 + Math.sin(time * 0.5 + i) * 0.1;
    const radius = big ? 10 : 8;
    const leafR = big ? (i % 3 === 0 ? 5 : 4) : 4;
    oCtx.beginPath();
    oCtx.ellipse(p.x + Math.cos(angle) * radius, p.y - (big ? 14 : 12) + Math.sin(angle) * 5, leafR + 1, leafR, angle, 0, Math.PI * 2);
    oCtx.fillStyle = i % 2 === 0 ? PAL.leafDark : PAL.leafLight;
    oCtx.fill();
  }
}

function drawCoffeeMachine(gx, gy) {
  const p = iso(gx, gy);
  if (officeAssetReady('coffeeMachine')) {
    drawOfficeAsset('coffeeMachine', p.x, p.y + 4, 1.0);
    oCtx.font = '7px system-ui';
    oCtx.fillStyle = '#7b6852';
    oCtx.textAlign = 'center';
    oCtx.fillText('☕ COFFEE', p.x, p.y + ISO.tileH / 2 + 10);
    return;
  }
  drawIsoBox(gx, gy, 24, '#555', PAL.coffeeMachine, '#4a4a4a');
  // Light
  oCtx.fillStyle = PAL.coffeeMachineLight;
  oCtx.beginPath();
  oCtx.arc(p.x, p.y - 20, 2, 0, Math.PI * 2);
  oCtx.fill();
  // Label
  oCtx.font = '7px system-ui';
  oCtx.fillStyle = '#888';
  oCtx.textAlign = 'center';
  oCtx.fillText('☕ COFFEE', p.x, p.y + ISO.tileH / 2 + 10);
}

function drawLamp(gx, gy) {
  const p = iso(gx, gy);
  const lampKey = pickOfficeAsset((gx + gy) % 2 === 0 ? ['lampFloorNE','lampFloor'] : ['lampFloor','lampFloorNE']);
  if (officeAssetReady(lampKey)) {
    drawOfficeAsset(lampKey, p.x, p.y + 8, 0.92, 0.96);
    const flicker = 0.1 + Math.sin(_frameTime / 2000 + gx) * 0.04;
    oCtx.beginPath();
    oCtx.arc(p.x, p.y - 28, 18, 0, Math.PI * 2);
    oCtx.fillStyle = `rgba(255,220,120,${flicker})`;
    oCtx.fill();
    return;
  }
  // Pole
  oCtx.strokeStyle = PAL.lampPole;
  oCtx.lineWidth = 2;
  oCtx.beginPath();
  oCtx.moveTo(p.x, p.y);
  oCtx.lineTo(p.x, p.y - 36);
  oCtx.stroke();
  // Shade
  oCtx.fillStyle = PAL.lampShade;
  oCtx.beginPath();
  oCtx.moveTo(p.x - 8, p.y - 36);
  oCtx.lineTo(p.x + 8, p.y - 36);
  oCtx.lineTo(p.x + 5, p.y - 30);
  oCtx.lineTo(p.x - 5, p.y - 30);
  oCtx.closePath();
  oCtx.fill();
  // Glow
  const flicker = 0.12 + Math.sin(_frameTime / 2000 + gx) * 0.04;
  oCtx.beginPath();
  oCtx.arc(p.x, p.y - 33, 16, 0, Math.PI * 2);
  oCtx.fillStyle = `rgba(255,220,120,${flicker})`;
  oCtx.fill();
}

function drawCat(gx, gy) {
  const p = iso(gx, gy);
  const time = _frameTime / 1000;
  // Body
  oCtx.fillStyle = PAL.catBody;
  oCtx.beginPath();
  oCtx.ellipse(p.x, p.y - 3, 8, 4, 0, 0, Math.PI * 2);
  oCtx.fill();
  // Head
  oCtx.beginPath();
  oCtx.arc(p.x + 6, p.y - 5, 4, 0, Math.PI * 2);
  oCtx.fill();
  // Ears
  oCtx.fillStyle = PAL.catEar;
  oCtx.beginPath();
  oCtx.moveTo(p.x + 4, p.y - 9);
  oCtx.lineTo(p.x + 6, p.y - 13);
  oCtx.lineTo(p.x + 8, p.y - 9);
  oCtx.fill();
  oCtx.beginPath();
  oCtx.moveTo(p.x + 7, p.y - 9);
  oCtx.lineTo(p.x + 9, p.y - 13);
  oCtx.lineTo(p.x + 11, p.y - 9);
  oCtx.fill();
  // Tail (animated)
  const tailWag = Math.sin(time * 2) * 4;
  oCtx.strokeStyle = PAL.catBody;
  oCtx.lineWidth = 2;
  oCtx.beginPath();
  oCtx.moveTo(p.x - 7, p.y - 3);
  oCtx.quadraticCurveTo(p.x - 12, p.y - 8 + tailWag, p.x - 10, p.y - 14);
  oCtx.stroke();
  // Zzz for sleeping cat
  oCtx.font = '7px monospace';
  oCtx.fillStyle = '#aaa';
  oCtx.textAlign = 'left';
  const zzOff = Math.sin(time) * 2;
  oCtx.fillText('z', p.x + 10, p.y - 10 + zzOff);
  oCtx.fillText('Z', p.x + 13, p.y - 15 + zzOff);
}

function drawRug(gx, gy) {
  const p = iso(gx, gy);
  oCtx.save();
  oCtx.globalAlpha = 0.15;
  oCtx.beginPath();
  oCtx.ellipse(p.x, p.y, 100, 50, 0, 0, Math.PI * 2);
  const grad = oCtx.createRadialGradient(p.x, p.y, 10, p.x, p.y, 80);
  grad.addColorStop(0, PAL.rugColors[0]);
  grad.addColorStop(0.5, PAL.rugColors[1]);
  grad.addColorStop(0.8, PAL.rugColors[2]);
  grad.addColorStop(1, 'transparent');
  oCtx.fillStyle = grad;
  oCtx.fill();
  oCtx.restore();
}

function drawClock(gx, gy) {
  const p = iso(gx, gy);
  const r = 12;
  const cy = p.y - ISO.tileH / 2 - 30;
  // Frame
  oCtx.beginPath();
  oCtx.arc(p.x, cy, r + 2, 0, Math.PI * 2);
  oCtx.fillStyle = '#3a2a1a';
  oCtx.fill();
  // Face
  oCtx.beginPath();
  oCtx.arc(p.x, cy, r, 0, Math.PI * 2);
  oCtx.fillStyle = '#f5f0e0';
  oCtx.fill();
  oCtx.strokeStyle = '#ccc';
  oCtx.lineWidth = 1;
  oCtx.stroke();
  // Hour marks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    oCtx.fillStyle = '#666';
    oCtx.fillRect(p.x + Math.cos(a) * (r - 3) - 0.5, cy + Math.sin(a) * (r - 3) - 0.5, 1, 1);
  }
  // Hands
  const d = new Date(_frameTime);
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();
  // Hour
  const ha = (h + m / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  oCtx.strokeStyle = '#333';
  oCtx.lineWidth = 1.5;
  oCtx.beginPath();
  oCtx.moveTo(p.x, cy);
  oCtx.lineTo(p.x + Math.cos(ha) * 6, cy + Math.sin(ha) * 6);
  oCtx.stroke();
  // Minute
  const ma = m / 60 * Math.PI * 2 - Math.PI / 2;
  oCtx.lineWidth = 1;
  oCtx.beginPath();
  oCtx.moveTo(p.x, cy);
  oCtx.lineTo(p.x + Math.cos(ma) * 9, cy + Math.sin(ma) * 9);
  oCtx.stroke();
  // Second
  const sa = s / 60 * Math.PI * 2 - Math.PI / 2;
  oCtx.strokeStyle = '#e74c3c';
  oCtx.lineWidth = 0.5;
  oCtx.beginPath();
  oCtx.moveTo(p.x, cy);
  oCtx.lineTo(p.x + Math.cos(sa) * 10, cy + Math.sin(sa) * 10);
  oCtx.stroke();
}

function drawPoster(gx, gy, hue) {
  const p = iso(gx, gy);
  const py = p.y - ISO.tileH / 2 - 28;
  // Frame
  oCtx.fillStyle = PAL.posterFrame;
  oCtx.fillRect(p.x - 10, py, 20, 16);
  // Art
  const grad = oCtx.createLinearGradient(p.x - 8, py + 1, p.x + 8, py + 14);
  grad.addColorStop(0, `hsl(${hue},50%,40%)`);
  grad.addColorStop(1, `hsl(${hue + 30},60%,50%)`);
  oCtx.fillStyle = grad;
  oCtx.fillRect(p.x - 8, py + 2, 16, 12);
  if (hue > 250) {
    oCtx.fillStyle = 'rgba(255,230,170,0.85)';
    oCtx.font = 'bold 7px system-ui';
    oCtx.textAlign = 'center';
    oCtx.fillText('LOTR', p.x, py + 10);
  }
}

function drawPhotoFrame(gx, gy) {
  const p = iso(gx, gy);
  const py = p.y - ISO.tileH / 2 - 20;
  oCtx.fillStyle = '#6d4c38';
  oCtx.fillRect(p.x - 10, py, 20, 12);
  oCtx.fillStyle = '#f4e7cf';
  oCtx.fillRect(p.x - 8, py + 2, 16, 8);
  oCtx.fillStyle = '#7aa2d6';
  oCtx.fillRect(p.x - 7, py + 3, 6, 6);
  oCtx.fillStyle = '#d99b7a';
  oCtx.fillRect(p.x + 1, py + 3, 5, 6);
}

function drawCoffeeCorner(gx, gy) {
  const p = iso(gx, gy);
  drawCoffeeTable(gx, gy);
  if (officeAssetReady('coffeeMachine')) drawOfficeAsset('coffeeMachine', p.x, p.y - 4, 0.75, 0.98);
  if (officeAssetReady('plantSmall2')) drawOfficeAsset('plantSmall2', p.x + 18, p.y + 4, 0.52, 0.95);
  oCtx.fillStyle = '#fff6ea';
  oCtx.font = 'bold 7px system-ui';
  oCtx.textAlign = 'center';
  oCtx.fillText('COFFEE', p.x, p.y + 18);
}

function drawServerRack(gx, gy) {
  const p = iso(gx, gy);
  oCtx.fillStyle = '#1f2430';
  oCtx.fillRect(p.x - 10, p.y - 28, 20, 30);
  oCtx.strokeStyle = '#394150';
  oCtx.lineWidth = 1;
  oCtx.strokeRect(p.x - 10, p.y - 28, 20, 30);
  for (let i = 0; i < 4; i++) {
    const yy = p.y - 24 + i * 7;
    oCtx.fillStyle = '#2b3242';
    oCtx.fillRect(p.x - 8, yy, 16, 4);
    oCtx.fillStyle = i % 2 === 0 ? '#60a5fa' : '#34d399';
    oCtx.fillRect(p.x + 4, yy + 1, 2, 2);
  }
}

function drawSharedFurniture(time) {
  const isMobile = window.innerWidth <= 768;
  for (const f of SHARED_FURNITURE) {
    if (isMobile && !['window','doorway','coffeeMachine','waterCooler','whiteboard','serverRack','bookshelfClosed','bookshelf','lamp'].includes(f.type)) continue;
    switch (f.type) {
      case 'bookshelf': drawBookshelf(f.gx, f.gy); break;
      case 'bookshelfClosed': drawBookshelf(f.gx, f.gy, true); break;
      case 'plant': drawPlant(f.gx, f.gy); break;
      case 'coffeeMachine': drawCoffeeMachine(f.gx, f.gy); break;
      case 'lamp': drawLamp(f.gx, f.gy); break;
      case 'cat': drawCat(f.gx, f.gy); break;
      case 'rug': drawRug(f.gx, f.gy); break;
      case 'clock': drawClock(f.gx, f.gy); break;
      case 'poster': drawPoster(f.gx, f.gy, f.hue || 0); break;
      case 'photoFrame': drawPhotoFrame(f.gx, f.gy); break;
      case 'coffeeCorner': drawCoffeeCorner(f.gx, f.gy); break;
      case 'window': drawWindow(f.gx, f.gy); break;
      case 'doorway': drawDoorway(f.gx, f.gy); break;
      case 'waterCooler': drawWaterCooler(f.gx, f.gy); break;
      case 'serverRack': drawServerRack(f.gx, f.gy); break;
      case 'whiteboard': drawWhiteboard(f.gx, f.gy); break;
      case 'armchair': drawArmchair(f.gx, f.gy); break;
      case 'sideTable': drawSideTable(f.gx, f.gy); break;
      case 'coffeeTable': drawCoffeeTable(f.gx, f.gy); break;
      case 'benchProp': drawBenchProp(f.gx, f.gy); break;
      case 'boxProp': drawBoxProp(f.gx, f.gy); break;
      case 'speakerProp': drawSpeakerProp(f.gx, f.gy); break;
      case 'lampProp': drawLampProp(f.gx, f.gy); break;
    }
  }
}

function drawWindow(gx, gy) {
  const p = iso(gx, gy);
  const wy = p.y - ISO.tileH / 2 - 32;
  const nightMode = document.documentElement.getAttribute('data-theme') === 'dark' || new Date(_frameTime).getHours() < 7 || new Date(_frameTime).getHours() >= 19;
  // Frame
  oCtx.fillStyle = '#5a4a3a';
  oCtx.fillRect(p.x - 14, wy, 28, 22);
  // Glass — warm night / cool day
  const grad = oCtx.createLinearGradient(p.x, wy + 2, p.x, wy + 18);
  if (nightMode) {
    grad.addColorStop(0, '#2a3650');
    grad.addColorStop(0.38, '#3e5378');
    grad.addColorStop(0.72, '#845f47');
    grad.addColorStop(1, '#f4b36d');
  } else {
    grad.addColorStop(0, '#87ceeb');
    grad.addColorStop(0.6, '#b8e6f0');
    grad.addColorStop(1, '#d4eef4');
  }
  oCtx.fillStyle = grad;
  oCtx.fillRect(p.x - 12, wy + 2, 24, 18);
  // Cross bar
  oCtx.fillStyle = '#5a4a3a';
  oCtx.fillRect(p.x - 0.5, wy + 2, 1, 18);
  oCtx.fillRect(p.x - 12, wy + 10, 24, 1);
  // Light reflection / lived-in window warmth
  oCtx.globalAlpha = nightMode ? 0.18 : 0.2;
  oCtx.fillStyle = '#fff';
  oCtx.fillRect(p.x - 9, wy + 4, 6, 3);
  if (nightMode) {
    oCtx.fillStyle = 'rgba(255,212,144,0.42)';
    oCtx.fillRect(p.x - 11, wy + 12, 22, 6);
  }
  oCtx.globalAlpha = 1;
  // Light pool on floor
  oCtx.save();
  oCtx.globalAlpha = nightMode ? 0.16 : 0.06;
  const floorP = iso(gx, gy + 2);
  oCtx.beginPath();
  oCtx.ellipse(floorP.x, floorP.y, 30, 15, 0, 0, Math.PI * 2);
  oCtx.fillStyle = nightMode ? '#ffcc7a' : '#ffe8a0';
  oCtx.fill();
  oCtx.restore();
}

function drawDoorway(gx, gy) {
  const p = iso(gx, gy);
  const doorKey = pickOfficeAsset((gx + gy) % 2 === 0 ? ['doorwayNE','doorway'] : ['doorway','doorwayNE']);
  if (officeAssetReady(doorKey)) {
    drawOfficeAsset(doorKey, p.x, p.y + 10, 0.92, 0.92);
    return;
  }
  oCtx.fillStyle = 'rgba(90,74,58,0.85)';
  oCtx.fillRect(p.x - 16, p.y - 26, 32, 24);
  oCtx.clearRect(p.x - 8, p.y - 24, 16, 20);
}

function drawWaterCooler(gx, gy) {
  const p = iso(gx, gy);
  const by = p.y - ISO.tileH / 2;
  if (officeAssetReady('waterCooler')) {
    drawOfficeAsset('waterCooler', p.x, p.y + 10, 0.72);
    return;
  }
  // Base/stand
  oCtx.fillStyle = '#888';
  oCtx.fillRect(p.x - 5, by - 16, 10, 20);
  // Bottle
  oCtx.fillStyle = 'rgba(120,200,255,0.6)';
  oCtx.fillRect(p.x - 6, by - 30, 12, 16);
  // Cap
  oCtx.fillStyle = '#5a9abf';
  oCtx.fillRect(p.x - 4, by - 32, 8, 3);
  // Water level shimmer
  const t = performance.now() / 2000;
  oCtx.globalAlpha = 0.3 + Math.sin(t) * 0.1;
  oCtx.fillStyle = '#4db8e8';
  oCtx.fillRect(p.x - 4, by - 24, 8, 8);
  oCtx.globalAlpha = 1;
  // Spigot
  oCtx.fillStyle = '#666';
  oCtx.fillRect(p.x + 5, by - 14, 3, 3);
}

function drawWhiteboard(gx, gy) {
  const p = iso(gx, gy);
  const wy = p.y - ISO.tileH / 2 - 36;
  // Board
  oCtx.fillStyle = '#f0f0f0';
  oCtx.fillRect(p.x - 22, wy, 44, 30);
  oCtx.strokeStyle = '#999';
  oCtx.lineWidth = 1.5;
  oCtx.strokeRect(p.x - 22, wy, 44, 30);
  // Scribble lines
  oCtx.strokeStyle = '#3b82f6';
  oCtx.lineWidth = 1;
  oCtx.beginPath();
  oCtx.moveTo(p.x - 16, wy + 8); oCtx.lineTo(p.x + 10, wy + 8);
  oCtx.moveTo(p.x - 16, wy + 13); oCtx.lineTo(p.x + 6, wy + 13);
  oCtx.stroke();
  oCtx.strokeStyle = '#ef4444';
  oCtx.beginPath();
  oCtx.moveTo(p.x - 16, wy + 18); oCtx.lineTo(p.x + 14, wy + 18);
  oCtx.stroke();
  // Checkmark
  oCtx.strokeStyle = '#22c55e';
  oCtx.lineWidth = 1.5;
  oCtx.beginPath();
  oCtx.moveTo(p.x + 12, wy + 6); oCtx.lineTo(p.x + 14, wy + 9); oCtx.lineTo(p.x + 18, wy + 4);
  oCtx.stroke();
  // Tray
  oCtx.fillStyle = '#ccc';
  oCtx.fillRect(p.x - 18, wy + 30, 36, 3);
  // Marker dots
  oCtx.fillStyle = '#3b82f6'; oCtx.fillRect(p.x - 12, wy + 31, 4, 1.5);
  oCtx.fillStyle = '#ef4444'; oCtx.fillRect(p.x - 6, wy + 31, 4, 1.5);
  oCtx.fillStyle = '#22c55e'; oCtx.fillRect(p.x, wy + 31, 4, 1.5);
}

function drawArmchair(gx, gy) {
  const p = iso(gx, gy);
  const by = p.y - ISO.tileH / 2;
  const chairKey = (gx + gy) % 2 === 0 ? 'armchair' : 'armchairAlt';
  if (officeAssetReady(chairKey)) {
    drawOfficeAsset(chairKey, p.x, p.y + 10, chairKey === 'armchairAlt' ? 0.88 : 0.92);
    return;
  }
  // Seat cushion
  oCtx.fillStyle = '#6b4c3b';
  oCtx.fillRect(p.x - 8, by - 6, 16, 10);
  // Back
  oCtx.fillStyle = '#5a3d2e';
  oCtx.fillRect(p.x - 9, by - 16, 18, 12);
  // Arms
  oCtx.fillStyle = '#7a5a45';
  oCtx.fillRect(p.x - 11, by - 14, 3, 16);
  oCtx.fillRect(p.x + 8, by - 14, 3, 16);
  // Cushion highlight
  oCtx.globalAlpha = 0.15;
  oCtx.fillStyle = '#fff';
  oCtx.fillRect(p.x - 5, by - 4, 10, 4);
  oCtx.globalAlpha = 1;
}

function drawSideTable(gx, gy) {
  const p = iso(gx, gy);
  if (officeAssetReady('sideTable')) {
    drawOfficeAsset('sideTable', p.x, p.y + 8, 0.82);
    if (officeAssetReady('books') && (gx + gy) % 2 === 0) drawOfficeAsset('books', p.x + 2, p.y - 1, 0.55, 0.95);
    return;
  }
  drawIsoBox(gx, gy, 10, '#8a6038', '#6d4b2f', '#7b5434');
}

function drawCoffeeTable(gx, gy) {
  const p = iso(gx, gy);
  if (officeAssetReady('coffeeTable')) {
    drawOfficeAsset('coffeeTable', p.x, p.y + 8, 0.9);
    if (officeAssetReady('books')) drawOfficeAsset('books', p.x - 3, p.y, 0.52, 0.92);
    return;
  }
  drawIsoBox(gx, gy, 8, '#7d5836', '#65462a', '#6e4c2e');
}

function drawBenchProp(gx, gy) {
  const p = iso(gx, gy);
  if (officeAssetReady('bench')) {
    drawOfficeAsset('bench', p.x, p.y + 8, 0.92);
    return;
  }
  drawIsoBox(gx, gy, 10, '#846044', '#6e4f37', '#795640');
}

function drawBoxProp(gx, gy) {
  const p = iso(gx, gy);
  if (officeAssetReady('box')) {
    drawOfficeAsset('box', p.x, p.y + 6, 0.72);
    return;
  }
  drawIsoBox(gx, gy, 8, '#b98d58', '#987146', '#a67d50');
}

function drawSpeakerProp(gx, gy) {
  const p = iso(gx, gy);
  if (officeAssetReady('speaker')) {
    drawOfficeAsset('speaker', p.x, p.y + 6, 0.64);
    return;
  }
  oCtx.fillStyle = '#2f2f35';
  oCtx.fillRect(p.x - 5, p.y - 12, 10, 16);
}

function drawLampProp(gx, gy) {
  const p = iso(gx, gy);
  if (officeAssetReady('lampFloor')) {
    drawOfficeAsset('lampFloor', p.x, p.y + 8, 0.78, 0.96);
    return;
  }
  drawLamp(gx, gy);
}

// ── SPEECH BUBBLES ──
let _speechBubbleAgent = null;
let _speechBubbleTime = 0;
const SPEECH_BUBBLE_DURATION = 5000;
const SPEECH_BUBBLE_INTERVAL = 6000;
let _lastBubbleSwitch = 0;

// sanitizeAgentText defined in app.js (loaded first) — removed duplicate

function drawSpeechBubble(x, y, text) {
  if (!text) return;
  const clean = sanitizeAgentText(text);
  if (!clean) return;
  const maxLen = 30;
  const display = clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
  oCtx.font = '600 10px -apple-system, system-ui, sans-serif';
  oCtx.textAlign = 'left';
  const tw = oCtx.measureText(display).width;
  const padX = 7, padY = 4;
  const bw = tw + padX * 2;
  const bh = 18;
  const bx = x - bw / 2;
  const by = y - 38;

  // Clamp to visible world-space bounds (accounting for camera pan + zoom)
  const _dprB = window.devicePixelRatio || 1;
  const _cwB = oCanvas.width / _dprB;
  const worldLeft = (_cwB / 2 - _cwB / 2 / camZoom) - camPanX;
  const worldRight = (_cwB / 2 + _cwB / 2 / camZoom) - camPanX;
  const clampedBx = Math.max(worldLeft + 4, Math.min(bx, worldRight - bw - 4));

  // Bubble
  oCtx.fillStyle = 'rgba(255,255,255,0.95)';
  oCtx.beginPath();
  oCtx.roundRect(clampedBx, by, bw, bh, 6);
  oCtx.fill();
  oCtx.strokeStyle = 'rgba(0,0,0,0.1)';
  oCtx.lineWidth = 0.5;
  oCtx.stroke();

  // Tail
  oCtx.fillStyle = 'rgba(255,255,255,0.95)';
  oCtx.beginPath();
  oCtx.moveTo(x - 3, by + bh);
  oCtx.lineTo(x, by + bh + 5);
  oCtx.lineTo(x + 3, by + bh);
  oCtx.fill();

  // Text
  oCtx.fillStyle = '#333';
  oCtx.fillText(display, clampedBx + padX, by + 11);
}

// ── MAIN DRAW ──
let _frameTime = 0;
let _staticValid = false;
let _staticCanvas = null, _staticCtx = null;
let _staticCamZoom = 0, _staticCamPanX = 0, _staticCamPanY = 0;

// ── Color utils (hoisted for perf — avoid re-creating per frame) ──
const _hexCache = {};
function hexToRgb(hex) {
  if (_hexCache[hex]) return _hexCache[hex];
  const n = parseInt(hex.slice(1), 16);
  const r = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _hexCache[hex] = r;
  return r;
}
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}
const _lerpCache = {};
function lerpColor(c1, c2, t) {
  const key = c1 + c2 + (t * 1000 | 0);
  if (_lerpCache[key]) return _lerpCache[key];
  const a = hexToRgb(c1), b = hexToRgb(c2);
  const result = rgbToHex(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t);
  _lerpCache[key] = result;
  // Prevent cache from growing unbounded
  if (Object.keys(_lerpCache).length > 500) {
    const keys = Object.keys(_lerpCache);
    for (let i = 0; i < 250; i++) delete _lerpCache[keys[i]];
  }
  return result;
}

// ── Sky cache — redrawn only when hour changes ──
let _skyCanvas = null, _skyCtx = null;
let _skyLastHour = -1, _skyLastW = 0, _skyLastH = 0, _skyLastTime = 0, _skyLastTheme = '';

function invalidateStaticCache() {
  _staticValid = false;
  _syncThemePalette();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame((t) => {
      try { if (typeof drawOffice === 'function') drawOffice(t); } catch (_) {}
    });
  }
}

function drawOffice(rafNow) {
  if (!oCtx || !oCanvas.width) return;
  try { _drawOfficeInner(rafNow); } catch (e) { console.warn('drawOffice error:', e.message); }
}

function _drawOfficeInner(rafNow) {
  _syncThemePalette();
  const dpr = window.devicePixelRatio || 1;
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Reset hover targets each frame to prevent unbounded growth (memory leak fix)
  _hoverTargets.length = 0;

  const time = rafNow ? Math.round(performance.timeOrigin + rafNow) : Date.now();
  _frameTime = time;

  const cw = oCanvas.width / dpr;
  const ch = oCanvas.height / dpr;

  const now = new Date(_frameTime);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const hourF = hour + minute / 60; // fractional hour for smooth transitions
  const _themeDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const nightMode = _themeDark || hour < 7 || hour >= 19;

  // ── Sky rendering (cached — only redraws every 5 minutes or on resize) ──
  const skyKey = _themeDark ? -999 : (hour * 12 + (minute / 5 | 0)); // changes every 5 min or on theme change
  const _themeKey = _themeDark ? 'dark' : 'light';
  if (!_skyCanvas || _skyLastHour !== skyKey || _skyLastW !== oCanvas.width || _skyLastH !== oCanvas.height || _skyLastTheme !== _themeKey) {
    if (!_skyCanvas) { _skyCanvas = document.createElement('canvas'); _skyCtx = _skyCanvas.getContext('2d'); }
    _skyCanvas.width = oCanvas.width; _skyCanvas.height = oCanvas.height;
    _skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const _origCtx2 = oCtx;
    oCtx = _skyCtx;
  // Each phase has gradient stops; we blend between adjacent phases
  const _skyHourF = _themeDark ? 1 : hourF; // force deep night in dark theme
  const SKY_PHASES = [
    // 0-5: deep night
    { h: 0,  stops: [['#0a0812',0],['#17111f',0.22],['#1e1530',0.5],['#2a1f3a',0.74],['#3a2844',1]] },
    // 5-6: pre-dawn (deep blue to purple horizon)
    { h: 5,  stops: [['#0f0e1e',0],['#1a1832',0.2],['#2d2548',0.5],['#5a3858',0.74],['#7a4a52',1]] },
    // 6-7: dawn (warm horizon, pink/orange)
    { h: 6,  stops: [['#2a2848',0],['#4a3858',0.2],['#8a5a60',0.45],['#d4876a',0.74],['#e8a878',1]] },
    // 7-8: sunrise (golden, warm)
    { h: 7,  stops: [['#7aaed8',0],['#c4b8a0',0.3],['#e8c898',0.55],['#ddb888',0.8],['#d4aa80',1]] },
    // 8-11: morning (bright, clear)
    { h: 8,  stops: [['#b8d8f0',0],['#dbeaf8',0.2],['#f3e7d5',0.55],['#e0cdb0',0.8],['#d7bf9f',1]] },
    // 11-15: midday (bright blue-white sky)
    { h: 11, stops: [['#c4e2f8',0],['#e4eff8',0.25],['#f8f0e2',0.55],['#e8dac4',0.8],['#dac8a8',1]] },
    // 15-17: afternoon (warm golden)
    { h: 15, stops: [['#b8d4e8',0],['#dde0d8',0.25],['#f0e0c4',0.55],['#e0c8a0',0.8],['#d4b898',1]] },
    // 17-18.5: golden hour
    { h: 17, stops: [['#8ab0d8',0],['#d4b898',0.25],['#e8b878',0.5],['#d49858',0.78],['#c88848',1]] },
    // 18.5-19.5: dusk (dramatic orange/purple)
    { h: 18.5, stops: [['#3a3058',0],['#6a4868',0.22],['#a86858',0.48],['#c87848',0.74],['#b86848',1]] },
    // 19.5-21: twilight
    { h: 19.5, stops: [['#1a1428',0],['#2a2040',0.25],['#4a3558',0.5],['#6a4858',0.76],['#7a5050',1]] },
    // 21-24: night
    { h: 21, stops: [['#0a0812',0],['#17111f',0.22],['#1e1530',0.5],['#2a1f3a',0.74],['#3a2844',1]] },
  ];

  // hexToRgb/rgbToHex/lerpColor hoisted to module scope for perf

  // Find two adjacent phases and blend
  let phaseA = SKY_PHASES[SKY_PHASES.length - 1], phaseB = SKY_PHASES[0];
  let blendT = 0;
  for (let i = 0; i < SKY_PHASES.length - 1; i++) {
    if (_skyHourF >= SKY_PHASES[i].h && hourF < SKY_PHASES[i + 1].h) {
      phaseA = SKY_PHASES[i]; phaseB = SKY_PHASES[i + 1];
      blendT = (_skyHourF - phaseA.h) / (phaseB.h - phaseA.h);
      break;
    }
  }

  const bgGrad = oCtx.createLinearGradient(0, 0, 0, ch);
  for (let i = 0; i < phaseA.stops.length; i++) {
    const [cA, posA] = phaseA.stops[i];
    const [cB, posB] = phaseB.stops[Math.min(i, phaseB.stops.length - 1)];
    bgGrad.addColorStop(posA + (posB - posA) * blendT, lerpColor(cA, cB, blendT));
  }
  oCtx.fillStyle = bgGrad;
  oCtx.fillRect(0, 0, cw, ch);

  // Time-of-day glow — intensity varies by phase
  const glowIntensity = nightMode ? 0.24 : (_skyHourF >= 17 && _skyHourF < 19.5) ? 0.3 : 0.18;
  const horizonGlow = oCtx.createRadialGradient(cw * 0.5, ch * 0.22, 24, cw * 0.5, ch * 0.22, Math.max(cw, ch) * 0.58);
  if (nightMode) {
    horizonGlow.addColorStop(0, `rgba(255,206,138,${glowIntensity})`);
    horizonGlow.addColorStop(0.28, 'rgba(210,132,214,0.14)');
    horizonGlow.addColorStop(0.58, 'rgba(89,58,110,0.08)');
    horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
  } else if (_skyHourF >= 6 && _skyHourF < 8) {
    // Dawn/sunrise warm glow
    const dawnI = (_skyHourF - 6) / 2;
    horizonGlow.addColorStop(0, `rgba(255,220,160,${0.2 + dawnI * 0.15})`);
    horizonGlow.addColorStop(0.35, `rgba(255,180,100,${0.08 + dawnI * 0.06})`);
    horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
  } else if (_skyHourF >= 17 && _skyHourF < 19.5) {
    // Golden hour/dusk warm glow
    const duskI = (_skyHourF - 17) / 2.5;
    horizonGlow.addColorStop(0, `rgba(255,180,100,${0.22 + duskI * 0.1})`);
    horizonGlow.addColorStop(0.3, `rgba(240,140,80,${0.12 + duskI * 0.08})`);
    horizonGlow.addColorStop(0.6, `rgba(180,80,120,${duskI * 0.08})`);
    horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    horizonGlow.addColorStop(0, 'rgba(255,248,226,0.22)');
    horizonGlow.addColorStop(0.42, 'rgba(180,221,255,0.10)');
    horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
  }
  oCtx.fillStyle = horizonGlow;
  oCtx.fillRect(0, 0, cw, ch);

  // Soft vignette
  const vignetteAlpha = nightMode ? 0.34 : (_skyHourF >= 17 && _skyHourF < 19.5) ? 0.22 : 0.14;
  const vignette = oCtx.createRadialGradient(cw / 2, ch * 0.42, Math.min(cw, ch) * 0.18, cw / 2, ch * 0.46, Math.max(cw, ch) * 0.78);
  vignette.addColorStop(0, 'rgba(255,245,230,0)');
  vignette.addColorStop(1, nightMode ? `rgba(30,14,24,${vignetteAlpha})` : `rgba(120,84,44,${vignetteAlpha})`);
  oCtx.fillStyle = vignette;
  oCtx.fillRect(0, 0, cw, ch);

  // Night-specific effects
  if (nightMode) {
    const lampWash = oCtx.createRadialGradient(cw * 0.5, ch * 0.28, 20, cw * 0.5, ch * 0.28, Math.max(cw, ch) * 0.55);
    lampWash.addColorStop(0, 'rgba(255,216,150,0.28)');
    lampWash.addColorStop(0.34, 'rgba(255,190,110,0.12)');
    lampWash.addColorStop(1, 'rgba(255,210,130,0)');
    oCtx.fillStyle = lampWash;
    oCtx.fillRect(0, 0, cw, ch);
  }

  // Stars — visible at night, fade in/out during twilight
  const starAlpha = _skyHourF < 5 ? 0.7 : _skyHourF < 7 ? 0.7 * (1 - (_skyHourF - 5) / 2) : _skyHourF >= 19.5 ? Math.min(0.7, (_skyHourF - 19.5) / 1.5 * 0.7) : _skyHourF >= 21 ? 0.7 : 0;
  if (starAlpha > 0.02) {
    oCtx.save();
    oCtx.globalAlpha = starAlpha;
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 137) % Math.max(40, Math.floor(cw - 60))) + 30;
      const sy = ((i * 83) % Math.max(20, Math.floor(ch * 0.28))) + 14;
      // Gentle twinkle
      const twinkle = 0.6 + 0.4 * Math.sin(time / 1200 + i * 1.7);
      const r = (i % 5 === 0 ? 1.8 : 1.1) * twinkle;
      oCtx.beginPath();
      oCtx.arc(sx, sy, r, 0, Math.PI * 2);
      oCtx.fillStyle = i % 4 === 0 ? 'rgba(255,230,190,0.9)' : 'rgba(255,248,235,0.85)';
      oCtx.fill();
    }
    oCtx.restore();
  }

    oCtx = _origCtx2;
    _skyLastHour = skyKey; _skyLastW = oCanvas.width; _skyLastH = oCanvas.height; _skyLastTheme = _themeKey;
  }
  // Blit cached sky
  oCtx.save();
  oCtx.setTransform(1, 0, 0, 1, 0, 0);
  oCtx.drawImage(_skyCanvas, 0, 0);
  oCtx.restore();
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Apply zoom + pan
  oCtx.save();
  oCtx.translate(cw / 2, ch / 2);
  oCtx.scale(camZoom, camZoom);
  oCtx.translate(-cw / 2 + camPanX, -ch / 2 + camPanY);

  // Center the real scene bounds, not just the raw tile grid, so the office fills the viewport cleanly.
  const scene = getSceneBounds();
  _originX = cw / 2 - (scene.minX + scene.maxX) / 2;
  _originY = ch * 0.45 - (scene.minY + scene.maxY) / 2;

  // Grounding shadow under the whole office so it feels like a placed scene, not floating geometry
  oCtx.save();
  oCtx.globalAlpha = 0.22;
  const shadowCx = cw / 2;
  const shadowCy = _originY + scene.height * 0.62;
  const shadow = oCtx.createRadialGradient(shadowCx, shadowCy, 40, shadowCx, shadowCy, Math.max(scene.width * 0.38, 220));
  shadow.addColorStop(0, 'rgba(80,48,20,0.24)');
  shadow.addColorStop(1, 'rgba(80,48,20,0)');
  oCtx.fillStyle = shadow;
  oCtx.beginPath();
  oCtx.ellipse(shadowCx, shadowCy, scene.width * 0.38, scene.height * 0.22, 0, 0, Math.PI * 2);
  oCtx.fill();
  oCtx.restore();

  // Draw static layers from cache (walls, floor, zones, partitions, labels, furniture)
  if (!_staticValid || !_staticCanvas || _staticCanvas.width !== oCanvas.width || _staticCanvas.height !== oCanvas.height) {
    if (!_staticCanvas) { _staticCanvas = document.createElement('canvas'); _staticCtx = _staticCanvas.getContext('2d'); }
    _staticCanvas.width = oCanvas.width;
    _staticCanvas.height = oCanvas.height;
    _staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _staticCtx.imageSmoothingEnabled = false;
    _staticCtx.clearRect(0, 0, cw, ch);
    // Mirror the current transform into static context
    _staticCtx.save();
    _staticCtx.translate(cw / 2, ch / 2);
    _staticCtx.scale(camZoom, camZoom);
    _staticCtx.translate(-cw / 2 + camPanX, -ch / 2 + camPanY);
    const _origCtx = oCtx;
    oCtx = _staticCtx;
    drawWalls();
    drawFloor();
    drawZoneBoundaries();
    drawInteriorPartitions();
    drawZoneLabels();
    drawSharedFurniture(time);
    oCtx = _origCtx;
    _staticCtx.restore();
    _staticValid = true;
    _staticCamZoom = camZoom;
    _staticCamPanX = camPanX;
    _staticCamPanY = camPanY;
  }
  // Invalidate if camera moved
  if (_staticCamZoom !== camZoom || _staticCamPanX !== camPanX || _staticCamPanY !== camPanY) {
    _staticValid = false;
  }
  // Blit static cache — draw it at identity transform since it was rendered with the full transform
  oCtx.save();
  oCtx.setTransform(1, 0, 0, 1, 0, 0);
  oCtx.drawImage(_staticCanvas, 0, 0);
  oCtx.restore();

  // Assign agents to desk slots — only occupied slots get desks
  const agents = (typeof agentData !== 'undefined' ? agentData : []).slice();
  // Clean up wander state for agents that no longer exist
  const agentNames = new Set(agents.map(a => a.name));
  for (const k of Object.keys(_wanderState)) {
    if (!agentNames.has(k)) delete _wanderState[k];
  }
  // Sort: working first, then idle, then sleeping
  agents.sort((a, b) => {
    const order = { working: 0, idle: 1, sleeping: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  // Assign desks by department first so the office feels intentionally organized
  const zoneBuckets = { engineering: [], content: [], leadership: [], support: [] };
  const overflowAgents = [];
  for (const a of agents) {
    const z = getZoneForAgent(a);
    if (zoneBuckets[z]) zoneBuckets[z].push(a); else overflowAgents.push(a);
  }
  const activeDeskSlots = getActiveDeskSlots();
  const slotsByZone = {
    engineering: activeDeskSlots.filter(s => s.zone === 'engineering'),
    content: activeDeskSlots.filter(s => s.zone === 'content'),
    leadership: activeDeskSlots.filter(s => s.zone === 'leadership'),
    support: activeDeskSlots.filter(s => s.zone === 'support'),
  };
  const assigned = [];
  Object.keys(slotsByZone).forEach(zone => {
    const people = zoneBuckets[zone] || [];
    slotsByZone[zone].forEach((slot, i) => {
      const agent = people[i] || overflowAgents.shift() || null;
      if (agent) assigned.push({ ...slot, agent });
    });
  });
  while (overflowAgents.length && assigned.length < activeDeskSlots.length) {
    const slot = activeDeskSlots[assigned.length];
    assigned.push({ ...slot, agent: overflowAgents.shift() });
  }
  // Dynamic overflow: place extra agents in unused grid space within room bounds
  let overflowIdx = 0;
  while (overflowAgents.length) {
    const a = overflowAgents.shift();
    // Place in a zigzag pattern across the room center
    const gx = 4 + (overflowIdx % 5) * 4;
    const gy = 2 + Math.floor(overflowIdx / 5) * 4;
    const clampedGx = Math.min(gx, 22);
    const clampedGy = Math.min(gy, 14);
    assigned.push({ gx: clampedGx, gy: clampedGy, zone: 'support', agent: a });
    overflowIdx++;
  }
  const sortedSlots = assigned
    .map((s, i) => ({ ...s, idx: i }))
    .sort((a, b) => (a.gy + a.gx) - (b.gy + b.gx));

  const _pendingLabels = []; // collect labels for final overlay pass

  for (const slot of sortedSlots) {
    // Get wander position for idle agents
    const wpos = slot.agent ? getWanderPos(slot.agent.name, slot.gx, slot.gy, slot.agent.status, time) : null;
    const isWandering = wpos && (Math.abs(wpos.gx - slot.gx) > 0.1 || Math.abs(wpos.gy - slot.gy) > 0.1);
    // Always draw desk at desk slot; pass null agent if wandering (so agent draws separately)
    drawDeskStation(slot.gx, slot.gy, isWandering ? null : slot.agent, time);
    // Draw wandering agent at their current position
    if (isWandering && slot.agent) {
      const wp = iso(wpos.gx, wpos.gy);
      drawAgent(wp.x, wp.y - ISO.tileH / 2 - 10, slot.agent, time);
      _pendingLabels.push({ x: wp.x, y: wp.y + 4, agent: slot.agent });
      const screen = worldToScreen(wp.x, wp.y - ISO.tileH / 2 - 10, cw, ch);
      _hoverTargets.push({ agent: slot.agent, x: screen.x, y: screen.y, r: 36 });
    } else if (slot.agent) {
      const dp = iso(slot.gx, slot.gy);
      _pendingLabels.push({ x: dp.x, y: dp.y + ISO.tileH / 2 + 8, agent: slot.agent });
      const screen = worldToScreen(dp.x, dp.y - ISO.tileH / 2 - 22, cw, ch);
      _hoverTargets.push({ agent: slot.agent, x: screen.x, y: screen.y, r: 36 });
    }
  }

  // Draw all name labels AFTER all desks/agents so they're always on top
  for (const lbl of _pendingLabels) {
    drawNameLabel(lbl.x, lbl.y, lbl.agent);
  }

  // Speech bubbles for active agents — show up to 2 simultaneously, staggered
  const workingAgents = sortedSlots.filter(s => s.agent && s.agent.status === 'working' && s.agent.lastMessage);
  if (workingAgents.length > 0 && window.innerWidth > 480) {
    if (time - _lastBubbleSwitch > SPEECH_BUBBLE_INTERVAL) {
      _lastBubbleSwitch = time;
      _speechBubbleAgent = (_speechBubbleAgent === null) ? 0 : (_speechBubbleAgent + 1) % workingAgents.length;
    }
    const numBubbles = workingAgents.length >= 3 ? 2 : 1;
    for (let bi = 0; bi < numBubbles; bi++) {
      const idx = ((_speechBubbleAgent ?? 0) + bi * Math.max(1, Math.floor(workingAgents.length / 2))) % workingAgents.length;
      const bubbleSlot = workingAgents[idx];
      if (bubbleSlot) {
        const p = iso(bubbleSlot.gx, bubbleSlot.gy);
        const stagger = bi * 1200;
        const elapsed = time - _lastBubbleSwitch - stagger;
        if (elapsed < 0) continue;
        const fadeIn = Math.min(1, elapsed / 300);
        const fadeOut = Math.max(0, 1 - Math.max(0, elapsed - SPEECH_BUBBLE_DURATION) / 500);
        oCtx.globalAlpha = Math.min(fadeIn, fadeOut);
        drawSpeechBubble(p.x, p.y - ISO.tileH / 2 - 38, bubbleSlot.agent.lastMessage);
        oCtx.globalAlpha = 1;
      }
    }
  }

  // ── Ambient particles (dust motes by day, firefly embers at night) ──
  oCtx.save();
  const particleCount = nightMode ? 12 : 8;
  for (let i = 0; i < particleCount; i++) {
    const seed = i * 73 + 17;
    const speed = 0.0002 + (seed % 7) * 0.00005;
    const phase = seed * 1.3;
    // Orbital path with gentle drift
    const px = (Math.sin(time * speed + phase) * 0.35 + 0.5) * cw / camZoom;
    const py = (Math.cos(time * speed * 0.7 + phase * 0.8) * 0.3 + 0.45) * ch / camZoom;
    const breathe = 0.5 + 0.5 * Math.sin(time * 0.001 + i * 2.1);
    if (nightMode) {
      // Warm firefly embers
      const r = 1.2 + breathe * 1.4;
      oCtx.globalAlpha = 0.15 + breathe * 0.35;
      oCtx.beginPath();
      oCtx.arc(px, py, r + 2, 0, Math.PI * 2);
      oCtx.fillStyle = i % 3 === 0 ? 'rgba(255,200,80,0.3)' : 'rgba(255,160,60,0.25)';
      oCtx.fill();
      oCtx.beginPath();
      oCtx.arc(px, py, r, 0, Math.PI * 2);
      oCtx.fillStyle = i % 3 === 0 ? '#ffcc55' : '#ffaa44';
      oCtx.fill();
    } else {
      // Floating dust motes
      const r = 0.8 + breathe * 0.6;
      oCtx.globalAlpha = 0.08 + breathe * 0.12;
      oCtx.beginPath();
      oCtx.arc(px, py, r, 0, Math.PI * 2);
      oCtx.fillStyle = '#fff8e0';
      oCtx.fill();
    }
  }
  oCtx.globalAlpha = 1;
  oCtx.restore();

  oCtx.restore(); // undo zoom+pan

  if (_hoveredAgent) {
    const ha = _hoveredAgent;
    const msg = sanitizeAgentText(ha.lastMessage || 'No recent activity').replace(/\n/g, ' ').slice(0, 72);
    const role = ha.role || 'Agent';
    const status = String(ha.status || 'unknown').toUpperCase();
    const ageMin = ha.ageMin || 0;
    const ageStr = ageMin < 1 ? 'just now' : ageMin < 60 ? Math.round(ageMin) + 'm ago' : Math.round(ageMin / 60) + 'h ago';
    const title = `${ha.name || 'Agent'} · ${status}`;
    const subtitle = `${role} · ${ageStr}`;
    oCtx.font = '600 11px -apple-system, system-ui, sans-serif';
    const tw1 = oCtx.measureText(title).width;
    oCtx.font = '10px -apple-system, system-ui, sans-serif';
    const tw2 = oCtx.measureText(subtitle).width;
    const tw3 = oCtx.measureText(msg).width;
    const tw = Math.max(tw1, tw2, tw3);
    const bx = Math.max(12, Math.min(_mouseCanvasX + 14, cw - tw - 28));
    const by = Math.max(12, _mouseCanvasY - 66);
    oCtx.fillStyle = PAL.tooltipBg;
    oCtx.beginPath();
    oCtx.roundRect(bx, by, tw + 16, 50, 8);
    oCtx.fill();
    oCtx.strokeStyle = PAL.tooltipBorder;
    oCtx.lineWidth = 1;
    oCtx.stroke();
    oCtx.fillStyle = PAL.tooltipAccent;
    oCtx.fillRect(bx + 8, by + 8, 4, 34);
    oCtx.font = '600 11px -apple-system, system-ui, sans-serif';
    oCtx.fillStyle = '#fff';
    oCtx.fillText(title, bx + 18, by + 16);
    oCtx.font = '10px -apple-system, system-ui, sans-serif';
    oCtx.fillStyle = 'rgba(255,220,180,0.7)';
    oCtx.fillText(subtitle, bx + 18, by + 28);
    oCtx.fillStyle = 'rgba(255,255,255,0.82)';
    oCtx.fillText(msg, bx + 18, by + 42);
  }

  // Watermark / zoom hint
  oCtx.font = '9px -apple-system, system-ui, sans-serif';
  oCtx.fillStyle = 'rgba(0,0,0,0.2)';
  oCtx.textAlign = 'left';
  oCtx.fillText('Scroll to zoom · Drag to pan', 8, ch - 8);
}

// ── FPS OVERLAY (toggle with F key) ──
let _showFPS = false;
let _fpsFrameTimes = [];
function drawFPSOverlay() {
  if (!_showFPS || !oCtx) return;
  const now = performance.now();
  _fpsFrameTimes.push(now);
  while (_fpsFrameTimes.length > 0 && now - _fpsFrameTimes[0] > 1000) _fpsFrameTimes.shift();
  const fps = _fpsFrameTimes.length;
  const frameMs = _fpsFrameTimes.length > 1 ? (now - _fpsFrameTimes[_fpsFrameTimes.length - 2]).toFixed(1) : '—';
  const dpr = window.devicePixelRatio || 1;
  oCtx.save();
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  oCtx.fillStyle = 'rgba(0,0,0,0.7)';
  oCtx.fillRect(4, 4, 110, 38);
  oCtx.font = '11px SF Mono, Menlo, monospace';
  oCtx.fillStyle = fps >= 12 ? '#4ade80' : fps >= 8 ? '#fbbf24' : '#f87171';
  oCtx.textAlign = 'left';
  oCtx.fillText(fps + ' FPS', 10, 20);
  oCtx.fillStyle = '#94a3b8';
  oCtx.fillText(frameMs + ' ms/frame', 10, 35);
  oCtx.restore();
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName !== 'INPUT') _showFPS = !_showFPS;
});

// ── ANIMATION LOOP ──
const FRAME_INTERVAL = 1000 / 15; // 15fps
let _lastFrameTime = 0;
let _wasHidden = false;
var _canvasVisible = true;

// IntersectionObserver to skip rendering when scrolled out of view
try {
  const _cvEl = document.getElementById('office-canvas');
  if (_cvEl) {
    const _cvObs = new IntersectionObserver(entries => {
      _canvasVisible = entries[0]?.isIntersecting ?? true;
    }, { threshold: 0.01 });
    _cvObs.observe(_cvEl);
  }
} catch (e) {}

var _lastViewSwitchTime = performance.now();
function officeLoop(now) {
  requestAnimationFrame(officeLoop);
  if (typeof _officeView !== 'undefined' && _officeView === 'grid') return;
  if (document.hidden) { _wasHidden = true; return; }
  if (typeof _currentTab !== 'undefined' && _currentTab !== 'office') return;
  // Skip visibility check for 2s after view switch to let IntersectionObserver catch up
  const recentSwitch = (now - _lastViewSwitchTime) < 2000;
  if (!_canvasVisible && !recentSwitch) return;
  if (now - _lastFrameTime < FRAME_INTERVAL) return;
  _lastFrameTime = now;
  if (!oCanvas.width || !oCanvas.height || oCanvas.width < 10) { resizeCanvas(); return; }
  if (_wasHidden) { _wasHidden = false; invalidateStaticCache(); }
  drawOffice(now);
  drawFPSOverlay();
}

// ── RESIZE ──
function resizeCanvas() {
  if (!oCanvas || !oCtx) return;
  const container = oCanvas.parentElement;
  if (!container) return;
  const w = container.clientWidth;
  if (w < 10) return;

  const headerH = document.querySelector('header')?.offsetHeight || 40;
  const navH = document.querySelector('nav')?.offsetHeight || 36;
  const usedH = headerH + navH + 24;
  const availH = Math.max(300, window.innerHeight - usedH);
  const isMobile = window.innerWidth <= 480;

  const canvasW = w;
  // Mobile: fill available viewport minus bottom nav padding.
  // Desktop: fill the available viewport height.
  const mobileAvailH = Math.max(300, availH - 12);
  const canvasH = isMobile ? mobileAvailH : Math.max(500, availH - 8);

  const dpr = window.devicePixelRatio || 1;
  const internalW = Math.max(canvasW, 800);
  const internalH = (canvasH / canvasW) * internalW;

  oCanvas.width = internalW * dpr;
  oCanvas.height = internalH * dpr;
  oCanvas.style.width = canvasW + 'px';
  oCanvas.style.height = canvasH + 'px';
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  oCtx.imageSmoothingEnabled = false;

  // Auto-fit zoom: fill viewport while keeping the ENTIRE office visible (no clipping).
  const scene = getSceneBounds();
  const padX = isMobile ? 8 : 60;
  const padTop = isMobile ? 8 : 30;
  const padBottom = isMobile ? 8 : 50;
  const fitW = (internalW - padX * 2) / Math.max(scene.width, 1);
  const fitH = (internalH - padTop - padBottom) / Math.max(scene.height, 1);
  // Use the SMALLER of width/height fit so nothing clips
  // On mobile, bias toward width-fit since there's extra vertical space
  // Mobile: use width-fit to fill the narrow viewport, desktop: balanced fit
  const fit = isMobile ? fitH * 1.1 : Math.min(fitW, fitH) * 0.95;

  if (!_dragging && !_userPanned) {
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit));
    // Center camera on the scene's center point, not on (0,0)
    const sceneCenterX = (scene.minX + scene.maxX) / 2;
    const sceneCenterY = (scene.minY + scene.maxY) / 2;
    camPanX = sceneCenterX;
    camPanY = sceneCenterY + (isMobile ? -300 : 0);
  }

  invalidateStaticCache();
}

// ── MOUSE/TOUCH EVENTS ──
if (oCanvas) {
  oCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) camZoom = Math.min(ZOOM_MAX, camZoom + ZOOM_STEP);
    else camZoom = Math.max(ZOOM_MIN, camZoom - ZOOM_STEP);
  }, { passive: false });

  oCanvas.addEventListener('mousemove', (e) => {
    const rect = oCanvas.getBoundingClientRect();
    const scaleX = oCanvas.width / rect.width;
    const scaleY = oCanvas.height / rect.height;
    _mouseCanvasX = (e.clientX - rect.left) * scaleX;
    _mouseCanvasY = (e.clientY - rect.top) * scaleY;
    _hoveredAgent = null;
    for (const t of _hoverTargets) {
      const dx = _mouseCanvasX - t.x, dy = _mouseCanvasY - t.y;
      if ((dx * dx + dy * dy) <= (t.r * t.r)) { _hoveredAgent = t.agent; break; }
    }
    oCanvas.style.cursor = _hoveredAgent ? 'pointer' : (_dragging ? 'grabbing' : 'grab');
  });
  oCanvas.addEventListener('mouseleave', () => { _hoveredAgent = null; });

  oCanvas.addEventListener('mousedown', (e) => {
    _dragging = true;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragPanStartX = camPanX;
    _dragPanStartY = camPanY;
    _pointerDownAgent = _hoveredAgent;
    _pointerDownAt = Date.now();
    oCanvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!_dragging) return;
    camPanX = _dragPanStartX + (e.clientX - _dragStartX) / camZoom;
    camPanY = _dragPanStartY + (e.clientY - _dragStartY) / camZoom;
    _userPanned = true;
  });
  window.addEventListener('mouseup', (e) => {
    const moved = Math.hypot(e.clientX - _dragStartX, e.clientY - _dragStartY);
    const tapped = _pointerDownAgent && moved < 8 && (Date.now() - _pointerDownAt) < 350;
    const targetAgent = _pointerDownAgent;
    _dragging = false;
    _pointerDownAgent = null;
    if (oCanvas) oCanvas.style.cursor = 'grab';
    if (tapped && targetAgent && typeof openAgentDetail === 'function') {
      openAgentDetail(targetAgent.name);
    }
  });
  oCanvas.style.cursor = 'grab';

  // Touch support
  let _touchStart = null, _touchDist = null;
  oCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const rect = oCanvas.getBoundingClientRect();
      const scaleX = oCanvas.width / rect.width;
      const scaleY = oCanvas.height / rect.height;
      _mouseCanvasX = (e.touches[0].clientX - rect.left) * scaleX;
      _mouseCanvasY = (e.touches[0].clientY - rect.top) * scaleY;
      _hoveredAgent = null;
      for (const t of _hoverTargets) {
        const dx = _mouseCanvasX - t.x, dy = _mouseCanvasY - t.y;
        if ((dx * dx + dy * dy) <= (t.r * t.r)) { _hoveredAgent = t.agent; break; }
      }
      _dragging = true;
      _dragStartX = e.touches[0].clientX;
      _dragStartY = e.touches[0].clientY;
      _dragPanStartX = camPanX;
      _dragPanStartY = camPanY;
      _pointerDownAgent = _hoveredAgent;
      _pointerDownAt = Date.now();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      _touchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });
  oCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && _dragging) {
      camPanX = _dragPanStartX + (e.touches[0].clientX - _dragStartX) / camZoom;
      camPanY = _dragPanStartY + (e.touches[0].clientY - _dragStartY) / camZoom;
    } else if (e.touches.length === 2 && _touchDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / _touchDist;
      camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camZoom * scale));
      _touchDist = dist;
    }
  }, { passive: true });
  oCanvas.addEventListener('touchend', (e) => {
    const touch = e.changedTouches && e.changedTouches[0];
    const moved = touch ? Math.hypot(touch.clientX - _dragStartX, touch.clientY - _dragStartY) : 999;
    const tapped = _pointerDownAgent && moved < 12 && (Date.now() - _pointerDownAt) < 400;
    const targetAgent = _pointerDownAgent;
    _dragging = false;
    _touchDist = null;
    _pointerDownAgent = null;
    if (tapped && targetAgent && typeof openAgentDetail === 'function') {
      openAgentDetail(targetAgent.name);
    }
  }, { passive: true });
}

// ── INIT ──
window.addEventListener('resize', () => { invalidateStaticCache(); resizeCanvas(); });
if (document.readyState === 'complete') { resizeCanvas(); } else { window.addEventListener('load', () => { invalidateStaticCache(); resizeCanvas(); }); }
setTimeout(() => { invalidateStaticCache(); resizeCanvas(); }, 100);
setTimeout(() => { invalidateStaticCache(); resizeCanvas(); }, 500);
requestAnimationFrame(officeLoop);
