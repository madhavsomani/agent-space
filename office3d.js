// ===== AGENT SPACE — 3D VIRTUAL OFFICE (Three.js) =====
// Isometric voxel-style living office. Agents walk, work, sleep, fidget.
// Warm floor, blocky characters, speech bubbles, ambient life.

window.Office3D = (function() {
  let THREE, OrbitControls;
  let scene, camera, renderer, controls, clock;
  let container = null;
  let initialized = false, active = false;
  let animFrameId = null;
  let agentPollTimer = null;
  let lastPollAt = 0;
  let lastUpdateAt = 0;
  let agentMeshes = {}; // name -> AgentState
  let furnitureGroup;
  let ambientObjects = []; // plants, lamps, server LEDs etc for ambient anim

  // Colors matching reference
  const FLOOR_COLOR = 0xd4c4a0;
  const FLOOR_COLOR2 = 0xc8b890;
  const WALL_COLOR = 0xb8a882;
  const DESK_COLOR = 0x8B6914;
  const DESK_DARK = 0x6B4F10;
  const CHAIR_COLOR = 0x3b5998;
  const MONITOR_BODY = 0x2a2a2a;
  const MONITOR_SCREEN = 0x4a9eff;
  const SERVER_COLOR = 0x1a2744;
  const COUCH_COLOR = 0x7b5ea7;
  const PLANT_POT = 0x8B6914;
  const PLANT_GREEN = 0x2d8a4e;
  const BOOKSHELF_COLOR = 0x6B4F10;
  const LAMP_COLOR = 0xffd700;
  const SKIN_COLOR = 0xffd5a0;
  const HAIR_COLORS = [0x3a2a1a, 0x6a4a2a, 0xc8a050, 0x8a3030, 0x2a4a6a, 0x5a2a5a, 0x1a1a1a, 0xd4a060];

  const GRID = { cols: 14, rows: 10 };
  const TILE = 1.5;

  // ── ZONES (world coords) ──
  const hw = GRID.cols * TILE / 2, hh = GRID.rows * TILE / 2;
  const ZONES = {
    breakRoom: { x: -hw + 2, z: -hh + 1.5, label: 'Break Room' },
    lounge: { x: -hw + 2.2, z: -hh + 2.3, label: 'Lounge' },
    serverRoom: { x: hw - 1.5, z: -hh + 0.5, label: 'Server Room' },
    whiteboard: { x: 3, z: -hh + 1.5, label: 'Whiteboard' },
    review: { x: 1.5, z: -hh + 2.2, label: 'Review' },
    center: { x: 0, z: 0, label: 'Center' },
  };

  // Walking speed (world units per second)
  const WALK_SPEED = 1.8;
  const LEG_SWING = 0.5; // radians

  // Wandering: nearby points-of-interest agents walk to
  const WANDER_POINTS = [
    { x: -hw + 2, z: -hh + 1.5, label: 'couch' },       // break room couch
    { x: -hw + 4, z: -hh + 0.6, label: 'water' },       // water cooler
    { x: 3, z: -hh + 1.5, label: 'whiteboard' },         // whiteboard
    { x: -2, z: -hh + 1, label: 'bookshelf' },           // bookshelf
    { x: hw - 1.5, z: -hh + 1, label: 'server' },       // server rack
    { x: 0, z: 0, label: 'center' },                     // center of office
  ];
  // How often idle agents decide to wander (seconds)
  const IDLE_WANDER_MIN = 4;
  const IDLE_WANDER_MAX = 10;
  // Working agents occasionally stretch
  const WORK_STRETCH_MIN = 12;
  const WORK_STRETCH_MAX = 25;

  // ── LOAD THREE.JS ──
  async function loadThreeJS() {
    if (THREE) return;
    const [threeModule, controlsModule] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js')
    ]);
    THREE = threeModule;
    OrbitControls = controlsModule.OrbitControls;
  }

  // ── FLOOR ──
  function createFloor() {
    const geo = new THREE.PlaneGeometry(GRID.cols * TILE, GRID.rows * TILE);
    const mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.85 });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    // Grid lines
    const lMat = new THREE.LineBasicMaterial({ color: FLOOR_COLOR2, transparent: true, opacity: 0.3 });
    for (let i = 0; i <= GRID.cols; i++) {
      const x = -hw + i * TILE;
      const pts = [new THREE.Vector3(x, 0.005, -hh), new THREE.Vector3(x, 0.005, hh)];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lMat));
    }
    for (let j = 0; j <= GRID.rows; j++) {
      const z = -hh + j * TILE;
      const pts = [new THREE.Vector3(-hw, 0.005, z), new THREE.Vector3(hw, 0.005, z)];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lMat));
    }
  }

  // ── WALLS ──
  function createWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.7 });
    const wallH = 2.8;
    const back = new THREE.Mesh(new THREE.BoxGeometry(GRID.cols * TILE, wallH, 0.15), wallMat);
    back.position.set(0, wallH / 2, -hh); back.receiveShadow = true;
    scene.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, wallH, GRID.rows * TILE), wallMat);
    left.position.set(-hw, wallH / 2, 0); left.receiveShadow = true;
    scene.add(left);
  }

  // ── DESK ──
  function createDesk(x, z) {
    const g = new THREE.Group();
    const topMat = new THREE.MeshStandardMaterial({ color: DESK_COLOR, roughness: 0.6 });
    const sideMat = new THREE.MeshStandardMaterial({ color: DESK_DARK, roughness: 0.7 });

    // L-shape desktop
    const mainTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.7), topMat);
    mainTop.position.set(x, 0.62, z); mainTop.castShadow = true;
    g.add(mainTop);
    const sideTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), topMat);
    sideTop.position.set(x + 0.9, 0.62, z - 0.1); sideTop.castShadow = true;
    g.add(sideTop);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.06, 0.6, 0.06);
    [[-0.6, -0.3], [-0.6, 0.3], [0.6, 0.3], [1.1, -0.3], [1.1, 0.1]].forEach(([dx, dz]) => {
      const leg = new THREE.Mesh(legGeo, sideMat);
      leg.position.set(x + dx, 0.3, z + dz);
      g.add(leg);
    });

    // Monitor
    const monBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.04),
      new THREE.MeshStandardMaterial({ color: MONITOR_BODY }));
    monBody.position.set(x, 0.9, z - 0.2); monBody.castShadow = true;
    g.add(monBody);
    const monScreen = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.01),
      new THREE.MeshStandardMaterial({ color: MONITOR_SCREEN, emissive: new THREE.Color(MONITOR_SCREEN), emissiveIntensity: 0.4 }));
    monScreen.position.set(x, 0.92, z - 0.17);
    g.add(monScreen);
    const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x888888 }));
    monStand.position.set(x, 0.72, z - 0.2);
    g.add(monStand);

    scene.add(g);
    return { group: g, monScreen };
  }

  // ── CHAIR ──
  function createChair(x, z) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: CHAIR_COLOR, roughness: 0.6 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), mat);
    seat.position.set(x, 0.4, z); seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.06), mat);
    back.position.set(x, 0.62, z + 0.2);
    g.add(back);
    // Legs (simple cylinder)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.38, 6);
    [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].forEach(([dx, dz]) => {
      const l = new THREE.Mesh(legGeo, legMat);
      l.position.set(x + dx, 0.19, z + dz);
      g.add(l);
    });
    scene.add(g);
    return g;
  }

  // ── CHARACTER (with legs for walking) ──
  function createCharacter(color, idx) {
    const g = new THREE.Group();
    const col = new THREE.Color(typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color);
    const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.25), bodyMat);
    body.position.y = 0.72; body.castShadow = true;
    g.add(body);

    // Head
    const headMat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.25), headMat);
    head.position.y = 1.12; head.castShadow = true;
    g.add(head);

    // Hair
    const hairColor = HAIR_COLORS[(idx || 0) % HAIR_COLORS.length];
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.27), hairMat);
    hair.position.y = 1.31;
    g.add(hair);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), eyeMat);
    eyeL.position.set(-0.07, 1.14, -0.13);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), eyeMat);
    eyeR.position.set(0.07, 1.14, -0.13);
    g.add(eyeR);

    // Arms (pivoted at shoulder for animation)
    const armGeo = new THREE.BoxGeometry(0.12, 0.35, 0.15);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.24, 0.72, 0);
    g.add(armL);
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.24, 0.72, 0);
    g.add(armR);

    // Legs (for walking animation)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5a, roughness: 0.7 }); // dark pants
    const legGeo = new THREE.BoxGeometry(0.12, 0.35, 0.13);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.09, 0.32, 0);
    g.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.09, 0.32, 0);
    g.add(legR);

    return { group: g, body, head, hair, armL, armR, legL, legR, eyeL, eyeR };
  }

  // ── SPEECH BUBBLE (Canvas → Sprite) ──
  function createSpeechBubble(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');

    // Rounded white bubble
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 4, 4, 504, 72, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    roundRect(ctx, 4, 4, 504, 72, 12);
    ctx.stroke();

    // Tail (triangle)
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(50, 76); ctx.lineTo(70, 92); ctx.lineTo(80, 76);
    ctx.fill();

    // Text
    ctx.fillStyle = '#1a1a2e';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const truncated = text.length > 45 ? text.slice(0, 42) + '...' : text;
    ctx.fillText(truncated, 16, 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.0, 0.6, 1);
    sprite.position.set(0.5, 2.0, 0);
    sprite.renderOrder = 1000;
    return sprite;
  }

  // ── Zzz PARTICLES ──
  function createZzzParticle(x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.8 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.25, 0.25, 1);
    sprite.position.set(x, y, z);
    sprite.renderOrder = 998;
    return sprite;
  }

  // ── NAME BADGE ──
  function createNameBadge(name, status) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, 4, 4, 248, 40, 10);
    ctx.fill();
    const dotColors = { working: '#22c55e', idle: '#eab308', sleeping: '#6b7280' };
    ctx.fillStyle = dotColors[status] || '#6b7280';
    ctx.beginPath(); ctx.arc(230, 24, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, 120, 24);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 0.35, 1);
    sprite.position.y = 1.55;
    sprite.renderOrder = 999;
    return sprite;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── FURNITURE ──
  function createFurniture() {
    furnitureGroup = new THREE.Group();

    // Server rack
    const srvMat = new THREE.MeshStandardMaterial({ color: SERVER_COLOR, roughness: 0.4, metalness: 0.3 });
    const srv = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.6), srvMat);
    srv.position.set(hw - 1.5, 1.1, -hh + 0.5); srv.castShadow = true;
    furnitureGroup.add(srv);

    // Server LEDs (animated)
    for (let i = 0; i < 4; i++) {
      const ledMat = new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: new THREE.Color(0x00ff44), emissiveIntensity: 0.8 });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), ledMat);
      led.position.set(hw - 1.35, 0.5 + i * 0.4, -hh + 0.82);
      furnitureGroup.add(led);
      ambientObjects.push({ type: 'led', mesh: led, mat: ledMat, idx: i });
    }

    // Couch (break room)
    const couchMat = new THREE.MeshStandardMaterial({ color: COUCH_COLOR, roughness: 0.7 });
    const couchSeat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.7), couchMat);
    couchSeat.position.set(-hw + 2, 0.35, -hh + 1.5); couchSeat.castShadow = true;
    furnitureGroup.add(couchSeat);
    const couchBack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.15), couchMat);
    couchBack.position.set(-hw + 2, 0.7, -hh + 1.15);
    furnitureGroup.add(couchBack);
    [[-hw + 1.15, -hh + 1.5], [-hw + 2.85, -hh + 1.5]].forEach(([ax, az]) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.7), couchMat);
      arm.position.set(ax, 0.5, az);
      furnitureGroup.add(arm);
    });

    // Bookshelf
    const bsMat = new THREE.MeshStandardMaterial({ color: BOOKSHELF_COLOR, roughness: 0.7 });
    const bs = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.4), bsMat);
    bs.position.set(-2, 1.0, -hh + 0.3); bs.castShadow = true;
    furnitureGroup.add(bs);
    for (let i = 0; i < 3; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.04, 0.35), bsMat);
      shelf.position.set(-2, 0.4 + i * 0.6, -hh + 0.3);
      furnitureGroup.add(shelf);
    }
    [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22].forEach((c, i) => {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.2),
        new THREE.MeshStandardMaterial({ color: c }));
      book.position.set(-2.4 + i * 0.22, 0.6, -hh + 0.3);
      furnitureGroup.add(book);
    });

    // Plants (with sway animation)
    const plantPositions = [
      [hw - 0.6, -hh + 0.6], [-hw + 0.6, hh - 0.6], [hw - 0.6, hh - 0.6], [2, -hh + 0.6]
    ];
    plantPositions.forEach(([px, pz], i) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: PLANT_POT }));
      pot.position.set(px, 0.13, pz);
      furnitureGroup.add(pot);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6),
        new THREE.MeshStandardMaterial({ color: PLANT_GREEN, roughness: 0.8 }));
      leaf.position.set(px, 0.45, pz);
      furnitureGroup.add(leaf);
      const leaf2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a9a5e, roughness: 0.8 }));
      leaf2.position.set(px + 0.08, 0.55, pz - 0.05);
      furnitureGroup.add(leaf2);
      ambientObjects.push({ type: 'plant', meshes: [leaf, leaf2], baseY: [0.45, 0.55], idx: i });
    });

    // Floor lamps
    [[-hw + 0.6, -hh + 3], [hw - 0.6, 2]].forEach(([lx, lz], i) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x888888 }));
      pole.position.set(lx, 0.75, lz);
      furnitureGroup.add(pole);
      const shadeMat = new THREE.MeshStandardMaterial({ color: LAMP_COLOR, emissive: new THREE.Color(LAMP_COLOR), emissiveIntensity: 0.3 });
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.2, 8), shadeMat);
      shade.position.set(lx, 1.55, lz);
      furnitureGroup.add(shade);
      ambientObjects.push({ type: 'lamp', mesh: shade, mat: shadeMat, idx: i });
    });

    // Whiteboard
    const wbFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xcccccc }));
    wbFrame.position.set(3, 1.8, -hh + 0.1);
    furnitureGroup.add(wbFrame);
    const wbSurface = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xf8f8f8 }));
    wbSurface.position.set(3, 1.8, -hh + 0.14);
    furnitureGroup.add(wbSurface);

    // Coffee table in break room
    const tableMat = new THREE.MeshStandardMaterial({ color: DESK_COLOR, roughness: 0.6 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.4), tableMat);
    table.position.set(-hw + 2, 0.35, -hh + 2.2);
    furnitureGroup.add(table);
    const tableLeg = new THREE.CylinderGeometry(0.025, 0.025, 0.33, 6);
    [[-0.2, -0.12], [0.2, -0.12], [-0.2, 0.12], [0.2, 0.12]].forEach(([dx, dz]) => {
      const l = new THREE.Mesh(tableLeg, new THREE.MeshStandardMaterial({ color: 0x555555 }));
      l.position.set(-hw + 2 + dx, 0.17, -hh + 2.2 + dz);
      furnitureGroup.add(l);
    });

    // Water cooler near break room
    const coolerMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.5 });
    const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8), coolerMat);
    cooler.position.set(-hw + 4, 0.45, -hh + 0.6);
    furnitureGroup.add(cooler);
    const coolerTop = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.15, 8),
      new THREE.MeshStandardMaterial({ color: 0x4488cc, transparent: true, opacity: 0.6 }));
    coolerTop.position.set(-hw + 4, 0.98, -hh + 0.6);
    furnitureGroup.add(coolerTop);

    scene.add(furnitureGroup);

    // Zone labels on floor
    const zoneLabelData = [
      { text: '☕ Break Room', x: -hw + 2, z: -hh + 2.5 },
      { text: '🖥️ Server Room', x: hw - 1.5, z: -hh + 2 },
      { text: '📋 Whiteboard', x: 3, z: -hh + 2.5 },
      { text: '📚 Library', x: -2, z: -hh + 2 },
    ];
    zoneLabelData.forEach(zl => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 48;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(0,0,0,0.25)';
      cx.fillRect(0, 0, 256, 48);
      cx.fillStyle = '#ffffff';
      cx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(zl.text, 128, 24);
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.5), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(zl.x, 0.01, zl.z);
      scene.add(mesh);
    });

    // Break room rug
    const rugMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9, transparent: true, opacity: 0.4 });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-hw + 2, 0.005, -hh + 1.8);
    scene.add(rug);
  }

  // ── GRID → WORLD ──
  function gridToWorld(gx, gy) {
    return {
      x: -hw + gx * TILE + TILE / 2,
      z: -hh + gy * TILE + TILE / 2
    };
  }

  // ── AGENT STATE MACHINE ──
  // States: 'sitting_working', 'sitting_idle', 'sleeping', 'walking', 'at_break', 'at_zone'
  // Each agent has:
  //   state, targetPos, deskPos, walkPath, walkProgress
  //   zzzSprites, speechBubble, lastMessage

  function initAgentState(am, wp) {
    am.deskPos = { x: wp.x, z: wp.z + 0.5 };
    am.state = 'sitting_idle';
    am.targetPos = null;
    am.walkProgress = 0;
    am.walkFrom = null;
    am.walkTo = null;
    am.zzzSprites = [];
    am.speechBubble = null;
    am.lastMessage = '';
    am.stateTimer = 0;
    am.fidgetTimer = 0;
    am.blinkTimer = 0;
    am.prevApiStatus = null;
    am.nextWanderTime = 2 + Math.random() * 5; // first wander soon after spawn
    am.isWandering = false; // true when on an autonomous wander (not API-driven)
  }

  function jitterPoint(base, radius = 0.6) {
    return {
      x: base.x + (Math.random() - 0.5) * radius,
      z: base.z + (Math.random() - 0.5) * radius
    };
  }

  function getStatusTarget(am, status, agent) {
    const s = String(status || '').toLowerCase();
    const role = String(agent?.role || '').toLowerCase();
    if (s.includes('sleep')) return am.deskPos;
    if (s.includes('review')) return jitterPoint(ZONES.review, 0.8);
    if (s.includes('qa') || role.includes('qa') || role.includes('tester')) return jitterPoint(ZONES.serverRoom, 0.9);
    if (s.includes('idle')) {
      const choices = [ZONES.breakRoom, ZONES.lounge, ZONES.whiteboard, ZONES.center];
      return jitterPoint(choices[Math.floor(Math.random() * choices.length)], 1.0);
    }
    if (s.includes('working')) return am.deskPos;
    return jitterPoint(ZONES.center, 0.8);
  }

  function transitionToWalking(am, target) {
    am.state = 'walking';
    am.stateTimer = 0;
    am.walkFrom = { x: am.group.position.x, z: am.group.position.z };
    am.walkTo = { x: target.x, z: target.z };
    am.walkProgress = 0;
    // Reset pose
    resetPose(am);
  }

  function transitionToSitting(am, status) {
    // Check if we're at desk or at a wandering POI
    const atDesk = Math.abs(am.group.position.x - am.deskPos.x) < 0.5 &&
                   Math.abs(am.group.position.z - am.deskPos.z) < 0.5;

    if (am.isWandering && !atDesk) {
      // Arrived at POI — stand around looking at it
      am.state = 'standing_idle';
      am.stateTimer = 0;
      am.isWandering = false;
      resetPose(am);
      return;
    }

    am.isWandering = false;
    am.state = status === 'working' ? 'sitting_working' : status === 'sleeping' ? 'sleeping' : 'sitting_idle';
    am.stateTimer = 0;
    // Snap to desk
    am.group.position.x = am.deskPos.x;
    am.group.position.z = am.deskPos.z;
    if (status === 'sleeping') {
      am.head.position.y = 0.95;
      am.head.rotation.x = 0.4;
      am.body.rotation.x = 0.3;
      am.body.position.y = 0.62;
      am.armL.position.y = 0.55;
      am.armR.position.y = 0.55;
    } else {
      resetPose(am);
    }
  }

  function resetPose(am) {
    am.head.position.y = 1.12; am.head.rotation.x = 0; am.head.rotation.y = 0;
    am.body.rotation.x = 0; am.body.position.y = 0.72; am.body.scale.y = 1;
    am.armL.position.y = 0.72; am.armL.rotation.x = 0;
    am.armR.position.y = 0.72; am.armR.rotation.x = 0;
    am.legL.rotation.x = 0; am.legR.rotation.x = 0;
  }

  // ── SPEECH BUBBLE MANAGEMENT ──
  function updateSpeechBubble(am, text) {
    if (am.lastMessage === text) return;
    am.lastMessage = text;
    if (am.speechBubble) { am.group.remove(am.speechBubble); am.speechBubble = null; }
    if (text && am.state === 'sitting_working') {
      am.speechBubble = createSpeechBubble(text);
      am.group.add(am.speechBubble);
    }
  }

  // ── Zzz MANAGEMENT ──
  function updateZzz(am, t) {
    // Add new Z every 1.5s when sleeping
    if (am.state === 'sleeping') {
      if (am.zzzSprites.length < 3 && (t - (am._lastZzz || 0)) > 1.5) {
        am._lastZzz = t;
        const z = createZzzParticle(0.3, 1.5, -0.2);
        z._startY = 1.5;
        z._startTime = t;
        am.group.add(z);
        am.zzzSprites.push(z);
      }
    }
    // Animate existing Zzz
    for (let i = am.zzzSprites.length - 1; i >= 0; i--) {
      const z = am.zzzSprites[i];
      const age = t - z._startTime;
      z.position.y = z._startY + age * 0.4;
      z.position.x = 0.3 + Math.sin(age * 2) * 0.15;
      z.material.opacity = Math.max(0, 0.8 - age * 0.3);
      const s = 0.2 + age * 0.05;
      z.scale.set(s, s, 1);
      if (age > 2.5) {
        am.group.remove(z);
        z.material.dispose(); z.material.map?.dispose();
        am.zzzSprites.splice(i, 1);
      }
    }
    // Clean up if not sleeping
    if (am.state !== 'sleeping' && am.zzzSprites.length) {
      am.zzzSprites.forEach(z => {
        am.group.remove(z);
        z.material.dispose(); z.material.map?.dispose();
      });
      am.zzzSprites = [];
    }
  }

  async function pollAgentsOnce() {
    if (!active) return;
    try {
      lastPollAt = Date.now();
      const r = await fetch('/api/agents', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.agents)) updateAgents(d.agents);
    } catch {}
  }

  function startAgentPolling() {
    if (agentPollTimer) clearInterval(agentPollTimer);
    agentPollTimer = setInterval(() => {
      if (active) pollAgentsOnce();
    }, 10000);
    setTimeout(() => { if (active && !lastUpdateAt) pollAgentsOnce(); }, 1200);
  }

  // ── INIT ──
  async function start(containerEl) {
    container = containerEl;
    if (initialized) { resume(); return; }

    await loadThreeJS();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd0e8f8);
    scene.fog = new THREE.FogExp2(0xd0e8f8, 0.012);

    const aspect = container.clientWidth / container.clientHeight;
    const frustum = 10;
    camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 100);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.5;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxZoom = 3; controls.minZoom = 0.5;
    controls.enablePan = true;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    // Lighting
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.2);
    sun.position.set(8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffeedd, 0.6));
    // Warm fill from front
    const fill = new THREE.DirectionalLight(0xffe8c0, 0.3);
    fill.position.set(-5, 6, 10);
    scene.add(fill);

    createFloor();
    createWalls();
    createFurniture();

    clock = new THREE.Clock();
    initialized = true;
    active = true;

    window.addEventListener('resize', onResize);
    startAgentPolling();
    animate();
  }

  function onResize() {
    if (!container || !camera || !renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    const aspect = w / h, frustum = 10;
    camera.left = -frustum * aspect; camera.right = frustum * aspect;
    camera.top = frustum; camera.bottom = -frustum;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function resume() {
    active = true;
    clock?.start();
    startAgentPolling();
    animate();
  }
  function stop() {
    active = false;
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (agentPollTimer) { clearInterval(agentPollTimer); agentPollTimer = null; }
  }
  function dispose() {
    stop();
    if (renderer && container) {
      container.removeChild(renderer.domElement);
      renderer.dispose();
    }
    scene = camera = renderer = controls = clock = null;
    agentMeshes = {}; ambientObjects = [];
    initialized = false;
    window.removeEventListener('resize', onResize);
  }

  // ── UPDATE AGENTS ──
  function updateAgents(agents) {
    if (!initialized || !active) return;
    lastUpdateAt = Date.now();

    const seen = new Set();
    agents.forEach((agent, idx) => {
      const name = agent.name;
      seen.add(name);

      if (!agentMeshes[name]) {
        const deskPos = (typeof deskPositions !== 'undefined' && deskPositions[name])
          || (typeof getAutoDesk === 'function' && getAutoDesk(name))
          || { gx: 2 + (idx % 5) * 2, gy: 2 + Math.floor(idx / 5) * 3 };

        const wp = gridToWorld(deskPos.gx, deskPos.gy);
        const desk = createDesk(wp.x, wp.z);
        const chair = createChair(wp.x, wp.z + 0.6);
        const char = createCharacter(agent.color || '#3b82f6', idx);
        char.group.position.set(wp.x, 0, wp.z + 0.5);
        scene.add(char.group);

        const badge = createNameBadge(name, agent.status);
        char.group.add(badge);

        const am = { ...char, desk, chair, badge, wp, idx };
        initAgentState(am, wp);
        agentMeshes[name] = am;
      }

      const am = agentMeshes[name];

      // Status change → trigger transition
      if (am.prevApiStatus !== agent.status) {
        const prevStatus = am.prevApiStatus;
        am.prevApiStatus = agent.status;

        // Update badge
        if (am.badge) { am.group.remove(am.badge); }
        am.badge = createNameBadge(name, agent.status);
        am.group.add(am.badge);

        if (prevStatus && prevStatus !== agent.status) {
          const atDesk = Math.abs(am.group.position.x - am.deskPos.x) < 0.3 &&
                         Math.abs(am.group.position.z - am.deskPos.z) < 0.3;
          const nextStatus = String(agent.status || '').toLowerCase();

          if (nextStatus.includes('working')) {
            if (!atDesk) {
              transitionToWalking(am, am.deskPos);
              am.isWandering = false;
              am._pendingState = 'working';
            } else {
              transitionToSitting(am, 'working');
            }
          } else if (nextStatus.includes('sleep')) {
            if (!atDesk) transitionToWalking(am, am.deskPos);
            else transitionToSitting(am, 'sleeping');
            am.isWandering = false;
            am._pendingState = 'sleeping';
          } else {
            // Idle / review / QA-like states should visibly leave the desk.
            transitionToWalking(am, getStatusTarget(am, nextStatus, agent));
            am.isWandering = true;
            am._pendingState = 'idle';
          }
        } else {
          // First load
          const initialStatus = String(agent.status || '').toLowerCase();
          if (initialStatus.includes('working') || initialStatus.includes('sleep')) {
            transitionToSitting(am, initialStatus.includes('sleep') ? 'sleeping' : 'working');
          } else {
            transitionToWalking(am, getStatusTarget(am, initialStatus, agent));
            am.isWandering = true;
            am._pendingState = 'idle';
          }
        }
      }

      // Update speech bubble with last message
      const msg = agent.lastMessage || '';
      updateSpeechBubble(am, msg);
    });

    // Remove departed agents
    Object.keys(agentMeshes).forEach(name => {
      if (!seen.has(name)) {
        const am = agentMeshes[name];
        if (am.group) scene.remove(am.group);
        if (am.desk?.group) scene.remove(am.desk.group);
        if (am.chair) scene.remove(am.chair);
        am.zzzSprites?.forEach(z => { am.group.remove(z); z.material.dispose(); });
        delete agentMeshes[name];
      }
    });
  }

  // ── ANIMATION LOOP ──
  function animate() {
    if (!active) return;
    animFrameId = requestAnimationFrame(animate);

    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    // Agent animations
    Object.values(agentMeshes).forEach(am => {
      am.stateTimer += dt;

      // ── AUTONOMOUS WANDERING ──
      // Idle agents wander to points of interest
      if (am.state === 'sitting_idle' && am.stateTimer > am.nextWanderTime) {
        const poi = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
        // Add slight randomness to target so agents don't stack
        const jitter = { x: poi.x + (Math.random() - 0.5) * 0.8, z: poi.z + (Math.random() - 0.5) * 0.8 };
        transitionToWalking(am, jitter);
        am.isWandering = true;
        am._pendingState = 'idle'; // come back to idle when arrived
        am.nextWanderTime = IDLE_WANDER_MIN + Math.random() * (IDLE_WANDER_MAX - IDLE_WANDER_MIN);
      }
      // Idle agents standing at a POI should walk back to desk after a pause
      if (am.state === 'standing_idle' && am.stateTimer > 2 + Math.random() * 3) {
        transitionToWalking(am, am.deskPos);
        am.isWandering = true;
        am._pendingState = 'idle';
      }
      // Working agents occasionally stand/stretch then walk to water cooler and back
      if (am.state === 'sitting_working' && am.stateTimer > am.nextWanderTime) {
        const waterCooler = { x: -hw + 4 + (Math.random() - 0.5) * 0.5, z: -hh + 0.6 + (Math.random() - 0.5) * 0.5 };
        transitionToWalking(am, waterCooler);
        am.isWandering = true;
        am._pendingState = 'working'; // sit back down and work when done
        am.nextWanderTime = WORK_STRETCH_MIN + Math.random() * (WORK_STRETCH_MAX - WORK_STRETCH_MIN);
      }

      switch (am.state) {
        case 'walking': {
          if (!am.walkFrom || !am.walkTo) { transitionToSitting(am, am.prevApiStatus || 'idle'); break; }
          const dx = am.walkTo.x - am.walkFrom.x;
          const dz = am.walkTo.z - am.walkFrom.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          am.walkProgress += (WALK_SPEED * dt) / Math.max(dist, 0.01);

          if (am.walkProgress >= 1) {
            am.group.position.x = am.walkTo.x;
            am.group.position.z = am.walkTo.z;
            // Arrived — transition to pending state
            const pending = am._pendingState || am.prevApiStatus || 'idle';
            am._pendingState = null;
            transitionToSitting(am, pending);
          } else {
            am.group.position.x = am.walkFrom.x + dx * am.walkProgress;
            am.group.position.z = am.walkFrom.z + dz * am.walkProgress;
            // Face direction of movement
            am.group.rotation.y = Math.atan2(dx, dz);
            // Walking animation: leg swing + arm swing + body bob
            const phase = t * 8;
            am.legL.rotation.x = Math.sin(phase) * LEG_SWING;
            am.legR.rotation.x = -Math.sin(phase) * LEG_SWING;
            am.armL.rotation.x = -Math.sin(phase) * 0.3;
            am.armR.rotation.x = Math.sin(phase) * 0.3;
            am.body.position.y = 0.72 + Math.abs(Math.sin(phase * 2)) * 0.02; // bounce
          }
          break;
        }

        case 'sitting_working': {
          // Typing: rapid arm oscillation
          am.armL.rotation.x = Math.sin(t * 10 + am.idx) * 0.15;
          am.armR.rotation.x = Math.sin(t * 10 + am.idx + 1.5) * 0.15;
          // Subtle body micro-movement
          am.body.position.y = 0.72 + Math.sin(t * 3) * 0.003;
          // Occasional head tilt (looking at screen)
          am.head.rotation.y = Math.sin(t * 0.3 + am.idx * 1.7) * 0.05;
          // Legs still
          am.legL.rotation.x = 0; am.legR.rotation.x = 0;
          am.group.rotation.y = 0; // face desk
          break;
        }

        case 'sitting_idle': {
          // Fidget: shift weight, look around, occasional arm movement
          am.head.rotation.y = Math.sin(t * 0.4 + am.idx * 2.1) * 0.25;
          am.head.rotation.x = Math.sin(t * 0.2 + am.idx) * 0.05;
          am.body.rotation.z = Math.sin(t * 0.15 + am.idx * 3) * 0.02; // lean
          // Arm fidget
          if (Math.sin(t * 0.5 + am.idx * 5) > 0.8) {
            am.armR.rotation.x = Math.sin(t * 3) * 0.1;
          } else {
            am.armR.rotation.x *= 0.95; // relax
          }
          am.armL.rotation.x *= 0.95;
          am.legL.rotation.x = 0; am.legR.rotation.x = 0;
          am.group.rotation.y = Math.sin(t * 0.1 + am.idx) * 0.1; // slight chair swivel
          break;
        }

        case 'sleeping': {
          // Breathing
          am.body.scale.y = 1 + Math.sin(t * 1.5 + am.idx) * 0.025;
          // Zzz particles
          updateZzz(am, t);
          am.group.rotation.y = 0;
          break;
        }

        case 'standing_idle': {
          // Standing at a POI — look around, shift weight
          am.head.rotation.y = Math.sin(t * 0.6 + am.idx * 2) * 0.4;
          am.head.rotation.x = Math.sin(t * 0.3 + am.idx) * 0.1;
          am.body.position.y = 0.72;
          // Weight shift: lean side to side
          am.body.rotation.z = Math.sin(t * 0.3 + am.idx * 2.5) * 0.04;
          // Arms relaxed at sides, slight movement
          am.armL.rotation.x = Math.sin(t * 0.5 + am.idx) * 0.08;
          am.armR.rotation.x = -Math.sin(t * 0.4 + am.idx) * 0.06;
          am.legL.rotation.x = 0; am.legR.rotation.x = 0;
          break;
        }
      }

      // Blinking (all states except sleeping)
      if (am.state !== 'sleeping') {
        const blinkCycle = (t + am.idx * 3.7) % 4;
        const isBlinking = blinkCycle > 3.8;
        am.eyeL.scale.y = isBlinking ? 0.1 : 1;
        am.eyeR.scale.y = isBlinking ? 0.1 : 1;
      }

      // Speech bubble fade based on state
      if (am.speechBubble) {
        am.speechBubble.material.opacity = am.state === 'sitting_working' ? 
          0.7 + Math.sin(t * 2) * 0.15 : 0.3;
      }
    });

    // Ambient animations
    ambientObjects.forEach(obj => {
      switch (obj.type) {
        case 'led':
          // Random flicker
          obj.mat.emissiveIntensity = 0.5 + Math.sin(t * 4 + obj.idx * 7) * 0.3 +
            (Math.random() > 0.98 ? 0.5 : 0);
          break;
        case 'plant':
          // Gentle sway
          obj.meshes.forEach((m, i) => {
            m.position.y = obj.baseY[i] + Math.sin(t * 0.8 + obj.idx * 2 + i) * 0.015;
            m.rotation.z = Math.sin(t * 0.5 + obj.idx * 3 + i) * 0.05;
          });
          break;
        case 'lamp':
          // Warm glow pulse
          obj.mat.emissiveIntensity = 0.25 + Math.sin(t * 0.7 + obj.idx) * 0.08;
          break;
      }
    });

    controls.update();
    renderer.render(scene, camera);
  }

  return {
    start, stop, dispose, updateAgents,
    isActive: () => active,
    isInitialized: () => initialized,
    debugSnapshot: () => ({
      active,
      initialized,
      lastPollAt,
      lastUpdateAt,
      agentCount: Object.keys(agentMeshes).length,
      agents: Object.entries(agentMeshes).map(([name, am]) => ({
        name,
        state: am.state,
        apiStatus: am.prevApiStatus,
        isWandering: !!am.isWandering,
        walkProgress: Number((am.walkProgress || 0).toFixed(3)),
        position: {
          x: Number(am.group.position.x.toFixed(2)),
          y: Number(am.group.position.y.toFixed(2)),
          z: Number(am.group.position.z.toFixed(2))
        },
        deskPos: {
          x: Number(am.deskPos.x.toFixed(2)),
          z: Number(am.deskPos.z.toFixed(2))
        },
        walkTo: am.walkTo ? {
          x: Number(am.walkTo.x.toFixed(2)),
          z: Number(am.walkTo.z.toFixed(2))
        } : null,
        speech: am.lastMessage || ''
      }))
    })
  };
})();
