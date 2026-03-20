// ===== COZY PIXEL-ART OFFICE =====
// Warm, detailed isometric office with proper desk areas per agent.
// Replaces the old cold-blue scattered layout.

const oCanvas = document.getElementById('office-canvas');
let oCtx = oCanvas ? oCanvas.getContext('2d', { willReadFrequently: true }) : null;

// ── PALETTE ──
const PAL = {
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
  labelBg: 'rgba(30,30,30,0.85)', labelText: '#fff',
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
};

// ── LAYOUT ──
// Each desk station is a self-contained area with desk, chair, monitor, personal items.
// Grid is in screen pixels (not iso tiles) for simplicity — we draw top-down isometric.
const ISO = { tileW: 64, tileH: 32 };

// Room dimensions
const ROOM = { cols: 16, rows: 12 };

// Fixed desk positions — 3-cell spacing for breathing room
const DESK_SLOTS = [
  { gx: 2, gy: 3 },
  { gx: 5, gy: 3 },
  { gx: 8, gy: 3 },
  { gx: 11, gy: 3 },
  { gx: 14, gy: 3 },
  { gx: 3, gy: 6 },
  { gx: 6, gy: 6 },
  { gx: 9, gy: 6 },
  { gx: 12, gy: 6 },
  { gx: 2, gy: 9 },
  { gx: 5, gy: 9 },
  { gx: 8, gy: 9 },
  { gx: 11, gy: 9 },
  { gx: 14, gy: 9 },
  { gx: 4, gy: 11 },
  { gx: 10, gy: 11 },
];

// Shared furniture
const SHARED_FURNITURE = [
  { type: 'bookshelf', gx: 0, gy: 1 },
  { type: 'bookshelf', gx: 0, gy: 4 },
  { type: 'bookshelf', gx: 0, gy: 7 },
  { type: 'plant', gx: 0, gy: 10 },
  { type: 'coffeeMachine', gx: 15, gy: 1 },
  { type: 'plant', gx: 15, gy: 4 },
  { type: 'plant', gx: 15, gy: 7 },
  { type: 'plant', gx: 15, gy: 10 },
  { type: 'lamp', gx: 1, gy: 0 },
  { type: 'lamp', gx: 7, gy: 0 },
  { type: 'lamp', gx: 13, gy: 0 },
  { type: 'cat', gx: 7, gy: 11 },
  { type: 'rug', gx: 8, gy: 6 },
  { type: 'clock', gx: 8, gy: 0 },
  { type: 'poster', gx: 4, gy: 0, hue: 200 },
  { type: 'poster', gx: 11, gy: 0, hue: 30 },
  { type: 'window', gx: 3, gy: 0 },
  { type: 'window', gx: 6, gy: 0 },
  { type: 'window', gx: 10, gy: 0 },
  { type: 'window', gx: 13, gy: 0 },
  { type: 'waterCooler', gx: 15, gy: 6 },
  { type: 'whiteboard', gx: 5, gy: 0 },
  { type: 'armchair', gx: 7, gy: 5 },
  { type: 'armchair', gx: 9, gy: 5 },
];

// ── IDLE AGENT WANDERING ──
// Idle agents occasionally leave desks to visit POIs (water cooler, armchairs, coffee)
const WANDER_POIS = [
  { gx: 15, gy: 6, label: 'water cooler' },
  { gx: 7, gy: 5, label: 'lounge' },
  { gx: 9, gy: 5, label: 'lounge' },
  { gx: 15, gy: 1, label: 'coffee' },
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
    minX = Math.min(minX, p.x - ISO.tileW / 2 - 28);
    maxX = Math.max(maxX, p.x + ISO.tileW / 2 + 28);
    minY = Math.min(minY, p.y - ISO.tileH / 2 - wallH - 40);
    maxY = Math.max(maxY, p.y + ISO.tileH / 2 + 46);
  });
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

// ── ZOOM / PAN ──
let camZoom = 1, camPanX = 0, camPanY = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0, ZOOM_STEP = 0.15;
let _dragging = false, _dragStartX = 0, _dragStartY = 0, _dragPanStartX = 0, _dragPanStartY = 0;

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
      const isCheck = (gx + gy) % 2 === 0;
      drawIsoDiamond(gx, gy, isCheck ? PAL.floorA : PAL.floorB, null, PAL.floorLine);
    }
  }
}

// ── WALLS ──
function drawWalls() {
  const wallH = 40;
  // Back wall (top edge, gy = -0.5)
  for (let gx = 0; gx < ROOM.cols; gx++) {
    const p = iso(gx, 0);
    const p2 = iso(gx + 1, 0);
    // Wall segment
    oCtx.fillStyle = PAL.wallTop;
    oCtx.beginPath();
    oCtx.moveTo(p.x, p.y - ISO.tileH / 2 - wallH);
    oCtx.lineTo(p2.x, p2.y - ISO.tileH / 2 - wallH);
    oCtx.lineTo(p2.x, p2.y - ISO.tileH / 2);
    oCtx.lineTo(p.x, p.y - ISO.tileH / 2);
    oCtx.closePath();
    oCtx.fill();
    // Trim line
    oCtx.strokeStyle = PAL.wallTrim;
    oCtx.lineWidth = 1;
    oCtx.beginPath();
    oCtx.moveTo(p.x, p.y - ISO.tileH / 2);
    oCtx.lineTo(p2.x, p2.y - ISO.tileH / 2);
    oCtx.stroke();
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
  }
}

// ── DESK STATION ──
function drawDeskStation(gx, gy, agent, time) {
  const p = iso(gx, gy);

  // Desk (iso box)
  drawIsoBox(gx, gy, 12, PAL.deskTop, PAL.deskFront, PAL.deskSide);

  // Monitor
  const monW = 16, monH = 12;
  const monX = p.x - monW / 2, monY = p.y - ISO.tileH / 2 - 12 - monH;
  oCtx.fillStyle = PAL.monFrame;
  oCtx.fillRect(monX - 1, monY - 1, monW + 2, monH + 2);
  // Screen color based on status
  let screenColor = PAL.monScreen;
  if (agent) {
    if (agent.status === 'idle') screenColor = PAL.monScreenIdle;
    else if (agent.status === 'sleeping') screenColor = PAL.monScreenSleep;
    // Typing animation for working agents
    if (agent.status === 'working') {
      const blink = Math.sin(time / 400 + gx) > 0.3;
      if (blink) {
        screenColor = '#4a8ff7';
      }
    }
  }
  oCtx.fillStyle = screenColor;
  oCtx.fillRect(monX, monY, monW, monH);

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

  // Coffee mug (right side of desk)
  const mugX = p.x + 12, mugY = p.y - ISO.tileH / 2 - 10;
  oCtx.fillStyle = PAL.mugBody;
  oCtx.fillRect(mugX, mugY, 5, 6);
  oCtx.fillStyle = PAL.mugCoffee;
  oCtx.fillRect(mugX + 1, mugY + 1, 3, 4);
  oCtx.strokeStyle = PAL.mugHandle;
  oCtx.lineWidth = 1;
  oCtx.beginPath();
  oCtx.arc(mugX + 6, mugY + 3, 2, -Math.PI / 2, Math.PI / 2);
  oCtx.stroke();
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

  // Chair (behind desk — drawn as simple iso seat)
  const chairP = iso(gx, gy + 0.6);
  oCtx.fillStyle = PAL.chairSeat;
  oCtx.beginPath();
  oCtx.ellipse(chairP.x, chairP.y - 6, 8, 4, 0, 0, Math.PI * 2);
  oCtx.fill();
  // Chair back
  oCtx.fillStyle = PAL.chairBack;
  oCtx.fillRect(chairP.x - 6, chairP.y - 16, 12, 8);
  // Chair legs
  oCtx.fillStyle = PAL.chairLeg;
  oCtx.fillRect(chairP.x - 5, chairP.y - 2, 1, 4);
  oCtx.fillRect(chairP.x + 4, chairP.y - 2, 1, 4);

  // Agent character (sitting at desk — drawn BEHIND the desk)
  if (agent) {
    // Draw agent slightly above and behind desk center
    drawAgent(p.x, p.y - ISO.tileH / 2 - 22, agent, time);
    // Name label below desk
    drawNameLabel(p.x, p.y + ISO.tileH / 2 + 8, agent);
  }
}

// ── AGENT CHARACTER ──
function drawAgent(x, y, agent, time) {
  const color = agent.color || '#888';
  const isSleeping = agent.status === 'sleeping';
  const isWorking = agent.status === 'working';

  // Body
  oCtx.fillStyle = color;
  oCtx.fillRect(x - 5, y - 2, 10, 10);

  // Head
  const headBob = isWorking ? Math.sin(time / 300) * 1 : 0;
  oCtx.fillStyle = '#f0d0a0'; // skin tone
  oCtx.beginPath();
  oCtx.arc(x, y - 8 + headBob, 6, 0, Math.PI * 2);
  oCtx.fill();

  // Eyes
  if (isSleeping) {
    // Closed eyes (Z's)
    oCtx.fillStyle = '#666';
    oCtx.fillRect(x - 3, y - 9, 3, 1);
    oCtx.fillRect(x + 1, y - 9, 3, 1);
    // Zzz
    oCtx.font = '8px monospace';
    oCtx.fillStyle = '#999';
    oCtx.textAlign = 'left';
    const zzOff = Math.sin(time / 800) * 2;
    oCtx.fillText('z', x + 7, y - 12 + zzOff);
    oCtx.fillText('Z', x + 10, y - 18 + zzOff);
  } else {
    // Open eyes
    oCtx.fillStyle = '#333';
    oCtx.fillRect(x - 3, y - 10 + headBob, 2, 2);
    oCtx.fillRect(x + 2, y - 10 + headBob, 2, 2);
  }

  // Arms (typing animation for working agents)
  if (isWorking) {
    const armL = Math.sin(time / 200) * 2;
    const armR = Math.sin(time / 200 + Math.PI) * 2;
    oCtx.fillStyle = color;
    oCtx.fillRect(x - 8, y + 0 + armL, 3, 4);
    oCtx.fillRect(x + 5, y + 0 + armR, 3, 4);

    // Typing sparks — small bright dots near hands
    const sparkPhase = (time / 120) | 0;
    if (sparkPhase % 3 === 0) {
      oCtx.fillStyle = '#ffa300';
      oCtx.fillRect(x - 6 + (sparkPhase % 5), y + 5, 1, 1);
    }
    if ((sparkPhase + 1) % 4 === 0) {
      oCtx.fillStyle = '#ffec27';
      oCtx.fillRect(x + 6 - (sparkPhase % 4), y + 4, 1, 1);
    }

    // Coffee mug steam — wispy lines rising from desk edge
    const steamT = time / 600;
    oCtx.strokeStyle = 'rgba(200,200,200,0.3)';
    oCtx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const sx = x + 12 + i * 3;
      const sy = y + 6;
      oCtx.beginPath();
      oCtx.moveTo(sx, sy);
      oCtx.quadraticCurveTo(sx + Math.sin(steamT + i) * 2, sy - 5, sx + Math.sin(steamT + i + 1) * 1.5, sy - 10);
      oCtx.stroke();
    }
  } else {
    oCtx.fillStyle = color;
    oCtx.fillRect(x - 8, y + 1, 3, 4);
    oCtx.fillRect(x + 5, y + 1, 3, 4);
  }
}

// ── NAME LABEL ──
function drawNameLabel(x, y, agent) {
  const rawName = agent.name || 'Unknown';
  const name = rawName.length > 16 ? rawName.slice(0, 15) + '…' : rawName;
  oCtx.font = '600 9px -apple-system, system-ui, sans-serif';
  oCtx.textAlign = 'center';
  const tw = oCtx.measureText(name).width;
  const padX = 7, padY = 3;
  const lx = x - tw / 2 - padX;
  const ly = y - padY;
  const lw = tw + padX * 2 + 8;
  const lh = 15;

  // Badge background
  oCtx.fillStyle = 'rgba(43,30,18,0.82)';
  oCtx.beginPath();
  oCtx.roundRect(lx, ly, lw, lh, 5);
  oCtx.fill();

  // Status dot
  const dotR = 2.5;
  const dotX = lx + 8;
  const dotY = ly + lh / 2;
  oCtx.fillStyle = agent.status === 'working' ? PAL.statusWorking
    : agent.status === 'idle' ? PAL.statusIdle
    : PAL.statusSleeping;
  oCtx.beginPath();
  oCtx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  oCtx.fill();
  // Glow for working
  if (agent.status === 'working') {
    oCtx.globalAlpha = 0.3;
    oCtx.beginPath();
    oCtx.arc(dotX, dotY, dotR + 2, 0, Math.PI * 2);
    oCtx.fill();
    oCtx.globalAlpha = 1;
  }

  // Name text
  oCtx.fillStyle = '#fffaf2';
  oCtx.fillText(name, x + 5, y + 7.5);
}

// ── SHARED FURNITURE ──
function drawBookshelf(gx, gy) {
  const p = iso(gx, gy);
  // Shelf frame
  drawIsoBox(gx, gy, 30, PAL.shelfWood, PAL.shelfSide, PAL.shelfWood);
  // Books
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      oCtx.fillStyle = PAL.bookColors[(row * 4 + i + gx * 3) % PAL.bookColors.length];
      const bx = p.x - 10 + i * 6;
      const by = p.y - 28 + row * 9;
      oCtx.fillRect(bx, by, 4, 7);
    }
  }
}

function drawPlant(gx, gy) {
  const p = iso(gx, gy);
  // Pot
  oCtx.fillStyle = PAL.plantPot;
  oCtx.fillRect(p.x - 5, p.y - 4, 10, 8);
  // Leaves
  const time = _frameTime / 1000;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + Math.sin(time * 0.5 + i) * 0.1;
    oCtx.beginPath();
    oCtx.arc(p.x + Math.cos(angle) * 8, p.y - 12 + Math.sin(angle) * 4, 4, 0, Math.PI * 2);
    oCtx.fillStyle = i % 2 === 0 ? PAL.leafDark : PAL.leafLight;
    oCtx.fill();
  }
}

function drawCoffeeMachine(gx, gy) {
  const p = iso(gx, gy);
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
}

function drawSharedFurniture(time) {
  for (const f of SHARED_FURNITURE) {
    switch (f.type) {
      case 'bookshelf': drawBookshelf(f.gx, f.gy); break;
      case 'plant': drawPlant(f.gx, f.gy); break;
      case 'coffeeMachine': drawCoffeeMachine(f.gx, f.gy); break;
      case 'lamp': drawLamp(f.gx, f.gy); break;
      case 'cat': drawCat(f.gx, f.gy); break;
      case 'rug': drawRug(f.gx, f.gy); break;
      case 'clock': drawClock(f.gx, f.gy); break;
      case 'poster': drawPoster(f.gx, f.gy, f.hue || 0); break;
      case 'window': drawWindow(f.gx, f.gy); break;
      case 'waterCooler': drawWaterCooler(f.gx, f.gy); break;
      case 'whiteboard': drawWhiteboard(f.gx, f.gy); break;
      case 'armchair': drawArmchair(f.gx, f.gy); break;
    }
  }
}

function drawWindow(gx, gy) {
  const p = iso(gx, gy);
  const wy = p.y - ISO.tileH / 2 - 32;
  // Frame
  oCtx.fillStyle = '#5a4a3a';
  oCtx.fillRect(p.x - 14, wy, 28, 22);
  // Glass — sky gradient
  const grad = oCtx.createLinearGradient(p.x, wy + 2, p.x, wy + 18);
  grad.addColorStop(0, '#87ceeb');
  grad.addColorStop(0.6, '#b8e6f0');
  grad.addColorStop(1, '#d4eef4');
  oCtx.fillStyle = grad;
  oCtx.fillRect(p.x - 12, wy + 2, 24, 18);
  // Cross bar
  oCtx.fillStyle = '#5a4a3a';
  oCtx.fillRect(p.x - 0.5, wy + 2, 1, 18);
  oCtx.fillRect(p.x - 12, wy + 10, 24, 1);
  // Light reflection
  oCtx.globalAlpha = 0.2;
  oCtx.fillStyle = '#fff';
  oCtx.fillRect(p.x - 9, wy + 4, 6, 3);
  oCtx.globalAlpha = 1;
  // Sunlight pool on floor
  oCtx.save();
  oCtx.globalAlpha = 0.06;
  const floorP = iso(gx, gy + 2);
  oCtx.beginPath();
  oCtx.ellipse(floorP.x, floorP.y, 30, 15, 0, 0, Math.PI * 2);
  oCtx.fillStyle = '#ffe8a0';
  oCtx.fill();
  oCtx.restore();
}

function drawWaterCooler(gx, gy) {
  const p = iso(gx, gy);
  const by = p.y - ISO.tileH / 2;
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

// ── SPEECH BUBBLES ──
let _speechBubbleAgent = null;
let _speechBubbleTime = 0;
const SPEECH_BUBBLE_DURATION = 5000;
const SPEECH_BUBBLE_INTERVAL = 6000;
let _lastBubbleSwitch = 0;

function drawSpeechBubble(x, y, text) {
  if (!text) return;
  const maxLen = 35;
  const display = text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  oCtx.font = '9px -apple-system, system-ui, sans-serif';
  oCtx.textAlign = 'left';
  const tw = oCtx.measureText(display).width;
  const padX = 6, padY = 4;
  const bw = tw + padX * 2;
  const bh = 16;
  const bx = x - bw / 2;
  const by = y - 38;

  // Clamp to canvas bounds
  const clampedBx = Math.max(4, Math.min(bx, oCanvas.width / (window.devicePixelRatio || 1) / camZoom - bw - 4));

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

function invalidateStaticCache() { _staticValid = false; }

function drawOffice(rafNow) {
  if (!oCtx || !oCanvas.width) return;
  try { _drawOfficeInner(rafNow); } catch (e) { console.warn('drawOffice error:', e.message); }
}

function _drawOfficeInner(rafNow) {
  const dpr = window.devicePixelRatio || 1;
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const time = rafNow ? Math.round(performance.timeOrigin + rafNow) : Date.now();
  _frameTime = time;

  const cw = oCanvas.width / dpr;
  const ch = oCanvas.height / dpr;

  // Warm studio backdrop instead of a flat beige slab
  const bgGrad = oCtx.createLinearGradient(0, 0, 0, ch);
  bgGrad.addColorStop(0, PAL.backdropTop);
  bgGrad.addColorStop(1, PAL.backdropBottom);
  oCtx.fillStyle = bgGrad;
  oCtx.fillRect(0, 0, cw, ch);

  // Soft vignette so empty canvas edges feel intentional, not broken
  const vignette = oCtx.createRadialGradient(cw / 2, ch * 0.42, Math.min(cw, ch) * 0.18, cw / 2, ch * 0.46, Math.max(cw, ch) * 0.78);
  vignette.addColorStop(0, 'rgba(255,245,230,0)');
  vignette.addColorStop(1, PAL.vignette);
  oCtx.fillStyle = vignette;
  oCtx.fillRect(0, 0, cw, ch);

  // Apply zoom + pan
  oCtx.save();
  oCtx.translate(cw / 2, ch / 2);
  oCtx.scale(camZoom, camZoom);
  oCtx.translate(-cw / 2 + camPanX, -ch / 2 + camPanY);

  // Center the real scene bounds, not just the raw tile grid, so the office fills the viewport cleanly.
  const scene = getSceneBounds();
  _originX = cw / 2 - (scene.minX + scene.maxX) / 2;
  _originY = ch * 0.53 - (scene.minY + scene.maxY) / 2;

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

  // Draw layers back-to-front
  drawWalls();
  drawFloor();

  // Shared furniture (back rows first)
  drawSharedFurniture(time);

  // Assign agents to desk slots — only occupied slots get desks
  const agents = (typeof agentData !== 'undefined' ? agentData : []).slice();
  // Sort: working first, then idle, then sleeping
  agents.sort((a, b) => {
    const order = { working: 0, idle: 1, sleeping: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  // Only draw desks for agents that exist
  const usedSlots = DESK_SLOTS.slice(0, agents.length);
  const sortedSlots = usedSlots.map((s, i) => ({ ...s, agent: agents[i], idx: i }))
    .sort((a, b) => (a.gy + a.gx) - (b.gy + b.gx));

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
      drawNameLabel(wp.x, wp.y + 4, slot.agent);
    }
  }

  // Speech bubble for active agents (rotate every 6s)
  const workingAgents = sortedSlots.filter(s => s.agent && s.agent.status === 'working' && s.agent.lastMessage);
  if (workingAgents.length > 0) {
    if (time - _lastBubbleSwitch > SPEECH_BUBBLE_INTERVAL) {
      _lastBubbleSwitch = time;
      _speechBubbleAgent = (_speechBubbleAgent === null) ? 0 : (_speechBubbleAgent + 1) % workingAgents.length;
    }
    const idx = (_speechBubbleAgent ?? 0) % workingAgents.length;
    const bubbleSlot = workingAgents[idx];
    if (bubbleSlot) {
      const p = iso(bubbleSlot.gx, bubbleSlot.gy);
      const fadeIn = Math.min(1, (time - _lastBubbleSwitch) / 300);
      const fadeOut = Math.max(0, 1 - Math.max(0, time - _lastBubbleSwitch - SPEECH_BUBBLE_DURATION) / 500);
      oCtx.globalAlpha = Math.min(fadeIn, fadeOut);
      drawSpeechBubble(p.x, p.y - ISO.tileH / 2 - 30, bubbleSlot.agent.lastMessage);
      oCtx.globalAlpha = 1;
    }
  }

  oCtx.restore(); // undo zoom+pan

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
let _canvasVisible = true;

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

function officeLoop(now) {
  requestAnimationFrame(officeLoop);
  if (typeof _officeView !== 'undefined' && _officeView === 'grid') return;
  if (document.hidden) { _wasHidden = true; return; }
  if (typeof _currentTab !== 'undefined' && _currentTab !== 'office') return;
  if (!_canvasVisible) return;
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
  // Mobile should feel scene-first: let the office claim more vertical space
  // so short pages don't leave a large dead band below the canvas.
  const mobileH = Math.min(Math.max(340, window.innerHeight * 0.58), 520);
  const desktopH = Math.min(availH, Math.max(450, window.innerHeight * 0.74), 920);
  const canvasH = isMobile ? Math.min(availH, mobileH) : desktopH;

  const dpr = window.devicePixelRatio || 1;
  const internalW = Math.max(canvasW, 800);
  const internalH = (canvasH / canvasW) * internalW;

  oCanvas.width = internalW * dpr;
  oCanvas.height = internalH * dpr;
  oCanvas.style.width = canvasW + 'px';
  oCanvas.style.height = canvasH + 'px';
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  oCtx.imageSmoothingEnabled = false;

  // Auto-fit zoom using the real rendered scene bounds so the office fills the viewport cleanly.
  const scene = getSceneBounds();
  const padX = isMobile ? 30 : 54;
  const padTop = isMobile ? 26 : 40;
  const padBottom = isMobile ? 34 : 48;
  const fitW = (internalW - padX * 2) / Math.max(scene.width, 1);
  const fitH = (internalH - padTop - padBottom) / Math.max(scene.height, 1);
  const fitBase = Math.min(fitW, fitH);
  const fit = isMobile ? fitBase * 1.06 : fitBase * 1.02;

  if (!_dragging && camPanX === 0 && camPanY <= 0) {
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit));
    camPanY = isMobile ? 10 : 0;
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

  oCanvas.addEventListener('mousedown', (e) => {
    _dragging = true;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragPanStartX = camPanX;
    _dragPanStartY = camPanY;
    oCanvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!_dragging) return;
    camPanX = _dragPanStartX + (e.clientX - _dragStartX) / camZoom;
    camPanY = _dragPanStartY + (e.clientY - _dragStartY) / camZoom;
  });
  window.addEventListener('mouseup', () => {
    _dragging = false;
    if (oCanvas) oCanvas.style.cursor = 'grab';
  });
  oCanvas.style.cursor = 'grab';

  // Touch support
  let _touchStart = null, _touchDist = null;
  oCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      _dragging = true;
      _dragStartX = e.touches[0].clientX;
      _dragStartY = e.touches[0].clientY;
      _dragPanStartX = camPanX;
      _dragPanStartY = camPanY;
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
  oCanvas.addEventListener('touchend', () => { _dragging = false; _touchDist = null; }, { passive: true });
}

// ── INIT ──
window.addEventListener('resize', () => { invalidateStaticCache(); resizeCanvas(); });
if (document.readyState === 'complete') { resizeCanvas(); } else { window.addEventListener('load', () => { invalidateStaticCache(); resizeCanvas(); }); }
setTimeout(() => { invalidateStaticCache(); resizeCanvas(); }, 100);
setTimeout(() => { invalidateStaticCache(); resizeCanvas(); }, 500);
requestAnimationFrame(officeLoop);
