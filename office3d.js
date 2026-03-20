// ===== AGENT SPACE — REAL 3D OFFICE (Three.js) =====
// Fresh minimal mesh-based office scene for the Office tab.
// Goal: reliable global attach + actual 3D characters/furniture.

(function () {
  let THREE = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  let container = null;
  let rafId = 0;
  let active = false;
  let initialized = false;
  let resizeHandler = null;
  let clockStart = 0;
  let agents3d = [];
  // Orbit state
  let orbitAngle = Math.PI / 4; // horizontal angle (radians) — 45° default
  let orbitPitch = 0.55;        // vertical pitch (0.2 - 1.2) — slightly lower for better spread
  let orbitDist = 24;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartAngle = 0, dragStartPitch = 0;
  let dragMoved = false;
  // Speech bubble sprites
  let bubbleSprites = [];
  let deskGroups = [];       // persistent desk meshes (not rebuilt on agent update)
  let roomPropsBuilt = false;
  let orbitCleanup = null;   // function to remove orbit event listeners
  let particleSystem = null; // ambient floating particles
  let screenCanvases = [];   // CanvasTexture data for monitor content
  let nameplates = [];       // persistent nameplate meshes (cleaned on agent update)
  let ambientLight = null;   // ref for day/night cycle
  let dirLight = null;       // ref for day/night cycle
  const CODE_LINES = [
    'const agent = await spawn({',
    '  model: "claude-opus",',
    '  task: "fix auth flow"',
    '});',
    'if (status === "working") {',
    '  await processQueue();',
    '  metrics.record(task);',
    '}',
    'function heartbeat() {',
    '  return { ok: true, ts: Date.now() };',
    '}',
    'export async function run() {',
    '  const result = await llm.chat(msgs);',
    '  return result.content;',
    '}',
    'await db.put("state", { done: true });',
    'logger.info("task complete");',
  ];
  let screenMeshes = [];     // monitor screens for flicker effect
  let themeObserver = null;  // MutationObserver for theme changes
  let wallClockData = null;  // wall clock canvas/texture/mesh
  let keyParticles = [];     // typing spark particles per agent
  let sparkGeoShared = null; // shared geometry for typing sparks
  let sparkMatShared = null; // shared material for typing sparks
  let waterCoolerPos = { x: -18, z: 18 }; // water cooler gathering spot
  let raycaster = null;
  let mouse = new Float32Array(2); // reusable
  let selectedAgent = null;  // currently inspected agent
  let inspectPanel = null;   // DOM overlay for agent details
  let hoveredAgentIdx = -1;  // index of currently hovered agent (-1 = none)
  let hoverGlowTime = 0;    // animation time for glow pulse
  let miniMapPanel = null;   // agent list sidebar

  const FLOOR_W = 60;
  const FLOOR_D = 44;
  const DESK_LAYOUT = [
    // back row (5 desks) — wider spread
    [-22, -16], [-11, -16], [0, -16], [11, -16], [22, -16],
    // middle row (5 desks)
    [-22, -2], [-11, -2], [0, -2], [11, -2], [22, -2],
    // right-side leadership strip (3 desks)
    [26, -12], [26, 0], [26, 12],
    // front row (4 desks)
    [-22, 12], [-11, 12], [11, 12], [22, 12],
  ];

  function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse(function (child) {
      if (child.geometry && child.geometry !== sparkGeoShared) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(function (m) {
          if (m === sparkMatShared) return; // don't dispose shared material
          if (m.map) m.map.dispose();
          if (m.lightMap) m.lightMap.dispose();
          if (m.emissiveMap) m.emissiveMap.dispose();
          m.dispose();
        });
      }
    });
  }

  function clearScene() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    agents3d.forEach(function (a) { disposeObject3D(a.group); });
    agents3d = [];
    deskGroups.forEach(function (g) { disposeObject3D(g); });
    deskGroups = [];
    nameplates = [];
    roomPropsBuilt = false;
    particleSystem = null;
    screenMeshes = [];
    screenCanvases = [];
    hideInspectPanel();
    if (orbitCleanup) { orbitCleanup(); orbitCleanup = null; }
    if (renderer) {
      try { renderer.dispose(); } catch (e) {}
      try { renderer.domElement && renderer.domElement.remove(); } catch (e) {}
    }
    scene = null;
    camera = null;
    renderer = null;
  }

  async function loadThree() {
    if (THREE) return THREE;
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');
    return THREE;
  }

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents');
      const json = await res.json();
      return Array.isArray(json.agents) ? json.agents : [];
    } catch (e) {
      return [];
    }
  }

  function makeFloor() {
    // Use InstancedMesh for massive perf gain (~2300 meshes → 2)
    const geo = new THREE.BoxGeometry(2, 0.12, 2);
    const matA = new THREE.MeshStandardMaterial({ color: 0xc99563, roughness: 0.96 });
    const matB = new THREE.MeshStandardMaterial({ color: 0xb9814f, roughness: 0.96 });
    const tilesX = Math.ceil(FLOOR_W / 2);
    const tilesZ = Math.ceil(FLOOR_D / 2);
    const half = Math.floor(tilesX * tilesZ / 2) + 1;
    const instA = new THREE.InstancedMesh(geo, matA, half);
    const instB = new THREE.InstancedMesh(geo, matB, half);
    instA.receiveShadow = true;
    instB.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let iA = 0, iB = 0;
    for (let x = -FLOOR_W / 2; x < FLOOR_W / 2; x += 2) {
      for (let z = -FLOOR_D / 2; z < FLOOR_D / 2; z += 2) {
        dummy.position.set(x + 1, 0, z + 1);
        dummy.updateMatrix();
        const even = (((x + z) / 2) % 2) === 0;
        if (even) { instA.setMatrixAt(iA++, dummy.matrix); }
        else { instB.setMatrixAt(iB++, dummy.matrix); }
      }
    }
    instA.count = iA;
    instB.count = iB;
    scene.add(instA);
    scene.add(instB);
  }

  function makeWalls() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9c4a4, roughness: 1 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_W, 6, 0.5), mat);
    back.position.set(0, 3, -FLOOR_D / 2);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, FLOOR_D), mat);
    left.position.set(-FLOOR_W / 2, 3, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, FLOOR_D), mat);
    right.position.set(FLOOR_W / 2, 3, 0);
    // Front wall with gap for "entrance"
    const frontL = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_W * 0.35, 6, 0.5), mat);
    frontL.position.set(-FLOOR_W * 0.325, 3, FLOOR_D / 2);
    const frontR = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_W * 0.35, 6, 0.5), mat);
    frontR.position.set(FLOOR_W * 0.325, 3, FLOOR_D / 2);
    scene.add(back); scene.add(left); scene.add(right); scene.add(frontL); scene.add(frontR);
  }

  function makeBookshelf(x, z, tone) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: tone || 0x6b4f2a, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.3, 0.7), wood);
    body.position.y = 1.65;
    g.add(body);
    const colors = [0xdc2626, 0x2563eb, 0xf59e0b, 0x16a34a, 0x9333ea, 0xec4899];
    for (let i = 0; i < 12; i++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.48 + (i % 3) * 0.06, 0.18),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.88 })
      );
      book.position.set(-0.82 + (i % 4) * 0.48, 0.65 + Math.floor(i / 4) * 0.92, 0.2);
      g.add(book);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function makePlant(x, z, scale) {
    const g = new THREE.Group();
    const s = scale || 1;
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * s, 0.24 * s, 0.32 * s, 10),
      new THREE.MeshStandardMaterial({ color: 0x8b5a32, roughness: 0.92 })
    );
    pot.position.y = 0.16 * s;
    g.add(pot);
    [[0,0.52,0,0.28],[0.18,0.48,0.08,0.2],[-0.18,0.5,-0.06,0.2]].forEach(([px,py,pz,r]) => {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(r * s, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x49a166, roughness: 0.9 })
      );
      leaf.position.set(px * s, py * s, pz * s);
      g.add(leaf);
    });
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function makeCoffeeArea(x, z) {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1), new THREE.MeshStandardMaterial({ color: 0x8a5d33, roughness: 0.9 }));
    counter.position.set(0, 0.55, 0);
    g.add(counter);
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.48), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.55 }));
    machine.position.set(-0.5, 1.1, -0.12);
    g.add(machine);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1 }));
    light.position.set(-0.5, 1.13, 0.14);
    g.add(light);
    for (let i = 0; i < 3; i++) {
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0xf2eadf }));
      mug.position.set(0.15 + i * 0.23, 1.18, -0.12 + (i % 2) * 0.08);
      g.add(mug);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function makeServerRack(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.8, 1.1), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.55, metalness: 0.25 }));
    body.position.y = 1.9;
    g.add(body);
    for (let i = 0; i < 5; i++) {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.36, 0.05), new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.72 }));
      bay.position.set(0, 0.7 + i * 0.55, 0.55);
      g.add(bay);
      const ledColor = i % 2 ? 0x22c55e : 0x60a5fa;
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: ledColor, emissive: ledColor, emissiveIntensity: 0.8 }));
      led.position.set(0.38, 0.7 + i * 0.55, 0.59);
      g.add(led);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }

  function makePoster(x, y, z, label, colorA, colorB) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5b4632';
    ctx.fillRect(0, 0, 128, 160);
    const grad = ctx.createLinearGradient(0, 0, 128, 160);
    grad.addColorStop(0, '#' + colorA.toString(16).padStart(6, '0'));
    grad.addColorStop(1, '#' + colorB.toString(16).padStart(6, '0'));
    ctx.fillStyle = grad;
    ctx.fillRect(8, 8, 112, 144);
    ctx.fillStyle = 'rgba(255,245,220,0.92)';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(label, 24, 86);
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(x, y, z);
    scene.add(mesh);
  }

  function makeDesk(x, z, idx) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: idx % 2 ? 0x8a5d33 : 0x9a6a3c, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x5d3b20, roughness: 0.9 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 1.5), wood);
    top.position.set(0, 1.35, 0);
    g.add(top);
    [[-1.18,-0.62],[1.18,-0.62],[-1.18,0.62],[1.18,0.62]].forEach(([dx,dz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), dark);
      leg.position.set(dx, 0.65, dz);
      g.add(leg);
    });
    // Screen with dynamic canvas texture
    const scrCanvas = document.createElement('canvas');
    scrCanvas.width = 256; scrCanvas.height = 176;
    const scrCtx = scrCanvas.getContext('2d');
    scrCtx.fillStyle = '#1a1a2e'; scrCtx.fillRect(0,0,256,176);
    const scrTex = new THREE.CanvasTexture(scrCanvas);
    scrTex.minFilter = THREE.LinearFilter;
    const scrMat = new THREE.MeshStandardMaterial({ map: scrTex, emissive: 0x2d6cdf, emissiveIntensity: 0.35 });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.62, 0.06), scrMat);
    screen.position.set(0, 1.82, -0.22);
    screen.userData = { deskIdx: idx };
    g.add(screen);
    screenMeshes.push(screen);
    screenCanvases[idx] = { canvas: scrCanvas, ctx: scrCtx, tex: scrTex, scrollOffset: Math.random() * CODE_LINES.length | 0 };
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), dark);
    stand.position.set(0, 1.52, -0.22);
    g.add(stand);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0xf1eadc }));
    mug.position.set(0.78, 1.34, 0.15);
    g.add(mug);
    const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), dark);
    lampPole.position.set(-0.82, 1.42, 0.2);
    g.add(lampPole);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xffd175, emissive: 0xffd175, emissiveIntensity: 0.2 }));
    lampShade.position.set(-0.82, 1.67, 0.2);
    lampShade.rotation.x = Math.PI;
    g.add(lampShade);
    const plantPot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0x8b5a32 }));
    plantPot.position.set(0.92, 1.34, -0.24);
    g.add(plantPot);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4aa56b, roughness: 0.9 }));
    plant.position.set(0.92, 1.52, -0.24);
    g.add(plant);
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.14, 0.82), new THREE.MeshStandardMaterial({ color: 0x3e5f98, roughness: 0.8 }));
    chairSeat.position.set(0, 0.8, 1.22);
    g.add(chairSeat);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.84, 0.12), new THREE.MeshStandardMaterial({ color: 0x355184, roughness: 0.8 }));
    chairBack.position.set(0, 1.22, 1.54);
    g.add(chairBack);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function makeLabel(name, status) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    // Background pill
    const w = 400, h = 72, r = 12, x0 = 56, y0 = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0); ctx.lineTo(x0 + w - r, y0);
    ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); ctx.lineTo(x0 + w, y0 + h - r);
    ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); ctx.lineTo(x0 + r, y0 + h);
    ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); ctx.lineTo(x0, y0 + r);
    ctx.quadraticCurveTo(x0, y0, x0 + r, y0); ctx.fill();
    // Status dot
    const sLower = String(status || '').toLowerCase();
    const dotColor = sLower.includes('work') ? '#22c55e' : sLower.includes('sleep') ? '#94a3b8' : '#facc15';
    ctx.fillStyle = dotColor;
    ctx.beginPath(); ctx.arc(82, y0 + h / 2, 10, 0, Math.PI * 2); ctx.fill();
    // Name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px system-ui';
    ctx.fillText(String(name || 'Agent').slice(0, 16), 100, y0 + 32);
    // Status line
    if (status) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px system-ui';
      ctx.fillText(String(status).slice(0, 24), 100, y0 + 58);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(5.5, 1.38, 1);
    return sprite;
  }

  function makeSpeechBubble(text) {
    if (!text) return null;
    // Clean up text — remove markdown, reply markers, truncate meaningfully
    let cleanText = text.replace(/\[\[.*?\]\]/g, '').replace(/[#*_`]/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    // Bubble background with shadow
    const bw = 480, bh = 110, br = 20, bx = 16, by = 4;
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(ctx, bx + 3, by + 3, bw, bh, br); ctx.fill();
    // Main bubble
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    roundRect(ctx, bx, by, bw, bh, br); ctx.fill();
    // Tail triangle
    ctx.beginPath(); ctx.moveTo(56, by + bh); ctx.lineTo(38, by + bh + 28); ctx.lineTo(82, by + bh); ctx.fill();
    // Shadow on tail
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(59, by + bh + 2); ctx.lineTo(41, by + bh + 30); ctx.lineTo(85, by + bh + 2); ctx.fill();
    // Subtle border
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, bw, bh, br); ctx.stroke();
    // Typing dots indicator (three animated-looking dots)
    ctx.fillStyle = '#a3a3a3';
    [0, 1, 2].forEach(di => {
      ctx.beginPath();
      ctx.arc(bx + 30 + di * 18, by + bh - 18, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // Text — word-wrapped, larger font
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px system-ui';
    const maxW = bw - 32;
    const words = cleanText.split(' ');
    let lines = [], currentLine = '';
    words.forEach(w => {
      const test = currentLine ? currentLine + ' ' + w : w;
      if (ctx.measureText(test).width > maxW) {
        if (currentLine) lines.push(currentLine);
        currentLine = w;
      } else { currentLine = test; }
    });
    if (currentLine) lines.push(currentLine);
    // Max 3 lines
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].slice(0, -1) + '…'; }
    lines.forEach((line, li) => {
      ctx.fillText(line, bx + 16, by + 28 + li * 24);
    });
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(7, 2.2, 1);
    return sprite;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function makeAgent(agent, idx, x, z) {
    const g = new THREE.Group();
    const shirtPalette = [0x4f7cff,0x22a06b,0xb45309,0x9333ea,0xdc2626,0x0891b2,0x64748b,0xbe185d];
    const hairPalette = [0x2b1d14,0x6b4423,0xc5964f,0x111827,0x7c2d12,0x374151];
    const skinPalette = [0xf2c79b,0xe8b88a,0xd4a574,0xc49060,0xa67850,0x8d6040];
    const shirt = shirtPalette[idx % shirtPalette.length];
    const hair = hairPalette[idx % hairPalette.length];
    const skin = skinPalette[idx % skinPalette.length];
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.82 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.86 });

    // Body — slightly rounded with cylinder
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.9, 12), shirtMat);
    body.position.set(0, 1.2, 0); g.add(body);
    // Head — round sphere instead of box
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 14), skinMat);
    head.position.set(0, 1.92, 0.03); g.add(head);
    // Hair — rounded cap
    const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairCap.position.set(0, 1.98, 0.01); g.add(hairCap);
    // Hair back tuft for variety
    if (idx % 3 === 0) {
      const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.2), hairMat);
      tuft.position.set(0, 2.22, -0.08); g.add(tuft);
    }
    // Eyes — white sclera + dark pupil
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), eyeWhiteMat);
    eyeL.position.set(-0.12, 1.94, 0.28); g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), eyeWhiteMat);
    eyeR.position.set(0.12, 1.94, 0.28); g.add(eyeR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), pupilMat);
    pupilL.position.set(-0.12, 1.94, 0.34); g.add(pupilL);
    const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), pupilMat);
    pupilR.position.set(0.12, 1.94, 0.34); g.add(pupilR);
    // Mouth — tiny curved line (mesh)
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xc97070, roughness: 0.8 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.02), mouthMat);
    mouth.position.set(0, 1.82, 0.32); g.add(mouth);
    // Arms — rounded
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.62, 8), shirtMat);
    armL.position.set(-0.44, 1.18, 0); g.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.62, 8), shirtMat);
    armR.position.set(0.44, 1.18, 0); g.add(armR);
    // Hands — small spheres
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
    handL.position.set(-0.44, 0.85, 0); g.add(handL);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
    handR.position.set(0.44, 0.85, 0); g.add(handR);
    // Legs — dark pants
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.58, 8), legMat);
    legL.position.set(-0.15, 0.56, 0); g.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.58, 8), legMat);
    legR.position.set(0.15, 0.56, 0); g.add(legR);
    // Shoes — tiny dark boxes
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), shoeMat);
    shoeL.position.set(-0.15, 0.24, 0.03); g.add(shoeL);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), shoeMat);
    shoeR.position.set(0.15, 0.24, 0.03); g.add(shoeR);

    const label = makeLabel(agent.name, agent.status);
    label.position.set(0, 2.85, 0); g.add(label);

    // Status indicator sprites (Zzz for sleeping, speech bubble for working)
    let bubble = null;
    let statusSprites = [];
    const statusLower = String(agent.status || '').toLowerCase();
    const taskText = agent.currentTask || agent.lastMessage || '';
    if (taskText && statusLower.includes('work')) {
      bubble = makeSpeechBubble(taskText);
      if (bubble) { bubble.position.set(0, 4.2, 0); g.add(bubble); }
    }
    // Floating Zzz for sleeping agents
    if (statusLower.includes('sleep')) {
      const zChars = ['Z', 'z', 'Z'];
      zChars.forEach((ch, zi) => {
        const zCanvas = document.createElement('canvas');
        zCanvas.width = 64; zCanvas.height = 64;
        const zCtx = zCanvas.getContext('2d');
        zCtx.fillStyle = zi === 0 ? '#94a3b8' : zi === 1 ? '#64748b' : '#475569';
        zCtx.font = (zi === 0 ? 'bold 38px' : zi === 1 ? 'bold 28px' : 'bold 20px') + ' system-ui';
        zCtx.textAlign = 'center';
        zCtx.fillText(ch, 32, 44);
        const zTex = new THREE.CanvasTexture(zCanvas);
        const zMat = new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false, opacity: 0.8 });
        const zSprite = new THREE.Sprite(zMat);
        zSprite.scale.set(0.6 - zi * 0.12, 0.6 - zi * 0.12, 1);
        zSprite.position.set(0.3 + zi * 0.25, 2.8 + zi * 0.45, 0.2);
        zSprite.userData._zIdx = zi; // for animation
        g.add(zSprite);
        statusSprites.push(zSprite);
      });
    }

    g.position.set(x, 0, z + 0.65);
    // Invisible hit box for click detection
    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.5, 2.2), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.position.set(0, 1.5, 0);
    hitBox.userData.isHitBox = true;
    g.add(hitBox);
    scene.add(g);
    agents3d.push({ agent, idx, group: g, body, head, armL, armR, handL, handR, legL, legR, shoeL, shoeR, eyeL, eyeR, pupilL, pupilR, mouth, label, bubble, statusSprites, baseX: x, baseZ: z + 0.65 });
  }

  function makeNameplate(name, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2c1e10';
    const r = 6, w = 240, h = 48, x0 = 8, y0 = 8;
    ctx.beginPath();
    ctx.moveTo(x0+r,y0); ctx.lineTo(x0+w-r,y0); ctx.quadraticCurveTo(x0+w,y0,x0+w,y0+r);
    ctx.lineTo(x0+w,y0+h-r); ctx.quadraticCurveTo(x0+w,y0+h,x0+w-r,y0+h);
    ctx.lineTo(x0+r,y0+h); ctx.quadraticCurveTo(x0,y0+h,x0,y0+h-r);
    ctx.lineTo(x0,y0+r); ctx.quadraticCurveTo(x0,y0,x0+r,y0); ctx.fill();
    ctx.fillStyle = '#f5e6c8';
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(String(name || 'Agent').slice(0, 14), 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.45),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 1.44, z + 0.45);
    scene.add(mesh);
    return mesh;
  }

  function makeParticles() {
    const count = 60;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i*3] = (Math.random() - 0.5) * FLOOR_W;
      positions[i*3+1] = 1 + Math.random() * 5;
      positions[i*3+2] = (Math.random() - 0.5) * FLOOR_D;
      velocities.push({ vx: (Math.random()-0.5)*0.02, vy: 0.005 + Math.random()*0.01, vz: (Math.random()-0.5)*0.02 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffd97a, size: 0.18, transparent: true, opacity: 0.5, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    particleSystem = { points, geo, velocities };
  }

  function buildMiniMap(data) {
    if (miniMapPanel) miniMapPanel.remove();
    if (!container) return;
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) return;
    const panel = document.createElement('div');
    panel.id = 'office3d-minimap';
    panel.style.cssText = 'position:absolute;top:12px;left:12px;width:180px;max-height:calc(100% - 24px);overflow-y:auto;background:var(--card-bg,rgba(20,20,40,0.88));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:10px;padding:8px 6px;z-index:15;backdrop-filter:blur(6px);font-size:12px;scrollbar-width:thin';
    // Hide minimap on very small screens
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      panel.style.width = '140px';
      panel.style.fontSize = '11px';
      panel.style.padding = '6px 4px';
      panel.style.maxHeight = '40px';
      panel.style.overflow = 'hidden';
      panel.style.cursor = 'pointer';
      panel.dataset.collapsed = 'true';
      panel.addEventListener('click', (e) => {
        if (e.target.closest('[data-agent-click]')) return;
        const collapsed = panel.dataset.collapsed === 'true';
        panel.dataset.collapsed = collapsed ? 'false' : 'true';
        panel.style.maxHeight = collapsed ? 'calc(100% - 24px)' : '40px';
        panel.style.overflow = collapsed ? 'auto' : 'hidden';
      });
    }
    let html = '<div style="font-weight:700;font-size:11px;color:var(--text-secondary,#94a3b8);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Agents</div>';
    list.forEach(function(a, i) {
      const s = String(a.status || 'idle').toLowerCase();
      const color = s.includes('work') ? '#22c55e' : s.includes('sleep') ? '#64748b' : '#facc15';
      html += '<div class="minimap-row" data-idx="' + i + '" style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;transition:background .15s">' +
        '<span style="width:7px;height:7px;min-width:7px;border-radius:50%;background:' + color + '"></span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary,#e2e8f0)">' + (a.name || 'Agent') + '</span>' +
        '</div>';
    });
    panel.innerHTML = html;
    // Add hover style
    if (!document.getElementById('office3d-minimap-style')) {
      const s = document.createElement('style');
      s.id = 'office3d-minimap-style';
      s.textContent = '.minimap-row:hover{background:rgba(255,255,255,0.08)}';
      document.head.appendChild(s);
    }
    // Click to focus camera on agent
    panel.addEventListener('click', function(e) {
      const row = e.target.closest('.minimap-row');
      if (!row) return;
      const idx = parseInt(row.dataset.idx, 10);
      if (agents3d[idx]) showInspectPanel(agents3d[idx].agent);
    });
    // Hover to highlight
    panel.addEventListener('mouseenter', function(e) {
      const row = e.target.closest && e.target.closest('.minimap-row');
      if (row) hoveredAgentIdx = parseInt(row.dataset.idx, 10);
    }, true);
    panel.addEventListener('mouseleave', function() { hoveredAgentIdx = -1; }, true);
    container.style.position = 'relative';
    container.appendChild(panel);
    miniMapPanel = panel;
  }

  function showInspectPanel(agentData) {
    hideInspectPanel();
    selectedAgent = agentData;
    const panel = document.createElement('div');
    panel.id = 'office3d-inspect';
    const status = String(agentData.status || 'idle').toLowerCase();
    const dotColor = status.includes('work') ? '#22c55e' : status.includes('sleep') ? '#94a3b8' : '#facc15';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="width:12px;height:12px;border-radius:50%;background:${dotColor};display:inline-block"></span>
        <span style="font-size:18px;font-weight:700;color:var(--text-primary,#fff)">${agentData.name || 'Agent'}</span>
        <span style="font-size:12px;color:var(--text-secondary,#94a3b8);margin-left:auto">${agentData.status || 'idle'}</span>
      </div>
      <div style="font-size:13px;color:var(--text-secondary,#bbb);line-height:1.5">
        ${agentData.currentTask ? `<div><b>Task:</b> ${agentData.currentTask}</div>` : ''}
        ${agentData.lastMessage ? `<div style="margin-top:4px"><b>Last:</b> ${String(agentData.lastMessage).slice(0,120)}</div>` : ''}
        ${agentData.model ? `<div style="margin-top:4px"><b>Model:</b> ${agentData.model}</div>` : ''}
        ${agentData.uptime ? `<div style="margin-top:4px"><b>Uptime:</b> ${agentData.uptime}</div>` : ''}
        ${agentData.kind ? `<div style="margin-top:4px"><b>Kind:</b> ${agentData.kind}</div>` : ''}
      </div>
      <button id="office3d-inspect-close" style="position:absolute;top:8px;right:10px;background:none;border:none;color:var(--text-secondary,#aaa);font-size:18px;cursor:pointer">&times;</button>
    `;
    panel.style.cssText = 'position:absolute;bottom:16px;right:16px;width:280px;max-width:90%;background:var(--card-bg,rgba(30,30,50,0.95));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:12px;padding:16px;z-index:20;box-shadow:0 8px 32px rgba(0,0,0,0.4);backdrop-filter:blur(8px);animation:office3d-fadein .2s ease';
    if (!document.getElementById('office3d-inspect-style')) {
      const s = document.createElement('style');
      s.id = 'office3d-inspect-style';
      s.textContent = '@keyframes office3d-fadein{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(s);
    }
    container.style.position = 'relative';
    container.appendChild(panel);
    inspectPanel = panel;
    panel.querySelector('#office3d-inspect-close').onclick = hideInspectPanel;
  }

  function hideInspectPanel() {
    if (inspectPanel) { inspectPanel.remove(); inspectPanel = null; }
    selectedAgent = null;
  }

  function onCanvasClick(e) {
    if (!renderer || !camera || !scene || dragMoved) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (!raycaster) raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x, y }, camera);
    // Check intersection with all agent groups
    for (let i = 0; i < agents3d.length; i++) {
      const a = agents3d[i];
      const hits = raycaster.intersectObjects(a.group.children, true);
      if (hits.length > 0) {
        showInspectPanel(a.agent);
        return;
      }
    }
    // Clicked empty space — close panel
    hideInspectPanel();
  }

  function populateAgents(data) {
    // Dispose old agent figures only (desks are persistent)
    agents3d.forEach(function (a) {
      // Clean up typing sparks
      if (a._typingSparks) {
        a._typingSparks.forEach(function(sp) { a.group.remove(sp); sp.material.dispose(); });
        a._typingSparks = [];
      }
      a._glowMeshes = null;
      disposeObject3D(a.group); scene.remove(a.group);
    });
    agents3d = [];
    // Dispose old nameplates
    nameplates.forEach(function (m) { disposeObject3D(m); scene.remove(m); });
    nameplates = [];
    const list = Array.isArray(data) ? data : [];
    list.slice(0, DESK_LAYOUT.length).forEach((agent, idx) => {
      const pos = DESK_LAYOUT[idx];
      // Build desk once
      if (!deskGroups[idx]) {
        deskGroups[idx] = makeDesk(pos[0], pos[1], idx);
      }
      const np = makeNameplate(agent.name, pos[0], pos[1]);
      if (np) nameplates.push(np);
      makeAgent(agent, idx, pos[0], pos[1]);
    });
    buildMiniMap(list);
  }

  function makeWhiteboard(x, z, facing, agentsData) {
    // Kanban-style whiteboard mounted on wall
    const g = new THREE.Group();
    // Board body
    const boardW = 8, boardH = 4;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(boardW, boardH, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 })
    );
    board.position.y = 3.2;
    g.add(board);
    // Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.3 });
    [[0, boardH/2 + 0.08, boardW, 0.16], [0, -boardH/2 - 0.08, boardW, 0.16],
     [-boardW/2 - 0.08, 0, 0.16, boardH + 0.32], [boardW/2 + 0.08, 0, 0.16, boardH + 0.32]].forEach(([fx, fy, fw, fh]) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.18), frameMat);
      strip.position.set(fx, 3.2 + fy, 0);
      g.add(strip);
    });
    // Kanban columns drawn via CanvasTexture
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 512, 256);
    // Column headers
    const cols = ['TO DO', 'IN PROGRESS', 'DONE'];
    const colW = 170;
    cols.forEach((label, ci) => {
      const cx = ci * colW + 4;
      // Header
      ctx.fillStyle = ci === 0 ? '#ef4444' : ci === 1 ? '#f59e0b' : '#22c55e';
      ctx.fillRect(cx, 4, colW - 8, 28);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui';
      ctx.fillText(label, cx + 8, 22);
      // Divider
      if (ci > 0) { ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 2, 0); ctx.lineTo(cx - 2, 256); ctx.stroke(); }
    });
    // Sticky notes from agent data
    const list = Array.isArray(agentsData) ? agentsData : [];
    let todoY = 38, progY = 38, doneY = 38;
    const stickyColors = ['#fef3c7', '#dbeafe', '#fce7f3', '#d1fae5', '#ede9fe'];
    list.slice(0, 12).forEach((a, i) => {
      const s = String(a.status || '').toLowerCase();
      let col, yRef;
      if (s.includes('work')) { col = 1; yRef = progY; progY += 32; }
      else if (s.includes('done') || s.includes('complet')) { col = 2; yRef = doneY; doneY += 32; }
      else { col = 0; yRef = todoY; todoY += 32; }
      if (yRef > 220) return; // overflow
      const sx = col * colW + 8;
      ctx.fillStyle = stickyColors[i % stickyColors.length];
      ctx.fillRect(sx, yRef, colW - 16, 26);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.strokeRect(sx, yRef, colW - 16, 26);
      ctx.fillStyle = '#1e293b'; ctx.font = 'bold 11px system-ui';
      ctx.fillText(String(a.name || 'Agent').slice(0, 12), sx + 4, yRef + 12);
      // Show task snippet
      const taskSnip = String(a.lastMessage || a.currentTask || '').replace(/\[\[.*?\]\]/g,'').replace(/[#*_`]/g,'').trim().slice(0, 20);
      if (taskSnip) {
        ctx.fillStyle = '#64748b'; ctx.font = '9px system-ui';
        ctx.fillText(taskSnip, sx + 4, yRef + 22);
      }
    });
    const tex = new THREE.CanvasTexture(canvas);
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(boardW - 0.3, boardH - 0.3),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    overlay.position.set(0, 3.2, 0.09);
    g.add(overlay);
    // Position and rotate based on facing wall
    g.position.set(x, 0, z);
    if (facing === 'back') { /* default, facing +z */ }
    else if (facing === 'left') { g.rotation.y = Math.PI / 2; }
    else if (facing === 'right') { g.rotation.y = -Math.PI / 2; }
    scene.add(g);
    return { group: g, canvas, ctx, tex, overlay };
  }

  let whiteboardData = null; // for live updates

  function updateWhiteboardContent(agentsData) {
    if (!whiteboardData) return;
    const { canvas, ctx, tex } = whiteboardData;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 512, 256);
    const cols = ['TO DO', 'IN PROGRESS', 'DONE'];
    const colW = 170;
    cols.forEach((label, ci) => {
      const cx = ci * colW + 4;
      ctx.fillStyle = ci === 0 ? '#ef4444' : ci === 1 ? '#f59e0b' : '#22c55e';
      ctx.fillRect(cx, 4, colW - 8, 28);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui';
      ctx.fillText(label, cx + 8, 22);
      if (ci > 0) { ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 2, 0); ctx.lineTo(cx - 2, 256); ctx.stroke(); }
    });
    const list = Array.isArray(agentsData) ? agentsData : [];
    let todoY = 38, progY = 38, doneY = 38;
    const stickyColors = ['#fef3c7', '#dbeafe', '#fce7f3', '#d1fae5', '#ede9fe'];
    list.slice(0, 12).forEach((a, i) => {
      const s = String(a.status || '').toLowerCase();
      let col, yRef;
      if (s.includes('work')) { col = 1; yRef = progY; progY += 32; }
      else if (s.includes('done') || s.includes('complet')) { col = 2; yRef = doneY; doneY += 32; }
      else { col = 0; yRef = todoY; todoY += 32; }
      if (yRef > 220) return;
      const sx = col * colW + 8;
      ctx.fillStyle = stickyColors[i % stickyColors.length];
      ctx.fillRect(sx, yRef, colW - 16, 26);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.strokeRect(sx, yRef, colW - 16, 26);
      ctx.fillStyle = '#1e293b'; ctx.font = 'bold 11px system-ui';
      ctx.fillText(String(a.name || 'Agent').slice(0, 12), sx + 4, yRef + 12);
      const taskSnip = String(a.lastMessage || a.currentTask || '').replace(/\[\[.*?\]\]/g,'').replace(/[#*_`]/g,'').trim().slice(0, 20);
      if (taskSnip) {
        ctx.fillStyle = '#64748b'; ctx.font = '9px system-ui';
        ctx.fillText(taskSnip, sx + 4, yRef + 22);
      }
    });
    tex.needsUpdate = true;
  }

  function makeWallClock(x, y, z) {
    const g = new THREE.Group();
    // Clock face
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 32),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    face.position.z = 0.08;
    g.add(face);
    // Frame ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.6, 32),
      new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.7 })
    );
    ring.position.z = 0.05;
    g.add(ring);
    g.position.set(x, y, z);
    scene.add(g);
    wallClockData = { canvas, ctx: canvas.getContext('2d'), tex, mesh: face };
    updateWallClock();
  }

  function updateWallClock() {
    if (!wallClockData) return;
    const { canvas, ctx, tex } = wallClockData;
    const w = 256, cx = 128, cy = 128, r = 110;
    ctx.clearRect(0, 0, w, w);
    // Face
    ctx.fillStyle = '#faf5eb'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Hour marks
    ctx.strokeStyle = '#2c1e10'; ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
      ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); ctx.stroke();
    }
    // Numbers
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(String(i), cx + Math.cos(a) * (r - 28), cy + Math.sin(a) * (r - 28));
    }
    // Hands
    const now = new Date();
    const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
    // Hour hand
    const ha = ((h + m / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * 55, cy + Math.sin(ha) * 55); ctx.stroke();
    // Minute hand
    const ma = ((m + s / 60) / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ma) * 80, cy + Math.sin(ma) * 80); ctx.stroke();
    // Second hand
    const sa = (s / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sa) * 85, cy + Math.sin(sa) * 85); ctx.stroke();
    // Center dot
    ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    tex.needsUpdate = true;
  }

  function makeWaterCooler(x, z) {
    const g = new THREE.Group();
    // Base/body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.4, metalness: 0.2 })
    );
    body.position.y = 0.85;
    g.add(body);
    // Water jug on top
    const jug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.7, 12),
      new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.2, transparent: true, opacity: 0.65 })
    );
    jug.position.y = 1.75;
    g.add(jug);
    // Spout
    const spout = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 })
    );
    spout.position.set(0, 1.15, 0.38);
    g.add(spout);
    // Cup holder tray
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.04, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.5 })
    );
    tray.position.set(0.4, 1.02, 0);
    g.add(tray);
    // Small cups
    for (let i = 0; i < 3; i++) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.03, 0.08, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
      );
      cup.position.set(0.28 + i * 0.12, 1.08, 0);
      g.add(cup);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function makeRoomProps() {
    makeBookshelf(-26, -8, 0x6b4f2a);
    makeBookshelf(-26, 8, 0x7a5730);
    makeServerRack(28, -14);
    makeCoffeeArea(28, 14);
    makeWaterCooler(waterCoolerPos.x, waterCoolerPos.z);
    makePlant(-26, 16, 1.1);
    makePlant(22, 8, 0.9);
    makePlant(10, 20, 0.85);
    makePlant(-6, 20, 0.8);
    makePlant(2, -20, 0.9);
    makePlant(-14, -20, 0.85);
    makePoster(-10, 3.2, -21.7, 'LOTR', 0x6d28d9, 0xfbbf24);
    makePoster(6, 3.2, -21.7, 'HQ', 0x2563eb, 0xf97316);
    // Wall clock on back wall
    makeWallClock(-20, 4.5, -21.6);
    // Pre-create shared spark geometry/material
    sparkGeoShared = new THREE.SphereGeometry(0.03, 4, 4);
    sparkMatShared = new THREE.MeshBasicMaterial({ color: 0xffd175, transparent: true, opacity: 1 });
  }

  function updateCamera() {
    if (!camera) return;
    const x = Math.cos(orbitAngle) * Math.cos(orbitPitch) * orbitDist;
    const y = Math.sin(orbitPitch) * orbitDist;
    const z = Math.sin(orbitAngle) * Math.cos(orbitPitch) * orbitDist;
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  function animate() {
    if (!active || !renderer) return;
    const t = (performance.now() - clockStart) / 1000;
    agents3d.forEach((a, i) => {
      const status = (a._statusLower = String(a.agent && a.agent.status || '').toLowerCase());
      const bob = Math.sin(t * 1.3 + i) * 0.03;
      a.group.position.y = bob;
      a.group.rotation.y = 0;
      a.head.position.y = 1.92;
      a.head.rotation.x = 0;
      a.head.rotation.y = Math.sin(t * 0.7 + i * 1.1) * 0.18;
      a.armL.rotation.z = 0;
      a.armR.rotation.z = 0;
      a.legL.rotation.x = 0;
      a.legR.rotation.x = 0;
      // Eye tracking — pupils shift slightly toward camera
      if (a.pupilL && a.pupilR) {
        const eyeShiftX = Math.sin(t * 0.5 + i) * 0.015;
        const eyeShiftY = Math.cos(t * 0.3 + i) * 0.008;
        a.pupilL.position.x = -0.12 + eyeShiftX;
        a.pupilL.position.y = 1.94 + eyeShiftY;
        a.pupilR.position.x = 0.12 + eyeShiftX;
        a.pupilR.position.y = 1.94 + eyeShiftY;
      }

      if (status.indexOf('working') !== -1) {
        a.armL.rotation.x = -1.15 + Math.sin(t * 7 + i) * 0.35;
        a.armR.rotation.x = -1.15 + Math.sin(t * 7 + i + 0.8) * 0.35;
        a.body.rotation.z = Math.sin(t * 3 + i) * 0.03;
        a.head.rotation.x = 0.12;
        // Focused eyes — pupils center-down
        if (a.pupilL && a.pupilR) {
          a.pupilL.position.y = 1.92; a.pupilR.position.y = 1.92;
        }
        // Typing sparks — emit small particles from hands periodically (shared geometry)
        if (!a._typingSparks) a._typingSparks = [];
        if (Math.random() < 0.08) {
          const sparkMat = sparkMatShared.clone();
          const spark = new THREE.Mesh(sparkGeoShared, sparkMat);
          const hand = Math.random() > 0.5 ? a.handR : a.handL;
          spark.position.copy(hand.position);
          spark.position.y += 0.05;
          spark.userData._vel = { x: (Math.random() - 0.5) * 0.04, y: 0.03 + Math.random() * 0.03, z: (Math.random() - 0.5) * 0.04 };
          spark.userData._life = 1.0;
          a.group.add(spark);
          a._typingSparks.push(spark);
        }
        // Update existing sparks
        for (let si = a._typingSparks.length - 1; si >= 0; si--) {
          const sp = a._typingSparks[si];
          sp.userData._life -= 0.04;
          if (sp.userData._life <= 0) {
            a.group.remove(sp); sp.material.dispose();
            a._typingSparks.splice(si, 1);
          } else {
            sp.position.x += sp.userData._vel.x;
            sp.position.y += sp.userData._vel.y;
            sp.position.z += sp.userData._vel.z;
            sp.userData._vel.y -= 0.002; // gravity
            sp.material.opacity = sp.userData._life;
          }
        }
      } else if (status.indexOf('sleep') !== -1) {
        a.head.rotation.x = 0.6;
        a.head.position.y = 1.62;
        a.armL.rotation.x = -0.45;
        a.armR.rotation.x = -0.45;
        a.body.rotation.z = 0.08;
        // Eyes closed — hide pupils behind head
        if (a.pupilL && a.pupilR) {
          a.pupilL.position.z = 0.1; a.pupilR.position.z = 0.1;
        }
        if (a.eyeL && a.eyeR) {
          a.eyeL.position.z = 0.15; a.eyeR.position.z = 0.15;
        }
        // Animate Zzz sprites floating up
        if (a.statusSprites) {
          a.statusSprites.forEach(function(sp) {
            const zi = sp.userData._zIdx || 0;
            const phase = t * 0.6 + zi * 1.2;
            const yOff = (phase % 3) * 0.4;
            sp.position.y = 2.2 + zi * 0.35 + yOff;
            sp.material.opacity = 0.9 - (yOff / 1.2) * 0.7;
            sp.position.x = 0.3 + zi * 0.25 + Math.sin(phase) * 0.12;
          });
        }
        // Clean up typing sparks if agent switched from working to sleeping
        if (a._typingSparks) {
          a._typingSparks.forEach(sp => { a.group.remove(sp); sp.material.dispose(); });
          a._typingSparks = [];
        }
      } else {
        // Idle — agents slowly drift toward water cooler, chat animation
        if (!a._idlePhase) a._idlePhase = Math.random() * Math.PI * 2;
        const idleT = t * 0.15 + a._idlePhase;
        // Gentle sway toward water cooler direction
        const wcDx = waterCoolerPos.x - a.baseX;
        const wcDz = waterCoolerPos.z - a.baseZ;
        const wcDist = Math.sqrt(wcDx * wcDx + wcDz * wcDz);
        // Drift partway toward cooler (max 2 units from desk)
        const driftFrac = Math.min(1, 2 / wcDist) * (0.5 + 0.5 * Math.sin(idleT));
        a.group.position.x = a.baseX + wcDx * driftFrac * 0.08 + Math.sin(idleT * 2.3) * 0.15;
        a.group.position.z = a.baseZ + wcDz * driftFrac * 0.08 + Math.cos(idleT * 1.7) * 0.15;
        // Face toward cooler when drifting
        const faceAngle = Math.atan2(wcDx, wcDz);
        a.group.rotation.y = faceAngle * driftFrac * 0.15 + Math.sin(t * 0.45 + i) * 0.08;
        a.armL.rotation.x = Math.sin(t * 1.6 + i) * 0.18;
        a.armR.rotation.x = Math.sin(t * 1.6 + i + 0.8) * 0.18;
        a.armL.rotation.z = -0.08 + Math.sin(t * 0.9 + i) * 0.05;
        a.armR.rotation.z = 0.08 - Math.sin(t * 0.9 + i + 1.1) * 0.05;
        a.head.rotation.y = Math.sin(t * 0.45 + i * 1.3) * 0.35;
        a.body.rotation.z = Math.sin(t * 0.8 + i) * 0.02;
        // Clean up typing sparks for idle agents
        if (a._typingSparks) {
          a._typingSparks.forEach(sp => { a.group.remove(sp); sp.material.dispose(); });
          a._typingSparks = [];
        }
      }
      // Reset eyes for non-sleeping
      if (status.indexOf('sleep') === -1) {
        if (a.eyeL) a.eyeL.position.z = 0.28;
        if (a.eyeR) a.eyeR.position.z = 0.28;
        if (a.pupilL) a.pupilL.position.z = 0.34;
        if (a.pupilR) a.pupilR.position.z = 0.34;
      }
      // Bubble bob
      if (a.bubble) {
        a.bubble.position.y = 4.2 + Math.sin(t * 1.2 + i * 0.7) * 0.15;
        a.bubble.material.opacity = 0.85 + Math.sin(t * 0.8 + i) * 0.15;
      }
      // Hover glow effect (use cached mesh list to avoid traverse per frame)
      if (!a._glowMeshes) {
        a._glowMeshes = [];
        a.group.traverse(function(c) {
          if (c.isMesh && c.material && !c.userData.isHitBox) {
            c.material._origEmissive = c.material.emissive ? c.material.emissive.getHex() : 0;
            c.material._origEmissiveIntensity = c.material.emissiveIntensity || 0;
            a._glowMeshes.push(c);
          }
        });
      }
      if (i === hoveredAgentIdx) {
        const glowIntensity = 0.4 + Math.sin(t * 3) * 0.2;
        for (let gi = 0; gi < a._glowMeshes.length; gi++) {
          const c = a._glowMeshes[gi];
          c.material.emissive.setHex(0x66bbff);
          c.material.emissiveIntensity = glowIntensity;
        }
        const s = 1 + Math.sin(t * 4) * 0.015;
        a.group.scale.set(s, s, s);
        a._glowing = true;
      } else if (a._glowing) {
        a.group.scale.set(1, 1, 1);
        for (let gi = 0; gi < a._glowMeshes.length; gi++) {
          const c = a._glowMeshes[gi];
          c.material.emissive.setHex(c.material._origEmissive);
          c.material.emissiveIntensity = c.material._origEmissiveIntensity;
        }
        a._glowing = false;
      }
    });
    // Ambient particles
    if (particleSystem) {
      const pos = particleSystem.geo.attributes.position;
      const arr = pos.array;
      const vels = particleSystem.velocities;
      for (let i = 0; i < vels.length; i++) {
        arr[i*3] += vels[i].vx;
        arr[i*3+1] += vels[i].vy;
        arr[i*3+2] += vels[i].vz;
        if (arr[i*3+1] > 7) { arr[i*3+1] = 1; arr[i*3] = (Math.random()-0.5)*FLOOR_W; arr[i*3+2] = (Math.random()-0.5)*FLOOR_D; }
      }
      pos.needsUpdate = true;
      particleSystem.points.material.opacity = 0.3 + Math.sin(t * 0.5) * 0.2;
    }
    // Screen content + flicker for working agents
    const frameMod = Math.floor(t * 2) | 0; // update screen text ~2fps to save perf
    screenMeshes.forEach(function (scr) {
      const idx = scr.userData.deskIdx;
      const a3d = agents3d[idx];
      const isWorking = a3d && (a3d._statusLower || '').includes('work');
      if (isWorking) {
        scr.material.emissiveIntensity = 0.35 + Math.sin(t * 12 + idx * 3.7) * 0.15 + Math.sin(t * 5.3 + idx * 1.9) * 0.08;
        // Draw scrolling code on screen canvas
        const sc = screenCanvases[idx];
        if (sc && frameMod % 2 === 0) {
          const ctx = sc.ctx;
          ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 256, 176);
          ctx.font = '11px monospace';
          const scroll = Math.floor(t * 0.8 + sc.scrollOffset) % CODE_LINES.length;
          for (let li = 0; li < 10; li++) {
            const lineIdx = (scroll + li) % CODE_LINES.length;
            const fade = li < 2 ? 0.4 + li * 0.3 : li > 7 ? 0.4 : 1;
            ctx.fillStyle = li % 3 === 0 ? `rgba(86,156,214,${fade})` : li % 3 === 1 ? `rgba(206,145,120,${fade})` : `rgba(156,220,254,${fade})`;
            ctx.fillText(CODE_LINES[lineIdx], 8, 16 + li * 16);
          }
          // Cursor blink
          if (Math.sin(t * 4) > 0) {
            ctx.fillStyle = '#aeafad'; ctx.fillRect(8 + (CODE_LINES[(scroll + 4) % CODE_LINES.length] || '').length * 6.5, 62, 7, 13);
          }
          sc.tex.needsUpdate = true;
        }
      } else {
        scr.material.emissiveIntensity = 0.15;
        // Dim idle screen
        const sc = screenCanvases[idx];
        if (sc && frameMod % 10 === 0) {
          const ctx = sc.ctx;
          ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, 256, 176);
          ctx.fillStyle = '#374151'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
          ctx.fillText('💤 idle', 128, 92); ctx.textAlign = 'start';
          sc.tex.needsUpdate = true;
        }
      }
    });
    // Day/night cycle based on real local time
    // Update wall clock every second
    if (wallClockData && (Math.floor(t) !== Math.floor(t - 0.016))) {
      updateWallClock();
    }
    if (ambientLight && dirLight) {
      const now = new Date();
      const h = now.getHours() + now.getMinutes() / 60;
      // 0-6: night, 6-8: sunrise, 8-17: day, 17-19: sunset, 19-24: night
      let dayFactor;
      if (h >= 8 && h <= 17) dayFactor = 1;
      else if (h >= 6 && h < 8) dayFactor = (h - 6) / 2;
      else if (h > 17 && h <= 19) dayFactor = 1 - (h - 17) / 2;
      else dayFactor = 0;
      // Ambient: night=warm dim (0.6), day=bright (1.8)
      ambientLight.intensity = 0.6 + dayFactor * 1.2;
      // Night: warm orange tint; Day: white
      const r = 0.85 + dayFactor * 0.15, g = 0.7 + dayFactor * 0.3, b = 0.5 + dayFactor * 0.5;
      ambientLight.color.setRGB(r, g, b);
      dirLight.intensity = 0.4 + dayFactor * 1.4;
      // Background: night=darker, day=lighter
      if (scene && scene.background) {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        if (isDark) {
          const rb = 0.12 + dayFactor * 0.02, gb = 0.12 + dayFactor * 0.02, bb = 0.23 + dayFactor * 0.02;
          scene.background.setRGB(rb, gb, bb);
          if (scene.fog) scene.fog.color.setRGB(rb, gb, bb);
        }
      }
    }
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }

  function onResize() {
    if (!container || !renderer || !camera) return;
    const mobile = window.innerWidth <= 768;
    const w = container.clientWidth || 1200;
    const h = mobile ? Math.max(360, Math.min(window.innerHeight * 0.88, 960)) : Math.max(500, container.clientHeight || Math.min(window.innerHeight * 0.88, 1000));
    renderer.setSize(w, h);
    const aspect = w / h;
    const frustum = mobile ? 22 : 20;
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.top = frustum;
    camera.bottom = -frustum;
    updateCamera();
  }

  async function start(containerEl) {
    await loadThree();
    if (container === containerEl && active) return;
    stop();
    container = containerEl;
    clearScene();

    scene = new THREE.Scene();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bgColor = isDark ? 0x1e1e3a : 0xefe1cb;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 60, 120);

    const mobile = window.innerWidth <= 768;
    const w = container.clientWidth || 1200;
    const h = mobile ? Math.max(360, Math.min(window.innerHeight * 0.88, 960)) : Math.max(500, container.clientHeight || Math.min(window.innerHeight * 0.88, 1000));
    const aspect = w / h;
    const frustum = mobile ? 22 : 20;
    camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200);
    updateCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth <= 768 ? 1.5 : 2));
    renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(amb);
    ambientLight = amb;
    const dir = new THREE.DirectionalLight(0xfff1cf, 1.8);
    dir.position.set(10, 20, 8);
    dir.castShadow = true;
    scene.add(dir);
    dirLight = dir;

    makeFloor();
    makeWalls();
    makeRoomProps();
    makeParticles();
    const data = await fetchAgents();
    populateAgents(data);
    buildMiniMap(data);
    // Kanban whiteboard on the back wall
    whiteboardData = makeWhiteboard(14, -21.5, 'back', data);

    resizeHandler = function () { onResize(); };
    window.addEventListener('resize', resizeHandler);

    // Orbit mouse/touch controls
    const cvs = renderer.domElement;
    function onMouseDown(e) { isDragging = true; dragMoved = false; dragStartX = e.clientX; dragStartY = e.clientY; dragStartAngle = orbitAngle; dragStartPitch = orbitPitch; }
    let _hoverThrottleTimer = 0;
    function onMouseMove(e) {
      if (isDragging) { const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY; if (dx*dx+dy*dy > 9) dragMoved = true; orbitAngle = dragStartAngle + dx * 0.008; orbitPitch = Math.max(0.2, Math.min(1.2, dragStartPitch - dy * 0.006)); updateCamera(); return; }
      // Throttle hover detection to ~30fps
      const now = performance.now();
      if (now - _hoverThrottleTimer < 33) return;
      _hoverThrottleTimer = now;
      if (!raycaster) raycaster = new THREE.Raycaster();
      const rect = cvs.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x: mx, y: my }, camera);
      let found = -1;
      for (let i = 0; i < agents3d.length; i++) {
        if (raycaster.intersectObjects(agents3d[i].group.children, true).length > 0) { found = i; break; }
      }
      if (found !== hoveredAgentIdx) {
        hoveredAgentIdx = found;
        cvs.style.cursor = found >= 0 ? 'pointer' : '';
      }
    }
    function onMouseUp() { isDragging = false; }
    function onWheel(e) { e.preventDefault(); orbitDist = Math.max(15, Math.min(60, orbitDist + e.deltaY * 0.03)); onResize(); }
    let pinchStartDist = 0, pinchStartZoom = 0;
    function onTouchStart(e) {
      if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDist = Math.sqrt(dx * dx + dy * dy);
        pinchStartZoom = orbitDist;
      } else if (e.touches.length === 1) {
        isDragging = true; dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
        dragStartAngle = orbitAngle; dragStartPitch = orbitPitch;
      }
    }
    function onTouchMove(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (pinchStartDist > 0) {
          const scale = pinchStartDist / dist;
          orbitDist = Math.max(15, Math.min(60, pinchStartZoom * scale));
          onResize();
        }
        return;
      }
      if (!isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      orbitAngle = dragStartAngle + (e.touches[0].clientX - dragStartX) * 0.008;
      orbitPitch = Math.max(0.2, Math.min(1.2, dragStartPitch - (e.touches[0].clientY - dragStartY) * 0.006));
      updateCamera();
    }
    function onTouchEnd() { isDragging = false; pinchStartDist = 0; }
    cvs.addEventListener('mousedown', onMouseDown);
    cvs.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    cvs.addEventListener('wheel', onWheel, { passive: false });
    cvs.addEventListener('touchstart', onTouchStart, { passive: true });
    cvs.addEventListener('touchmove', onTouchMove, { passive: false });
    cvs.addEventListener('touchend', onTouchEnd, { passive: true });
    // Click-to-inspect
    cvs.addEventListener('click', onCanvasClick);
    orbitCleanup = function () {
      cvs.removeEventListener('mousedown', onMouseDown);
      cvs.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      cvs.removeEventListener('wheel', onWheel);
      cvs.removeEventListener('touchstart', onTouchStart);
      cvs.removeEventListener('touchmove', onTouchMove);
      cvs.removeEventListener('touchend', onTouchEnd);
      cvs.removeEventListener('click', onCanvasClick);
    };
    clockStart = performance.now();
    // Watch for theme changes
    themeObserver = new MutationObserver(function () {
      if (!scene) return;
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      const bgc = dark ? 0x1e1e3a : 0xefe1cb;
      scene.background = new THREE.Color(bgc);
      if (scene.fog) scene.fog.color.setHex(bgc);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    initialized = true;
    active = true;
    animate();
  }

  function stop() {
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    if (orbitCleanup) { orbitCleanup(); orbitCleanup = null; }
    if (themeObserver) { themeObserver.disconnect(); themeObserver = null; }
    if (miniMapPanel) { miniMapPanel.remove(); miniMapPanel = null; }
  }

  function dispose() {
    stop();
    clearScene();
    initialized = false;
  }

  function updateAgents() {
    fetchAgents().then(data => {
      if (!scene || !active) return;
      populateAgents(data);
      updateWhiteboardContent(data);
    });
  }

  window.Office3D = {
    start: start,
    stop: stop,
    dispose: dispose,
    updateAgents: updateAgents,
    isActive: function () { return active; },
    isInitialized: function () { return initialized; }
  };
})();
