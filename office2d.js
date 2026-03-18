// ===== AGENT SPACE — 2D PIXEL ART OFFICE =====
// Cozy pixel art top-down office. Canvas-rendered, warm palette.
// Each agent gets a desk area with furniture, character sprite, status dot.

window.Office2D = (function() {
  let canvas, ctx;
  let agents = [];
  let initialized = false;
  let animFrame = null;
  let clickHandler = null;
  let dpr = 1;
  let frameCount = 0;
  let hitRegions = [];

  // ── PALETTE (warm, cozy) ──
  const P = {
    floorLight: '#e8dcc8',
    floorDark: '#ddd0b8',
    wallBrick: '#9a7355',
    wallBrickDark: '#7a5a42',
    wallBrickLight: '#b08a6a',
    woodDark: '#5a3a1e',
    woodMed: '#7a5a35',
    woodLight: '#9a7a50',
    deskTop: '#8a6a3f',
    deskSide: '#6a4f2a',
    monitorBody: '#c8c8c8',
    monitorScreen: '#a8d8ea',
    monitorScreenOn: '#88c8e8',
    monitorStand: '#888888',
    chairSeat: '#d4c4a0',
    chairBack: '#c8b890',
    lampShade: '#f0d888',
    lampPole: '#888870',
    lampGlow: 'rgba(255,240,180,0.15)',
    plantGreen: '#5a9a3a',
    plantDarkGreen: '#3a7a2a',
    plantPot: '#8a5a30',
    mugBody: '#f0e8d8',
    mugCoffee: '#5a3a1e',
    bookRed: '#c84040',
    bookBlue: '#4060a0',
    bookGreen: '#408040',
    bookYellow: '#d0a830',
    shelfWood: '#6a4a28',
    armchairBody: '#d8d0c0',
    armchairShadow: '#c0b8a0',
    coffeeMachineBody: '#708090',
    coffeeMachineTop: '#5a6a78',
    skin: '#f0d0a0',
    skinShadow: '#d0b080',
    hairDark: '#3a2a1a',
    hairBrown: '#6a4a2a',
    hairBlonde: '#c8a050',
    catGray: '#888888',
    catDark: '#555555',
    bedBeige: '#e0d0b0',
    statusWorking: '#22c55e',
    statusIdle: '#eab308',
    statusSleeping: '#6b7280',
    nameTagBg: 'rgba(0,0,0,0.75)',
    nameTagText: '#ffffff',
    borderFrame: '#b8a882',
    borderFrameLight: '#d0c8a8',
  };

  // Hair color variety
  const HAIR_COLORS = ['#3a2a1a', '#6a4a2a', '#c8a050', '#8a3030', '#2a4a6a', '#5a2a5a'];

  // ── PIXEL HELPERS ──
  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  function outline(x, y, w, h, color, lw) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1;
    ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(w) - 1, Math.floor(h) - 1);
  }

  // ── DRAW FLOOR (checkered) ──
  function drawFloor(ox, oy, w, h, tileSize) {
    for (let ty = 0; ty < Math.ceil(h / tileSize); ty++) {
      for (let tx = 0; tx < Math.ceil(w / tileSize); tx++) {
        rect(ox + tx * tileSize, oy + ty * tileSize, tileSize, tileSize,
          (tx + ty) % 2 === 0 ? P.floorLight : P.floorDark);
      }
    }
  }

  // ── DRAW WALL (brick pattern) ──
  function drawWall(ox, oy, w, h) {
    rect(ox, oy, w, h, P.wallBrick);
    const bw = 12, bh = 6;
    for (let row = 0; row < Math.ceil(h / bh); row++) {
      const offset = (row % 2) * (bw / 2);
      for (let col = -1; col < Math.ceil(w / bw) + 1; col++) {
        const bx = ox + col * bw + offset;
        const by = oy + row * bh;
        // Brick variation
        const shade = Math.random() > 0.5 ? P.wallBrickLight : P.wallBrick;
        rect(bx + 0.5, by + 0.5, bw - 1, bh - 1, shade);
        // Mortar lines
        ctx.strokeStyle = P.wallBrickDark;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
  }

  // ── DESK WITH IMAC ──
  function drawDesk(x, y, w, h) {
    // Desk surface (top-down view — rectangular)
    rect(x, y, w, h, P.deskTop);
    rect(x, y + h - 3, w, 3, P.deskSide); // front edge shadow
    outline(x, y, w, h, P.woodDark, 1);

    // iMac monitor
    const mx = x + w * 0.35, my = y + 4;
    // Stand
    rect(mx + 8, my + 18, 4, 6, P.monitorStand);
    rect(mx + 4, my + 23, 12, 2, P.monitorStand);
    // Screen body
    rect(mx, my, 20, 18, P.monitorBody);
    rect(mx + 1, my + 1, 18, 14, P.monitorScreenOn);
    // Screen glare
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(mx + 2, my + 2, 6, 4);

    // Desk lamp (left side)
    rect(x + 4, y + 6, 2, 10, P.lampPole);
    rect(x + 1, y + 3, 8, 5, P.lampShade);
    // Lamp glow
    ctx.fillStyle = P.lampGlow;
    ctx.beginPath();
    ctx.arc(x + 5, y + 8, 12, 0, Math.PI * 2);
    ctx.fill();

    // Coffee mug (right of monitor)
    rect(x + w - 14, my + 12, 7, 8, P.mugBody);
    rect(x + w - 13, my + 13, 5, 5, P.mugCoffee);
    // Mug handle
    rect(x + w - 7, my + 14, 3, 4, P.mugBody);

    // Small plant on desk
    rect(x + w - 24, my + 10, 6, 6, P.plantPot);
    drawMiniPlant(x + w - 24, my + 5, 6);
  }

  function drawMiniPlant(x, y, w) {
    const cx = x + w / 2;
    ctx.fillStyle = P.plantGreen;
    // Simple leaf cluster
    ctx.beginPath();
    ctx.arc(cx, y + 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.plantDarkGreen;
    ctx.beginPath();
    ctx.arc(cx - 2, y + 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── DRAWERS / CABINET ──
  function drawCabinet(x, y, w, h) {
    rect(x, y, w, h, P.woodMed);
    outline(x, y, w, h, P.woodDark, 1);
    // Drawer lines
    const dh = h / 3;
    for (let i = 1; i < 3; i++) {
      rect(x + 1, y + i * dh, w - 2, 1, P.woodDark);
      // Drawer handle
      rect(x + w / 2 - 2, y + i * dh - 2, 4, 2, P.monitorStand);
    }
  }

  // ── BOOKSHELF ──
  function drawBookshelf(x, y, w, h) {
    // Shelf frame
    rect(x, y, w, h, P.shelfWood);
    outline(x, y, w, h, P.woodDark, 1);
    // Shelves
    const rows = 3;
    const rowH = (h - 4) / rows;
    const bookColors = [P.bookRed, P.bookBlue, P.bookGreen, P.bookYellow, P.bookRed, P.bookBlue, P.bookGreen];
    for (let r = 0; r < rows; r++) {
      const sy = y + 2 + r * rowH;
      rect(x + 1, sy + rowH - 2, w - 2, 2, P.woodDark); // shelf board
      // Books
      let bx = x + 3;
      for (let b = 0; b < 5 + Math.floor(Math.random() * 3); b++) {
        const bw = 3 + Math.floor(Math.random() * 3);
        const bh = rowH - 5;
        rect(bx, sy + 1, bw, bh, bookColors[(r * 5 + b) % bookColors.length]);
        bx += bw + 1;
        if (bx > x + w - 5) break;
      }
    }
  }

  // ── ARMCHAIR ──
  function drawArmchair(x, y) {
    const w = 28, h = 32;
    // Back
    rect(x + 2, y, w - 4, 8, P.armchairBody);
    // Seat
    rect(x, y + 6, w, h - 10, P.armchairBody);
    rect(x + 3, y + 8, w - 6, h - 16, P.armchairShadow);
    // Arms
    rect(x, y + 6, 4, h - 12, P.armchairBody);
    rect(x + w - 4, y + 6, 4, h - 12, P.armchairBody);
    // Cushion
    rect(x + w / 2 - 4, y + h / 2 - 2, 8, 8, P.chairSeat);
    outline(x, y, w, h - 4, P.woodMed, 0.5);
  }

  // ── COFFEE MACHINE ──
  function drawCoffeeMachine(x, y) {
    rect(x, y, 16, 20, P.coffeeMachineBody);
    rect(x + 1, y + 1, 14, 8, P.coffeeMachineTop);
    outline(x, y, 16, 20, '#4a5a68', 1);
    // Buttons
    rect(x + 3, y + 11, 3, 3, '#ff4444');
    rect(x + 8, y + 11, 3, 3, '#44ff44');
    // Cup slot
    rect(x + 4, y + 16, 8, 3, '#2a2a2a');
    // Steam
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + 6, y - 3, 2, 3);
    ctx.fillRect(x + 9, y - 5, 2, 4);
  }

  // ── FLOOR LAMP ──
  function drawFloorLamp(x, y) {
    // Pole
    rect(x + 4, y + 8, 2, 24, P.lampPole);
    // Base
    rect(x + 1, y + 30, 8, 3, P.lampPole);
    // Shade
    rect(x, y, 10, 10, P.lampShade);
    rect(x + 1, y + 1, 8, 8, '#f8e8a0');
    // Glow
    ctx.fillStyle = P.lampGlow;
    ctx.beginPath();
    ctx.arc(x + 5, y + 5, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── PLANT (larger, potted) ──
  function drawPlant(x, y) {
    // Pot
    rect(x + 2, y + 14, 12, 10, P.plantPot);
    rect(x + 1, y + 12, 14, 3, P.plantPot);
    outline(x + 2, y + 14, 12, 10, P.woodDark, 0.5);
    // Leaves
    ctx.fillStyle = P.plantGreen;
    ctx.beginPath(); ctx.arc(x + 8, y + 6, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.plantDarkGreen;
    ctx.beginPath(); ctx.arc(x + 5, y + 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 11, y + 3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a8a2a';
    ctx.beginPath(); ctx.arc(x + 8, y + 1, 4, 0, Math.PI * 2); ctx.fill();
  }

  // ── PICTURE FRAME ──
  function drawFrame(x, y, w, h, imgColor) {
    rect(x, y, w, h, P.woodMed);
    rect(x + 2, y + 2, w - 4, h - 4, imgColor || '#2a3a4a');
    outline(x, y, w, h, P.woodDark, 1);
  }

  // ── CAT ON BED ──
  function drawCatBed(x, y) {
    // Bed
    ctx.fillStyle = P.bedBeige;
    ctx.beginPath();
    ctx.ellipse(x + 14, y + 14, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = P.woodMed;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Cat (curled up)
    ctx.fillStyle = P.catGray;
    ctx.beginPath();
    ctx.ellipse(x + 14, y + 12, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cat head
    ctx.beginPath();
    ctx.arc(x + 8, y + 10, 4, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.fillStyle = P.catDark;
    ctx.fillRect(x + 5, y + 6, 2, 3);
    ctx.fillRect(x + 9, y + 6, 2, 3);
    // Stripes
    ctx.fillStyle = P.catDark;
    ctx.fillRect(x + 12, y + 9, 1, 4);
    ctx.fillRect(x + 15, y + 9, 1, 4);
    ctx.fillRect(x + 18, y + 10, 1, 3);
  }

  // ── AGENT CHARACTER (pixel sprite) ──
  function drawCharacter(x, y, color, status, hairIdx, facing) {
    const statusColors = {
      working: P.statusWorking,
      idle: P.statusIdle,
      sleeping: P.statusSleeping
    };

    if (status === 'sleeping') {
      // Sleeping: head on desk pose
      // Body (slumped)
      rect(x + 2, y + 6, 8, 8, color);
      // Head (face down)
      rect(x + 1, y + 2, 10, 6, P.skin);
      rect(x + 2, y, 8, 3, HAIR_COLORS[hairIdx % HAIR_COLORS.length]);
      // Zzz
      const bounce = Math.sin(frameCount * 0.05) * 2;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '7px monospace';
      ctx.fillText('z', x + 12, y - 2 + bounce);
      ctx.font = '5px monospace';
      ctx.fillText('z', x + 15, y - 5 + bounce * 0.7);
    } else {
      // Standing/sitting character
      // Hair
      rect(x + 2, y, 8, 3, HAIR_COLORS[hairIdx % HAIR_COLORS.length]);
      // Head
      rect(x + 2, y + 2, 8, 6, P.skin);
      // Eyes
      if (status === 'idle') {
        // Blinking sometimes
        const blink = Math.sin(frameCount * 0.03 + hairIdx * 2) > 0.9;
        if (!blink) {
          rect(x + 4, y + 4, 2, 2, '#1a1a1a');
          rect(x + 7, y + 4, 2, 2, '#1a1a1a');
        } else {
          rect(x + 4, y + 5, 2, 1, '#1a1a1a');
          rect(x + 7, y + 5, 2, 1, '#1a1a1a');
        }
      } else {
        rect(x + 4, y + 4, 2, 2, '#1a1a1a');
        rect(x + 7, y + 4, 2, 2, '#1a1a1a');
      }
      // Body (shirt = agent color)
      rect(x + 1, y + 8, 10, 8, color);
      // Arms
      if (status === 'working') {
        // Arms forward (typing)
        const armBounce = Math.sin(frameCount * 0.15 + hairIdx) > 0 ? 1 : 0;
        rect(x - 1, y + 9 + armBounce, 3, 5, color);
        rect(x + 10, y + 9 - armBounce, 3, 5, color);
        // Hands
        rect(x - 1, y + 13 + armBounce, 3, 2, P.skin);
        rect(x + 10, y + 13 - armBounce, 3, 2, P.skin);
      } else {
        // Arms at side
        rect(x - 1, y + 9, 3, 6, color);
        rect(x + 10, y + 9, 3, 6, color);
        rect(x - 1, y + 14, 3, 2, P.skin);
        rect(x + 10, y + 14, 3, 2, P.skin);
      }
    }

    // Status dot
    ctx.fillStyle = statusColors[status] || P.statusSleeping;
    ctx.beginPath();
    ctx.arc(x + 11, y - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // ── NAME TAG ──
  function drawNameTag(x, y, w, name) {
    const tw = ctx.measureText(name).width;
    const tagW = Math.max(tw + 10, 40);
    const tagX = x + w / 2 - tagW / 2;
    ctx.fillStyle = P.nameTagBg;
    roundRectFill(tagX, y, tagW, 14, 4);
    ctx.fillStyle = P.nameTagText;
    ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + w / 2, y + 7);
    ctx.textAlign = 'left';
  }

  function roundRectFill(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // ── DESK ROOM (bordered area with desk + character) ──
  function drawDeskRoom(rx, ry, rw, rh, agent, idx) {
    // Room border (like reference — cream border frames)
    rect(rx, ry, rw, rh, P.floorLight);
    outline(rx, ry, rw, rh, P.borderFrame, 2);
    outline(rx + 1, ry + 1, rw - 2, rh - 2, P.borderFrameLight, 1);

    // Floor inside room (checkered)
    drawFloor(rx + 3, ry + 3, rw - 6, rh - 6, 8);

    // Desk
    const dw = Math.min(rw * 0.65, 70), dh = Math.min(rh * 0.35, 30);
    const dx = rx + (rw - dw) / 2;
    const dy = ry + 12;
    drawDesk(dx, dy, dw, dh);

    // Chair (below desk)
    const chairX = dx + dw / 2 - 5;
    const chairY = dy + dh + 2;
    rect(chairX, chairY, 10, 8, P.chairSeat);
    rect(chairX + 1, chairY + 1, 8, 6, P.chairBack);

    // Character (sitting at desk)
    const charX = dx + dw / 2 - 6;
    const charY = dy + dh - 4;
    drawCharacter(charX, charY, agent.color || '#3b82f6', agent.status, idx, 'up');

    // Name tag at bottom of room
    drawNameTag(rx, ry + rh - 18, rw, agent.name);
  }

  // ── SHARED AREA (lounge) ──
  function drawLounge(x, y, w, h) {
    rect(x, y, w, h, P.floorLight);
    outline(x, y, w, h, P.borderFrame, 2);
    drawFloor(x + 3, y + 3, w - 6, h - 6, 8);

    // Armchair
    drawArmchair(x + 10, y + 15);
    // Coffee machine
    drawCoffeeMachine(x + w - 30, y + 12);
    // Plant
    drawPlant(x + w - 22, y + h - 30);
    // Cat bed
    drawCatBed(x + 8, y + h - 35);
  }

  // ── MAIN RENDER ──
  function render() {
    if (!canvas || !ctx) return;
    frameCount++;
    hitRegions = [];

    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background (wall area)
    drawWall(0, 0, cw, 50);

    // Floor
    drawFloor(0, 50, cw, ch - 50, 10);

    // Agent desk rooms in grid
    const cols = Math.max(2, Math.min(4, Math.floor(cw / 160)));
    const padding = 8;
    const roomW = Math.floor((cw - padding * (cols + 1)) / cols);
    const roomH = Math.min(140, Math.floor((ch - 100) / Math.ceil((agents.length + 1) / cols)));

    // Wall decorations
    if (cw > 300) {
      drawFrame(20, 8, 30, 24, '#2a2a2a');  // Poster
      drawFrame(cw - 80, 10, 22, 18, '#4a3a2a');  // Photo
      if (cw > 500) drawFrame(cw / 2 - 15, 8, 30, 22, '#1a3050');
    }

    // Draw bookshelf on wall
    drawBookshelf(cw - 50, 2, 40, 46);

    // Floor lamp near bookshelf
    drawFloorLamp(cw - 58, 10);

    // Draw agent rooms
    agents.forEach((agent, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rx = padding + col * (roomW + padding);
      const ry = 58 + row * (roomH + padding);
      drawDeskRoom(rx, ry, roomW, roomH, agent, i);
      hitRegions.push({ x: rx, y: ry, w: roomW, h: roomH, agentName: agent.name });
    });

    // Lounge / common area (if space allows)
    const agentRows = Math.ceil(agents.length / cols);
    const loungeY = 58 + agentRows * (roomH + padding) + padding;
    if (loungeY + 80 < ch) {
      const loungeW = Math.min(cw - padding * 2, 300);
      drawLounge(padding, loungeY, loungeW, Math.min(100, ch - loungeY - padding));
    }

    ctx.restore();
  }

  // ── RESIZE ──
  function resize() {
    if (!canvas || !canvas.parentElement) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    // Height: enough for all agent rooms + lounge
    const cols = Math.max(2, Math.min(4, Math.floor(w / 160)));
    const rows = Math.ceil((agents.length || 4) / cols);
    const roomH = Math.min(140, 120);
    const h = Math.max(400, 58 + rows * (roomH + 8) + 120);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // crisp pixel art!
    render();
  }

  // ── ANIMATION LOOP (low fps for pixel art — 8fps) ──
  function loop() {
    if (!initialized) return;
    render();
    animFrame = setTimeout(() => requestAnimationFrame(loop), 125); // 8 FPS
  }

  // ── PUBLIC API ──
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    initialized = true;

    // Click handler
    clickHandler = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left);
      const my = (e.clientY - rect.top);
      const hit = hitRegions.find(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
      if (hit && typeof window.openAgentDetail === 'function') window.openAgentDetail(hit.agentName);
    };
    canvas.addEventListener('click', clickHandler);

    window.addEventListener('resize', resize);
    resize();
    loop();
  }

  function updateAgents(newAgents) {
    agents = newAgents || [];
    if (initialized) resize(); // recalc layout
  }

  function destroy() {
    initialized = false;
    if (animFrame) { clearTimeout(animFrame); animFrame = null; }
    if (canvas && clickHandler) canvas.removeEventListener('click', clickHandler);
    window.removeEventListener('resize', resize);
  }

  return { init, updateAgents, destroy, render, resize };
})();
