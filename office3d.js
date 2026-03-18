// ===== AGENT SPACE — 3D VIRTUAL OFFICE (Three.js) =====
// Replaces the 2D isometric canvas with a 3D scene when toggled.
// Uses Three.js + OrbitControls from CDN (loaded dynamically).

window.Office3D = (function() {
  'use strict';

  let THREE, OrbitControls;
  let scene, camera, renderer, controls, clock;
  let container, animFrameId;
  let agentMeshes = {}; // name -> { group, desk, monitor, character, bubble, nameTag }
  let floorMesh, wallMeshes = [];
  let sunLight, ambientLight, pointLights = [];
  let initialized = false;
  let active = false;

  // Colors
  const FLOOR_COLOR = 0x5a7a9a;
  const FLOOR_COLOR2 = 0x4e6e8e;
  const WALL_COLOR = 0x5a7a9a;
  const DESK_COLOR = 0x9B7924;
  const MONITOR_COLOR = 0x1a1f2e;
  const MONITOR_SCREEN = 0x3b82f6;

  // Agent colors (parsed from hex strings)
  function hexToInt(hex) {
    return parseInt(hex.replace('#', ''), 16);
  }

  // Grid config matching 2D office
  const GRID = { cols: 16, rows: 10 };
  const TILE_SIZE = 2;

  async function loadThreeJS() {
    if (THREE) return;
    const importMap = { imports: { 'three': 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js', 'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/' } };
    // Create import map if needed
    if (!document.querySelector('script[type="importmap"]')) {
      const s = document.createElement('script');
      s.type = 'importmap';
      s.textContent = JSON.stringify(importMap);
      document.head.appendChild(s);
    }
    // Dynamic import
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
    const controls = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js');
    OrbitControls = controls.OrbitControls;
  }

  function createFloor() {
    // Checkerboard floor
    const geo = new THREE.PlaneGeometry(GRID.cols * TILE_SIZE, GRID.rows * TILE_SIZE, GRID.cols, GRID.rows);
    const colors = [];
    const color1 = new THREE.Color(FLOOR_COLOR);
    const color2 = new THREE.Color(FLOOR_COLOR2);
    // Assign vertex colors for checkerboard
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = Math.floor((posAttr.getX(i) + GRID.cols * TILE_SIZE / 2) / TILE_SIZE);
      const y = Math.floor((posAttr.getY(i) + GRID.rows * TILE_SIZE / 2) / TILE_SIZE);
      const c = (x + y) % 2 === 0 ? color1 : color2;
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
    floorMesh = new THREE.Mesh(geo, mat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
  }

  function createWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.7, metalness: 0.1 });
    const wallHeight = 4;

    // Back wall
    const backGeo = new THREE.BoxGeometry(GRID.cols * TILE_SIZE, wallHeight, 0.3);
    const backWall = new THREE.Mesh(backGeo, wallMat);
    backWall.position.set(0, wallHeight / 2, -GRID.rows * TILE_SIZE / 2);
    backWall.castShadow = true;
    scene.add(backWall);
    wallMeshes.push(backWall);

    // Left wall
    const leftGeo = new THREE.BoxGeometry(0.3, wallHeight, GRID.rows * TILE_SIZE);
    const leftWall = new THREE.Mesh(leftGeo, wallMat);
    leftWall.position.set(-GRID.cols * TILE_SIZE / 2, wallHeight / 2, 0);
    leftWall.castShadow = true;
    scene.add(leftWall);
    wallMeshes.push(leftWall);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(GRID.cols * TILE_SIZE, GRID.rows * TILE_SIZE);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x8898a8, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    ceiling.receiveShadow = true;
    scene.add(ceiling);
  }

  function createDesk(x, z, color) {
    const group = new THREE.Group();

    // Desk surface
    const topGeo = new THREE.BoxGeometry(1.8, 0.1, 0.9);
    const topMat = new THREE.MeshStandardMaterial({ color: DESK_COLOR, roughness: 0.6 });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 0.75;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.75);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.3 });
    const positions = [[-0.8, 0.375, -0.35], [0.8, 0.375, -0.35], [-0.8, 0.375, 0.35], [0.8, 0.375, 0.35]];
    positions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, ly, lz);
      group.add(leg);
    });

    // Monitor
    const monGeo = new THREE.BoxGeometry(0.6, 0.4, 0.05);
    const monMat = new THREE.MeshStandardMaterial({ color: MONITOR_COLOR, roughness: 0.3, metalness: 0.5 });
    const monitor = new THREE.Mesh(monGeo, monMat);
    monitor.position.set(0, 1.15, -0.3);
    group.add(monitor);

    // Screen (emissive)
    const scrGeo = new THREE.PlaneGeometry(0.5, 0.3);
    const scrMat = new THREE.MeshStandardMaterial({ color: MONITOR_SCREEN, emissive: new THREE.Color(color || MONITOR_SCREEN), emissiveIntensity: 0.5, roughness: 0.2 });
    const screen = new THREE.Mesh(scrGeo, scrMat);
    screen.position.set(0, 1.15, -0.27);
    group.add(screen);

    // Monitor stand
    const standGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.3);
    const stand = new THREE.Mesh(standGeo, legMat);
    stand.position.set(0, 0.95, -0.3);
    group.add(stand);

    group.position.set(x, 0, z);
    scene.add(group);
    return { group, screen };
  }

  function createCharacter(color, name) {
    const group = new THREE.Group();
    const col = new THREE.Color(hexToInt(color));

    // Body (rounded box approximation with capsule)
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.4, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 12, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffd5a0, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 4);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    [-0.07, 0.07].forEach(dx => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(dx, 1.57, 0.15);
      group.add(eye);
    });

    // Chair
    const chairGeo = new THREE.BoxGeometry(0.5, 0.05, 0.5);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const seat = new THREE.Mesh(chairGeo, chairMat);
    seat.position.y = 0.55;
    seat.position.z = 0.2;
    group.add(seat);

    // Chair back
    const backGeo = new THREE.BoxGeometry(0.5, 0.5, 0.05);
    const back = new THREE.Mesh(backGeo, chairMat);
    back.position.set(0, 0.8, 0.45);
    group.add(back);

    // Name tag (sprite)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.roundRect(0, 0, 256, 64, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 2.0;
    sprite.scale.set(1.5, 0.4, 1);
    group.add(sprite);

    return { group, body, head, nameSprite: sprite };
  }

  function createSpeechBubble(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Bubble background
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 96, 16);
    ctx.fill();
    ctx.strokeStyle = color || '#3b82f6';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#1a1a2e';
    ctx.font = '20px system-ui';
    ctx.textAlign = 'center';
    const truncated = text.length > 50 ? text.substring(0, 47) + '...' : text;
    ctx.fillText(truncated, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 0.8, 1);
    return sprite;
  }

  function setupLighting() {
    // Ambient
    ambientLight = new THREE.AmbientLight(0x8090b0, 0.9);
    scene.add(ambientLight);

    // Sun (directional)
    sunLight = new THREE.DirectionalLight(0xfff0d0, 1.2);
    sunLight.position.set(10, 15, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 60;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    scene.add(sunLight);

    // Ceiling lights (point lights scattered across office)
    const lightPositions = [
      [-6, 3.8, -3], [0, 3.8, -3], [6, 3.8, -3],
      [-6, 3.8, 3], [0, 3.8, 3], [6, 3.8, 3]
    ];
    lightPositions.forEach(([x, y, z]) => {
      const pl = new THREE.PointLight(0xfff5e0, 0.6, 18);
      pl.position.set(x, y, z);
      scene.add(pl);
      pointLights.push(pl);

      // Light fixture visual
      const fixGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.1, 8);
      const fixMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
      const fixture = new THREE.Mesh(fixGeo, fixMat);
      fixture.position.set(x, y + 0.1, z);
      scene.add(fixture);
    });
  }

  function createFurniture() {
    // Plants
    const plantPositions = [[-14, 0, -8], [14, 0, -8], [-14, 0, 8], [14, 0, 8]];
    plantPositions.forEach(([x, y, z]) => {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 0.3, 8),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
      );
      pot.position.set(x, 0.15, z);
      scene.add(pot);

      // Leaves
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 4),
          new THREE.MeshStandardMaterial({ color: i % 2 ? 0x22c55e : 0x166534 })
        );
        const angle = (i / 5) * Math.PI * 2;
        leaf.position.set(x + Math.cos(angle) * 0.2, 0.45, z + Math.sin(angle) * 0.2);
        scene.add(leaf);
      }
    });

    // Whiteboard on back wall
    const wbGeo = new THREE.PlaneGeometry(3, 2);
    const wbMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3 });
    const wb = new THREE.Mesh(wbGeo, wbMat);
    wb.position.set(0, 2.5, -GRID.rows * TILE_SIZE / 2 + 0.2);
    scene.add(wb);

    // Server rack
    const srvGeo = new THREE.BoxGeometry(0.8, 2, 0.5);
    const srvMat = new THREE.MeshStandardMaterial({ color: 0x2d333b, metalness: 0.3 });
    const srv = new THREE.Mesh(srvGeo, srvMat);
    srv.position.set(-GRID.cols * TILE_SIZE / 2 + 1, 1, -GRID.rows * TILE_SIZE / 2 + 1);
    srv.castShadow = true;
    scene.add(srv);

    // LED on server
    const ledGeo = new THREE.SphereGeometry(0.04, 8, 4);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 2 });
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(-GRID.cols * TILE_SIZE / 2 + 1.2, 1.5 + i * 0.3, -GRID.rows * TILE_SIZE / 2 + 1.26);
      scene.add(led);
    }
  }

  function gridToWorld(gx, gy) {
    // Map grid coords (0-16, 0-10) to world coords
    const x = (gx - GRID.cols / 2) * TILE_SIZE + TILE_SIZE / 2;
    const z = (gy - GRID.rows / 2) * TILE_SIZE + TILE_SIZE / 2;
    return { x, z };
  }

  function updateDayNight() {
    if (!sunLight) return;
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour >= 20;
    const isDusk = (hour >= 18 && hour < 20) || (hour >= 6 && hour < 8);

    if (isNight) {
      sunLight.intensity = 0.1;
      ambientLight.intensity = 0.3;
      ambientLight.color.setHex(0x202040);
      scene.background = new THREE.Color(0x0a0a20);
      pointLights.forEach(pl => { pl.intensity = 0.8; });
    } else if (isDusk) {
      sunLight.intensity = 0.6;
      sunLight.color.setHex(0xffa050);
      ambientLight.intensity = 0.4;
      scene.background = new THREE.Color(0x1a1040);
      pointLights.forEach(pl => { pl.intensity = 0.5; });
    } else {
      sunLight.intensity = 1.2;
      sunLight.color.setHex(0xfff0d0);
      ambientLight.intensity = 0.6;
      ambientLight.color.setHex(0x404060);
      scene.background = new THREE.Color(0x87CEEB);
      pointLights.forEach(pl => { pl.intensity = 0.3; });
    }
  }

  function updateAgents(agents) {
    if (!initialized || !active) return;

    agents.forEach(agent => {
      const name = agent.name;
      if (!agentMeshes[name]) {
        // Find desk position from 2D canvas deskPositions or auto-assign
        const deskPos = (typeof deskPositions !== 'undefined' && deskPositions[name])
          || (typeof getAutoDesk === 'function' && getAutoDesk(name))
          || { gx: 8, gy: 5 };
        const wp = gridToWorld(deskPos.gx, deskPos.gy);
        const desk = createDesk(wp.x, wp.z, hexToInt(agent.color));
        const char = createCharacter(agent.color, name);
        char.group.position.set(wp.x, 0, wp.z + 0.5);
        scene.add(char.group);
        // Status ring (flat circle under agent)
        const ringGeo = new THREE.RingGeometry(0.35, 0.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wp.x, 0.02, wp.z + 0.5);
        scene.add(ring);
        agentMeshes[name] = { ...desk, ...char, ring, wp, status: null };
      }

      const am = agentMeshes[name];

      // Update status-based animations
      if (am.status !== agent.status) {
        am.status = agent.status;
        if (agent.status === 'sleeping') {
          am.head.position.y = 1.35;
          am.head.position.z = 0.1;
          am.body.rotation.x = 0.3;
          if (am.ring) { am.ring.material.color.setHex(0x64748b); am.ring.material.opacity = 0.3; }
        } else if (agent.status === 'working') {
          am.head.position.y = 1.55;
          am.head.position.z = 0;
          am.body.rotation.x = 0;
          if (am.ring) { am.ring.material.color.setHex(0x22c55e); am.ring.material.opacity = 0.6; }
        } else {
          am.head.position.y = 1.55;
          am.head.position.z = 0;
          am.body.rotation.x = 0;
          if (am.ring) { am.ring.material.color.setHex(0xf59e0b); am.ring.material.opacity = 0.5; }
        }
      }

      // Update speech bubble
      if (agent.lastMessage && agent.status === 'working') {
        if (am.bubble) am.group.remove(am.bubble);
        am.bubble = createSpeechBubble(agent.lastMessage, agent.color);
        am.bubble.position.y = 2.5;
        am.group.add(am.bubble);
      } else if (am.bubble && agent.status !== 'working') {
        am.group.remove(am.bubble);
        am.bubble = null;
      }
    });
  }

  function animate() {
    if (!active) return;
    animFrameId = requestAnimationFrame(animate);

    const time = clock.getElapsedTime();

    // Animate agents
    Object.values(agentMeshes).forEach(am => {
      if (am.status === 'working') {
        // Subtle typing bounce
        am.body.position.y = 1.1 + Math.sin(time * 8) * 0.01;
        // Screen flicker
        if (am.screen && am.screen.material) {
          am.screen.material.emissiveIntensity = 0.4 + Math.sin(time * 3) * 0.15;
        }
        // Pulse status ring
        if (am.ring) am.ring.material.opacity = 0.4 + 0.3 * Math.sin(time * 2);
      } else if (am.status === 'idle') {
        // Gentle sway
        am.group.rotation.y = Math.sin(time * 0.5 + am.wp.x) * 0.05;
      } else if (am.status === 'sleeping') {
        // Zzz bobbing
        am.head.position.y = 1.35 + Math.sin(time * 0.5) * 0.02;
      }
    });

    // Day/night cycle (update every 60 frames)
    if (Math.floor(time * 8) % 60 === 0) updateDayNight();

    controls.update();
    renderer.render(scene, camera);
  }

  function init(containerEl) {
    container = containerEl;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // sky blue
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

    clock = new THREE.Clock();

    // Camera
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(18, 10, 22);
    camera.lookAt(0, 1, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1; // Don't go below floor
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.target.set(0, 1, 0);

    // Build scene
    createFloor();
    createWalls();
    setupLighting();
    createFurniture();
    updateDayNight();

    // Handle resize
    const resizeObs = new ResizeObserver(() => {
      if (!container || !active) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObs.observe(container);

    initialized = true;
  }

  return {
    async start(containerEl) {
      await loadThreeJS();
      if (!initialized) init(containerEl);
      active = true;
      renderer.domElement.style.display = '';
      animate();
    },
    stop() {
      active = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (renderer) renderer.domElement.style.display = 'none';
    },
    updateAgents,
    isActive() { return active; },
    isInitialized() { return initialized; }
  };
})();
