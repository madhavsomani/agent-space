// ===== COZY PIXEL-ART OFFICE =====
// Warm, detailed isometric office with proper desk areas per agent.
// Replaces the old cold-blue scattered layout.

const oCanvas = document.getElementById('office-canvas');
let oCtx = oCanvas ? oCanvas.getContext('2d', { willReadFrequently: true }) : null;

// ── PALETTE ──
const PAL = {
  // Warm wood floor
  floorA: '#c4a882', floorB: '#b89b74',
  floorLine: '#a08a68',
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
];

// ── ISO PROJECTION ──
let _originX = 0, _originY = 0;

function iso(gx, gy) {
  return {
    x: _originX + (gx - gy) * ISO.tileW / 2,
    y: _originY + (gx + gy) * ISO.tileH / 2
  };
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
  } else {
    oCtx.fillStyle = color;
    oCtx.fillRect(x - 8, y + 1, 3, 4);
    oCtx.fillRect(x + 5, y + 1, 3, 4);
  }
}

// ── NAME LABEL ──
function drawNameLabel(x, y, agent) {
  const name = agent.name || 'Unknown';
  oCtx.font = 'bold 10px -apple-system, system-ui, sans-serif';
  oCtx.textAlign = 'center';
  const tw = oCtx.measureText(name).width;
  const padX = 6, padY = 3;
  const lx = x - tw / 2 - padX;
  const ly = y - padY;
  const lw = tw + padX * 2;
  const lh = 14 + padY;

  // Badge background
  oCtx.fillStyle = PAL.labelBg;
  oCtx.beginPath();
  oCtx.roundRect(lx, ly, lw, lh, 4);
  oCtx.fill();

  // Status dot
  const dotR = 3;
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
  oCtx.fillStyle = PAL.labelText;
  oCtx.fillText(name, x + 4, y + 8);
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

  // Clear with warm background
  oCtx.fillStyle = '#d4c4a8';
  oCtx.fillRect(0, 0, cw, ch);

  // Apply zoom + pan
  oCtx.save();
  oCtx.translate(cw / 2, ch / 2);
  oCtx.scale(camZoom, camZoom);
  oCtx.translate(-cw / 2 + camPanX, -ch / 2 + camPanY);

  // Calculate origin to center room
  const gridPixelW = (ROOM.cols + ROOM.rows) * ISO.tileW / 2;
  const gridPixelH = (ROOM.cols + ROOM.rows) * ISO.tileH / 2;
  _originX = cw / 2 + (ROOM.rows * ISO.tileW / 4) - (ROOM.cols * ISO.tileW / 4);
  _originY = (ch - gridPixelH) / 2 + 40; // 40px down for wall space

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
    drawDeskStation(slot.gx, slot.gy, slot.agent, time);
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
  const desktopH = Math.min(availH, Math.max(450, window.innerHeight * 0.70));
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

  // Auto-fit zoom
  const gridPixelW = (ROOM.cols + ROOM.rows) * ISO.tileW / 2 + 80;
  const gridPixelH = (ROOM.cols + ROOM.rows) * ISO.tileH / 2 + 120;
  const fitW = internalW / gridPixelW;
  const fitH = internalH / gridPixelH;
  const fitBase = Math.min(fitW, fitH);
  const fit = isMobile ? fitBase * 1.5 : fitBase * 1.2;

  if (!_dragging && camPanX === 0 && camPanY <= 0) {
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit));
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
