// ===== AGENT SPACE — 3D VIRTUAL OFFICE (Three.js) =====
// Isometric voxel-style office matching reference screenshot.
// Warm floor, blocky characters, name badges with status dots.

window.Office3D = (function() {
  let THREE, OrbitControls;
  let scene, camera, renderer, controls, clock;
  let container = null;
  let initialized = false, active = false;
  let animFrameId = null;
  let agentMeshes = {}; // name -> { group, body, head, desk, chair, ring, status }
  let furnitureGroup;

  // Colors matching reference
  const FLOOR_COLOR = 0xd4c4a0;      // warm beige
  const FLOOR_COLOR2 = 0xc8b890;     // slightly darker beige
  const WALL_COLOR = 0xb8a882;        // tan wall
  const DESK_COLOR = 0x8B6914;        // brown desk
  const DESK_DARK = 0x6B4F10;         // darker brown for sides
  const CHAIR_COLOR = 0x3b5998;       // blue office chair
  const MONITOR_BODY = 0x2a2a2a;      // dark monitor
  const MONITOR_SCREEN = 0x4a9eff;    // blue screen glow
  const SERVER_COLOR = 0x1a2744;      // dark navy server rack
  const COUCH_COLOR = 0x7b5ea7;       // purple couch
  const PLANT_POT = 0x8B6914;
  const PLANT_GREEN = 0x2d8a4e;
  const BOOKSHELF_COLOR = 0x6B4F10;
  const LAMP_COLOR = 0xffd700;
  const SKIN_COLOR = 0xffd5a0;

  const GRID = { cols: 14, rows: 10 };
  const TILE = 1.5; // tile size

  async function loadThreeJS() {
    if (THREE) return;
    // importmap for bare specifiers
    if (!document.querySelector('script[type="importmap"]')) {
      const s = document.createElement('script');
      s.type = 'importmap';
      s.textContent = JSON.stringify({ imports: {
        'three': 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
        'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/'
      }});
      document.head.appendChild(s);
    }
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
    const ctrl = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js');
    OrbitControls = ctrl.OrbitControls;
  }

  // ── FLOOR ──
  function createFloor() {
    const geo = new THREE.PlaneGeometry(GRID.cols * TILE, GRID.rows * TILE);
    const mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.9 });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid lines for tile feel
    const lineGeo = new THREE.BufferGeometry();
    const pts = [];
    const hw = GRID.cols * TILE / 2, hh = GRID.rows * TILE / 2;
    for (let i = 0; i <= GRID.cols; i++) {
      const x = -hw + i * TILE;
      pts.push(x, 0.01, -hh, x, 0.01, hh);
    }
    for (let j = 0; j <= GRID.rows; j++) {
      const z = -hh + j * TILE;
      pts.push(-hw, 0.01, z, hw, 0.01, z);
    }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc0b080, transparent: true, opacity: 0.3 });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);
  }

  // ── WALLS (back + left, low height) ──
  function createWalls() {
    const wallH = 3;
    const mat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.8 });
    const hw = GRID.cols * TILE / 2, hh = GRID.rows * TILE / 2;

    // Back wall
    const backGeo = new THREE.BoxGeometry(GRID.cols * TILE, wallH, 0.15);
    const back = new THREE.Mesh(backGeo, mat);
    back.position.set(0, wallH / 2, -hh);
    back.castShadow = true; back.receiveShadow = true;
    scene.add(back);

    // Left wall
    const leftGeo = new THREE.BoxGeometry(0.15, wallH, GRID.rows * TILE);
    const left = new THREE.Mesh(leftGeo, mat);
    left.position.set(-hw, wallH / 2, 0);
    left.castShadow = true; left.receiveShadow = true;
    scene.add(left);
  }

  // ── DESK (L-shaped like reference) ──
  function createDesk(x, z) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: DESK_COLOR, roughness: 0.6 });
    const matDark = new THREE.MeshStandardMaterial({ color: DESK_DARK, roughness: 0.6 });

    // Main surface
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), mat);
    top.position.y = 0.72; top.castShadow = true;
    g.add(top);

    // Side extension (L-shape)
    const ext = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.5), mat);
    ext.position.set(0.5, 0.72, -0.65); ext.castShadow = true;
    g.add(ext);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.06, 0.72, 0.06);
    [[-0.72, 0.36, -0.32], [0.72, 0.36, -0.32], [-0.72, 0.36, 0.32], [0.72, 0.36, 0.32]].forEach(([lx,ly,lz]) => {
      const leg = new THREE.Mesh(legGeo, matDark);
      leg.position.set(lx, ly, lz);
      g.add(leg);
    });

    // Monitor
    const monBase = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: MONITOR_BODY }));
    monBase.position.set(0, 0.77, -0.15);
    g.add(monBase);

    const monStand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.04), new THREE.MeshStandardMaterial({ color: MONITOR_BODY }));
    monStand.position.set(0, 0.85, -0.15);
    g.add(monStand);

    const monScreen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.04),
      new THREE.MeshStandardMaterial({ color: MONITOR_BODY }));
    monScreen.position.set(0, 1.1, -0.15);
    g.add(monScreen);

    // Screen face (emissive)
    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.29),
      new THREE.MeshStandardMaterial({ color: MONITOR_SCREEN, emissive: new THREE.Color(MONITOR_SCREEN), emissiveIntensity: 0.4 }));
    screenFace.position.set(0, 1.1, -0.12);
    g.add(screenFace);

    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  // ── OFFICE CHAIR ──
  function createChair(x, z) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: CHAIR_COLOR, roughness: 0.5 });

    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), mat);
    seat.position.y = 0.45;
    g.add(seat);

    // Back
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), mat);
    back.position.set(0, 0.73, 0.2);
    g.add(back);

    // Base pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    pole.position.y = 0.22;
    g.add(pole);

    // Wheel base (star shape approximation — 5 legs)
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
      leg.position.set(Math.sin(angle) * 0.12, 0.02, Math.cos(angle) * 0.12);
      leg.rotation.y = angle;
      g.add(leg);
    }

    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  // ── BLOCKY CHARACTER ──
  function createCharacter(color) {
    const g = new THREE.Group();
    const col = new THREE.Color(typeof color === 'string' ? parseInt(color.replace('#',''), 16) : color);

    // Body (box)
    const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.25), bodyMat);
    body.position.y = 0.72; body.castShadow = true;
    g.add(body);

    // Head (box, skin colored)
    const headMat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.25), headMat);
    head.position.y = 1.12; head.castShadow = true;
    g.add(head);

    // Hair (dark box on top)
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.27), hairMat);
    hair.position.y = 1.31;
    g.add(hair);

    // Eyes (two small black boxes)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), eyeMat);
    eyeL.position.set(-0.07, 1.14, -0.13);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), eyeMat);
    eyeR.position.set(0.07, 1.14, -0.13);
    g.add(eyeR);

    // Arms (small boxes at sides)
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.15), bodyMat);
    armL.position.set(-0.24, 0.72, 0);
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.15), bodyMat);
    armR.position.set(0.24, 0.72, 0);
    g.add(armR);

    return { group: g, body, head, hair, armL, armR };
  }

  // ── NAME BADGE (Canvas → Sprite) ──
  function createNameBadge(name, status) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 48;
    const ctx = canvas.getContext('2d');

    // Rounded black background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, 4, 4, 248, 40, 10);
    ctx.fill();

    // Status dot
    const dotColors = { working: '#22c55e', idle: '#eab308', sleeping: '#6b7280' };
    ctx.fillStyle = dotColors[status] || '#6b7280';
    ctx.beginPath();
    ctx.arc(230, 24, 7, 0, Math.PI * 2);
    ctx.fill();

    // Name text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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
  }

  // ── FURNITURE ──
  function createFurniture() {
    furnitureGroup = new THREE.Group();
    const hw = GRID.cols * TILE / 2, hh = GRID.rows * TILE / 2;

    // Server rack (back-right corner)
    const srvMat = new THREE.MeshStandardMaterial({ color: SERVER_COLOR, roughness: 0.4, metalness: 0.3 });
    const srv = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.6), srvMat);
    srv.position.set(hw - 1.5, 1.1, -hh + 0.5); srv.castShadow = true;
    furnitureGroup.add(srv);

    // Server LEDs
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: new THREE.Color(0x00ff44), emissiveIntensity: 0.8 }));
      led.position.set(hw - 1.35, 0.5 + i * 0.4, -hh + 0.82);
      furnitureGroup.add(led);
    }

    // Couch (back-left area)
    const couchMat = new THREE.MeshStandardMaterial({ color: COUCH_COLOR, roughness: 0.7 });
    const couchSeat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.7), couchMat);
    couchSeat.position.set(-hw + 2, 0.35, -hh + 1.5); couchSeat.castShadow = true;
    furnitureGroup.add(couchSeat);
    const couchBack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.15), couchMat);
    couchBack.position.set(-hw + 2, 0.7, -hh + 1.15); couchBack.castShadow = true;
    furnitureGroup.add(couchBack);
    // Armrests
    const couchArmL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.7), couchMat);
    couchArmL.position.set(-hw + 1.15, 0.5, -hh + 1.5);
    furnitureGroup.add(couchArmL);
    const couchArmR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.7), couchMat);
    couchArmR.position.set(-hw + 2.85, 0.5, -hh + 1.5);
    furnitureGroup.add(couchArmR);

    // Bookshelf (against back wall, center-left)
    const bsMat = new THREE.MeshStandardMaterial({ color: BOOKSHELF_COLOR, roughness: 0.7 });
    const bs = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.4), bsMat);
    bs.position.set(-2, 1.0, -hh + 0.3); bs.castShadow = true;
    furnitureGroup.add(bs);
    // Shelf dividers
    for (let i = 0; i < 3; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.04, 0.35), bsMat);
      shelf.position.set(-2, 0.4 + i * 0.6, -hh + 0.3);
      furnitureGroup.add(shelf);
    }
    // Colored book spines
    const bookColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22];
    bookColors.forEach((c, i) => {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.2),
        new THREE.MeshStandardMaterial({ color: c }));
      book.position.set(-2.4 + i * 0.22, 0.6, -hh + 0.3);
      furnitureGroup.add(book);
    });

    // Plants (scattered)
    const plantPositions = [
      [hw - 0.6, -hh + 0.6], [-hw + 0.6, hh - 0.6], [hw - 0.6, hh - 0.6], [2, -hh + 0.6]
    ];
    plantPositions.forEach(([px, pz]) => {
      // Pot
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: PLANT_POT }));
      pot.position.set(px, 0.13, pz);
      furnitureGroup.add(pot);
      // Plant (simple sphere cluster)
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6),
        new THREE.MeshStandardMaterial({ color: PLANT_GREEN, roughness: 0.8 }));
      leaf.position.set(px, 0.45, pz);
      furnitureGroup.add(leaf);
      const leaf2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a9a5e, roughness: 0.8 }));
      leaf2.position.set(px + 0.08, 0.55, pz - 0.05);
      furnitureGroup.add(leaf2);
    });

    // Floor lamps
    const lampPositions = [[-hw + 0.6, -hh + 3], [hw - 0.6, 2]];
    lampPositions.forEach(([lx, lz]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x888888 }));
      pole.position.set(lx, 0.75, lz);
      furnitureGroup.add(pole);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.2, 8),
        new THREE.MeshStandardMaterial({ color: LAMP_COLOR, emissive: new THREE.Color(LAMP_COLOR), emissiveIntensity: 0.3 }));
      shade.position.set(lx, 1.55, lz);
      furnitureGroup.add(shade);
    });

    // Whiteboard on back wall
    const wbFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xcccccc }));
    wbFrame.position.set(3, 1.8, -hh + 0.1);
    furnitureGroup.add(wbFrame);
    const wbSurface = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xf8f8f8 }));
    wbSurface.position.set(3, 1.8, -hh + 0.14);
    furnitureGroup.add(wbSurface);

    scene.add(furnitureGroup);
  }

  // ── GRID → WORLD ──
  function gridToWorld(gx, gy) {
    const hw = GRID.cols * TILE / 2, hh = GRID.rows * TILE / 2;
    return {
      x: -hw + gx * TILE + TILE / 2,
      z: -hh + gy * TILE + TILE / 2
    };
  }

  // ── INIT ──
  async function start(containerEl) {
    container = containerEl;
    if (initialized) { resume(); return; }

    await loadThreeJS();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd0e8f8); // light blue sky
    scene.fog = new THREE.FogExp2(0xd0e8f8, 0.012);

    // Isometric-style camera (orthographic for that flat isometric feel)
    const aspect = container.clientWidth / container.clientHeight;
    const frustum = 10;
    camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum, 0.1, 100
    );
    // Classic isometric angle
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Touch-friendly controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.5;
    controls.minPolarAngle = Math.PI / 6;
    controls.enablePan = true;
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 0.8;
    controls.minZoom = 0.5;
    controls.maxZoom = 3;
    // Touch: enable pinch zoom + swipe pan
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    clock = new THREE.Clock();

    // Lights
    const ambient = new THREE.AmbientLight(0xb0c0d0, 0.8);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff8e0, 1.5);
    sun.position.set(12, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    scene.add(sun);

    // Warm fill light from opposite side
    const fill = new THREE.DirectionalLight(0xffd4a0, 0.4);
    fill.position.set(-8, 6, -5);
    scene.add(fill);

    createFloor();
    createWalls();
    createFurniture();

    // Resize handler
    const onResize = () => {
      if (!container || !active) return;
      const w = container.clientWidth, h = container.clientHeight;
      const a = w / h;
      camera.left = -frustum * a;
      camera.right = frustum * a;
      camera.top = frustum;
      camera.bottom = -frustum;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    container._resizeHandler = onResize;

    initialized = true;
    active = true;
    animate();
  }

  function resume() {
    if (!initialized) return;
    active = true;
    container.appendChild(renderer.domElement);
    if (container._resizeHandler) container._resizeHandler();
    animate();
  }

  function stop() {
    active = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    if (renderer && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  function dispose() {
    stop();
    if (renderer) renderer.dispose();
    initialized = false;
    agentMeshes = {};
  }

  // ── AGENT UPDATE ──
  function updateAgents(agents) {
    if (!initialized || !active) return;

    const seen = new Set();
    agents.forEach((agent, idx) => {
      const name = agent.name;
      seen.add(name);

      if (!agentMeshes[name]) {
        // Find desk position
        const deskPos = (typeof deskPositions !== 'undefined' && deskPositions[name])
          || (typeof getAutoDesk === 'function' && getAutoDesk(name))
          || { gx: 2 + (idx % 5) * 2, gy: 2 + Math.floor(idx / 5) * 3 };

        const wp = gridToWorld(deskPos.gx, deskPos.gy);
        const desk = createDesk(wp.x, wp.z);
        const chair = createChair(wp.x, wp.z + 0.6);
        const char = createCharacter(agent.color || '#3b82f6');
        char.group.position.set(wp.x, 0, wp.z + 0.5);
        scene.add(char.group);

        const badge = createNameBadge(name, agent.status);
        char.group.add(badge);

        agentMeshes[name] = { ...char, desk, chair, badge, wp, status: null, idx };
      }

      const am = agentMeshes[name];

      // Update status
      if (am.status !== agent.status) {
        am.status = agent.status;
        // Update badge
        if (am.badge) {
          am.group.remove(am.badge);
          am.badge = createNameBadge(name, agent.status);
          am.group.add(am.badge);
        }

        if (agent.status === 'sleeping') {
          am.head.position.y = 0.95;
          am.head.rotation.x = 0.4;
          am.body.rotation.x = 0.3;
          am.body.position.y = 0.62;
        } else {
          am.head.position.y = 1.12;
          am.head.rotation.x = 0;
          am.body.rotation.x = 0;
          am.body.position.y = 0.72;
        }
      }
    });

    // Remove agents no longer present
    Object.keys(agentMeshes).forEach(name => {
      if (!seen.has(name)) {
        const am = agentMeshes[name];
        if (am.group) scene.remove(am.group);
        if (am.desk) scene.remove(am.desk);
        if (am.chair) scene.remove(am.chair);
        delete agentMeshes[name];
      }
    });
  }

  // ── ANIMATION LOOP ──
  function animate() {
    if (!active) return;
    animFrameId = requestAnimationFrame(animate);

    const t = clock.getElapsedTime();

    Object.values(agentMeshes).forEach(am => {
      if (am.status === 'working') {
        // Typing animation: arms move up/down
        am.armL.rotation.x = Math.sin(t * 8 + am.idx) * 0.15;
        am.armR.rotation.x = Math.sin(t * 8 + am.idx + 1) * 0.15;
        am.body.position.y = 0.72 + Math.sin(t * 4) * 0.005;
      } else if (am.status === 'idle') {
        // Slight look-around
        am.head.rotation.y = Math.sin(t * 0.5 + (am.idx || 0)) * 0.2;
        am.armL.rotation.x = 0;
        am.armR.rotation.x = 0;
      } else if (am.status === 'sleeping') {
        // Gentle breathing
        am.body.scale.y = 1 + Math.sin(t * 1.5) * 0.02;
      }
    });

    controls.update();
    renderer.render(scene, camera);
  }

  return {
    start,
    stop,
    dispose,
    updateAgents,
    isActive: () => active,
    isInitialized: () => initialized
  };
})();
