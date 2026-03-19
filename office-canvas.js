// ===== ISOMETRIC 3D OFFICE =====
const ISO = { tileW: 80, tileH: 40 };
const GRID = { cols: 16, rows: 12 };
const oCanvas = document.getElementById('office-canvas');
let oCtx = oCanvas.getContext('2d', { willReadFrequently: true });

// Canvas context loss recovery — handles browser GC, tab backgrounding, GPU reset
oCanvas.addEventListener('contextlost', (e) => {
  e.preventDefault(); // allow restoration
  console.warn('[Agent Space] Canvas context lost');
});
oCanvas.addEventListener('contextrestored', () => {
  console.log('[Agent Space] Canvas context restored');
  oCtx = oCanvas.getContext('2d', { willReadFrequently: true });
  const dpr = window.devicePixelRatio || 1;
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  invalidateStaticCache();
});
// Also recover on tab re-focus (common trigger for context loss)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Immediate context health check — don't wait for RAF
    try {
      const dpr = window.devicePixelRatio || 1;
      oCtx.setTransform(1, 0, 0, 1, 0, 0);
      oCtx.fillStyle = 'rgba(1,2,3,1)';
      oCtx.fillRect(0, 0, 1, 1);
      const px = oCtx.getImageData(0, 0, 1, 1).data;
      oCtx.clearRect(0, 0, 1, 1);
      oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (px[0] !== 1 || px[1] !== 2 || px[2] !== 3 || px[3] === 0) {
        console.warn('[Agent Space] Canvas dead after tab focus — hard reset');
        const w = oCanvas.width, h = oCanvas.height;
        oCanvas.width = 1; oCanvas.width = w; oCanvas.height = h;
        oCtx = oCanvas.getContext('2d', { willReadFrequently: true });
        oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        invalidateStaticCache();
        resizeCanvas();
      }
    } catch(e) {}
    invalidateStaticCache();
  }
});

// OFFICE LAYOUT — auto-assigned from agent list
// Empty by default — auto-desk assignment handles placement dynamically
const deskPositions = {};

// Zone-aware desk slots — 16×12 grid, zones at col 8 / row 6
// INTERLEAVED: one from each zone per round → even distribution
const overflowDesks = [
  // Round 1: one from each zone
  {gx:3,  gy:2},  // Content (top-left)
  {gx:12, gy:2},  // Engineering (top-right)
  {gx:3,  gy:8},  // Leadership (bot-left)
  {gx:12, gy:8},  // Support (bot-right)
  // Round 2
  {gx:6,  gy:2},  // Content
  {gx:15, gy:2},  // Engineering — right edge but within bounds
  {gx:6,  gy:8},  // Leadership
  {gx:15, gy:8},  // Support
  // Round 3 (lower rows within each zone)
  {gx:3,  gy:4},  // Content
  {gx:12, gy:4},  // Engineering
  {gx:3,  gy:10}, // Leadership
  {gx:12, gy:10}, // Support
  // Round 4
  {gx:6,  gy:4},  // Content
  {gx:15, gy:4},  // Engineering
  {gx:6,  gy:10}, // Leadership
  {gx:15, gy:10}, // Support
];
const _assignedOverflow = {};
let _overflowIdx = 0;
function getAutoDesk(name) {
  if (_assignedOverflow[name]) return _assignedOverflow[name];
  if (_overflowIdx < overflowDesks.length) {
    _assignedOverflow[name] = overflowDesks[_overflowIdx++];
    // Also dynamically add a desk furniture item at this position
    furniture.push({ type:'desk', gx: _assignedOverflow[name].gx, gy: _assignedOverflow[name].gy });
    _sortedFurniture.push(furniture[furniture.length-1]);
    _sortedFurniture.sort((a,b)=>(a.gx+a.gy)-(b.gx+b.gy));
    invalidateStaticCache();
    return _assignedOverflow[name];
  }
  return null;
}

// Walking state for working agents
const agentWalking = {};

// ===== AGENT INTERACTION SYSTEM =====
// Idle/working agents occasionally leave desks for interactions
const agentInteractions = {}; // {agentName: {type, target, startTime, duration, fromGx, fromGy, toGx, toGy, phase}}
// Desk items left behind after POI visits — {agentName: [{type, placedAt, x, y}]}
const deskItems = {};
const DESK_ITEM_LIFETIME = 45000; // items stay on desk for 45 seconds then fade
const POI = { // Points of Interest
  whiteboard: {gx:10, gy:3},
  coffee: {gx:10, gy:10},
  server: {gx:19, gy:10},
  door: {gx:19, gy:7},
  plant: {gx:1, gy:1},
};
const INTERACTION_TYPES = ['coffee','whiteboard','chat','stretch','server-check','water-plant','phone-call'];

// Agent interaction preferences — derived from role, not hardcoded names
const AGENT_INTERACTION_PREFS = {};

// Role-based default interaction preferences (applied dynamically)
function getRolePrefs(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('code') || r.includes('engineer') || r.includes('dev')) return {coffee:3, whiteboard:1, chat:1, stretch:2, 'server-check':5};
  if (r.includes('qa') || r.includes('test') || r.includes('quality')) return {coffee:2, whiteboard:3, chat:2, stretch:1, 'server-check':4};
  if (r.includes('write') || r.includes('content') || r.includes('research')) return {coffee:3, whiteboard:1, chat:1, stretch:2, 'water-plant':2};
  if (r.includes('design') || r.includes('art') || r.includes('visual')) return {coffee:2, whiteboard:3, chat:2, stretch:2, 'water-plant':4};
  if (r.includes('mail') || r.includes('email') || r.includes('comms')) return {coffee:2, whiteboard:1, chat:2, stretch:2, 'phone-call':5};
  if (r.includes('director') || r.includes('lead') || r.includes('manager')) return {coffee:2, whiteboard:4, chat:3, stretch:1, 'phone-call':1};
  if (r.includes('ceo') || r.includes('mc') || r.includes('owner')) return {coffee:3, whiteboard:2, chat:4, stretch:1, 'phone-call':3};
  if (r.includes('publish') || r.includes('deploy') || r.includes('release')) return {coffee:2, whiteboard:1, chat:3, stretch:1, 'phone-call':3};
  if (r.includes('produce') || r.includes('video') || r.includes('media')) return {coffee:3, whiteboard:2, chat:2, stretch:1, 'server-check':2, 'phone-call':1};
  return {coffee:2, whiteboard:2, chat:2, stretch:2};
}

function pickWeightedInteraction(agentName, availableTypes, time) {
  const agent = agentData.find(a => a.name === agentName);
  const prefs = AGENT_INTERACTION_PREFS[agentName] || getRolePrefs(agent?.role) || {};
  const weights = availableTypes.map(t => prefs[t] || 1);
  const total = weights.reduce((a,b)=>a+b, 0);
  // Use time-based pseudo-random for determinism within a frame
  const seed = (agentName.charCodeAt(0)*137 + agentName.length*53 + Math.floor(time/1000)) % 10000;
  let r = (seed / 10000) * total;
  for (let i = 0; i < availableTypes.length; i++) {
    r -= weights[i];
    if (r <= 0) return availableTypes[i];
  }
  return availableTypes[availableTypes.length - 1];
}

function tickInteractions(agents, time) {
  agents.forEach(a => {
    const desk = deskPositions[a.name];
    if (!desk) return;
    const cur = agentInteractions[a.name];

    // Only idle agents do interactions (working agents stay focused)
    if (a.status !== 'idle') {
      if (cur) delete agentInteractions[a.name];
      return;
    }

    // Currently interacting — check if done
    if (cur) {
      if (time - cur.startTime > cur.duration) {
        // Return phase: walking back to desk
        if (cur.phase === 'going') {
          cur.phase = 'at-poi';
          cur.phaseStart = time;
          cur.atDuration = 3000 + Math.random() * 4000; // hang out 3-7s
          // Collaborative whiteboard: extend duration if partner is there
          if (cur.type === 'collab-whiteboard') cur.atDuration = 6000 + Math.random() * 5000;
        } else if (cur.phase === 'at-poi' && time - cur.phaseStart > cur.atDuration) {
          cur.phase = 'returning';
          cur.phaseStart = time;
          cur.returnDuration = cur.duration; // same walk time back
          // Pick up item to carry back
          const itemMap = {coffee:'mug', 'read-bookshelf':'book', 'water-plant':'can', 'server-check':'tablet'};
          cur.carriedItem = itemMap[cur.type] || null;
        } else if (cur.phase === 'returning' && time - cur.phaseStart > cur.returnDuration) {
          // Deposit carried item on desk
          if (cur.carriedItem) {
            if (!deskItems[a.name]) deskItems[a.name] = [];
            // Remove any existing item of same type to avoid duplicates
            deskItems[a.name] = deskItems[a.name].filter(di => di.type !== cur.carriedItem);
            deskItems[a.name].push({
              type: cur.carriedItem,
              placedAt: time,
              offsetX: 8 + Math.random() * 6, // slight randomness in desk placement
              offsetY: -24 - Math.random() * 4,
            });
            // Max 3 items per desk
            if (deskItems[a.name].length > 3) { deskItems[a.name][0] = deskItems[a.name][deskItems[a.name].length - 1]; deskItems[a.name].pop(); }
          }
          delete agentInteractions[a.name];
        }
      }
      return;
    }

    // Random chance to start interaction (~every 20-40s on average)
    const seed = (a.name.charCodeAt(0) * 271 + a.name.length * 97) % 10000;
    const interval = 20000 + seed * 2;
    const roll = Math.sin(time / interval + seed) + Math.sin(time / (interval * 0.7) + seed * 3);
    if (roll > 1.85) {
      // Check if another agent is already at or heading to the whiteboard — join them for collab
      const wbPartner = Object.entries(agentInteractions).find(([name, inter]) =>
        name !== a.name && (inter.type === 'whiteboard' || inter.type === 'collab-whiteboard') &&
        (inter.phase === 'at-poi' || inter.phase === 'going')
      );

      if (wbPartner && Math.random() < 0.6) {
        // Join as collaborative whiteboard session
        const partnerName = wbPartner[0];
        // Stand slightly offset from whiteboard
        const toGx = POI.whiteboard.gx + 1;
        const toGy = POI.whiteboard.gy + 1;
        const dist = Math.abs(toGx - desk.gx) + Math.abs(toGy - desk.gy);
        const walkTime = dist * 600 + 800;
        // Upgrade partner's interaction to collab too
        wbPartner[1].type = 'collab-whiteboard';
        wbPartner[1].collabPartner = a.name;
        agentInteractions[a.name] = {
          type: 'collab-whiteboard', startTime: time, duration: walkTime,
          fromGx: desk.gx, fromGy: desk.gy, toGx, toGy,
          phase: 'going', phaseStart: time,
          collabPartner: partnerName,
          atDuration: 6000 + Math.random() * 5000,
          returnDuration: walkTime,
        };
        return;
      }

      // Build available interaction types
      const types = ['coffee','whiteboard','stretch','water-plant','phone-call'];
      const role = (a.role || '').toLowerCase();
      if (role.includes('code') || role.includes('engineer') || role.includes('dev') || role.includes('qa') || role.includes('test') || role.includes('produce') || role.includes('ops')) types.push('server-check');
      // Chat: find a nearby idle agent
      const nearbyIdle = agents.filter(b => b.name !== a.name && b.status === 'idle' && deskPositions[b.name] && !agentInteractions[b.name]);
      if (nearbyIdle.length > 0) types.push('chat');

      const type = pickWeightedInteraction(a.name, types, time);
      let toGx, toGy, chatPartner = null;

      if (type === 'coffee') { toGx = POI.coffee.gx; toGy = POI.coffee.gy; }
      else if (type === 'whiteboard') { toGx = POI.whiteboard.gx; toGy = POI.whiteboard.gy; }
      else if (type === 'server-check') { toGx = POI.server.gx; toGy = POI.server.gy; }
      else if (type === 'water-plant') {
        // Walk to nearest plant
        const plantPoi = [POI.plant, {gx:8,gy:1}, {gx:1,gy:9}];
        const nearest = plantPoi.reduce((best,p) => {
          const d = Math.abs(p.gx-desk.gx)+Math.abs(p.gy-desk.gy);
          return d < best.d ? {p,d} : best;
        }, {p:plantPoi[0], d:999});
        toGx = nearest.p.gx; toGy = nearest.p.gy;
      }
      else if (type === 'phone-call') {
        // Walk to a quiet corner near their desk
        toGx = Math.min(GRID.cols - 1, desk.gx + 2);
        toGy = Math.max(1, desk.gy - 1);
      }
      else if (type === 'stretch') {
        toGx = desk.gx + Math.round((Math.random() - 0.5) * 3);
        toGy = desk.gy + Math.round((Math.random() - 0.5) * 2);
        toGx = Math.max(1, Math.min(GRID.cols - 1, toGx));
        toGy = Math.max(1, Math.min(GRID.rows - 1, toGy));
      } else if (type === 'chat') {
        chatPartner = nearbyIdle[Math.floor(Math.random() * nearbyIdle.length)];
        const partnerDesk = deskPositions[chatPartner.name];
        toGx = Math.round((desk.gx + partnerDesk.gx) / 2);
        toGy = Math.round((desk.gy + partnerDesk.gy) / 2);
      }

      const dist = Math.abs(toGx - desk.gx) + Math.abs(toGy - desk.gy);
      const walkTime = dist * 600 + 800;

      agentInteractions[a.name] = {
        type, startTime: time, duration: walkTime,
        fromGx: desk.gx, fromGy: desk.gy, toGx, toGy,
        phase: 'going', phaseStart: time,
        chatPartner: chatPartner?.name || null,
        atDuration: 3000 + Math.random() * 4000,
        returnDuration: walkTime,
      };
    }
  });
}

function getInteractionOffset(agentName, time) {
  const inter = agentInteractions[agentName];
  if (!inter) return null;
  const desk = deskPositions[agentName];
  if (!desk) return null;

  let progress, fromGx, fromGy, toGx, toGy;

  if (inter.phase === 'going') {
    progress = Math.min(1, (time - inter.startTime) / inter.duration);
    fromGx = inter.fromGx; fromGy = inter.fromGy;
    toGx = inter.toGx; toGy = inter.toGy;
  } else if (inter.phase === 'at-poi') {
    return { gx: inter.toGx, gy: inter.toGy, atPoi: true, type: inter.type, chatPartner: inter.chatPartner, collabPartner: inter.collabPartner, carriedItem: inter.carriedItem };
  } else if (inter.phase === 'returning') {
    progress = Math.min(1, (time - inter.phaseStart) / inter.returnDuration);
    fromGx = inter.toGx; fromGy = inter.toGy;
    toGx = inter.fromGx; toGy = inter.fromGy;
  } else return null;

  // Ease in-out
  const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  const gx = fromGx + (toGx - fromGx) * ease;
  const gy = fromGy + (toGy - fromGy) * ease;
  return { gx, gy, atPoi: false, type: inter.type, chatPartner: inter.chatPartner, walking: true, carriedItem: inter.carriedItem, dx: toGx - fromGx, dy: toGy - fromGy };
}

const furniture = [
  // Decor spread across 16×12 grid — no overlap with desk positions
  // Corner plants
  { type:'plant', gx:1, gy:1 }, { type:'plant', gx:15, gy:1 }, { type:'plant', gx:1, gy:11 }, { type:'plant', gx:15, gy:11 },
  // Center corridor
  { type:'whiteboard', gx:8, gy:3 },
  { type:'coffee', gx:8, gy:9 },
  { type:'server', gx:14, gy:9 },
  { type:'clock', gx:8, gy:0 },
  { type:'door', gx:15, gy:6 },
  // One lamp per zone
  { type:'lamp', gx:5, gy:1 }, { type:'lamp', gx:13, gy:1 },
  { type:'lamp', gx:5, gy:7 }, { type:'lamp', gx:13, gy:7 },
  // Extra decor
  { type:'bookshelf', gx:1, gy:5 },
  { type:'cactus', gx:8, gy:6 },
  { type:'coat-rack', gx:1, gy:7 },
];
const _sortedFurniture = [...furniture].sort((a,b)=>(a.gx+a.gy)-(b.gx+b.gy));

// Dynamic iso origin — recalculated on resize
let _isoOriginX = 404, _isoOriginY = 40;
// Pool of reusable point objects to reduce GC pressure
const _ptPool = Array.from({length:64}, ()=>({x:0,y:0}));
let _ptIdx = 0;

// Label deconfliction: prevent name tag overlap in dense scenes
const _frameLabelRects = [];
function _deconflictLabel(x, y, w, h) {
  // Nudge label down until it doesn't overlap any existing label
  let ny = y;
  for (let attempt = 0; attempt < 4; attempt++) {
    let overlap = false;
    for (let i = 0; i < _frameLabelRects.length; i++) {
      const r = _frameLabelRects[i];
      if (x < r.x + r.w && x + w > r.x && ny < r.y + r.h && ny + h > r.y) {
        ny = r.y + r.h + 1;
        overlap = true;
        break;
      }
    }
    if (!overlap) break;
  }
  _frameLabelRects.push({ x, y: ny, w, h });
  return ny;
}
function isoToScreen(gx, gy) {
  const p = _ptPool[_ptIdx]; _ptIdx = (_ptIdx + 1) & 63;
  p.x = _isoOriginX + (gx-gy)*ISO.tileW/2;
  p.y = _isoOriginY + (gx+gy)*ISO.tileH/2;
  return p;
}

function drawIsoTile(gx, gy, fill, stroke) {
  const p = isoToScreen(gx,gy);
  oCtx.beginPath();
  oCtx.moveTo(p.x, p.y); oCtx.lineTo(p.x+ISO.tileW/2, p.y+ISO.tileH/2);
  oCtx.lineTo(p.x, p.y+ISO.tileH); oCtx.lineTo(p.x-ISO.tileW/2, p.y+ISO.tileH/2);
  oCtx.closePath(); oCtx.fillStyle=fill; oCtx.fill();
  if(stroke){oCtx.strokeStyle=stroke;oCtx.lineWidth=0.3;oCtx.stroke();}
}

function drawIsoCube(gx,gy,h,top,left,right){
  const p=isoToScreen(gx,gy), hw=ISO.tileW/2, hh=ISO.tileH/2;
  oCtx.beginPath();oCtx.moveTo(p.x,p.y-h);oCtx.lineTo(p.x+hw,p.y+hh-h);oCtx.lineTo(p.x,p.y+ISO.tileH-h);oCtx.lineTo(p.x-hw,p.y+hh-h);oCtx.closePath();oCtx.fillStyle=top;oCtx.fill();
  oCtx.beginPath();oCtx.moveTo(p.x-hw,p.y+hh-h);oCtx.lineTo(p.x,p.y+ISO.tileH-h);oCtx.lineTo(p.x,p.y+ISO.tileH);oCtx.lineTo(p.x-hw,p.y+hh);oCtx.closePath();oCtx.fillStyle=left;oCtx.fill();
  oCtx.beginPath();oCtx.moveTo(p.x+hw,p.y+hh-h);oCtx.lineTo(p.x,p.y+ISO.tileH-h);oCtx.lineTo(p.x,p.y+ISO.tileH);oCtx.lineTo(p.x+hw,p.y+hh);oCtx.closePath();oCtx.fillStyle=right;oCtx.fill();
}

function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function shadeColor(c,pct){const n=parseInt(c.replace('#',''),16),a=Math.round(2.55*pct),R=Math.max(0,Math.min(255,(n>>16)+a)),G=Math.max(0,Math.min(255,(n>>8&0xFF)+a)),B=Math.max(0,Math.min(255,(n&0xFF)+a));return'#'+(0x1000000+R*0x10000+G*0x100+B).toString(16).slice(1);}

function drawDesk(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.desk){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.desk,p.x,p.y-10,1.45);return;}}const t=_th||getCanvasTheme();drawIsoCube(gx,gy,14,t.deskTop,t.deskL,t.deskR);oCtx.fillStyle=t.monitorBg;oCtx.fillRect(p.x-8,p.y-28,16,12);oCtx.fillStyle=t.monitorScr;oCtx.fillRect(p.x-6,p.y-26,12,8);}
function drawLargeDesk(gx,gy){const t=_th||getCanvasTheme();drawIsoCube(gx,gy,16,t.lgDeskTop,t.lgDeskL,t.lgDeskR);const p=isoToScreen(gx,gy);oCtx.fillStyle=t.monitorBg;oCtx.fillRect(p.x-16,p.y-32,14,12);oCtx.fillRect(p.x+2,p.y-32,14,12);oCtx.fillStyle=t.monitorScr;oCtx.fillRect(p.x-14,p.y-30,10,8);oCtx.fillStyle=t.monitorScr2;oCtx.fillRect(p.x+4,p.y-30,10,8);}
function drawPlant(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.plant){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.plant,p.x,p.y-10,1.2);return;}}const t=_th||getCanvasTheme();oCtx.fillStyle=t.potBrown;oCtx.fillRect(p.x-6,p.y-4,12,10);const tm=_frameTime/1000;for(let i=0;i<5;i++){const a=(i/5)*Math.PI*2+Math.sin(tm*0.5+i)*0.15;oCtx.beginPath();oCtx.arc(p.x+Math.cos(a)*10,p.y-14+Math.sin(a)*5,5,0,Math.PI*2);oCtx.fillStyle=i%2===0?t.leafDk:t.leafLt;oCtx.fill();}}
function drawCoffee(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.coffee){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.coffee,p.x,p.y-12,1.3);return;}}const t=_th||getCanvasTheme();drawIsoCube(gx,gy,20,t.coffeeTop,t.coffeeL,t.coffeeR);oCtx.font='14px serif';oCtx.textAlign='center';oCtx.fillText('☕',p.x,p.y-24);}
function drawWhiteboard(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.whiteboard){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.whiteboard,p.x,p.y-20,1.45);return;}}const t=_th||getCanvasTheme();oCtx.fillStyle=t.wbBg;oCtx.fillRect(p.x-28,p.y-40,56,36);oCtx.strokeStyle=t.wbBorder;oCtx.lineWidth=2;oCtx.strokeRect(p.x-28,p.y-40,56,36);oCtx.font='7px system-ui';oCtx.fillStyle=t.wbText;oCtx.textAlign='left';oCtx.fillText('Sprint Tasks:',p.x-22,p.y-28);oCtx.fillStyle=t.wbCheck;oCtx.fillText('✓ Dashboard v3',p.x-22,p.y-18);oCtx.fillText('✓ Agent system',p.x-22,p.y-10);}
function drawServer(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.server){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.server,p.x,p.y-18,1.35);oCtx.font='8px system-ui';oCtx.fillStyle=(_th||getCanvasTheme()).srvLabel;oCtx.textAlign='center';oCtx.fillText('SERVER',p.x,p.y+ISO.tileH+10);return;}}const t=_th||getCanvasTheme();drawIsoCube(gx,gy,30,t.srvTop,t.srvL,t.srvR);const tm=_frameTime;for(let i=0;i<3;i++){oCtx.beginPath();oCtx.arc(p.x-4,p.y-10-i*8,2,0,Math.PI*2);oCtx.fillStyle=(Math.sin(tm/300+i)>0)?t.srvLed:t.srvLedOff;oCtx.fill();}oCtx.font='8px system-ui';oCtx.fillStyle=t.srvLabel;oCtx.textAlign='center';oCtx.fillText('SERVER',p.x,p.y+ISO.tileH+10);}
function drawBookshelf(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.bookshelf){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.bookshelf,p.x,p.y-18,1.4);return;}}const t=_th||getCanvasTheme();drawIsoCube(gx,gy,36,t.bsTop,t.bsL,t.bsR);const colors=['#e74c3c','#3498db','#f1c40f','#2ecc71','#9b59b6','#e67e22'];for(let row=0;row<3;row++){for(let i=0;i<3;i++){oCtx.fillStyle=colors[(row*3+i)%colors.length];oCtx.fillRect(p.x-9+i*7,p.y-32+row*10,5,8);}}oCtx.font='7px system-ui';oCtx.fillStyle=t.bsLabel;oCtx.textAlign='center';oCtx.fillText('📚',p.x,p.y+ISO.tileH+8);}
function drawLamp(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.lamp){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.lamp,p.x,p.y-22,1.3);// Still draw the glow effect on top for warmth
const t=_th||getCanvasTheme();const tm=_frameTime;const flicker=0.15+Math.sin(tm/2000+gx)*0.05;oCtx.beginPath();oCtx.arc(p.x,p.y-45,18,0,Math.PI*2);oCtx.fillStyle=t.lampGlow+flicker+')';oCtx.fill();return;}}const t=_th||getCanvasTheme();const tm=_frameTime;const flicker=0.15+Math.sin(tm/2000+gx)*0.05;oCtx.beginPath();oCtx.arc(p.x,p.y-45,18,0,Math.PI*2);oCtx.fillStyle=t.lampGlow+flicker+')';oCtx.fill();oCtx.beginPath();oCtx.arc(p.x,p.y-45,8,0,Math.PI*2);oCtx.fillStyle=t.lampGlow+(flicker+0.1)+')';oCtx.fill();oCtx.strokeStyle=t.lampPole;oCtx.lineWidth=1.5;oCtx.beginPath();oCtx.moveTo(p.x,p.y);oCtx.lineTo(p.x,p.y-38);oCtx.stroke();oCtx.fillStyle=t.lampShade;oCtx.beginPath();oCtx.moveTo(p.x-8,p.y-44);oCtx.lineTo(p.x+8,p.y-44);oCtx.lineTo(p.x+5,p.y-38);oCtx.lineTo(p.x-5,p.y-38);oCtx.closePath();oCtx.fill();}
function drawRug(){const cx=isoToScreen(8,6);oCtx.save();oCtx.globalAlpha=0.12;oCtx.beginPath();oCtx.ellipse(cx.x,cx.y+10,200,90,0,0,Math.PI*2);const rg=oCtx.createRadialGradient(cx.x,cx.y+10,10,cx.x,cx.y+10,160);rg.addColorStop(0,'#8b5cf6');rg.addColorStop(0.5,'#6d28d9');rg.addColorStop(1,'transparent');oCtx.fillStyle=rg;oCtx.fill();oCtx.restore();}
// Cached window sky colors — recomputed every 10s instead of every frame
let _winCache = null;
function _getWindowColors() {
  if (_winCache && _frameTime - _winCache.t < 10000) return _winCache;
  _clockDate.setTime(_frameTime);const hr=_clockDate.getHours()+_clockDate.getMinutes()/60;
  let nightAmt=0;
  if(hr>=21||hr<5) nightAmt=1;
  else if(hr>=5&&hr<7) nightAmt=1-(hr-5)/2;
  else if(hr>=7&&hr<18) nightAmt=0;
  else if(hr>=18&&hr<21) nightAmt=(hr-18)/3;
  const dayR=135,dayG=206,dayB=250;
  const duskR=255,duskG=140,duskB=80;
  const nightR=10,nightG=22,nightB=40;
  let skyR,skyG,skyB;
  if(nightAmt<0.3){const t=nightAmt/0.3;skyR=dayR+(duskR-dayR)*t;skyG=dayG+(duskG-dayG)*t;skyB=dayB+(duskB-dayB)*t;}
  else{const t=(nightAmt-0.3)/0.7;skyR=duskR+(nightR-duskR)*t;skyG=duskG+(nightG-duskG)*t;skyB=duskB+(nightB-duskB)*t;}
  _winCache = {
    t: _frameTime, nightAmt,
    skyColor:`rgb(${Math.round(skyR)},${Math.round(skyG)},${Math.round(skyB)})`,
    skyColorInner:nightAmt>0.5?'#0d1f3a':`rgb(${Math.round(skyR*0.85)},${Math.round(skyG*0.9)},${Math.round(skyB*0.95)})`,
    frameColor:nightAmt>0.5?'#3a4a6a':'#8aa0c0',
    frameColorInner:nightAmt>0.5?'#2a3a5a':'#7090b0',
  };
  return _winCache;
}
function drawWindows(time){
  const wc = _getWindowColors();
  const {nightAmt, skyColor, skyColorInner, frameColor, frameColorInner} = wc;
  for(let c=2;c<GRID.cols;c+=3){const p=isoToScreen(c,0);
    // Window outer frame
    oCtx.fillStyle=frameColor;
    roundRect(oCtx,p.x-15,p.y-33,30,22,3);oCtx.fill();
    // Window glass
    const wg=oCtx.createLinearGradient(p.x,p.y-31,p.x,p.y-13);
    wg.addColorStop(0,skyColorInner);wg.addColorStop(1,skyColor);
    oCtx.fillStyle=wg;
    roundRect(oCtx,p.x-13,p.y-31,26,18,2);oCtx.fill();
    // Clouds during day
    if(nightAmt<0.6){
      const cloudAlpha=(1-nightAmt)*0.35;
      const cx=p.x-6+Math.sin(time/8000+c)*6;
      const cy=p.y-24;
      oCtx.globalAlpha=cloudAlpha;oCtx.fillStyle='#fff';
      oCtx.beginPath();oCtx.arc(cx,cy,3,0,Math.PI*2);oCtx.arc(cx+4,cy-1,2.5,0,Math.PI*2);oCtx.arc(cx+7,cy,2,0,Math.PI*2);oCtx.fill();
      oCtx.globalAlpha=1;
    }
    // Stars at night
    if(nightAmt>0.5){
      const starA=(nightAmt-0.5)*2;
      for(let s=0;s<3;s++){
        const sx=p.x-8+((c*7+s*13)%18);const sy=p.y-28+((s*11+c*3)%12);
        const tw=0.3+Math.sin(time/1200+c+s*2.5)*0.7;
        oCtx.beginPath();oCtx.arc(sx,sy,0.7+tw*0.3,0,Math.PI*2);
        oCtx.fillStyle=`rgba(255,255,220,${tw*starA})`;oCtx.fill();
      }
    }
    // Subtle glass reflection
    oCtx.globalAlpha=0.06;oCtx.fillStyle='#fff';
    oCtx.fillRect(p.x-11,p.y-30,10,14);oCtx.globalAlpha=1;
    // Center divider (cross-bar)
    oCtx.fillStyle=frameColorInner;
    oCtx.fillRect(p.x-0.5,p.y-31,1,18);
    oCtx.fillRect(p.x-13,p.y-22.5,26,1);
    // Inner frame border
    oCtx.strokeStyle=frameColorInner;oCtx.lineWidth=0.5;
    roundRect(oCtx,p.x-13,p.y-31,26,18,2);oCtx.stroke();
  }
}
const _clockDate = new Date(); // reuse single Date object
function drawWallClock(gx,gy){const t=_th||getCanvasTheme();const p=isoToScreen(gx,gy);const r=14;oCtx.save();oCtx.beginPath();oCtx.arc(p.x,p.y-42,r+2,0,Math.PI*2);oCtx.fillStyle=t.clockFrame;oCtx.fill();oCtx.beginPath();oCtx.arc(p.x,p.y-42,r,0,Math.PI*2);oCtx.fillStyle=t.clockFace;oCtx.fill();oCtx.strokeStyle=t.clockTick;oCtx.lineWidth=1.5;oCtx.stroke();_clockDate.setTime(_frameTime);const h=_clockDate.getHours()%12,m=_clockDate.getMinutes(),s=_clockDate.getSeconds();for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2-Math.PI/2;oCtx.fillStyle=t.clockTick;oCtx.fillRect(p.x+Math.cos(a)*(r-3)-1,p.y-42+Math.sin(a)*(r-3)-1,2,2);}oCtx.strokeStyle=t.clockHand;oCtx.lineWidth=1.5;const ha=(h+m/60)/12*Math.PI*2-Math.PI/2;oCtx.beginPath();oCtx.moveTo(p.x,p.y-42);oCtx.lineTo(p.x+Math.cos(ha)*7,p.y-42+Math.sin(ha)*7);oCtx.stroke();oCtx.lineWidth=1;const ma=m/60*Math.PI*2-Math.PI/2;oCtx.beginPath();oCtx.moveTo(p.x,p.y-42);oCtx.lineTo(p.x+Math.cos(ma)*10,p.y-42+Math.sin(ma)*10);oCtx.stroke();oCtx.strokeStyle=t.clockSec;oCtx.lineWidth=0.5;const sa=s/60*Math.PI*2-Math.PI/2;oCtx.beginPath();oCtx.moveTo(p.x,p.y-42);oCtx.lineTo(p.x+Math.cos(sa)*11,p.y-42+Math.sin(sa)*11);oCtx.stroke();oCtx.beginPath();oCtx.arc(p.x,p.y-42,1.5,0,Math.PI*2);oCtx.fillStyle=t.clockSec;oCtx.fill();oCtx.restore();}
function drawPictureFrame(gx,gy,hue){const p=isoToScreen(gx,gy);oCtx.save();oCtx.fillStyle='#3a2a1a';oCtx.fillRect(p.x-12,p.y-38,24,18);oCtx.fillStyle=`hsl(${hue},40%,25%)`;oCtx.fillRect(p.x-10,p.y-36,20,14);const grad=oCtx.createLinearGradient(p.x-10,p.y-36,p.x+10,p.y-22);grad.addColorStop(0,`hsl(${hue},50%,40%)`);grad.addColorStop(0.5,`hsl(${hue},60%,50%)`);grad.addColorStop(1,`hsl(${hue},40%,35%)`);oCtx.fillStyle=grad;oCtx.fillRect(p.x-9,p.y-35,18,12);oCtx.strokeStyle='#5a4a30';oCtx.lineWidth=1.5;oCtx.strokeRect(p.x-12,p.y-38,24,18);oCtx.restore();}
function drawFilingCabinet(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.filingCabinet){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.filingCabinet,p.x,p.y-14,1.2);return;}}const t=_th||getCanvasTheme();oCtx.save();drawIsoCube(gx,gy,28,t.fcTop,t.fcL,t.fcR);oCtx.fillStyle=t.fcDrawer;oCtx.fillRect(p.x-7,p.y-30,14,3);oCtx.fillRect(p.x-7,p.y-22,14,3);oCtx.fillRect(p.x-7,p.y-14,14,3);for(let i=0;i<3;i++){oCtx.beginPath();oCtx.arc(p.x,p.y-28+i*8,1.2,0,Math.PI*2);oCtx.fillStyle=t.fcKnob;oCtx.fill();}oCtx.restore();}
function drawTrashCan(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.trashCan){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.trashCan,p.x,p.y-6,1.0);return;}}const t=_th||getCanvasTheme();oCtx.save();oCtx.fillStyle=t.tcBody;oCtx.beginPath();oCtx.moveTo(p.x-6,p.y-2);oCtx.lineTo(p.x-5,p.y-14);oCtx.lineTo(p.x+5,p.y-14);oCtx.lineTo(p.x+6,p.y-2);oCtx.closePath();oCtx.fill();oCtx.fillStyle=t.tcLid;oCtx.fillRect(p.x-7,p.y-16,14,3);oCtx.strokeStyle=t.tcLine;oCtx.lineWidth=0.5;oCtx.beginPath();oCtx.moveTo(p.x-2,p.y-13);oCtx.lineTo(p.x-2,p.y-3);oCtx.moveTo(p.x+2,p.y-13);oCtx.lineTo(p.x+2,p.y-3);oCtx.stroke();oCtx.restore();}
function drawCoatRack(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.coatRack){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.coatRack,p.x,p.y-18,1.2);return;}}const t=_th||getCanvasTheme();oCtx.save();oCtx.strokeStyle=t.crPole;oCtx.lineWidth=2;oCtx.beginPath();oCtx.moveTo(p.x,p.y);oCtx.lineTo(p.x,p.y-40);oCtx.stroke();oCtx.strokeStyle=t.crPole;oCtx.lineWidth=1.5;const hooks=[[-8,-36],[8,-36],[-6,-30],[6,-30]];hooks.forEach(([dx,dy])=>{oCtx.beginPath();oCtx.moveTo(p.x,p.y+dy+4);oCtx.lineTo(p.x+dx,p.y+dy);oCtx.stroke();oCtx.beginPath();oCtx.arc(p.x+dx,p.y+dy,1.5,0,Math.PI*2);oCtx.fillStyle=t.crKnob;oCtx.fill();});oCtx.beginPath();oCtx.arc(p.x,p.y-42,3,0,Math.PI*2);oCtx.fillStyle=t.crPole;oCtx.fill();oCtx.fillStyle=t.crBase;oCtx.beginPath();oCtx.ellipse(p.x,p.y,8,4,0,0,Math.PI*2);oCtx.fill();oCtx.restore();}
function drawCactus(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.cactus){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.cactus,p.x,p.y-10,1.1);return;}}const t=_th||getCanvasTheme();oCtx.save();oCtx.fillStyle=t.cacPot;oCtx.fillRect(p.x-5,p.y-2,10,6);oCtx.fillStyle=t.cacPotIn;oCtx.fillRect(p.x-4,p.y-1,8,4);oCtx.fillStyle=t.cacBody;oCtx.beginPath();oCtx.moveTo(p.x-4,p.y-4);oCtx.lineTo(p.x+4,p.y-4);oCtx.lineTo(p.x+3,p.y-22);oCtx.lineTo(p.x-3,p.y-22);oCtx.closePath();oCtx.fill();oCtx.fillStyle=t.cacArm;oCtx.beginPath();oCtx.moveTo(p.x+3,p.y-14);oCtx.lineTo(p.x+9,p.y-18);oCtx.lineTo(p.x+8,p.y-24);oCtx.lineTo(p.x+3,p.y-18);oCtx.closePath();oCtx.fill();oCtx.beginPath();oCtx.moveTo(p.x-3,p.y-10);oCtx.lineTo(p.x-8,p.y-14);oCtx.lineTo(p.x-7,p.y-19);oCtx.lineTo(p.x-3,p.y-14);oCtx.closePath();oCtx.fill();oCtx.fillStyle='#fff';oCtx.globalAlpha=0.6;for(let i=0;i<5;i++){oCtx.fillRect(p.x-2+((i*3)%5),p.y-20+i*3,1,1);}oCtx.globalAlpha=1;oCtx.beginPath();oCtx.arc(p.x,p.y-23,2,0,Math.PI*2);oCtx.fillStyle=t.cacFlower;oCtx.fill();oCtx.restore();}
function drawStickyNotes(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.stickyNotes){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.stickyNotes,p.x,p.y-16,0.9);return;}}const t=_th||getCanvasTheme();oCtx.save();const colors=t.stickyC;const offsets=[[-10,-32,5],[2,-34,-3],[-4,-30,2]];offsets.forEach(([dx,dy,rot],i)=>{oCtx.save();oCtx.translate(p.x+dx,p.y+dy);oCtx.rotate(rot*Math.PI/180);oCtx.fillStyle=colors[i];oCtx.fillRect(-5,-5,10,10);oCtx.fillStyle='rgba(0,0,0,0.3)';oCtx.fillRect(-4,-2,7,1);oCtx.fillRect(-4,1,5,1);oCtx.restore();});oCtx.restore();}
function drawCoffeeMug(gx,gy){const t=_th||getCanvasTheme();const p=isoToScreen(gx,gy);oCtx.save();oCtx.fillStyle=t.mugBody;oCtx.fillRect(p.x+6,p.y-30,6,8);oCtx.fillStyle=t.mugFill;oCtx.fillRect(p.x+7,p.y-29,4,6);oCtx.strokeStyle=t.mugHandle;oCtx.lineWidth=1;oCtx.beginPath();oCtx.arc(p.x+14,p.y-26,2.5,Math.PI*1.5,Math.PI*0.5);oCtx.stroke();const tm=_frameTime/1000;if(Math.sin(tm+gx*2)>0.3){oCtx.globalAlpha=0.3;oCtx.fillStyle='#fff';oCtx.beginPath();oCtx.arc(p.x+9,p.y-32-Math.sin(tm)*2,2,0,Math.PI*2);oCtx.fill();oCtx.beginPath();oCtx.arc(p.x+11,p.y-35-Math.sin(tm+1)*2,1.5,0,Math.PI*2);oCtx.fill();}oCtx.restore();}
function drawDoor(gx,gy){const p=isoToScreen(gx,gy);if(typeof SpriteSystem!=='undefined'){const s=SpriteSystem.getFurnitureSprites?.();if(s?.door){oCtx.imageSmoothingEnabled=false;SpriteSystem.drawSprite(oCtx,s.door,p.x,p.y-22,1.4);return;}}const t=_th||getCanvasTheme();oCtx.save();oCtx.fillStyle=t.doorFrame;oCtx.fillRect(p.x-14,p.y-48,28,44);oCtx.fillStyle=t.doorFace;oCtx.fillRect(p.x-12,p.y-46,24,40);const dg=oCtx.createLinearGradient(p.x-12,p.y-46,p.x+12,p.y-6);dg.addColorStop(0,t.doorFace);dg.addColorStop(0.5,t.doorFace);dg.addColorStop(1,t.doorFrame);oCtx.fillStyle=dg;oCtx.fillRect(p.x-12,p.y-46,24,40);oCtx.fillStyle=t.doorFrame;oCtx.fillRect(p.x-10,p.y-44,20,2);oCtx.fillRect(p.x-10,p.y-24,20,2);oCtx.beginPath();oCtx.arc(p.x+7,p.y-26,2.5,0,Math.PI*2);oCtx.fillStyle=t.doorKnob;oCtx.fill();oCtx.strokeStyle=t.doorStroke;oCtx.lineWidth=1.5;oCtx.strokeRect(p.x-14,p.y-48,28,44);oCtx.fillStyle='rgba(255,255,255,0.03)';oCtx.fillRect(p.x-12,p.y-46,12,40);oCtx.restore();}

// ===== VISITOR (discovered/sub-agent) — smaller, translucent, no desk =====
function drawVisitor(agent, screenX, screenY, time) {
  const isWorking = agent.status === 'working';
  const baseY = screenY - 10;
  const px = screenX;
  const bob = Math.sin(time/1800 + screenX * 0.01) * 2;
  const scale = 0.7;

  oCtx.save();
  oCtx.globalAlpha = isWorking ? 0.85 : 0.5;

  // Shadow
  oCtx.beginPath(); oCtx.ellipse(px, screenY+2, 8, 3, 0, 0, Math.PI*2);
  oCtx.fillStyle = 'rgba(0,0,0,0.15)'; oCtx.fill();

  // Legs
  oCtx.fillStyle = '#334155';
  oCtx.fillRect(px-3, baseY+18*scale+bob, 3, 7*scale);
  oCtx.fillRect(px+1, baseY+18*scale+bob, 3, 7*scale);

  // Body
  const grad = oCtx.createLinearGradient(px-7, baseY+4+bob, px+7, baseY+18*scale+bob);
  grad.addColorStop(0, agent.color); grad.addColorStop(1, shadeColor(agent.color, -30));
  oCtx.fillStyle = grad;
  roundRect(oCtx, px-7, baseY+4+bob, 14, 13*scale, 3); oCtx.fill();

  // Head
  oCtx.beginPath(); oCtx.arc(px, baseY-2+bob, 7*scale, 0, Math.PI*2);
  oCtx.fillStyle = '#d4a574'; oCtx.fill();
  // Hair
  oCtx.beginPath(); oCtx.arc(px, baseY-5+bob, 7*scale, Math.PI, Math.PI*2);
  oCtx.fillStyle = '#475569'; oCtx.fill();
  // Eyes (dots)
  oCtx.fillStyle = '#1e293b';
  oCtx.beginPath(); oCtx.arc(px-2, baseY-2+bob, 1.2, 0, Math.PI*2); oCtx.fill();
  oCtx.beginPath(); oCtx.arc(px+2, baseY-2+bob, 1.2, 0, Math.PI*2); oCtx.fill();

  // Visitor badge (small "V" tag)
  oCtx.fillStyle = 'rgba(59,130,246,0.7)';
  roundRect(oCtx, px+6, baseY+5+bob, 8, 6, 2); oCtx.fill();
  oCtx.font = 'bold 5px system-ui'; oCtx.fillStyle = '#fff'; oCtx.textAlign = 'center';
  oCtx.fillText('V', px+10, baseY+10+bob);

  // Status dot
  const dotColor = isWorking ? '#22c55e' : agent.status === 'idle' ? '#f59e0b' : '#475569';
  oCtx.beginPath(); oCtx.arc(px+12, baseY-4+bob, 3, 0, Math.PI*2);
  oCtx.fillStyle = dotColor; oCtx.fill();

  // Name
  oCtx.font = 'bold 8px system-ui'; oCtx.textAlign = 'center';
  oCtx.fillStyle = agent.color;
  oCtx.fillText(agent.name, px, screenY+16);
  oCtx.font = '7px system-ui'; oCtx.fillStyle = '#64748b';
  oCtx.fillText(agent.role, px, screenY+24);

  oCtx.restore();
}

// ── SPRITE-BASED AGENT DRAWING ──
// Uses SpriteSystem for pixel-art rendering when available
function _drawAgentSprite(agent, gx, gy, time) {
  if (typeof SpriteSystem === 'undefined') return false;
  
  const baseP = isoToScreen(gx, gy);
  const isWorking = agent.status === 'working';
  const isSleeping = agent.status === 'sleeping';
  const isIdle = !isWorking && !isSleeping;
  
  // Get sprite set for this agent's color
  const sprites = SpriteSystem.getAgentSprites(agent.color || '#3b82f6', agent.name);
  
  // Calculate position with bobble
  const bobble = isWorking ? Math.sin(time / 250) * 1.5 : 0;
  const px = baseP.x;
  const py = baseP.y - 28 + bobble; // Offset up so sprite sits at desk level
  
  // Pick animation state
  let frame;
  if (isSleeping) {
    frame = sprites.sleeping[0];
  } else if (isWorking) {
    frame = SpriteSystem.getFrame(sprites.typing, time, 6);
  } else {
    // Check if walking to POI
    const interactionInfo = (typeof getInteractionOffset === 'function') ? getInteractionOffset(agent.name, time) : null;
    if (interactionInfo && interactionInfo.walking) {
      // Pick directional walk based on movement delta
      const dx = interactionInfo.dx || 0;
      const dy = interactionInfo.dy || 0;
      let walkSet = sprites.walking; // fallback = down
      if (Math.abs(dx) > Math.abs(dy)) {
        walkSet = dx > 0 ? (sprites.walkRight || sprites.walking) : (sprites.walkLeft || sprites.walking);
      } else {
        walkSet = dy < 0 ? (sprites.walkUp || sprites.walking) : (sprites.walkDown || sprites.walking);
      }
      frame = SpriteSystem.getFrame(walkSet, time, 4);
    } else {
      frame = SpriteSystem.getFrame(sprites.idle, time, 1); // Slow breathing
    }
  }
  
  if (!frame) return false;
  
  // Shadow
  oCtx.beginPath();
  oCtx.ellipse(px, baseP.y + 4, 12, 5, 0, 0, Math.PI * 2);
  oCtx.fillStyle = 'rgba(0,0,0,0.25)';
  oCtx.fill();
  
  // Draw sprite (centered, scaled to fit isometric tile)
  const spriteScale = 2.8; // large enough to read as distinct pixel-art characters
  oCtx.imageSmoothingEnabled = false;
  SpriteSystem.drawSprite(oCtx, frame, px, py, spriteScale);
  
  // Status glow ring
  if (isWorking) {
    oCtx.beginPath();
    oCtx.ellipse(px, baseP.y + 4, 14, 6, 0, 0, Math.PI * 2);
    oCtx.strokeStyle = agent.color || '#22c55e';
    oCtx.lineWidth = 1;
    oCtx.globalAlpha = 0.3 + 0.2 * Math.sin(time / 500);
    oCtx.stroke();
    oCtx.globalAlpha = 1;
  }
  
  // Name label (below sprite) with deconfliction
  oCtx.font = 'bold 9px system-ui';
  oCtx.textAlign = 'center';
  const nameW = oCtx.measureText(agent.name).width + 8;
  const labelX = px - nameW/2;
  const labelBaseY = baseP.y + 8;
  const labelY = _deconflictLabel(labelX, labelBaseY, nameW + 20, 14);
  oCtx.fillStyle = 'rgba(0,0,0,0.5)';
  oCtx.beginPath();
  oCtx.roundRect(labelX, labelY, nameW, 14, 4);
  oCtx.fill();
  oCtx.fillStyle = agent.color || '#94a3b8';
  oCtx.fillText(agent.name, px, labelY + 10);
  
  // Status emoji (compact — no speech bubbles to avoid overlap)
  const statusEmoji = isWorking ? '⚡' : isSleeping ? '💤' : '☕';
  oCtx.font = '10px system-ui';
  oCtx.fillText(statusEmoji, px + nameW/2 + 6, labelY + 10);
  
  // Typing dots for working agents
  if (isWorking) {
    const dotPhase = time / 400;
    for (let i = 0; i < 3; i++) {
      const dy = Math.sin(dotPhase + i * 0.8) * 2;
      oCtx.beginPath();
      oCtx.arc(px - 4 + i * 4, py - 8 + dy, 1.5, 0, Math.PI * 2);
      oCtx.fillStyle = agent.color;
      oCtx.globalAlpha = 0.7;
      oCtx.fill();
      oCtx.globalAlpha = 1;
    }
  }
  
  // Sleeping zzZ particles
  if (isSleeping) {
    const zPhase = (time % 3000) / 3000;
    for (let z = 0; z < 3; z++) {
      const zp = (zPhase + z * 0.33) % 1;
      const zx = px + 12 + zp * 8;
      const zy = py - 8 - zp * 16;
      const za = zp < 0.2 ? zp / 0.2 : zp > 0.7 ? (1 - zp) / 0.3 : 1;
      oCtx.globalAlpha = za * 0.6;
      oCtx.font = `${7 + z * 2}px system-ui`;
      oCtx.fillStyle = '#94a3b8';
      oCtx.fillText('z', zx, zy);
    }
    oCtx.globalAlpha = 1;
  }
  
  return true; // Sprite drawn successfully
}

function drawAgent(agent, gx, gy, time) {
  // Save the current transform matrix so we can restore it regardless of
  // save/restore stack imbalances inside _drawAgentInner.
  const _savedTransform = oCtx.getTransform();
  const _savedAlpha = oCtx.globalAlpha;
  // Intercept save/restore to track stack depth — prevents inner imbalances from
  // corrupting the parent transform (the root cause of the "dark void" canvas bug).
  const _origSave = oCtx.save.bind(oCtx), _origRestore = oCtx.restore.bind(oCtx);
  let _innerDepth = 0;
  oCtx.save = function() { _innerDepth++; _origSave(); };
  oCtx.restore = function() { if (_innerDepth > 0) { _innerDepth--; _origRestore(); } };
  try {
    // Try sprite-based rendering first (pixel art)
    if (!_drawAgentSprite(agent, gx, gy, time)) {
      // Fall back to procedural rendering
      _drawAgentInner(agent, gx, gy, time);
    }
  } catch(e) { console.warn('[drawAgent] error:', e); }
  // Unwind any remaining unmatched saves
  while (_innerDepth > 0) { _innerDepth--; _origRestore(); }
  oCtx.save = _origSave; oCtx.restore = _origRestore;
  // Hard-reset transform + alpha (immune to any residual corruption)
  oCtx.setTransform(_savedTransform);
  oCtx.globalAlpha = _savedAlpha;
}
function _drawAgentInner(agent, gx, gy, time) {
  // Role category mapper for dynamic lookups (no hardcoded agent names)
  function _getRoleCategory(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('ceo') || r.includes('mc') || r.includes('owner') || r.includes('chief')) return 'ceo';
    if (r.includes('director') || r.includes('lead') || r.includes('manager') && !r.includes('mail')) return 'director';
    if (r.includes('write') || r.includes('content') || r.includes('research') || r.includes('author')) return 'writer';
    if (r.includes('design') || r.includes('art') || r.includes('visual') || r.includes('ui')) return 'designer';
    if (r.includes('produce') || r.includes('video') || r.includes('media') || r.includes('render')) return 'producer';
    if (r.includes('publish') || r.includes('deploy') || r.includes('release') || r.includes('social')) return 'publisher';
    if (r.includes('code') || r.includes('dev') || r.includes('engineer') || r.includes('program')) return 'dev';
    if (r.includes('mail') || r.includes('email') || r.includes('comms') || r.includes('inbox')) return 'mail';
    if (r.includes('qa') || r.includes('test') || r.includes('quality') || r.includes('bug')) return 'qa';
    return 'default';
  }
  const isWorking = agent.status === 'working';
  const isSleeping = agent.status === 'sleeping';
  const isIdle = !isWorking && !isSleeping;
  const baseP = isoToScreen(gx, gy);

  // Search highlight: dim non-matching agents
  // (outer drawAgent() wrapper handles save/restore)
  const isFiltered = _highlightedAgents.size > 0 && !_highlightedAgents.has(agent.name);
  if (isFiltered) {
    oCtx.globalAlpha = 0.15;
  } else if (_highlightedAgents.size > 0 && _highlightedAgents.has(agent.name)) {
    // Pulsing highlight ring for matched agents
    const pulse = 0.6 + 0.4 * Math.sin(time * 0.004);
    oCtx.save();
    oCtx.beginPath(); oCtx.ellipse(baseP.x, baseP.y - 10, 22, 12, 0, 0, Math.PI * 2);
    oCtx.strokeStyle = agent.color; oCtx.lineWidth = 2; oCtx.globalAlpha = pulse;
    oCtx.stroke(); oCtx.globalAlpha = 1; oCtx.restore();
  }

  // ── PRE-SLEEP STRETCH & YAWN ──
  if (isSleeping && isInPreSleep(agent.name)) {
    drawPreSleepAgent(agent, gx, gy, time);
    return;
  }

  // ── SLEEPING: slumped at desk, head on arms ──
  if (isSleeping) {
    const slumpY = baseP.y - 6; // seated height near desk surface
    // Dim glow
    oCtx.beginPath(); oCtx.ellipse(baseP.x, baseP.y+4, 14, 6, 0, 0, Math.PI*2);
    oCtx.fillStyle = 'rgba(100,100,100,0.05)'; oCtx.fill();
    // Shadow
    oCtx.beginPath(); oCtx.ellipse(baseP.x, baseP.y+4, 8, 3, 0, 0, Math.PI*2);
    oCtx.fillStyle = 'rgba(0,0,0,0.2)'; oCtx.fill();
    // Legs (seated, visible below desk)
    oCtx.fillStyle = '#1e293b';
    oCtx.fillRect(baseP.x-5, slumpY+18, 4, 8);
    oCtx.fillRect(baseP.x+1, slumpY+18, 4, 8);
    // Body (hunched forward)
    const bodyColor = shadeColor(agent.color, -50);
    const grad = oCtx.createLinearGradient(baseP.x-8, slumpY+2, baseP.x+8, slumpY+16);
    grad.addColorStop(0, bodyColor); grad.addColorStop(1, shadeColor(bodyColor, -20));
    oCtx.fillStyle = grad;
    roundRect(oCtx, baseP.x-8, slumpY+2, 16, 14, 3); oCtx.fill();
    // Arms stretched forward on desk
    oCtx.fillStyle = shadeColor(bodyColor, -10);
    oCtx.fillRect(baseP.x-12, slumpY-2, 24, 5);
    // Head resting on arms (tilted)
    oCtx.save();
    oCtx.translate(baseP.x, slumpY-4);
    oCtx.rotate(0.25); // slight head tilt
    oCtx.beginPath(); oCtx.arc(0, 0, 9, 0, Math.PI*2);
    oCtx.fillStyle = '#b8976a'; oCtx.fill();
    // Hair
    oCtx.beginPath(); oCtx.arc(0, -3, 9, Math.PI, Math.PI*2);
    oCtx.fillStyle='#1e293b'; oCtx.fill();
    // Closed eyes
    oCtx.strokeStyle='#333'; oCtx.lineWidth=1;
    oCtx.beginPath(); oCtx.moveTo(-4,-1); oCtx.lineTo(-1,-1); oCtx.stroke();
    oCtx.beginPath(); oCtx.moveTo(1,-1); oCtx.lineTo(4,-1); oCtx.stroke();
    // Peaceful mouth
    oCtx.strokeStyle='#8B4513'; oCtx.lineWidth=0.8;
    oCtx.beginPath(); oCtx.moveTo(-1.5,3); oCtx.lineTo(1.5,3); oCtx.stroke();
    oCtx.restore();
    // Zzz floating up with drift
    const zFloat = (time % 3000) / 3000; // 0→1 cycle
    const zAlpha = 1 - zFloat * 0.7;
    oCtx.globalAlpha = 0.5 * zAlpha;
    oCtx.font=`bold ${10+zFloat*4}px system-ui`; oCtx.fillStyle='#64748b'; oCtx.textAlign='center';
    oCtx.fillText('z', baseP.x+10+zFloat*8, slumpY-14-zFloat*22+Math.sin(time/500)*2);
    const z2 = ((time+1000) % 3000) / 3000;
    oCtx.globalAlpha = 0.35 * (1 - z2 * 0.7);
    oCtx.font=`bold ${7+z2*3}px system-ui`;
    oCtx.fillText('z', baseP.x+16+z2*6, slumpY-22-z2*18+Math.sin(time/600)*1.5);
    oCtx.globalAlpha = 1;
    // Name + role
    oCtx.font='bold 10px system-ui'; oCtx.textAlign='center';
    oCtx.fillStyle = shadeColor(agent.color, -30);
    oCtx.fillText(agent.name, baseP.x, baseP.y+48);
    oCtx.font='8px system-ui'; oCtx.fillStyle='#475569';
    oCtx.fillText(agent.role, baseP.x, baseP.y+58);
    // Status dot
    oCtx.beginPath(); oCtx.arc(baseP.x+18, slumpY-12, 4, 0, Math.PI*2);
    oCtx.fillStyle = '#475569'; oCtx.fill();
    // Time ago
    if(agent.ageMin !== undefined) {
      oCtx.font='7px system-ui'; oCtx.fillStyle='#475569'; oCtx.textAlign='center';
      const txt = !agent.ageMin ? '' : agent.ageMin < 1 ? 'just now' : agent.ageMin < 60 ? `${agent.ageMin}m ago` : `${Math.round(agent.ageMin/60)}h ago`;
      oCtx.fillText(txt, baseP.x, baseP.y+66);
    }
    return;
  }
  let offsetX = 0, offsetY = 0;
  if (isWorking) {
    if (!agentWalking[agent.name]) agentWalking[agent.name] = { phase: Math.random() * Math.PI * 2 };
    const w = agentWalking[agent.name];
    const t = time / 2000 + w.phase;
    offsetX = Math.sin(t) * 15;
    offsetY = Math.cos(t * 0.7) * 6;
  }
  // Idle: check for interaction movement
  let idleSway = 0, idleHeadTurn = 0;
  let interactionInfo = null;
  if (isIdle) {
    interactionInfo = getInteractionOffset(agent.name, time);
    if (interactionInfo && !interactionInfo.atPoi && interactionInfo.walking) {
      // Walking to/from POI — compute screen offset from desk
      const deskScreen = isoToScreen(gx, gy);
      const walkScreen = isoToScreen(interactionInfo.gx, interactionInfo.gy);
      offsetX = walkScreen.x - deskScreen.x;
      offsetY = walkScreen.y - deskScreen.y;
    } else if (interactionInfo && interactionInfo.atPoi) {
      const deskScreen = isoToScreen(gx, gy);
      const poiScreen = isoToScreen(interactionInfo.gx, interactionInfo.gy);
      offsetX = poiScreen.x - deskScreen.x;
      offsetY = poiScreen.y - deskScreen.y;
    } else {
      if (!agentWalking[agent.name]) agentWalking[agent.name] = { phase: Math.random() * Math.PI * 2 };
      const ip = agentWalking[agent.name].phase;
      idleSway = Math.sin(time / 3000 + ip) * 2;
      idleHeadTurn = Math.sin(time / 4000 + ip * 2) * 0.08;
      offsetX = idleSway;
    }
  }

  const px = baseP.x + offsetX;
  const bobble = isWorking ? Math.sin(time/250) * 1.5 : 0;
  const baseY = baseP.y - 20 + bobble + offsetY;

  // Glow
  const glowColor = isWorking ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.08)';
  oCtx.beginPath(); oCtx.ellipse(px, baseP.y+4+offsetY, 18, 8, 0, 0, Math.PI*2);
  oCtx.fillStyle = glowColor; oCtx.fill();

  // Shadow
  oCtx.beginPath(); oCtx.ellipse(px, baseP.y+4+offsetY, 10, 4, 0, 0, Math.PI*2);
  oCtx.fillStyle = 'rgba(0,0,0,0.25)'; oCtx.fill();

  // Legs with walk animation
  const isWalkingToInteraction = interactionInfo && interactionInfo.walking;
  const legSwing = isWorking ? Math.sin(time/150)*3 : isWalkingToInteraction ? Math.sin(time/180)*3 : 0;
  oCtx.fillStyle = '#1e293b';
  oCtx.fillRect(px-5, baseY+24-legSwing, 4, 10);
  oCtx.fillRect(px+1, baseY+24+legSwing, 4, 10);

  // Body
  const bodyColor = agent.color;
  const grad = oCtx.createLinearGradient(px-10, baseY+6, px+10, baseY+24);
  grad.addColorStop(0, bodyColor); grad.addColorStop(1, shadeColor(bodyColor, -25));
  oCtx.fillStyle = grad;
  roundRect(oCtx, px-10, baseY+6, 20, 18, 4); oCtx.fill();

  // Arms with swing
  const armSwing = isWorking ? Math.sin(time/180)*4 : isIdle ? Math.sin(time/2500)*1.5 : 0;
  oCtx.fillStyle = shadeColor(bodyColor, -15);
  oCtx.fillRect(px-14, baseY+8+armSwing, 5, 12);
  oCtx.fillRect(px+9, baseY+8-armSwing, 5, 12);

  // Carried items from POI visits (shown when returning or just arrived back)
  const carried = interactionInfo?.carriedItem;
  if(carried && isIdle) {
    const handX = px+13, handY = baseY+16-armSwing;
    oCtx.save();
    if(carried === 'mug') {
      // Coffee mug
      oCtx.fillStyle='#e8e8e8'; oCtx.fillRect(handX-2, handY-6, 5, 7);
      oCtx.fillStyle='#6b4226'; oCtx.fillRect(handX-1, handY-5, 3, 5);
      oCtx.strokeStyle='#ccc'; oCtx.lineWidth=0.8;
      oCtx.beginPath(); oCtx.arc(handX+4, handY-3, 2, -Math.PI*0.5, Math.PI*0.5); oCtx.stroke();
      // Tiny steam
      const sp=((time%1200)/1200);
      oCtx.globalAlpha=0.3*(1-sp); oCtx.fillStyle='#fff';
      oCtx.beginPath(); oCtx.arc(handX+1, handY-8-sp*6+Math.sin(sp*6)*1.5, 1, 0, Math.PI*2); oCtx.fill();
      oCtx.globalAlpha=1;
    } else if(carried === 'book') {
      // Small book
      oCtx.fillStyle='#e74c3c'; roundRect(oCtx, handX-3, handY-5, 7, 9, 1); oCtx.fill();
      oCtx.fillStyle='#fff'; oCtx.fillRect(handX-1, handY-3, 3, 5);
    } else if(carried === 'can') {
      // Watering can (small)
      oCtx.fillStyle='#6b9bd2'; oCtx.fillRect(handX-2, handY-5, 6, 5);
      oCtx.fillRect(handX+3, handY-7, 3, 2);
    } else if(carried === 'tablet') {
      // Small tablet/clipboard
      oCtx.fillStyle='#334155'; roundRect(oCtx, handX-2, handY-6, 6, 8, 1); oCtx.fill();
      oCtx.fillStyle='#60a5fa'; oCtx.fillRect(handX-1, handY-5, 4, 5);
      // Blinking dot
      if(Math.sin(time/400)>0){ oCtx.fillStyle='#22c55e'; oCtx.beginPath(); oCtx.arc(handX+1, handY+1, 0.8, 0, Math.PI*2); oCtx.fill(); }
    }
    oCtx.restore();
  }

  // Head (with idle head turn)
  oCtx.save();
  if (isIdle) { oCtx.translate(px, baseY); oCtx.rotate(idleHeadTurn); oCtx.translate(-px, -baseY); }
  const headGrad = oCtx.createRadialGradient(px-2,baseY-2,1,px,baseY+2,10);
  headGrad.addColorStop(0,'#ffe0b2'); headGrad.addColorStop(1,'#d4a574');
  oCtx.beginPath(); oCtx.arc(px,baseY,10,0,Math.PI*2);
  oCtx.fillStyle = headGrad; oCtx.fill();

  // Hair
  oCtx.beginPath(); oCtx.arc(px,baseY-4,10,Math.PI,Math.PI*2);
  oCtx.fillStyle='#1e293b'; oCtx.fill();

  // Eyes — mood-aware
  const mood = agent.mood || 'neutral';
  const blink = Math.sin(time/2000+gx)>0.95;
  if(!blink){
    const eyeShift = isIdle ? idleHeadTurn * 8 : 0;
    if(mood === 'stressed') {
      // Worried eyes — angled brows, smaller pupils
      oCtx.fillStyle='#1e293b';
      oCtx.beginPath();oCtx.arc(px-3+eyeShift,baseY-1,1.5,0,Math.PI*2);oCtx.fill();
      oCtx.beginPath();oCtx.arc(px+3+eyeShift,baseY-1,1.5,0,Math.PI*2);oCtx.fill();
      oCtx.fillStyle='#fff';
      oCtx.beginPath();oCtx.arc(px-2.5+eyeShift,baseY-1.5,0.5,0,Math.PI*2);oCtx.fill();
      oCtx.beginPath();oCtx.arc(px+3.5+eyeShift,baseY-1.5,0.5,0,Math.PI*2);oCtx.fill();
      // Worried brows (angled inward)
      oCtx.strokeStyle='#1e293b';oCtx.lineWidth=1.2;
      oCtx.beginPath();oCtx.moveTo(px-5,baseY-5);oCtx.lineTo(px-1,baseY-4);oCtx.stroke();
      oCtx.beginPath();oCtx.moveTo(px+5,baseY-5);oCtx.lineTo(px+1,baseY-4);oCtx.stroke();
    } else if(mood === 'happy') {
      // Happy eyes — slightly larger, sparkle
      oCtx.fillStyle='#1e293b';
      oCtx.beginPath();oCtx.arc(px-3+eyeShift,baseY-1,2,0,Math.PI*2);oCtx.fill();
      oCtx.beginPath();oCtx.arc(px+3+eyeShift,baseY-1,2,0,Math.PI*2);oCtx.fill();
      oCtx.fillStyle='#fff';
      oCtx.beginPath();oCtx.arc(px-2.3+eyeShift,baseY-1.8,0.8,0,Math.PI*2);oCtx.fill();
      oCtx.beginPath();oCtx.arc(px+3.7+eyeShift,baseY-1.8,0.8,0,Math.PI*2);oCtx.fill();
      // Sparkle on one eye
      const sp = Math.sin(time/800)*0.5+0.5;
      oCtx.globalAlpha=sp*0.6;oCtx.fillStyle='#fff';
      oCtx.beginPath();oCtx.arc(px+4.5+eyeShift,baseY-2.5,0.4,0,Math.PI*2);oCtx.fill();
      oCtx.globalAlpha=1;
    } else {
      // Neutral eyes
      oCtx.fillStyle='#1e293b';
      oCtx.beginPath();oCtx.arc(px-3+eyeShift,baseY-1,1.8,0,Math.PI*2);oCtx.fill();
      oCtx.beginPath();oCtx.arc(px+3+eyeShift,baseY-1,1.8,0,Math.PI*2);oCtx.fill();
      oCtx.fillStyle='#fff';
      oCtx.beginPath();oCtx.arc(px-2.5+eyeShift,baseY-1.5,0.6,0,Math.PI*2);oCtx.fill();
      oCtx.beginPath();oCtx.arc(px+3.5+eyeShift,baseY-1.5,0.6,0,Math.PI*2);oCtx.fill();
    }
  } else {
    oCtx.strokeStyle='#333';oCtx.lineWidth=1;
    oCtx.beginPath();oCtx.moveTo(px-5,baseY-1);oCtx.lineTo(px-1,baseY-1);oCtx.stroke();
    oCtx.beginPath();oCtx.moveTo(px+1,baseY-1);oCtx.lineTo(px+5,baseY-1);oCtx.stroke();
  }
  oCtx.restore(); // end idle head turn

  // Mouth — mood-aware
  oCtx.strokeStyle='#8B4513'; oCtx.lineWidth=1; oCtx.beginPath();
  if(mood === 'happy') {
    // Big smile
    oCtx.arc(px,baseY+2.5,3.5,0.15*Math.PI,0.85*Math.PI);
  } else if(mood === 'stressed') {
    // Slight frown
    oCtx.arc(px,baseY+7,3,1.15*Math.PI,1.85*Math.PI);
  } else if(isWorking) {
    // Focused "o" mouth
    oCtx.arc(px,baseY+3,3,0.1*Math.PI,0.9*Math.PI);
  } else {
    // Neutral line
    oCtx.moveTo(px-2,baseY+4); oCtx.lineTo(px+2,baseY+4);
  }
  oCtx.stroke();

  // Mood indicator emoji (subtle, above head)
  if(mood === 'happy' && Math.sin(time/3000+gx*2)>0.7) {
    oCtx.font='8px serif';oCtx.textAlign='center';oCtx.globalAlpha=0.5;
    oCtx.fillText('✨',px+12,baseY-14+Math.sin(time/1000)*2);
    oCtx.globalAlpha=1;
  } else if(mood === 'stressed' && Math.sin(time/2500+gx*3)>0.6) {
    oCtx.font='8px serif';oCtx.textAlign='center';oCtx.globalAlpha=0.4;
    oCtx.fillText('😰',px+12,baseY-14+Math.sin(time/900)*1.5);
    oCtx.globalAlpha=1;
  }

  // Typing indicator for working agents
  if(isWorking) {
    const dotPhase = time / 400;
    for(let i=0;i<3;i++){
      const dy = Math.sin(dotPhase + i*0.8) * 2;
      oCtx.beginPath(); oCtx.arc(px-4+i*4, baseY-20+dy, 1.5, 0, Math.PI*2);
      oCtx.fillStyle = agent.color; oCtx.globalAlpha = 0.7; oCtx.fill(); oCtx.globalAlpha = 1;
    }
  }

  // POI personality animations — unique poses when idle agents are at a point of interest
  if(isIdle && interactionInfo && interactionInfo.atPoi) {
    const iType = interactionInfo.type;
    oCtx.save();
    if(iType === 'read-bookshelf') {
      // Holding a book — small rectangle in front, slight head tilt down
      oCtx.fillStyle='#e74c3c'; // red book cover
      oCtx.save(); oCtx.translate(px, baseY+14); oCtx.rotate(-0.15);
      oCtx.fillRect(-6,-4,12,8);
      oCtx.fillStyle='#fff'; oCtx.fillRect(-4,-2,8,4); // pages
      oCtx.restore();
      // Reading glasses glint
      const glint = 0.4+0.3*Math.sin(time/1200);
      oCtx.globalAlpha=glint; oCtx.fillStyle='rgba(255,255,255,0.6)';
      oCtx.fillRect(px-5,baseY-3,3,1); oCtx.fillRect(px+2,baseY-3,3,1);
      oCtx.globalAlpha=1;
    } else if(iType === 'water-plant') {
      // Watering can — tilted can pouring drops
      const tilt = Math.sin(time/800)*0.1 + 0.3;
      oCtx.save(); oCtx.translate(px+12, baseY+10); oCtx.rotate(tilt);
      oCtx.fillStyle='#6b9bd2'; // can body
      oCtx.fillRect(-5,-4,10,6);
      oCtx.fillStyle='#5a8abf'; // spout
      oCtx.fillRect(4,-6,6,2);
      oCtx.fillStyle='#6b9bd2';
      oCtx.fillRect(-3,-7,3,3); // handle top
      oCtx.restore();
      // Water drops
      const dropPhase = (time%1500)/1500;
      for(let d=0;d<3;d++){
        const dp = (dropPhase+d*0.33)%1;
        const dy = dp*18;
        const da = dp<0.3?dp/0.3 : dp>0.7?(1-dp)/0.3 : 1;
        oCtx.globalAlpha=da*0.7;
        oCtx.fillStyle='#60a5fa';
        oCtx.beginPath(); oCtx.arc(px+20, baseY+6+dy, 1.2-dp*0.4, 0, Math.PI*2); oCtx.fill();
      }
      oCtx.globalAlpha=1;
    } else if(iType === 'phone-call') {
      // Phone held to ear — small rectangle near head, mouth moving
      oCtx.fillStyle='#1e293b';
      oCtx.save(); oCtx.translate(px+10, baseY-4); oCtx.rotate(0.2);
      roundRect(oCtx,-2,-6,4,10,1.5); oCtx.fill();
      oCtx.fillStyle='#3b82f6'; oCtx.fillRect(-1,-5,2,2); // screen
      oCtx.restore();
      // Animated mouth (talking)
      const mouthOpen = Math.sin(time/200)*2 + 2;
      oCtx.strokeStyle='#8B4513'; oCtx.lineWidth=1;
      oCtx.beginPath(); oCtx.arc(px, baseY+3, mouthOpen, 0.1*Math.PI, 0.9*Math.PI);
      oCtx.stroke();
      // Sound waves from phone
      const waveA = 0.3+0.3*Math.sin(time/300);
      oCtx.globalAlpha=waveA*0.4;
      oCtx.strokeStyle=agent.color; oCtx.lineWidth=0.8;
      for(let w=0;w<3;w++){
        const wr = 4+w*4;
        oCtx.beginPath(); oCtx.arc(px+14, baseY-4, wr, -0.4, 0.4); oCtx.stroke();
      }
      oCtx.globalAlpha=1;
    } else if(iType === 'coffee') {
      // Holding a cup — small mug in hand, steam rising
      oCtx.fillStyle='#e8e8e8';
      oCtx.fillRect(px+10, baseY+10, 6, 8); // mug
      oCtx.fillStyle='#8B4513';
      oCtx.fillRect(px+11, baseY+11, 4, 6); // coffee
      oCtx.strokeStyle='#ccc'; oCtx.lineWidth=1;
      oCtx.beginPath(); oCtx.arc(px+18, baseY+14, 2.5, -Math.PI*0.5, Math.PI*0.5); oCtx.stroke(); // handle
      // Steam
      for(let s=0;s<2;s++){
        const sp = ((time+s*700)%2000)/2000;
        const sy = baseY+8 - sp*14;
        const sx = px+13 + Math.sin(sp*Math.PI*3+s)*3;
        oCtx.globalAlpha=(1-sp)*0.35;
        oCtx.fillStyle='#fff';
        oCtx.beginPath(); oCtx.arc(sx, sy, 1.5-sp*0.5, 0, Math.PI*2); oCtx.fill();
      }
      oCtx.globalAlpha=1;
    } else if(iType === 'collab-whiteboard') {
      // Collaborative whiteboard — two agents brainstorming together
      const partner = interactionInfo.collabPartner;
      // Drawing arm (alternating turns with partner)
      const turnPhase = (time % 4000) / 4000;
      const myTurn = turnPhase < 0.5;
      if (myTurn) {
        const drawX = px - 14 + Math.sin(time/500)*10;
        const drawY = baseY + 2 + Math.cos(time/700)*5;
        oCtx.strokeStyle=shadeColor(agent.color,-15); oCtx.lineWidth=3; oCtx.lineCap='round';
        oCtx.beginPath(); oCtx.moveTo(px+9, baseY+12); oCtx.lineTo(drawX, drawY); oCtx.stroke();
        oCtx.fillStyle=agent.color;
        oCtx.beginPath(); oCtx.arc(drawX, drawY, 2.5, 0, Math.PI*2); oCtx.fill();
        // Trail in agent's color
        for(let t=0;t<5;t++){
          const tx = px - 14 + Math.sin((time-t*180)/500)*10;
          const ty = baseY + 2 + Math.cos((time-t*180)/700)*5;
          oCtx.globalAlpha = 0.12*(1-t*0.18);
          oCtx.beginPath(); oCtx.arc(tx, ty, 1.5, 0, Math.PI*2); oCtx.fill();
        }
        oCtx.globalAlpha=1;
      } else {
        // Watching / nodding — slight head bob
        const nod = Math.sin(time/600)*0.08;
        oCtx.save(); oCtx.translate(px, baseY); oCtx.rotate(nod); oCtx.translate(-px, -baseY); oCtx.restore();
        // Pointing gesture
        oCtx.strokeStyle=shadeColor(agent.color,-15); oCtx.lineWidth=2; oCtx.lineCap='round';
        const pointX = px - 10 + Math.sin(time/2000)*5;
        oCtx.beginPath(); oCtx.moveTo(px+9, baseY+12); oCtx.lineTo(pointX, baseY+4); oCtx.stroke();
      }
      // Discussion bubbles (alternating 💡 and ✏️)
      const bubblePhase = (time % 3000) / 3000;
      if (bubblePhase > 0.3 && bubblePhase < 0.7) {
        const ba = bubblePhase < 0.4 ? (bubblePhase-0.3)*10 : bubblePhase > 0.6 ? (0.7-bubblePhase)*10 : 1;
        oCtx.globalAlpha = ba * 0.65;
        const emoji = myTurn ? '✏️' : '💡';
        oCtx.font='9px system-ui'; oCtx.textAlign='center';
        oCtx.fillText(emoji, px+12, baseY-16-Math.sin(bubblePhase*Math.PI)*3);
        oCtx.globalAlpha=1;
      }
      // "Brainstorming" label
      if (partner) {
        const labelAlpha = 0.3+0.15*Math.sin(time/1500);
        oCtx.globalAlpha=labelAlpha;
        oCtx.font='7px system-ui'; oCtx.textAlign='center'; oCtx.fillStyle='#a78bfa';
        oCtx.fillText(`🧠 w/ ${partner}`, px, baseY+42);
        oCtx.globalAlpha=1;
      }
    } else if(iType === 'whiteboard') {
      // Drawing on whiteboard — arm extended, marker dots appearing
      const drawX = px - 14 + Math.sin(time/600)*8;
      const drawY = baseY + 2 + Math.cos(time/800)*4;
      // Extended arm toward board
      oCtx.strokeStyle=shadeColor(agent.color,-15); oCtx.lineWidth=3; oCtx.lineCap='round';
      oCtx.beginPath(); oCtx.moveTo(px+9, baseY+12); oCtx.lineTo(drawX, drawY); oCtx.stroke();
      // Marker tip
      oCtx.fillStyle=agent.color;
      oCtx.beginPath(); oCtx.arc(drawX, drawY, 2, 0, Math.PI*2); oCtx.fill();
      // Trail dots
      for(let t=0;t<4;t++){
        const tt = ((time-t*200)%2400)/2400;
        const tx = px - 14 + Math.sin((time-t*200)/600)*8;
        const ty = baseY + 2 + Math.cos((time-t*200)/800)*4;
        oCtx.globalAlpha = 0.15*(1-t*0.2);
        oCtx.beginPath(); oCtx.arc(tx, ty, 1.5, 0, Math.PI*2); oCtx.fill();
      }
      oCtx.globalAlpha=1;
    } else if(iType === 'server-check') {
      // Typing on server terminal — hunched, fast finger taps
      const tapY = Math.abs(Math.sin(time/120))*3;
      oCtx.fillStyle='#475569';
      oCtx.fillRect(px-8, baseY+18-tapY, 3, 4); // left fingers
      oCtx.fillRect(px+5, baseY+18-Math.abs(Math.sin(time/120+1))*3, 3, 4); // right fingers
      // Terminal glow on face
      const termGlow = 0.1+0.05*Math.sin(time/500);
      oCtx.globalAlpha=termGlow;
      oCtx.fillStyle='#22c55e';
      oCtx.beginPath(); oCtx.arc(px, baseY, 12, 0, Math.PI*2); oCtx.fill();
      oCtx.globalAlpha=1;
    } else if(iType === 'stretch') {
      // Arms up stretch pose
      const sway = Math.sin(time/1500)*0.1;
      oCtx.save(); oCtx.translate(px, baseY); oCtx.rotate(sway);
      oCtx.fillStyle=shadeColor(agent.color,-15);
      // Arms raised
      oCtx.fillRect(-14, -8, 5, 14); // left arm up
      oCtx.fillRect(9, -8, 5, 14); // right arm up
      // Hands at top
      oCtx.fillStyle='#d4a574';
      oCtx.beginPath(); oCtx.arc(-11, -10, 3, 0, Math.PI*2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(12, -10, 3, 0, Math.PI*2); oCtx.fill();
      oCtx.restore();
    } else if(iType === 'chat' && interactionInfo.chatPartner) {
      // Chat bubbles bouncing between agents
      const chatPhase = (time%3000)/3000;
      const myTurn = chatPhase < 0.5;
      if(myTurn) {
        const ba = chatPhase < 0.1 ? chatPhase/0.1 : chatPhase > 0.4 ? (0.5-chatPhase)/0.1 : 1;
        oCtx.globalAlpha=ba*0.7;
        oCtx.font='10px system-ui'; oCtx.textAlign='center';
        oCtx.fillText('💬', px+10, baseY-16-Math.sin(chatPhase*Math.PI*4)*2);
        oCtx.globalAlpha=1;
      }
    }
    oCtx.restore();
  }

  // Idle: mood thought bubbles — agents show what they're thinking based on mood + personality
  if(isIdle && !interactionInfo) {
    const thoughtPeriod = 10000; // 10s cycle
    const thoughtCycle = (time / thoughtPeriod + (agentWalking[agent.name]?.phase||0)) % 1;
    if(thoughtCycle > 0.65 && thoughtCycle < 0.95) {
      const tAlpha = thoughtCycle < 0.75 ? (thoughtCycle-0.65)*10 : (0.95-thoughtCycle)*5;
      const mood = agent.mood || 'neutral';
      // Pick thought based on mood + agent personality
      const moodThoughts = {
        happy: {
          _role_ceo:['📈 Numbers up!','🚀 Team\'s on fire','⭐ Great progress'],
          _role_director:['🎯 Pipeline flowing','📋 On schedule!','✨ Content\'s great'],
          _role_writer:['✍️ Words flowing','📖 Good chapter','💡 Plot twist idea'],
          _role_designer:['🎨 Colors perfect','✨ Clean layout','🖼️ Portfolio piece'],
          _role_producer:['🎬 Render looks good','🎵 Audio\'s crisp','📹 Clean cut'],
          _role_publisher:['📊 Engagement up!','🎉 Post went viral','📱 Good reach'],
          _role_dev:['✅ Tests passing','🔧 Clean merge','💻 Code flows nice'],
          _role_mail:['📬 Inbox zero!','✉️ All caught up','📋 Sorted!'],
          _role_qa:['✅ All green!','🧪 Tests passing','🛡️ No bugs found'],
          _default:['😊 Going well!','✨ Nice progress','👍 Looking good']
        },
        stressed: {
          _role_ceo:['😰 Deadlines...','📉 Need to check','🤔 Resource issue?'],
          _role_director:['⏰ Behind schedule','🔥 Too many tasks','📋 Reprioritize...'],
          _role_writer:['😤 Writer\'s block','📝 Rewrite needed','🤔 Wrong angle...'],
          _role_designer:['🎨 Not quite right','😣 Alignment off','🔄 Another revision'],
          _role_producer:['🎬 Render failed?','⏳ Takes forever','🔧 Codec issues'],
          _role_publisher:['📉 Low engagement','🕐 Missed window','😬 Typo posted?'],
          _role_dev:['🐛 Weird bug...','❌ Tests failing','🤔 Race condition?'],
          _role_mail:['📨 Flood of mail','🔴 Urgent thread','😰 Spam wave'],
          _role_qa:['🐛 Found 3 bugs','❌ Regression!','⚠️ Flaky test'],
          _default:['😰 So much to do','🤔 Hmm...','⏳ Running behind']
        },
        neutral: {
          _role_ceo:['🤔 Strategy time','📊 Checking metrics','☕ Need coffee'],
          _role_director:['📋 Planning ahead','🤔 Next sprint...','📝 Review queue'],
          _role_writer:['📖 Research mode','✍️ Outlining...','🤔 Word choice...'],
          _role_designer:['🎨 Sketching ideas','🤔 Which font...','📐 Grid snapping'],
          _role_producer:['🎬 Timeline check','🎵 Audio levels','📹 B-roll ideas'],
          _role_publisher:['📊 Analytics time','📱 Schedule posts','🤔 Best timing?'],
          _role_dev:['💻 Code review','🔍 Refactoring','📝 TODO list'],
          _role_mail:['📬 Checking inbox','📋 Filing away','✉️ Draft reply'],
          _role_qa:['🧪 Test planning','🔍 Edge cases','📋 Checklist'],
          _default:['🤔 Thinking...','💭 Hmm...','📋 Planning']
        },
        tired: {
          _default:['😴 Need rest...','💤 So sleepy','☕ More coffee...','🥱 Long day']
        }
      };
      const moodSet = moodThoughts[mood] || moodThoughts.neutral;
      const roleKey = '_role_' + _getRoleCategory(agent.role);
      const agentThoughts = moodSet[roleKey] || moodSet._default;
      // Deterministic thought selection based on time bucket
      const bucket = Math.floor(time / thoughtPeriod + (agentWalking[agent.name]?.phase||0));
      const thought = agentThoughts[bucket % agentThoughts.length];

      // Draw thought bubble with trailing dots
      const bubbleY = baseY - 22 - (thoughtCycle - 0.65) * 20;
      oCtx.globalAlpha = tAlpha * 0.7;

      // Small trailing dots leading to bubble
      oCtx.fillStyle = 'rgba(255,255,255,0.25)';
      oCtx.beginPath(); oCtx.arc(px+8, baseY-14, 2, 0, Math.PI*2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(px+11, baseY-18, 1.5, 0, Math.PI*2); oCtx.fill();

      // Thought bubble background
      oCtx.font='8px system-ui'; oCtx.textAlign='center';
      const tw = oCtx.measureText(thought).width + 12;
      const bx = px + 14 - tw/2, by = bubbleY - 10;
      oCtx.fillStyle = 'rgba(30,20,60,0.75)';
      roundRect(oCtx, bx, by, tw, 14, 7); oCtx.fill();
      oCtx.strokeStyle = 'rgba(255,255,255,0.12)';
      oCtx.lineWidth = 0.5;
      roundRect(oCtx, bx, by, tw, 14, 7); oCtx.stroke();

      // Thought text
      oCtx.fillStyle = '#e0d8f0';
      oCtx.fillText(thought, px+14, bubbleY-1);
      oCtx.globalAlpha = 1;
    }
  }

  // Name + role
  oCtx.font='bold 10px system-ui'; oCtx.textAlign='center';
  oCtx.fillStyle = agent.color;
  oCtx.fillText(agent.name, baseP.x, baseP.y+48);
  oCtx.font='8px system-ui'; oCtx.fillStyle='#64748b';
  oCtx.fillText(agent.role, baseP.x, baseP.y+58);

  // Status dot
  const statusColor = isWorking ? '#22c55e' : '#f59e0b';
  oCtx.beginPath(); oCtx.arc(px+22, baseY-8, 4, 0, Math.PI*2);
  oCtx.fillStyle = statusColor; oCtx.fill();
  if(isWorking){
    oCtx.beginPath(); oCtx.arc(px+22, baseY-8, 7, 0, Math.PI*2);
    oCtx.strokeStyle='rgba(34,197,94,0.3)'; oCtx.lineWidth=2; oCtx.stroke();
  }

  // Speech bubble for working AND idle agents (idle = faded, skip if interacting)
  const hasRealMsg = agent.lastMessage && agent.lastMessage !== 'ANNOUNCE_SKIP' && agent.lastMessage !== 'NO_REPLY' && agent.lastMessage.length >= 5;
  const _roleFallbacks = {ceo:'Handling requests...',director:'Reviewing pipeline...',writer:'Drafting content...',designer:'Creating visuals...',producer:'Rendering video...',publisher:'Publishing drafts...',dev:'Writing code...',mail:'Processing emails...',qa:'Running QA checks...',default:'Working...'};
  const _myRoleCat = _getRoleCategory(agent.role);
  const fallbackMsg = _roleFallbacks[_myRoleCat] || _roleFallbacks.default;
  const interactionLabels = {coffee:'☕ Getting coffee...',whiteboard:'📝 At the whiteboard','collab-whiteboard':null,stretch:'🚶 Stretching legs','server-check':'🖥️ Checking servers','read-bookshelf':'📚 Reading up...','water-plant':'🌱 Watering plants','phone-call':'📞 On a call',chat:null};
  // Show interaction label at POI, otherwise normal bubble
  let bubbleText;
  if (interactionInfo && interactionInfo.atPoi) {
    const iLabel = interactionLabels[interactionInfo.type];
    if (interactionInfo.type === 'chat' && interactionInfo.chatPartner) {
      bubbleText = `💬 Chatting with ${interactionInfo.chatPartner}`;
    } else if (interactionInfo.type === 'collab-whiteboard' && interactionInfo.collabPartner) {
      bubbleText = `🧠 Brainstorming with ${interactionInfo.collabPartner}`;
    } else {
      bubbleText = iLabel || '';
    }
  } else if (!interactionInfo || !interactionInfo.walking) {
    bubbleText = hasRealMsg ? agent.lastMessage :
      (agent.status === 'working' ? fallbackMsg :
       agent.status === 'idle' ? fallbackMsg.replace('...','') + ' (idle)' : '');
  } else {
    bubbleText = '';
  }
  if(bubbleText && (agent.status === 'working' || agent.status === 'idle')) {
    oCtx.font='8px system-ui';
    // Word-wrap into up to 2 lines, max ~60 chars per line
    const maxLineW = 140;
    function wrapText(text, maxW) {
      const words = text.split(' ');
      const lines = []; let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (oCtx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
        else cur = test;
        if (lines.length >= 2) break;
      }
      if (cur && lines.length < 2) lines.push(cur);
      if (lines.length === 2 && oCtx.measureText(lines[1]).width > maxW) {
        lines[1] = lines[1].slice(0, 40) + '…';
      }
      return lines;
    }
    const lines = wrapText(bubbleText, maxLineW);
    const lineH = 11;
    const bw = Math.max(...lines.map(l => oCtx.measureText(l).width)) + 16;
    const bh = 8 + lines.length * lineH;
    const bx = baseP.x - bw/2, by = Math.max(10, baseP.y - 42 - bh);
    oCtx.globalAlpha = agent.status === 'working' ? 0.9 : 0.5;
    oCtx.fillStyle='rgba(15,20,30,0.92)';
    roundRect(oCtx,bx,by,bw,bh,8); oCtx.fill();
    oCtx.strokeStyle=agent.color; oCtx.lineWidth=0.8;
    roundRect(oCtx,bx,by,bw,bh,8); oCtx.stroke();
    // Arrow
    oCtx.fillStyle='rgba(15,20,30,0.92)';
    oCtx.beginPath();oCtx.moveTo(baseP.x-4,by+bh);oCtx.lineTo(baseP.x,by+bh+6);oCtx.lineTo(baseP.x+4,by+bh);oCtx.fill();
    oCtx.fillStyle='#e2e8f0'; oCtx.textAlign='center';
    lines.forEach((l, i) => oCtx.fillText(l, baseP.x, by + 10 + i * lineH));
    oCtx.globalAlpha = 1;
  }

  // Time ago
  if(agent.ageMin !== undefined) {
    oCtx.font='7px system-ui'; oCtx.fillStyle='#475569'; oCtx.textAlign='center';
    const txt = !agent.ageMin ? '' : agent.ageMin < 1 ? 'just now' : agent.ageMin < 60 ? `${agent.ageMin}m ago` : `${Math.round(agent.ageMin/60)}h ago`;
    oCtx.fillText(txt, baseP.x, baseP.y+66);
  }
}

function getCanvasTheme(){
  const dark=document.documentElement.getAttribute('data-theme')!=='light';
  return dark?{floor1:'#344e6e',floor2:'#3c5a80',floorStroke:'#4a6a90',wall1:'#4a6585',wall2:'#3e5872',wall3:'#354d66',nameTag:'rgba(0,0,0,0.7)',nameText:'#fff',deskTop:'#5a4630',deskL:'#3b2f1e',deskR:'#4a3828',lgDeskTop:'#6a5640',lgDeskL:'#4b3f2e',lgDeskR:'#5a4838',monitorBg:'#1a1f2e',monitorScr:'#3b82f6',monitorScr2:'#22c55e',potBrown:'#6b3a1f',leafDk:'#166534',leafLt:'#22c55e',clockFrame:'#2a2a2a',clockFace:'#f0ead6',clockTick:'#333',clockHand:'#333',clockSec:'#e74c3c',coffeeTop:'#444',coffeeL:'#2a2a2a',coffeeR:'#333',wbBg:'#f0f0f0',wbBorder:'#555',wbText:'#333',wbCheck:'#16a34a',srvTop:'#2d333b',srvL:'#1a1f2e',srvR:'#252b35',srvLed:'#22c55e',srvLedOff:'#0a3a1a',srvLabel:'#64748b',bsTop:'#5a3a20',bsL:'#3a2210',bsR:'#4a3018',bsLabel:'#64748b',lampPole:'#555',lampShade:'#c8a84e',lampGlow:'rgba(255,220,120,',fcTop:'#4a4a4a',fcL:'#333',fcR:'#3a3a3a',fcDrawer:'#555',fcKnob:'#c8a84e',tcBody:'#3a3a3a',tcLid:'#4a4a4a',tcLine:'#555',crPole:'#5a4a30',crKnob:'#c8a84e',crBase:'#3a3a3a',cacPot:'#8B4513',cacPotIn:'#a0522d',cacBody:'#2d6b2d',cacArm:'#3a8a3a',cacFlower:'#ff6b6b',stickyC:['#fef08a','#86efac','#93c5fd'],mugBody:'#e8e8e8',mugFill:'#8B4513',mugHandle:'#ccc',doorFrame:'#3a2820',doorFace:'#5a4030',doorKnob:'#c8a84e',doorStroke:'#2a1a10'}:{floor1:'#d8dce4',floor2:'#e4e8f0',floorStroke:'#b8c4d0',wall1:'#a0b4c8',wall2:'#90a4b8',wall3:'#8094a8',nameTag:'rgba(255,255,255,0.9)',nameText:'#1a1a2e',deskTop:'#c9a87c',deskL:'#a8875d',deskR:'#b8976d',lgDeskTop:'#d4b88c',lgDeskL:'#b8976d',lgDeskR:'#c9a87c',monitorBg:'#e8ecf0',monitorScr:'#60a5fa',monitorScr2:'#4ade80',potBrown:'#a0724e',leafDk:'#22863a',leafLt:'#4ade80',clockFrame:'#d0d0d0',clockFace:'#ffffff',clockTick:'#555',clockHand:'#444',clockSec:'#e74c3c',coffeeTop:'#6a6a6a',coffeeL:'#505050',coffeeR:'#5a5a5a',wbBg:'#ffffff',wbBorder:'#aaa',wbText:'#555',wbCheck:'#22863a',srvTop:'#c0c8d0',srvL:'#a0a8b0',srvR:'#b0b8c0',srvLed:'#4ade80',srvLedOff:'#b0d8b0',srvLabel:'#8090a0',bsTop:'#a07850',bsL:'#806030',bsR:'#907040',bsLabel:'#8090a0',lampPole:'#888',lampShade:'#d4b870',lampGlow:'rgba(255,230,150,',fcTop:'#8a8a8a',fcL:'#707070',fcR:'#7a7a7a',fcDrawer:'#999',fcKnob:'#d4b870',tcBody:'#808080',tcLid:'#909090',tcLine:'#aaa',crPole:'#907860',crKnob:'#d4b870',crBase:'#808080',cacPot:'#b87040',cacPotIn:'#c08050',cacBody:'#3a8a3a',cacArm:'#4aba4a',cacFlower:'#ff8a8a',stickyC:['#fef9c3','#bbf7d0','#bfdbfe'],mugBody:'#f0f0f0',mugFill:'#a06030',mugHandle:'#ddd',doorFrame:'#6a5040',doorFace:'#907060',doorKnob:'#d4b870',doorStroke:'#5a4030'};
}
let _th=null, _frameTime=0;
let _themeCache=null, _themeCacheKey=null;
const _getCanvasTheme = getCanvasTheme;
getCanvasTheme = function(){
  const key = document.documentElement.getAttribute('data-theme') || 'dark';
  if(key===_themeCacheKey && _themeCache) return _themeCache;
  _themeCacheKey=key; _themeCache=_getCanvasTheme(); return _themeCache;
};

// Ambient floating particles (dust motes / data particles)
const particles = [];
for(let i=0;i<15;i++) particles.push({x:Math.random()*1000,y:Math.random()*520,vx:(Math.random()-0.5)*0.3,vy:-0.1-Math.random()*0.2,size:0.8+Math.random()*1.5,alpha:0.1+Math.random()*0.25,hue:200+Math.random()*60});
function drawParticles(time){
  oCtx.save();
  for(let i=0;i<particles.length;i++){
    const p=particles[i];
    p.x+=p.vx+Math.sin(time/3000+p.y*0.01)*0.15;
    p.y+=p.vy;
    if(p.y<-5){p.y=525;p.x=Math.random()*1000;}
    if(p.x<-5)p.x=1005;if(p.x>1005)p.x=-5;
    const flicker=0.5+0.5*Math.sin(time/1500+p.x*0.1);
    oCtx.globalAlpha=p.alpha*flicker;
    oCtx.beginPath();oCtx.arc(p.x,p.y,p.size,0,Math.PI*2);
    oCtx.fillStyle=`hsl(${p.hue},60%,70%)`;oCtx.fill();
  }
  oCtx.restore();
}

// Floating emote bubbles for working agents
const agentEmotes = {}; // {agentName: [{emoji, x, y, startTime, duration}]}
const _roleEmotes = {
  ceo: ['⚡','🎯','📋','🚀'], director: ['👁️','🎬','✅','🔄'],
  writer: ['✍️','📝','💡','🔍'], designer: ['🎨','✨','🖌️','💜'],
  producer: ['🎬','🎥','🔥','📹'], publisher: ['📤','📱','🌐','📊'],
  dev: ['💻','🐛','⚙️','🧪'], mail: ['📧','💌','📬','✉️'],
  qa: ['🔍','✅','🧪','🎯'], default: ['💡','🔥','✨','⚡']
};
function _emoteRoleCat(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('ceo') || r.includes('mc') || r.includes('owner')) return 'ceo';
  if (r.includes('director') || r.includes('lead')) return 'director';
  if (r.includes('write') || r.includes('content') || r.includes('research')) return 'writer';
  if (r.includes('design') || r.includes('art')) return 'designer';
  if (r.includes('produce') || r.includes('video') || r.includes('media')) return 'producer';
  if (r.includes('publish') || r.includes('deploy') || r.includes('social')) return 'publisher';
  if (r.includes('code') || r.includes('dev') || r.includes('engineer')) return 'dev';
  if (r.includes('mail') || r.includes('email')) return 'mail';
  if (r.includes('qa') || r.includes('test') || r.includes('quality')) return 'qa';
  return 'default';
}
// Legacy compat: emotePool lookups by name fall through to role-based
const emotePool = new Proxy({_default:['💡','🔥','✨','⚡']}, {
  get(target, prop) {
    if (prop === '_default') return target._default;
    // Find agent by name in agentData and resolve role
    const a = agentData.find(ag => ag.name === prop);
    return _roleEmotes[_emoteRoleCat(a?.role)] || target._default;
  }
});

function tickEmotes(agents, time) {
  agents.forEach(a => {
    if (a.status !== 'working') { delete agentEmotes[a.name]; return; }
    if (!agentEmotes[a.name]) agentEmotes[a.name] = [];
    const arr = agentEmotes[a.name];
    // Remove expired
    for (let i = arr.length - 1; i >= 0; i--) {
      if (time - arr[i].startTime > arr[i].duration) { arr[i]=arr[arr.length-1]; arr.pop(); }
    }
    // Spawn new emote every ~6-10s (staggered per agent)
    const seed = (a.name.charCodeAt(0) * 137) % 4000;
    const interval = 6000 + seed;
    if (arr.length === 0 || (time - (arr[arr.length-1]?.startTime || 0)) > interval) {
      const pool = emotePool[a.name] || emotePool._default;
      const pos = deskPositions[a.name];
      if (!pos) return;
      const base = isoToScreen(pos.gx, pos.gy);
      arr.push({
        emoji: pool[Math.floor(Math.random() * pool.length)],
        x: base.x + (Math.random() - 0.5) * 16,
        y: base.y - 10,
        startTime: time,
        duration: 2200,
        dx: (Math.random() - 0.5) * 0.3
      });
    }
  });
}

function drawEmotes(time) {
  oCtx.save();
  for (const name in agentEmotes) {
    const arr = agentEmotes[name];
    arr.forEach(e => {
      const elapsed = time - e.startTime;
      const progress = elapsed / e.duration;
      const y = e.y - progress * 40; // float up 40px
      const x = e.x + Math.sin(progress * Math.PI * 2) * 6 + e.dx * elapsed;
      // Fade in first 20%, fade out last 30%
      let alpha = 1;
      if (progress < 0.2) alpha = progress / 0.2;
      else if (progress > 0.7) alpha = (1 - progress) / 0.3;
      oCtx.globalAlpha = alpha * 0.85;
      oCtx.font = '12px system-ui';
      oCtx.textAlign = 'center';
      oCtx.fillText(e.emoji, x, y);
    });
  }
  oCtx.restore();
}

// ===== ZOOM & PAN =====
let camZoom = 1.3, camPanX = 0, camPanY = 0;
// Dynamic camera pivot — center of isometric grid
const _gridCenterGx = GRID.cols / 2, _gridCenterGy = GRID.rows / 2;
let camPivotX = _isoOriginX + (_gridCenterGx - _gridCenterGy) * ISO.tileW / 2;
let camPivotY = _isoOriginY + (_gridCenterGx + _gridCenterGy) * ISO.tileH / 2;
let _dragging = false, _dragStartX = 0, _dragStartY = 0, _panStartX = 0, _panStartY = 0;
const ZOOM_MIN = 0.6, ZOOM_MAX = 3.0, ZOOM_STEP = 0.15;

function zoomIn() { camZoom = Math.min(ZOOM_MAX, camZoom + ZOOM_STEP); }
function zoomOut() { camZoom = Math.max(ZOOM_MIN, camZoom - ZOOM_STEP); }
function zoomReset() { camPanX = 0; camPanY = 0; resizeCanvas(); }

oCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.deltaY < 0) zoomIn(); else zoomOut();
}, { passive: false });

// ── Pinch-to-zoom + touch pan for mobile office canvas ──
let _touchPinchDist = 0, _touchPanStart = null, _touchPanCam = null;
oCanvas.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _touchPinchDist = Math.hypot(dx, dy);
  } else if (e.touches.length === 1) {
    _touchPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    _touchPanCam = { x: camPanX, y: camPanY };
  }
}, { passive: false });
oCanvas.addEventListener('touchmove', e => {
  if (e.touches.length === 2 && _touchPinchDist > 0) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const scale = dist / _touchPinchDist;
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camZoom * scale));
    _touchPinchDist = dist;
  } else if (e.touches.length === 1 && _touchPanStart && camZoom > 1.05) {
    e.preventDefault();
    camPanX = _touchPanCam.x + (e.touches[0].clientX - _touchPanStart.x) / camZoom;
    camPanY = _touchPanCam.y + (e.touches[0].clientY - _touchPanStart.y) / camZoom;
  }
}, { passive: false });
oCanvas.addEventListener('touchend', () => { _touchPinchDist = 0; _touchPanStart = null; _touchPanCam = null; });

// ── Layout Mode (desk drag & drop) ──
let _layoutMode = false, _layoutDragging = null, _layoutMouseX = 0, _layoutMouseY = 0;
let _layoutGhostGx = 0, _layoutGhostGy = 0;

function toggleLayoutMode() {
  _layoutMode = !_layoutMode;
  const btn = document.getElementById('layout-btn');
  btn.style.opacity = _layoutMode ? '1' : '0.5';
  btn.style.background = _layoutMode ? 'var(--accent)' : '';
  btn.style.color = _layoutMode ? '#fff' : '';
  oCanvas.style.cursor = _layoutMode ? 'crosshair' : 'default';
  _staticValid = false; // force redraw to show grid overlay
}

function isoToGrid(px, py) {
  // Invert the gridToIso: px = ox + (gx-gy)*tw/2, py = oy + (gx+gy)*th/2
  const dx = px - _isoOriginX, dy = py - _isoOriginY;
  const gx = (dx / (ISO.tileW / 2) + dy / (ISO.tileH / 2)) / 2;
  const gy = (dy / (ISO.tileH / 2) - dx / (ISO.tileW / 2)) / 2;
  return { gx: Math.round(gx), gy: Math.round(gy) };
}

function canvasToIso(clientX, clientY) {
  const rect = oCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cx = (clientX - rect.left) * dpr;
  const cy = (clientY - rect.top) * dpr;
  // Undo zoom+pan transform: the canvas applies scale(zoom) then translate(panX, panY)
  const px = cx / camZoom - camPanX;
  const py = cy / camZoom - camPanY;
  return isoToGrid(px, py);
}

function findAgentAtGrid(gx, gy) {
  for (const a of agentData) {
    const pos = deskPositions[a.name];
    if (pos && pos.gx === gx && pos.gy === gy) return a.name;
  }
  return null;
}

oCanvas.addEventListener('mousedown', e => {
  if (_layoutMode) {
    const grid = canvasToIso(e.clientX, e.clientY);
    const name = findAgentAtGrid(grid.gx, grid.gy);
    if (name) {
      _layoutDragging = name;
      _layoutGhostGx = grid.gx;
      _layoutGhostGy = grid.gy;
      oCanvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
  }
  _dragging = true; _dragStartX = e.clientX; _dragStartY = e.clientY;
  _panStartX = camPanX; _panStartY = camPanY;
  oCanvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', e => {
  if (_layoutDragging) {
    const grid = canvasToIso(e.clientX, e.clientY);
    _layoutGhostGx = Math.max(0, Math.min(GRID.cols - 1, grid.gx));
    _layoutGhostGy = Math.max(0, Math.min(GRID.rows - 1, grid.gy));
    _layoutMouseX = e.clientX;
    _layoutMouseY = e.clientY;
    return;
  }
  if (!_dragging) return;
  camPanX = _panStartX + (e.clientX - _dragStartX) / camZoom;
  camPanY = _panStartY + (e.clientY - _dragStartY) / camZoom;
});

window.addEventListener('mouseup', () => {
  if (_layoutDragging) {
    // Snap desk to new position
    const name = _layoutDragging;
    deskPositions[name] = { gx: _layoutGhostGx, gy: _layoutGhostGy };
    // Persist to localStorage
    const saved = JSON.parse(localStorage.getItem('desk-layout') || '{}');
    saved[name] = { gx: _layoutGhostGx, gy: _layoutGhostGy };
    localStorage.setItem('desk-layout', JSON.stringify(saved));
    _layoutDragging = null;
    _staticValid = false; // rebuild static layer
    oCanvas.style.cursor = _layoutMode ? 'crosshair' : 'default';
    return;
  }
  _dragging = false; oCanvas.style.cursor = _layoutMode ? 'crosshair' : (camZoom > 1 ? 'grab' : 'default');
});

// Load saved desk layout from localStorage
function loadDeskLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem('desk-layout') || '{}');
    for (const [name, pos] of Object.entries(saved)) {
      if (pos && typeof pos.gx === 'number' && typeof pos.gy === 'number') {
        deskPositions[name] = pos;
      }
    }
  } catch {}
}

// Mini-map settings
const MINIMAP_W = 140, MINIMAP_H = 80, MINIMAP_PAD = 8;

function drawMiniMap(agents) {
  if (camZoom <= 1.32 && Math.abs(camPanX) < 5 && Math.abs(camPanY + 5) < 5) return; // skip at default view
  const mx = 1000 - MINIMAP_W - MINIMAP_PAD;
  const my = MINIMAP_PAD;
  oCtx.save();
  // Background
  oCtx.globalAlpha = 0.75;
  oCtx.fillStyle = 'rgba(10,15,25,0.85)';
  roundRect(oCtx, mx, my, MINIMAP_W, MINIMAP_H, 6); oCtx.fill();
  oCtx.strokeStyle = 'rgba(59,130,246,0.4)'; oCtx.lineWidth = 1;
  roundRect(oCtx, mx, my, MINIMAP_W, MINIMAP_H, 6); oCtx.stroke();
  oCtx.globalAlpha = 1;

  // Scale: map grid into minimap rect
  const scX = (MINIMAP_W - 16) / GRID.cols;
  const scY = (MINIMAP_H - 16) / GRID.rows;
  const ox = mx + 8, oy = my + 8;

  // Floor tiles (tiny)
  oCtx.globalAlpha = 0.3;
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
    oCtx.fillStyle = (r + c) % 2 === 0 ? '#4a6a90' : '#5a7aa0';
    oCtx.fillRect(ox + c * scX, oy + r * scY, scX - 0.5, scY - 0.5);
  }

  // Viewport rectangle
  oCtx.globalAlpha = 0.5;
  const vpW = 1000 / camZoom, vpH = 520 / camZoom;
  const vpX = (camPivotX - camPanX * camZoom - vpW / 2);
  const vpY = (camPivotY - camPanY * camZoom - vpH / 2);
  // Map screen coords to minimap
  const mmvx = ox + (vpX / 1000) * (MINIMAP_W - 16);
  const mmvy = oy + (vpY / 520) * (MINIMAP_H - 16);
  const mmvw = (vpW / 1000) * (MINIMAP_W - 16);
  const mmvh = (vpH / 520) * (MINIMAP_H - 16);
  oCtx.strokeStyle = '#fff'; oCtx.lineWidth = 1;
  oCtx.strokeRect(Math.max(mx + 2, mmvx), Math.max(my + 2, mmvy), Math.min(mmvw, MINIMAP_W - 4), Math.min(mmvh, MINIMAP_H - 4));

  // Agent dots
  oCtx.globalAlpha = 0.9;
  agents.forEach(a => {
    const pos = deskPositions[a.name];
    if (!pos) return;
    const dx = ox + pos.gx * scX + scX / 2;
    const dy = oy + pos.gy * scY + scY / 2;
    oCtx.beginPath(); oCtx.arc(dx, dy, a.status === 'working' ? 3 : 2, 0, Math.PI * 2);
    oCtx.fillStyle = a.color || '#888'; oCtx.fill();
    if (a.status === 'working') {
      oCtx.beginPath(); oCtx.arc(dx, dy, 4.5, 0, Math.PI * 2);
      oCtx.strokeStyle = a.color || '#888'; oCtx.lineWidth = 0.5; oCtx.stroke();
    }
  });

  // Label
  oCtx.globalAlpha = 0.5;
  oCtx.font = '7px system-ui'; oCtx.fillStyle = '#94a3b8'; oCtx.textAlign = 'right';
  oCtx.fillText(`${Math.round(camZoom * 100)}%`, mx + MINIMAP_W - 4, my + MINIMAP_H - 3);

  oCtx.restore();
}

function drawZoomControls() {
  if (camZoom <= 1.05 && Math.abs(camPanX) < 5 && Math.abs(camPanY) < 5) return;
  // Just draw zoom level indicator — buttons are keyboard/wheel driven
  oCtx.save();
  oCtx.font = 'bold 9px system-ui'; oCtx.textAlign = 'left';
  oCtx.fillStyle = 'rgba(148,163,184,0.5)';
  oCtx.fillText('🔍 Scroll to zoom · Drag to pan · ` to reset', 8, 390);
  oCtx.restore();
}

// Reusable arrays for drawOffice to avoid per-frame allocations
const _deskAgentsBuf = [], _visitorsBuf = [], _sortedBuf = [], _workingBuf = [];
const _defaultDeskPos = {gx:7, gy:5};
let _canvasHealthCounter = 0;
let _frameCounter = 0;
let _darkFrameCount = 0;
function drawOffice(rafNow) {
  if (!oCtx || !oCanvas.width) return; // guard: canvas not initialized
  try { _drawOfficeInner(rafNow); } catch(e) { console.warn('drawOffice error:', e.message); }
  // Dark-void self-heal: if canvas is all-black for 5+ frames, reset it
  try {
    const cx = oCanvas.width >> 1, cy = oCanvas.height >> 1;
    const px = oCtx.getImageData(cx, cy, 1, 1).data;
    if (px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 0) {
      _darkFrameCount++;
      if (_darkFrameCount >= 5) {
        console.warn('[drawOffice] dark-void detected, resetting canvas');
        oCanvas.width = oCanvas.width; // force context reset
        _staticValid = false;
        _darkFrameCount = 0;
      }
    } else {
      _darkFrameCount = 0;
    }
  } catch(e) {}
}
// ── AMBIENT PARTICLE SYSTEM ──
// Lightweight particles: typing sparks, coffee steam, ambient dust motes
const _particles = [];
const MAX_PARTICLES = 60;

function _spawnParticle(x, y, type) {
  if (_particles.length >= MAX_PARTICLES) _particles.shift();
  const p = { x, y, type, born: performance.now(), life: 800 + Math.random() * 1200 };
  if (type === 'spark') {
    p.vx = (Math.random() - 0.5) * 2;
    p.vy = -1.5 - Math.random() * 1.5;
    p.color = ['#ffa300','#ffec27','#ff6c24'][Math.floor(Math.random()*3)];
    p.size = 1.5 + Math.random();
    p.life = 400 + Math.random() * 400;
  } else if (type === 'steam') {
    p.vx = (Math.random() - 0.5) * 0.3;
    p.vy = -0.6 - Math.random() * 0.4;
    p.color = '#c2c3c7';
    p.size = 2 + Math.random() * 2;
    p.life = 1200 + Math.random() * 800;
  } else { // dust
    p.vx = (Math.random() - 0.5) * 0.15;
    p.vy = -0.1 + Math.random() * 0.05;
    p.color = '#fff1e8';
    p.size = 0.8 + Math.random() * 0.8;
    p.life = 3000 + Math.random() * 2000;
  }
  _particles.push(p);
}

function _drawParticles(time, agents) {
  const now = performance.now();

  // Spawn typing sparks for working agents (occasional)
  for (const a of agents) {
    if (a.status === 'working' && Math.random() < 0.08) {
      const p = isoToScreen(a._gx, a._gy);
      _spawnParticle(p.x + (Math.random()-0.5)*8, p.y - 18, 'spark');
    }
  }

  // Spawn steam from coffee machine POI (every ~15 frames)
  if (typeof POI !== 'undefined' && POI.coffee && Math.random() < 0.07) {
    const cp = isoToScreen(POI.coffee.x, POI.coffee.y);
    _spawnParticle(cp.x + (Math.random()-0.5)*4, cp.y - 24, 'steam');
  }

  // Spawn ambient dust motes (very rare)
  if (Math.random() < 0.015) {
    // Random position across visible office
    const rx = oCanvas.width * 0.1 + Math.random() * oCanvas.width * 0.8;
    const ry = oCanvas.height * 0.1 + Math.random() * oCanvas.height * 0.8;
    _spawnParticle(rx / (camZoom || 1), ry / (camZoom || 1), 'dust');
  }

  // Update & draw
  oCtx.save();
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    const age = now - p.born;
    if (age > p.life) { _particles.splice(i, 1); continue; }
    const t = age / p.life; // 0→1
    p.x += p.vx;
    p.y += p.vy;
    // Fade out
    const alpha = t < 0.2 ? t / 0.2 : t > 0.6 ? (1 - t) / 0.4 : 1;
    oCtx.globalAlpha = alpha * (p.type === 'dust' ? 0.15 : p.type === 'steam' ? 0.35 : 0.8);
    oCtx.fillStyle = p.color;
    oCtx.beginPath();
    oCtx.arc(p.x, p.y, p.size * (p.type === 'steam' ? (1 + t * 0.8) : 1), 0, Math.PI * 2);
    oCtx.fill();
  }
  oCtx.restore();
}

function _drawOfficeInner(rafNow) {
  _ptIdx = 0; // reset point pool each frame
  _frameLabelRects.length = 0; // reset label deconfliction each frame

  const dpr = window.devicePixelRatio || 1;

  // Safety net: detect silent canvas context corruption every frame.
  // Write a single pixel and read it back — if the write silently fails,
  // hard-reset the canvas immediately. This catches GPU memory pressure,
  // tab backgrounding, and other Chromium-level canvas invalidation.
  if (++_canvasHealthCounter >= 8) { // check every ~1s at 8fps
    _canvasHealthCounter = 0;
    oCtx.save();
    oCtx.setTransform(1, 0, 0, 1, 0, 0); // identity — write to raw pixel coords
    oCtx.fillStyle = '#010101';
    oCtx.fillRect(0, 0, 1, 1);
    const probe = oCtx.getImageData(0, 0, 1, 1).data;
    oCtx.restore();
    if (probe[3] === 0) { // write was silently swallowed — context is dead
      const w = oCanvas.width, h = oCanvas.height;
      oCanvas.width = w; // hard reset — clears state stack + backing store
      oCtx = oCanvas.getContext('2d', { willReadFrequently: true });
      invalidateStaticCache();
    }
  }

  // Always set transform fresh — prevents DPR drift from leaked save/restore
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const time = rafNow ? Math.round(performance.timeOrigin + rafNow) : Date.now(); _frameTime=time;
  const th=getCanvasTheme(); _th=th;
  // Reset transform to known-good state every frame — prevents save/restore stack corruption
  // from accumulating across frames (the drawAgent POI branch has conditional save/restore paths)
  oCtx.resetTransform();
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  oCtx.globalAlpha = 1;
  oCtx.globalCompositeOperation = 'source-over';
  oCtx.clearRect(0, 0, oCanvas.width / dpr, oCanvas.height / dpr);
  // Fill canvas with blended floor color so empty areas match the office, not a dark void
  oCtx.fillStyle = th.floor2;
  oCtx.fillRect(0, 0, oCanvas.width / dpr, oCanvas.height / dpr);

  // Pre-draw health check: verify the floor fill actually wrote pixels.
  // If the context is silently corrupted, reset immediately instead of drawing a black frame.
  try {
    const _probe = oCtx.getImageData(0, 0, 1, 1).data;
    if (_probe[3] === 0) { // alpha 0 = nothing was drawn = context dead
      console.warn('[canvas] Pre-draw: context dead — hard reset');
      oCanvas.width = oCanvas.width; // force reset
      oCtx = oCanvas.getContext('2d', { willReadFrequently: true });
      invalidateStaticCache();
      resizeCanvas();
      return; // skip this frame
    }
  } catch(e) {}

  // Apply zoom & pan — center on the iso grid dynamically
  const pivotX = oCanvas.width / (2 * (window.devicePixelRatio || 1));
  const pivotY = oCanvas.height / (2 * (window.devicePixelRatio || 1));
  oCtx.save();
  oCtx.translate(pivotX, pivotY);
  oCtx.scale(camZoom, camZoom);
  oCtx.translate(-camPivotX + camPanX, -camPivotY + camPanY);

  // Blit cached static layer (floor, walls, labels, static furniture)
  // The static canvas is rendered at the same internal coordinate space as isoToScreen.
  // We're currently in the zoom/pan transformed space, so drawing at (0,0)-(internalW,internalH)
  // will correctly zoom and pan the static content.
  buildStaticLayer();
  // Safety: ensure oCtx always points at the visible canvas after buildStaticLayer
  if (oCtx !== oCanvas.getContext('2d')) { oCtx = oCanvas.getContext('2d', { willReadFrequently: true }); oCtx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  if (_staticCanvas) {
    const dpr = window.devicePixelRatio || 1;
    const iW = oCanvas.width / dpr, iH = oCanvas.height / dpr;
    oCtx.drawImage(_staticCanvas, 0, 0, _staticCanvas.width, _staticCanvas.height, 0, 0, iW, iH);
  }

  // Windows on back wall (animated — sky changes over time)
  drawWindows(time);

  // Animated furniture only (plants, servers, lamps, clocks, coffee mugs)
  // LOD: skip detailed animated furniture when zoomed out far
  const _lodSkipDetail = camZoom < 0.55;
  if (!_lodSkipDetail) {
    _sortedFurniture.forEach(f=>{
      if(!ANIMATED_FURNITURE.has(f.type)) return;
      if(f.type==='plant') drawPlant(f.gx,f.gy);
      else if(f.type==='server') drawServer(f.gx,f.gy);
      else if(f.type==='lamp') drawLamp(f.gx,f.gy);
      else if(f.type==='clock') drawWallClock(f.gx,f.gy);
      else if(f.type==='coffee-mug') drawCoffeeMug(f.gx,f.gy);
    });
  }

  // Agents — separate desk agents from visitors (discovered/sub-agents)
  const allAgents = agentData.length ? agentData : [
    {name:'Agent 1',role:'MC',color:'#FFD700',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 2',role:'Director',color:'#FF6B6B',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 3',role:'Writer',color:'#4ECDC4',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 4',role:'Designer',color:'#A78BFA',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 5',role:'Producer',color:'#F97316',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 6',role:'Publisher',color:'#34D399',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 7',role:'Dev',color:'#00D4FF',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 8',role:'Email',color:'#FF69B4',status:'sleeping',lastMessage:'',ageMin:0},
    {name:'Agent 9',role:'QA',color:'#EF4444',status:'sleeping',lastMessage:'',ageMin:0},
  ];

  // Desk agents = have a desk position (static or auto-assigned) AND are not "discovered" without a desk
  // Auto-assign overflow desks to discovered agents — reuse buffers
  _deskAgentsBuf.length = 0; _visitorsBuf.length = 0; _sortedBuf.length = 0;
  for (let i = 0; i < allAgents.length; i++) {
    const a = allAgents[i];
    let hasDeskPos = false;
    if (deskPositions[a.name]) { hasDeskPos = true; }
    else {
      const auto = getAutoDesk(a.name);
      if (auto) { deskPositions[a.name] = auto; hasDeskPos = true; }
    }
    if (hasDeskPos) _deskAgentsBuf.push(a); else _visitorsBuf.push(a);
  }
  for (let i = 0; i < _deskAgentsBuf.length; i++) {
    const a = _deskAgentsBuf[i];
    const pos = deskPositions[a.name] || _defaultDeskPos;
    // Attach grid coords directly — avoid spread-operator allocation per frame
    a._gx = pos.gx; a._gy = pos.gy;
    _sortedBuf.push(a);
  }
  _sortedBuf.sort((a,b)=>(a._gx+a._gy)-(b._gx+b._gy));
  const sorted = _sortedBuf;
  const visitors = _visitorsBuf;

  sorted.forEach(a => { oCtx.save(); drawAgent(a, a._gx, a._gy, time); oCtx.restore(); });

  // ── AMBIENT PARTICLES ──
  _drawParticles(time, sorted);

  // Layout mode: draw ghost desk at target position
  if (_layoutMode && _layoutDragging) {
    const gp = isoToScreen(_layoutGhostGx, _layoutGhostGy);
    oCtx.save();
    oCtx.globalAlpha = 0.5;
    oCtx.strokeStyle = '#22c55e';
    oCtx.lineWidth = 3;
    oCtx.setLineDash([6, 4]);
    oCtx.beginPath();
    oCtx.ellipse(gp.x, gp.y - 10, 28, 16, 0, 0, Math.PI * 2);
    oCtx.stroke();
    oCtx.setLineDash([]);
    oCtx.fillStyle = 'rgba(34,197,94,0.15)';
    oCtx.fill();
    oCtx.font = 'bold 10px system-ui';
    oCtx.textAlign = 'center';
    oCtx.fillStyle = '#22c55e';
    oCtx.fillText(_layoutDragging, gp.x, gp.y + 20);
    oCtx.restore();
  }

  // Layout mode indicator: show grid overlay
  if (_layoutMode) {
    oCtx.save();
    oCtx.globalAlpha = 0.15;
    oCtx.strokeStyle = '#94a3b8';
    oCtx.lineWidth = 0.5;
    for (let gx = 0; gx <= GRID.cols; gx++) {
      for (let gy = 0; gy <= GRID.rows; gy++) {
        const p = isoToScreen(gx, gy);
        oCtx.beginPath();
        oCtx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        oCtx.stroke();
      }
    }
    oCtx.restore();
  }

  // Activity speech bubbles for working agents — show what they're doing
  sorted.forEach(a => {
    if (a.status !== 'working' || !a.lastMessage) return;
    const pos = deskPositions[a.name];
    if (!pos) return;
    const p = isoToScreen(pos.gx, pos.gy);
    const msg = String(a.lastMessage || '').slice(0, 40);
    if (!msg || msg.length < 5) return;
    // Stagger which agents show bubbles — rotate every 5s
    const slot = Math.floor(time / 5000) % sorted.filter(x => x.status === 'working').length;
    const myIdx = sorted.filter(x => x.status === 'working').indexOf(a);
    if (myIdx !== slot) return;
    const bobY = Math.sin(time / 800) * 2;
    const bx = p.x, by = p.y - 52 + bobY;
    oCtx.save();
    oCtx.globalAlpha = 0.92;
    oCtx.font = '9px system-ui';
    const tw = oCtx.measureText(msg).width;
    const bw = tw + 16, bh = 18;
    // Clamp bubble to canvas bounds
    const canvasW = oCanvas.width / (window.devicePixelRatio || 1);
    const clampedBx = Math.max(bw/2 + 4, Math.min(canvasW - bw/2 - 4, bx));
    // Bubble background
    oCtx.fillStyle = 'rgba(15,23,42,0.9)';
    roundRect(oCtx, clampedBx - bw/2, by - bh/2, bw, bh, 6);
    oCtx.fill();
    oCtx.strokeStyle = a.color || '#4ade80';
    oCtx.lineWidth = 1;
    roundRect(oCtx, clampedBx - bw/2, by - bh/2, bw, bh, 6);
    oCtx.stroke();
    // Tail triangle
    oCtx.fillStyle = 'rgba(15,23,42,0.9)';
    oCtx.beginPath();
    oCtx.moveTo(bx - 4, by + bh/2);
    oCtx.lineTo(bx + 4, by + bh/2);
    oCtx.lineTo(bx, by + bh/2 + 6);
    oCtx.closePath(); oCtx.fill();
    // Text
    oCtx.fillStyle = '#e2e8f0';
    oCtx.textAlign = 'center'; oCtx.textBaseline = 'middle';
    oCtx.fillText(msg, clampedBx, by);
    oCtx.restore();
  });

  // Draw desk items left behind from POI visits (iterate without allocating Object.entries array)
  for (const agentName in deskItems) {
    const items = deskItems[agentName];
    const pos = deskPositions[agentName];
    if (!pos) continue;
    const p = isoToScreen(pos.gx, pos.gy);
    for (let i = items.length - 1; i >= 0; i--) {
      const di = items[i];
      const age = time - di.placedAt;
      if (age > DESK_ITEM_LIFETIME) { items[i]=items[items.length-1]; items.pop(); continue; }
      const fadeStart = DESK_ITEM_LIFETIME * 0.75;
      const alpha = age > fadeStart ? 1 - (age - fadeStart) / (DESK_ITEM_LIFETIME - fadeStart) : 1;
      const appearScale = Math.min(1, age / 300); // pop-in
      oCtx.save();
      oCtx.globalAlpha = alpha * 0.85;
      const ix = p.x + di.offsetX, iy = p.y + di.offsetY;
      oCtx.translate(ix, iy);
      oCtx.scale(appearScale, appearScale);
      if (di.type === 'mug') {
        oCtx.fillStyle='#e8e8e8'; oCtx.fillRect(-3,-4,6,7);
        oCtx.fillStyle='#6b4226'; oCtx.fillRect(-2,-3,4,5);
        oCtx.strokeStyle='#ccc'; oCtx.lineWidth=0.8;
        oCtx.beginPath(); oCtx.arc(4,-1,2,-Math.PI*0.5,Math.PI*0.5); oCtx.stroke();
        // Tiny steam wisps
        if (age < 20000) {
          const sp = ((time%1800)/1800);
          oCtx.globalAlpha = alpha * 0.25 * (1 - age/20000);
          oCtx.fillStyle='#fff';
          oCtx.beginPath(); oCtx.arc(0+Math.sin(sp*6)*1.5, -6-sp*8, 1, 0, Math.PI*2); oCtx.fill();
        }
      } else if (di.type === 'book') {
        oCtx.fillStyle='#e74c3c'; roundRect(oCtx,-4,-3,8,6,1); oCtx.fill();
        oCtx.fillStyle='#fff'; oCtx.fillRect(-2,-1,4,2);
      } else if (di.type === 'can') {
        oCtx.fillStyle='#6b9bd2'; oCtx.fillRect(-3,-3,7,5);
        oCtx.fillRect(3,-5,3,2); // spout
      } else if (di.type === 'tablet') {
        oCtx.fillStyle='#334155'; roundRect(oCtx,-3,-4,7,8,1); oCtx.fill();
        oCtx.fillStyle='#60a5fa'; oCtx.fillRect(-2,-3,5,5);
      }
      oCtx.restore();
    }
    if (items.length === 0) delete deskItems[agentName];
  }

  // Tick agent interaction system
  tickInteractions(allAgents, time);

  // Emote bubbles for working agents
  tickEmotes(allAgents, time);
  drawEmotes(time);

  // Draw visitor lounge area (bottom-right, near door)
  if (visitors.length > 0) {
    const loungeBase = isoToScreen(12, 9);
    // "Visitor Lounge" label
    oCtx.save();
    oCtx.globalAlpha = 0.6;
    oCtx.font = 'bold 8px system-ui'; oCtx.textAlign = 'center'; oCtx.fillStyle = '#64748b';
    oCtx.fillText('SUB-AGENTS', loungeBase.x - 40, loungeBase.y - 20);
    // Dotted border area
    oCtx.strokeStyle = 'rgba(100,116,139,0.25)'; oCtx.lineWidth = 1; oCtx.setLineDash([4,3]);
    oCtx.strokeRect(loungeBase.x - 90, loungeBase.y - 15, 100, visitors.length * 32 + 10);
    oCtx.setLineDash([]);
    oCtx.restore();
    // Render each visitor
    visitors.forEach((v, i) => {
      const vx = loungeBase.x - 40;
      const vy = loungeBase.y + i * 32;
      drawVisitor(v, vx, vy, time);
    });
  }

  // Collaboration lines — ONLY between agents that are actively interacting (chat, collab-whiteboard)
  {
    const interactingPairs = [];
    for (const [name, inter] of Object.entries(agentInteractions)) {
      if (inter.chatPartner) interactingPairs.push([name, inter.chatPartner]);
      if (inter.collabPartner) interactingPairs.push([name, inter.collabPartner]);
    }
    // Deduplicate pairs
    const seen = new Set();
    const uniquePairs = [];
    for (const [a, b] of interactingPairs) {
      const key = [a, b].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const a1 = sorted.find(x => x.name === a);
      const a2 = sorted.find(x => x.name === b);
      if (a1 && a2) uniquePairs.push([a1, a2]);
    }
    if (uniquePairs.length > 0) {
      oCtx.save();
      uniquePairs.forEach(([a1, a2], idx) => {
          const p1 = isoToScreen(a1._gx, a1._gy);
          const p2 = isoToScreen(a2._gx, a2._gy);
          const dashOff = (time / 80) % 20;
          const lg = oCtx.createLinearGradient(p1.x, p1.y - 10, p2.x, p2.y - 10);
          lg.addColorStop(0, a1.color + '60');
          lg.addColorStop(0.5, 'rgba(59,130,246,0.25)');
          lg.addColorStop(1, a2.color + '60');
          oCtx.strokeStyle = lg;
          oCtx.lineWidth = 1.5;
          oCtx.setLineDash([6, 4]);
          oCtx.lineDashOffset = -dashOff;
          oCtx.beginPath();
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2 - 30 - Math.sin(time / 1500 + idx) * 8;
          oCtx.moveTo(p1.x, p1.y - 10);
          oCtx.quadraticCurveTo(mx, my, p2.x, p2.y - 10);
          oCtx.stroke();
          const t2 = ((time / 2000 + idx * 0.5) % 1);
          const bx = (1-t2)*(1-t2)*p1.x + 2*(1-t2)*t2*mx + t2*t2*p2.x;
          const by = (1-t2)*(1-t2)*(p1.y-10) + 2*(1-t2)*t2*my + t2*t2*(p2.y-10);
          oCtx.setLineDash([]);
          oCtx.beginPath();
          oCtx.arc(bx, by, 2.5, 0, Math.PI * 2);
          oCtx.fillStyle = 'rgba(59,130,246,0.7)';
          oCtx.fill();
          oCtx.beginPath();
          oCtx.arc(bx, by, 5, 0, Math.PI * 2);
          oCtx.fillStyle = 'rgba(59,130,246,0.15)';
          oCtx.fill();
      });
      oCtx.setLineDash([]);
      oCtx.restore();
    }
  }

  // Monitor glow pools for working agents — colored light cast from screen onto floor
  sorted.forEach(a => {
    if (a.status !== 'working') return;
    const dp = isoToScreen(a._gx, a._gy);
    oCtx.save();
    const glow = oCtx.createRadialGradient(dp.x, dp.y - 8, 2, dp.x, dp.y + 8, 40);
    glow.addColorStop(0, a.color + '30');
    glow.addColorStop(0.4, a.color + '12');
    glow.addColorStop(1, 'transparent');
    oCtx.fillStyle = glow;
    oCtx.beginPath();
    oCtx.ellipse(dp.x, dp.y + 8, 38, 18, 0, 0, Math.PI * 2);
    oCtx.fill();
    // Animated scan line on monitor
    const scanY = dp.y - 28 + ((time / 80) % 12);
    oCtx.fillStyle = 'rgba(255,255,255,0.08)';
    oCtx.fillRect(dp.x - 6, scanY, 12, 1);
    // Role-specific monitor content for working agents
    const role = (a.role || '').toLowerCase();
    const seed = a.name.charCodeAt(0);
    const tick = Math.floor(time / 500);
    if (role.includes('writer') || role.includes('research')) {
      // Writer: scrolling text lines with cursor blink
      for (let row = 0; row < 4; row++) {
        const lineW = 2 + ((seed * 3 + row * 7 + tick) % 7);
        const lineY = dp.y - 26 + row * 2;
        oCtx.fillStyle = '#e2e8f0';
        oCtx.fillRect(dp.x - 5, lineY, lineW, 1);
      }
      // Blinking cursor
      if (Math.floor(time / 600) % 2 === 0) {
        const cursorRow = tick % 4;
        const cw = 2 + ((seed * 3 + cursorRow * 7 + tick) % 7);
        oCtx.fillStyle = '#fbbf24';
        oCtx.fillRect(dp.x - 5 + cw, dp.y - 26 + cursorRow * 2, 1, 1);
      }
    } else if (role.includes('code') || role.includes('coding') || role.includes('develop') || role.includes('engineer')) {
      // Coder: colored syntax blocks (brackets, indentation)
      const colors = ['#f472b6', '#60a5fa', '#a78bfa', '#34d399'];
      for (let row = 0; row < 4; row++) {
        const indent = (row === 1 || row === 2) ? 2 : 0;
        const lineY = dp.y - 26 + row * 2;
        // Keyword
        oCtx.fillStyle = colors[(seed + row) % colors.length];
        oCtx.fillRect(dp.x - 5 + indent, lineY, 3, 1);
        // Body
        oCtx.fillStyle = '#cbd5e1';
        const bw = 2 + ((seed * 5 + row * 11 + tick) % 4);
        oCtx.fillRect(dp.x - 1 + indent, lineY, bw, 1);
      }
      // Scrolling effect
      const scrollOff = ((time / 300) % 8) - 4;
      oCtx.fillStyle = 'rgba(255,255,255,0.04)';
      oCtx.fillRect(dp.x - 6, dp.y - 26 + scrollOff, 12, 2);
    } else if (role.includes('qa') || role.includes('quality') || role.includes('test')) {
      // QA: checkboxes being ticked
      for (let row = 0; row < 4; row++) {
        const lineY = dp.y - 26 + row * 2;
        const checked = ((tick + row) % 6) < 4;
        oCtx.fillStyle = checked ? '#22c55e' : '#64748b';
        oCtx.fillRect(dp.x - 5, lineY, 2, 1);
        oCtx.fillStyle = '#94a3b8';
        oCtx.fillRect(dp.x - 2, lineY, 4 + (seed + row) % 3, 1);
      }
    } else if (role.includes('design') || role.includes('art') || role.includes('visual')) {
      // Designer: color palette / shapes
      const palette = ['#f43f5e','#8b5cf6','#06b6d4','#f59e0b'];
      for (let row = 0; row < 4; row++) {
        const lineY = dp.y - 26 + row * 2;
        oCtx.fillStyle = palette[(row + tick) % 4];
        oCtx.fillRect(dp.x - 5 + (row % 2)*2, lineY, 3 + row % 3, 1);
      }
    } else {
      // Default: generic scrolling code dots
      for (let row = 0; row < 4; row++) {
        const lineW = 3 + ((seed * 7 + row * 13 + tick) % 6);
        const lineY = dp.y - 26 + row * 2;
        oCtx.fillStyle = a.color + '80';
        oCtx.fillRect(dp.x - 5, lineY, lineW, 1);
      }
    }
    // Mini task label above monitor for working agents (shows truncated current task)
    if (a.lastMessage && a.lastMessage.length > 5) {
      const taskText = a.lastMessage.replace(/^[A-Z_ ]+:/,'').trim().substring(0, 24) + (a.lastMessage.length > 24 ? '…' : '');
      const fadeIn = Math.min(1, 0.5 + 0.2 * Math.sin(time / 2000));
      oCtx.globalAlpha = fadeIn * 0.65;
      oCtx.font = '6px monospace';
      oCtx.textAlign = 'center';
      // Background pill
      const tw = oCtx.measureText(taskText).width;
      oCtx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(oCtx, dp.x - tw/2 - 3, dp.y - 40, tw + 6, 9, 3);
      oCtx.fill();
      oCtx.fillStyle = a.color;
      oCtx.fillText(taskText, dp.x, dp.y - 33);
      oCtx.globalAlpha = 1;
    }
    oCtx.restore();
  });

  // Ambient floating particles (dust motes / data particles)
  drawParticles(time);

  // Day/night ambient cycle — cached, recalculated every 30s
  {
    if (!_nightCache || time - _nightCache.t > 30000) {
      _clockDate.setTime(_frameTime);const hr = _clockDate.getHours() + _clockDate.getMinutes()/60;
      let nightAmt = 0;
      if (hr >= 21 || hr < 5) nightAmt = 1;
      else if (hr >= 5 && hr < 7) nightAmt = 1 - (hr - 5) / 2;
      else if (hr >= 7 && hr < 18) nightAmt = 0;
      else if (hr >= 18 && hr < 21) nightAmt = (hr - 18) / 3;
      _nightCache = { t: time, n: nightAmt };
    }
    const nightAmt = _nightCache.n;

    if (nightAmt > 0.01) {
      oCtx.save();
      oCtx.globalAlpha = nightAmt * 0.25;
      oCtx.fillStyle = '#0a1840';
      oCtx.fillRect(0, 0, oCanvas.width, oCanvas.height);
      oCtx.restore();
    }

    if (nightAmt < 0.8) {
      const sunAlpha = (1 - nightAmt) * 0.06;
      // Cache sunlight gradient positions — only rebuild when iso origin changes
      if (!_sunGradCache || _sunGradCache.ox !== _isoOriginX || _sunGradCache.oy !== _isoOriginY || _sunGradCache.a !== sunAlpha) {
        _sunGradCache = { ox: _isoOriginX, oy: _isoOriginY, a: sunAlpha, rects: [] };
        for (let c = 2; c < GRID.cols; c += 3) {
          const wp = isoToScreen(c, 0);
          _sunGradCache.rects.push({ x: wp.x, y: wp.y });
        }
      }
      _sunGradCache.rects.forEach(r => {
        const sg = oCtx.createLinearGradient(r.x, r.y, r.x, r.y + 120);
        sg.addColorStop(0, `rgba(255,220,130,${sunAlpha})`);
        sg.addColorStop(1, 'rgba(255,220,130,0)');
        oCtx.fillStyle = sg;
        oCtx.fillRect(r.x - 20, r.y, 40, 120);
      });
    }
  }

  // Status change sparkle particles (batched)
  if (statusSparkles.length > 0) {
    oCtx.save();
    for(let i=statusSparkles.length-1;i>=0;i--){
      const s=statusSparkles[i];
      s.x+=s.vx; s.y+=s.vy; s.vy+=0.05; s.life-=0.025;
      if(s.life<=0){
        // Swap-and-pop: O(1) removal instead of O(n) splice
        statusSparkles[i]=statusSparkles[statusSparkles.length-1];
        statusSparkles.pop();
        continue;
      }
      oCtx.globalAlpha=s.life;
      oCtx.beginPath(); oCtx.arc(s.x,s.y,s.size*s.life,0,Math.PI*2);
      oCtx.fillStyle=s.color; oCtx.fill();
      oCtx.beginPath(); oCtx.arc(s.x,s.y,s.size*s.life*2,0,Math.PI*2);
      oCtx.globalAlpha=s.life*0.2; oCtx.fill();
    }
    oCtx.restore();
  }

  // High-five celebrations
  drawHighFives(time);
  drawGoodbyeWaves(time);

  // End zoom/pan transform
  oCtx.restore();

  // Draw mini-map & zoom controls (in screen space, not transformed)
  // Day/night ambient overlay synced to real time
  {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    // Night: 22:00-06:00 = blue overlay. Dawn/dusk: gradual transition.
    let nightAlpha = 0;
    if (hour >= 22 || hour < 5) nightAlpha = 0.15; // deep night
    else if (hour >= 5 && hour < 7) nightAlpha = 0.15 * (1 - (hour - 5) / 2); // dawn
    else if (hour >= 19 && hour < 22) nightAlpha = 0.15 * ((hour - 19) / 3); // dusk
    if (nightAlpha > 0.005) {
      oCtx.save();
      oCtx.globalAlpha = nightAlpha;
      oCtx.fillStyle = '#0a1628';
      oCtx.fillRect(0, 0, oCanvas.width, oCanvas.height);
      oCtx.restore();
    }
  }
  drawMiniMap(allAgents);
  drawZoomControls();

  // Post-frame health check: if canvas is entirely transparent at center, something went wrong.
  // Check every frame for first 8 frames after reset, then every 8th frame after that.
  // Force a hard reset so next frame recovers immediately instead of showing a dark void.
  if (_canvasHealthCounter <= 8 || _canvasHealthCounter % 8 === 0) {
    try {
      const cx = Math.floor(oCanvas.width / 2), cy = Math.floor(oCanvas.height / 2);
      const px = oCtx.getImageData(cx, cy, 1, 1).data;
      if (px[3] === 0) { // fully transparent = nothing was drawn
        _canvasHealthCounter = 31; // trigger reset on next frame
      }
    } catch(e) {}
  }
}

// ===== OFFSCREEN STATIC LAYER CACHE =====
// Floor, walls, team labels, and non-animated furniture are cached to avoid redrawing every frame.
let _staticCanvas = null, _staticCtx = null, _staticValid = false;
let _nightCache = null; // {t: timestamp, n: nightAmount}
let _sunGradCache = null; // {ox, oy, a, rects}
let _staticThemeKey = '', _staticOriginX = 0, _staticOriginY = 0, _staticW = 0, _staticH = 0;
const STATIC_FURNITURE = new Set(['desk','desk-large','whiteboard','bookshelf','door','filing-cabinet','trash-can','coat-rack','cactus','sticky-notes','frame','coffee']);
const ANIMATED_FURNITURE = new Set(['plant','server','lamp','clock','coffee-mug']);

function invalidateStaticCache() { try { _staticValid = false; } catch(e) {} }

function buildStaticLayer() {
  const th = _th || getCanvasTheme();
  const dpr = window.devicePixelRatio || 1;
  const w = oCanvas.width, h = oCanvas.height;
  // Check if we can reuse
  const themeKey = document.documentElement.getAttribute('data-theme') || 'dark';
  if (_staticValid && _staticCanvas && _staticW === w && _staticH === h &&
      _staticThemeKey === themeKey && _staticOriginX === _isoOriginX && _staticOriginY === _isoOriginY) return;

  if (!_staticCanvas) _staticCanvas = document.createElement('canvas');
  _staticCanvas.width = w; _staticCanvas.height = h;
  _staticCtx = _staticCanvas.getContext('2d', { willReadFrequently: true });
  _staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Temporarily swap oCtx so draw functions render to the offscreen canvas.
  // CRITICAL: use try/finally to guarantee oCtx is always restored — if any draw
  // function throws, oCtx would stay pointing at the offscreen buffer, causing
  // all subsequent frames to render invisibly (the "dark void" bug).
  const origCtx = oCtx;
  oCtx = _staticCtx;
  try {

  // Floor
  // Floor with zone-based tinting for visual depth
  const zoneFloor = (c, r) => {
    // Content zone (top-left): warm purple
    if (c < 8 && r < 6) return (r+c) % 2 === 0 ? '#2a2235' : '#2e2639';
    // Engineering zone (top-right): dark blue-gray
    if (c >= 8 && r < 6) return (r+c) % 2 === 0 ? '#1a2744' : '#1e2d4e';
    // Leadership zone (bottom-left): amber
    if (c < 8 && r >= 6) return (r+c) % 2 === 0 ? '#2a2420' : '#2e2824';
    // Support zone (bottom-right): teal
    if (c >= 8 && r >= 6) return (r+c) % 2 === 0 ? '#1a2a2a' : '#1e2e2e';
    return (r+c) % 2 === 0 ? th.floor1 : th.floor2;
  };
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++)
    drawIsoTile(c, r, zoneFloor(c, r), th.floorStroke);
  // Zone divider lines (subtle)
  oCtx.save(); oCtx.globalAlpha = 0.2; oCtx.strokeStyle = '#ffffff'; oCtx.lineWidth = 1.5;
  // Vertical divider at col 8
  oCtx.beginPath();
  for (let r = 0; r <= GRID.rows; r++) {
    const p = isoToScreen(8, r);
    if (r === 0) oCtx.moveTo(p.x, p.y); else oCtx.lineTo(p.x, p.y);
  }
  oCtx.stroke();
  // Horizontal divider at row 6
  oCtx.beginPath();
  for (let c = 0; c <= GRID.cols; c++) {
    const p = isoToScreen(c, 6);
    if (c === 0) oCtx.moveTo(p.x, p.y); else oCtx.lineTo(p.x, p.y);
  }
  oCtx.stroke();
  oCtx.restore();

  // Walls
  for (let c = 0; c < GRID.cols; c++) drawIsoCube(c, 0, 16, th.wall1, th.wall2, th.wall3);
  for (let r = 0; r < GRID.rows; r++) drawIsoCube(0, r, 16, th.wall1, th.wall2, th.wall3);

  // Team labels (zone headers — big, bold, clearly above their section)
  oCtx.save();
  const isMobileCanvas = (oCanvas.style.width ? parseInt(oCanvas.style.width) : oCanvas.width) < 500;
  oCtx.globalAlpha = isMobileCanvas ? 0.25 : 0.35;
  oCtx.font = isMobileCanvas ? 'bold 10px system-ui' : 'bold 12px system-ui'; oCtx.textAlign = 'center';
  const ctP = isoToScreen(4, 1); oCtx.fillStyle = '#FF6B6B'; oCtx.fillText('✏️ CONTENT', ctP.x, ctP.y + 8);
  const enP = isoToScreen(12, 1); oCtx.fillStyle = '#00D4FF'; oCtx.fillText('⚡ ENGINEERING', enP.x, enP.y + 8);
  const ldP = isoToScreen(4, 7); oCtx.fillStyle = '#FFD700'; oCtx.fillText('👑 LEADERSHIP', ldP.x, ldP.y - 6);
  const supP = isoToScreen(12, 7); oCtx.fillStyle = '#FF69B4'; oCtx.fillText('🛟 SUPPORT', supP.x, supP.y - 6);
  oCtx.restore();

  // Static furniture
  _sortedFurniture.forEach(f => {
    if (!STATIC_FURNITURE.has(f.type)) return;
    if (f.type === 'desk') drawDesk(f.gx, f.gy);
    else if (f.type === 'desk-large') drawLargeDesk(f.gx, f.gy);
    else if (f.type === 'whiteboard') drawWhiteboard(f.gx, f.gy);
    else if (f.type === 'bookshelf') drawBookshelf(f.gx, f.gy);
    else if (f.type === 'door') drawDoor(f.gx, f.gy);
    else if (f.type === 'filing-cabinet') drawFilingCabinet(f.gx, f.gy);
    else if (f.type === 'trash-can') drawTrashCan(f.gx, f.gy);
    else if (f.type === 'coat-rack') drawCoatRack(f.gx, f.gy);
    else if (f.type === 'cactus') drawCactus(f.gx, f.gy);
    else if (f.type === 'sticky-notes') drawStickyNotes(f.gx, f.gy);
    else if (f.type === 'frame') drawPictureFrame(f.gx, f.gy, f.hue || 0);
    else if (f.type === 'coffee') drawCoffee(f.gx, f.gy);
  });

  } finally {
  // ALWAYS restore original context — even if drawing threw an error
  oCtx = origCtx;
  }
  _staticW = w; _staticH = h; _staticThemeKey = themeKey;
  _staticOriginX = _isoOriginX; _staticOriginY = _isoOriginY;
  _staticValid = true;
}

// Frame-limited render loop (15 FPS target — smooth enough for game-feel, light on CPU)
const FRAME_INTERVAL = 1000 / 15;
let _lastFrameTime = 0;
let _framesSinceCheck = 0, _blackFrames = 0, _wasHidden = false;
let _canvasVisible = true;
// Observe canvas visibility to avoid rendering when scrolled out of view
if (typeof IntersectionObserver !== 'undefined') {
  const _cvObs = new IntersectionObserver(entries => { _canvasVisible = entries[0]?.isIntersecting ?? true; }, { threshold: 0.01 });
  const _cvEl = document.getElementById('office-canvas');
  if (_cvEl) _cvObs.observe(_cvEl);
}
function officeLoop(now) {
  requestAnimationFrame(officeLoop);
  // Skip rendering when in card grid view
  if (_officeView === 'grid') return;
  if (document.hidden) { _wasHidden = true; return; }
  if (_currentTab !== 'office') return;
  if (!_canvasVisible) return;
  if (now - _lastFrameTime < FRAME_INTERVAL) return;
  _lastFrameTime = now;
  // Guard: if canvas has zero dimensions, re-trigger resize instead of drawing nothing
  if (!oCanvas.width || !oCanvas.height || oCanvas.width < 10) { resizeCanvas(); return; }
  // If tab was recently hidden, force a context health check BEFORE drawing
  if (_wasHidden) {
    _wasHidden = false;
    _framesSinceCheck = 999; // force immediate check after draw
    // Proactive context recovery — try a test write before wasting a frame
    try {
      oCtx.save();
      oCtx.setTransform(1, 0, 0, 1, 0, 0);
      oCtx.fillStyle = 'rgba(1,2,3,1)';
      oCtx.fillRect(0, 0, 1, 1);
      const probe = oCtx.getImageData(0, 0, 1, 1).data;
      oCtx.clearRect(0, 0, 1, 1);
      oCtx.restore();
      if (probe[0] !== 1 || probe[1] !== 2 || probe[2] !== 3) {
        console.warn('[canvas] Context lost after tab hide — resetting');
        const w = oCanvas.width, h = oCanvas.height;
        oCanvas.width = 1; oCanvas.width = w; oCanvas.height = h;
        oCtx = oCanvas.getContext('2d', { willReadFrequently: true });
        invalidateStaticCache();
        resizeCanvas();
        return; // skip this frame, draw fresh next time
      }
    } catch(e) {}
    invalidateStaticCache(); // theme/night may have changed while hidden
  }
  drawOffice(now);
  // Canvas health check: write-then-read a test pixel to detect silent context corruption.
  // A corrupted context silently drops all draw operations, causing the "dark void" bug.
  if (++_framesSinceCheck >= 8) { // check every ~1s at 8fps
    _framesSinceCheck = 0;
    try {
      // Write a known pixel at (0,0) then read it back
      oCtx.save();
      oCtx.setTransform(1, 0, 0, 1, 0, 0); // reset to identity — bypass any corrupted transform
      oCtx.fillStyle = 'rgba(1,2,3,1)';
      oCtx.fillRect(0, 0, 1, 1);
      const probe = oCtx.getImageData(0, 0, 1, 1).data;
      oCtx.clearRect(0, 0, 1, 1); // clean up test pixel
      oCtx.restore();
      if (probe[0] !== 1 || probe[1] !== 2 || probe[2] !== 3) {
        // Context is corrupted — draw ops are being silently dropped
        _blackFrames++;
        if (_blackFrames >= 2) { // 2 consecutive failures = definitely broken
          console.warn('[canvas] Context corrupted — resetting canvas');
          const w = oCanvas.width, h = oCanvas.height;
          oCanvas.width = 1; oCanvas.width = w; oCanvas.height = h; // force hard reset
          oCtx = oCanvas.getContext('2d', { willReadFrequently: true });
          invalidateStaticCache();
          resizeCanvas();
          _blackFrames = 0;
        }
      } else { _blackFrames = 0; }
    } catch(e) { /* getImageData may fail cross-origin */ }
  }
}
// officeLoop kicked off after resizeCanvas at end of file

// Dynamic team grouping based on agent role — no hardcoded names
function getTeamGroups() {
  const groups = {};
  const teamMap = {
    ceo: '🏢 Leadership', director: '🏢 Leadership',
    writer: '🎨 Content Team', designer: '🎨 Content Team', producer: '🎨 Content Team', publisher: '🎨 Content Team',
    dev: '💻 Engineering',
    mail: '📬 Support', qa: '📬 Support',
  };
  for (const a of agentData) {
    const r = (a.role || '').toLowerCase();
    let cat = 'default';
    if (r.includes('ceo') || r.includes('mc') || r.includes('owner')) cat = 'ceo';
    else if (r.includes('director') || r.includes('lead')) cat = 'director';
    else if (r.includes('write') || r.includes('content') || r.includes('research')) cat = 'writer';
    else if (r.includes('design') || r.includes('art')) cat = 'designer';
    else if (r.includes('produce') || r.includes('video') || r.includes('media')) cat = 'producer';
    else if (r.includes('publish') || r.includes('deploy') || r.includes('social')) cat = 'publisher';
    else if (r.includes('code') || r.includes('dev') || r.includes('engineer')) cat = 'dev';
    else if (r.includes('mail') || r.includes('email')) cat = 'mail';
    else if (r.includes('qa') || r.includes('test') || r.includes('quality')) cat = 'qa';
    const team = teamMap[cat] || '🔮 Other Agents';
    if (!groups[team]) groups[team] = [];
    groups[team].push(a);
  }
  return groups;
}

let _renderCardsTimer = null;
function scheduleRenderAgentCards() { if (_renderCardsTimer) return; _renderCardsTimer = setTimeout(() => { _renderCardsTimer = null; renderAgentCards(); }, 200); }
function renderAgentCards() {
  const container = document.getElementById('agent-status-cards');
  if (!container || !agentData.length) return;

  // Group agents by team — fully dynamic from role, no hardcoded names
  const grouped = getTeamGroups();

  // Collapsed state persisted in localStorage
  const collapsed = JSON.parse(localStorage.getItem('hq-collapsed-teams') || '{}');

  let html = '';
  for (const [team, agents] of Object.entries(grouped)) {
    const working = agents.filter(a => a.status === 'working').length;
    const total = agents.length;
    const isCollapsed = collapsed[team] === true;
    const teamId = team.replace(/[^a-zA-Z]/g,'');
    html += `<div class="team-group" style="grid-column:1/-1;margin:4px 0 0">
      <div class="team-group-header" onclick="toggleTeamGroup('${teamId}','${team.replace(/'/g,'\\\'')}')" style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;border-radius:6px;transition:background .15s;font-size:11px;color:var(--dim);user-select:none" onmouseenter="this.style.background='rgba(255,255,255,0.03)'" onmouseleave="this.style.background=''">
        <span style="font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(${isCollapsed?'-90':'0'}deg)" id="team-arrow-${teamId}">▼</span>
        <span style="font-weight:700;font-size:12px;color:var(--text)">${team}</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:${working>0?'var(--green-dim)':'rgba(100,100,100,0.1)'};color:${working>0?'var(--green)':'var(--dim)'};font-weight:600">${working}/${total} active</span>
      </div>
      <div id="team-body-${teamId}" style="display:${isCollapsed?'none':'grid'};grid-template-columns:repeat(2,1fr);gap:8px;margin-top:4px">`;
    html += agents.map(a => {
    const moodEmoji = a.mood === 'happy' ? '😊' : a.mood === 'stressed' ? '😰' : a.mood === 'tired' ? '😴' : '';
    const icon = a.status === 'working' ? '🟢' : a.status === 'idle' ? '🟡' : '💤';
    const age = !a.ageMin ? '' : a.ageMin < 1 ? 'just now' : a.ageMin < 60 ? a.ageMin + 'm ago' : Math.round(a.ageMin / 60) + 'h ago';
    // Elapsed status timer data
    const sinceTs = a.lastActivity || (Date.now() - (a.ageMin||0)*60000);
    const statusVerb = a.status === 'working' ? 'Working' : a.status === 'idle' ? 'Idle' : 'Sleeping';
    const statusTimerColor = a.status === 'working' ? 'var(--green)' : a.status === 'idle' ? 'var(--orange)' : 'var(--dim)';
    const hasMsg = a.lastMessage && a.lastMessage !== 'ANNOUNCE_SKIP' && a.lastMessage !== 'NO_REPLY' && a.lastMessage.length >= 5;
    const msg = hasMsg
      ? a.lastMessage.slice(0, 120) + (a.lastMessage.length > 120 ? '…' : '')
      : (a.status === 'working' ? '<span style="color:var(--green);font-style:italic">Active — processing...</span>' : '<span style="color:var(--dim);font-style:italic">No recent activity</span>');
    const borderL = a.status === 'working' ? a.color : a.status === 'idle' ? 'var(--orange)' : 'transparent';
    const cronInfo = a.cronStatus ? `<span style="font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(255,255,255,0.05);color:var(--dim);margin-left:4px">${a.cronStatus}</span>` : '';
    const durInfo = a.durationMs ? `<span style="font-size:9px;color:var(--dim);margin-left:4px" title="Last run duration">⏱${(a.durationMs/1000).toFixed(0)}s</span>` : '';
    // Live countdown for cron agents
    const nextRunHtml = a.nextRunAtMs ? (() => {
      const d = a.nextRunAtMs - Date.now();
      if (d <= 0) return '<div style="font-size:9px;color:var(--green);margin-top:3px;font-weight:600">⚡ Running now or imminent</div>';
      const sec = Math.ceil(d / 1000);
      const mm = Math.floor(sec / 60);
      const ss = sec % 60;
      return `<div style="font-size:9px;color:var(--dim);margin-top:3px;display:flex;align-items:center;gap:4px"><span>Next run:</span><span class="next-run-countdown" data-next="${a.nextRunAtMs}" style="font-family:'SF Mono',Menlo,monospace;font-weight:600;color:var(--accent)">${mm}:${String(ss).padStart(2,'0')}</span></div>`;
    })() : '';
    // Activity bar for working agents
    const activityBar = a.status === 'working' ? `<div style="margin-top:4px;height:2px;border-radius:1px;background:var(--border);overflow:hidden"><div style="height:100%;width:60%;background:${a.color};border-radius:1px;animation:activityPulse 1.5s ease-in-out infinite"></div></div>` : '';
    // Activity sparkline + uptime badge from timeline heatmap data
    let sparkHtml = '';
    let uptimeBadge = '';
    if (timelineData && timelineData.agents) {
      const ta = timelineData.agents.find(t => t.name === a.name);
      if (ta) {
        const activeSlots = ta.slots.filter(s => s > 0).length;
        const totalSlots = ta.slots.length;
        const uptimePct = Math.round((activeSlots / totalSlots) * 100);
        const uptimeColor = uptimePct >= 50 ? 'var(--green)' : uptimePct >= 20 ? 'var(--orange)' : 'var(--dim)';
        const uptimeBg = uptimePct >= 50 ? 'var(--green-dim)' : uptimePct >= 20 ? 'var(--orange-dim)' : 'rgba(100,100,100,0.1)';
        uptimeBadge = `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:${uptimeBg};color:${uptimeColor};font-weight:700;margin-left:4px;font-variant-numeric:tabular-nums" title="Active ${activeSlots}/${totalSlots} slots (last 6h)">${uptimePct}% ⬆</span>`;
        if (ta.slots.some(s => s > 0)) {
          sparkHtml = `<div style="margin-top:5px;display:flex;gap:1px;align-items:end;height:12px" title="Activity last 6h (15-min buckets)">${ta.slots.map(s => `<div style="flex:1;height:${s > 0 ? '100%' : '2px'};background:${s > 0 ? a.color : 'var(--border)'};border-radius:1px;opacity:${s > 0 ? '0.7' : '0.3'};transition:height .3s"></div>`).join('')}</div>`;
        }
      }
    }
    return `<div class="agent-card-item" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" style="background:var(--card);border:1px solid var(--border);border-left:3px solid ${borderL};border-radius:10px;padding:12px 14px;font-size:11px;transition:border-color .2s,background .2s,transform .15s;cursor:pointer" onclick="openAgentDetail('${a.name.replace(/'/g,String.fromCharCode(92)+String.fromCharCode(39))}')" onmouseenter="this.style.borderColor='${a.color}';this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseleave="this.style.borderColor='var(--border)';this.style.borderLeftColor='${borderL}';this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="position:relative;flex-shrink:0">
          <img src="https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(a.name)}&backgroundColor=transparent" alt="${a.name}" style="width:40px;height:40px;border-radius:50%;border:2px solid ${a.status === 'working' ? a.color : a.status === 'idle' ? 'var(--orange)' : 'var(--border)'};background:rgba(255,255,255,0.05)" loading="lazy" onerror="this.style.display='none'">
          <span style="position:absolute;bottom:-1px;right:-1px;font-size:11px;line-height:1">${icon}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:13px;color:${a.color}">${a.name}</span>${moodEmoji ? `<span style="font-size:11px" title="Mood: ${a.mood}">${moodEmoji}</span>` : ''}${uptimeBadge}${cronInfo}${durInfo}
            ${a.cronJobId && a.status !== 'working' ? `<button onclick="event.stopPropagation();wakeAgentCard(this,'${a.cronJobId}','${a.name.replace(/'/g,String.fromCharCode(92)+String.fromCharCode(39))}')" style="background:var(--green-dim,rgba(34,197,94,0.15));border:1px solid var(--green,#22c55e);color:var(--green,#22c55e);padding:1px 8px;border-radius:6px;cursor:pointer;font-size:9px;font-weight:700;font-family:inherit;margin-left:4px;transition:all .15s;white-space:nowrap" onmouseenter="this.style.background='var(--green,#22c55e)';this.style.color='#fff'" onmouseleave="this.style.background='var(--green-dim,rgba(34,197,94,0.15))';this.style.color='var(--green,#22c55e)'" title="Wake agent now">⚡</button>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
            <span class="status-timer" data-since="${sinceTs}" data-verb="${statusVerb}" style="color:${statusTimerColor};font-size:10px;font-family:'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums">${statusVerb} ${age}</span>
          </div>
        </div>
      </div>
      <div style="color:var(--text);line-height:1.4;font-size:11px;padding-left:50px">${msg}</div>${nextRunHtml ? `<div style="padding-left:50px">${nextRunHtml}</div>` : ''}${sparkHtml ? `<div style="padding-left:50px">${sparkHtml}</div>` : ''}${activityBar}
    </div>`;
  }).join('');
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

function toggleTeamGroup(teamId, teamName) {
  const body = document.getElementById('team-body-' + teamId);
  const arrow = document.getElementById('team-arrow-' + teamId);
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'grid' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
  const collapsed = JSON.parse(localStorage.getItem('hq-collapsed-teams') || '{}');
  collapsed[teamName] = !isHidden;
  localStorage.setItem('hq-collapsed-teams', JSON.stringify(collapsed));
}

// Live elapsed status timers + cron countdown (combined 1s interval)
setInterval(() => {
  if (document.hidden) return; // skip when tab not visible
  document.querySelectorAll('.status-timer').forEach(el => {
    const since = parseInt(el.dataset.since);
    const verb = el.dataset.verb || '';
    if (!since) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - since) / 1000));
    let label;
    if (elapsed < 60) label = elapsed + 's';
    else if (elapsed < 3600) label = Math.floor(elapsed/60) + 'm ' + (elapsed%60) + 's';
    else if (elapsed < 86400) label = Math.floor(elapsed/3600) + 'h ' + Math.floor((elapsed%3600)/60) + 'm';
    else label = Math.floor(elapsed/86400) + 'd ' + Math.floor((elapsed%86400)/3600) + 'h';
    el.textContent = verb + ' ' + label;
  });
  document.querySelectorAll('.next-run-countdown').forEach(el => {
    const next = parseInt(el.dataset.next);
    if (!next) return;
    const d = next - Date.now();
    if (d <= 0) { el.textContent = 'now!'; el.style.color = 'var(--green)'; return; }
    const sec = Math.ceil(d / 1000);
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    el.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
  });
}, 1000);


// Responsive canvas with HiDPI support — fills available viewport
function resizeCanvas() {
  if (!oCanvas || !oCtx) return; // guard: canvas not ready
  const container = oCanvas.parentElement;
  if (!container) return;
  const w = container.clientWidth;
  if (w < 10) return; // guard: DOM not laid out yet — retry on next resize/load event
  // Calculate available height: viewport minus header/nav/status (~110px)
  const headerH = document.querySelector('header')?.offsetHeight || 40;
  const navH = document.querySelector('nav')?.offsetHeight || 36;
  const stripH = document.querySelector('.status-strip')?.offsetHeight || 30;
  const usedH = headerH + navH + stripH + 24; // 24px padding
  const availH = Math.max(300, window.innerHeight - usedH);
  const isMobile = window.innerWidth <= 480;
  // On phones, avoid a giant empty blue slab: cap office height and bias toward a shorter, denser viewport.
  const mobilePreferredH = Math.min(Math.max(260, window.innerHeight * 0.42), 400);
  const canvasW = w;
  // Cap desktop at ~70% viewport so the office fills the view as primary content
  const desktopPreferredH = Math.min(availH, Math.max(450, window.innerHeight * 0.70));
  const canvasH = isMobile ? Math.min(availH, mobilePreferredH) : desktopPreferredH;
  const dpr = window.devicePixelRatio || 1;
  // Internal resolution scaled to width
  const internalW = Math.max(canvasW, 1000);
  const internalH = (canvasH / canvasW) * internalW;
  oCanvas.width = internalW * dpr;
  oCanvas.height = internalH * dpr;
  oCanvas.style.width = canvasW + 'px';
  oCanvas.style.height = canvasH + 'px';
  oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Crisp pixel art rendering — no smoothing
  oCtx.imageSmoothingEnabled = false;
  // Recalculate iso origin to center grid in canvas
  _isoOriginX = internalW / 2 + (GRID.rows * ISO.tileW / 4) - (GRID.cols * ISO.tileW / 4);
  // Vertically center the grid in available space
  const gridTotalH = (GRID.cols + GRID.rows) * ISO.tileH / 2 + 80;
  _isoOriginY = Math.max(10, (internalH - gridTotalH) / 2);
  camPivotX = _isoOriginX + (_gridCenterGx - _gridCenterGy) * ISO.tileW / 2;
  camPivotY = _isoOriginY + (_gridCenterGx + _gridCenterGy) * ISO.tileH / 2;
  // Auto-fit zoom: scale iso grid to fill canvas with minimal margins
  const gridPixelW = (GRID.cols + GRID.rows) * ISO.tileW / 2 + 120; // +120 for agent sprites overflowing edges
  const gridPixelH = (GRID.cols + GRID.rows) * ISO.tileH / 2 + 100; // +100 for agent sprites + name labels
  const fitZoomW = internalW / gridPixelW;
  const fitZoomH = internalH / gridPixelH;
  const fitZoomBase = Math.min(fitZoomW, fitZoomH);
  const fitZoom = isMobile ? fitZoomBase * 1.65 : fitZoomBase * 1.45; // fill viewport (mobile gets tighter framing)
  if (!_dragging && camPanX === 0 && camPanY <= 0) {
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
  }
}
window.addEventListener('resize', () => { invalidateStaticCache(); resizeCanvas(); });
// Defer initial resize to ensure DOM is fully laid out (fixes blank canvas on first load)
if (document.readyState === 'complete') { resizeCanvas(); } else { window.addEventListener('load', () => { invalidateStaticCache(); resizeCanvas(); }); }
// Fallback: retry resize after a short delay in case DOM wasn't ready
setTimeout(() => { invalidateStaticCache(); resizeCanvas(); }, 100);
setTimeout(() => { invalidateStaticCache(); resizeCanvas(); }, 500);

requestAnimationFrame(officeLoop);
