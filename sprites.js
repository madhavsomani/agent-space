/**
 * sprites.js — Pixel Art Sprite System for Agent Space
 * 
 * Generates 16×16 and 32×32 pixel art sprites as offscreen canvases.
 * Uses a PICO-8 inspired 32-color palette for consistency.
 * All sprites are pre-rendered at load time for fast drawImage() calls.
 */
window.SpriteSystem = (function() {
  'use strict';

  // ── PICO-8 Extended Palette (32 colors) ──
  const PAL = {
    black:     '#000000', darkBlue:  '#1d2b53', darkPurple:'#7e2553', darkGreen: '#008751',
    brown:     '#ab5236', darkGray:  '#5f574f', lightGray: '#c2c3c7', white:     '#fff1e8',
    red:       '#ff004d', orange:    '#ffa300', yellow:    '#ffec27', green:     '#00e436',
    blue:      '#29adff', indigo:    '#83769c', pink:      '#ff77a8', peach:     '#ffccaa',
    // Extended (secret PICO-8 colors)
    darkBrown: '#291814', darkerBlue:'#111d35', darkerPurp:'#422136', oliveGreen:'#125359',
    darkTan:   '#742f29', medGray:   '#49333b', lavender:  '#a28879', lightPeach:'#f3ef7d',
    darkRed:   '#be1250', darkOrange:'#ff6c24', limeGreen: '#a8e72e', teal:      '#00b543',
    skyBlue:   '#065ab5', mauve:     '#754665', salmon:    '#ff6e59', tan:       '#ff9d81',
    // Skin tones
    skin1:     '#ffccaa', skin2:     '#e8a070', skin3:     '#c68040', skin4:     '#8b5e3c',
  };

  const SPRITE_SIZE = 16; // Base sprite size
  const SCALE = 2;        // Render at 2x for crispness (32×32 actual)

  // Cache for generated sprite canvases
  const cache = {};

  // Create an offscreen canvas from a pixel data array
  function createSprite(width, height, pixelData) {
    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = pixelData[y * width + x];
        if (color && color !== '.') {
          ctx.fillStyle = color;
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
    }
    return canvas;
  }

  // Parse a visual pixel map string into a color array
  // Each char maps to a palette color via a legend
  function parsePixelMap(map, legend) {
    const rows = map.trim().split('\n').map(r => r.trim());
    const height = rows.length;
    const width = Math.max(...rows.map(r => r.length));
    const pixels = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = rows[y]?.[x] || '.';
        pixels.push(legend[ch] || null);
      }
    }
    return { width, height, pixels };
  }

  // ── AGENT SPRITES ──
  // Legend for agent sprites
  const AGENT_LEGEND = {
    '.': null,           // transparent
    'H': PAL.skin1,      // skin (head/hands)
    'h': PAL.skin2,      // skin shadow
    'B': PAL.darkBlue,   // hair/dark
    'b': PAL.darkerBlue, // hair shadow
    'E': PAL.white,      // eye white
    'e': PAL.black,      // eye pupil
    'M': PAL.darkRed,    // mouth
    'S': null,            // shirt (replaced per-agent)
    's': null,            // shirt shadow (replaced per-agent)
    'P': PAL.darkBlue,   // pants
    'p': PAL.darkerBlue, // pants shadow
    'F': PAL.brown,      // feet/shoes
    'f': PAL.darkBrown,  // shoe shadow
    'C': PAL.lightGray,  // chair
    'c': PAL.darkGray,   // chair shadow
    'D': PAL.brown,      // desk
    'd': PAL.darkBrown,  // desk shadow
    'W': PAL.white,      // monitor/screen white
    'w': PAL.lightGray,  // monitor frame
    'G': PAL.green,      // screen glow
    'g': PAL.darkGreen,  // screen glow dim
  };

  // ── SITTING IDLE (breathing animation - 2 frames) ──
  const SITTING_IDLE_1 = `
....BBBB....
...BbBBBb...
...HHHHHH...
...HeEeEH...
...HHHHHH...
....HMHH....
....SSSS....
...SsSsSs...
...SsSsSs...
..HsSsSsH..
....PPPP....
....PpPp....
....FFFF....
...CccccC...
..cccccccc..
................`;

  const SITTING_IDLE_2 = `
....BBBB....
...BbBBBb...
...HHHHHH...
...HeEeEH...
...HHHHHH...
....HMHH....
....SSSS....
...SsSsSs...
...SsSsSs...
..HsSsSsH..
....PPPP....
....PpPp....
....FFFF....
...CccccC...
..cccccccc..
................`;

  // ── SITTING TYPING (working - 4 frames) ──
  const SITTING_TYPING_1 = `
....BBBB....
...BbBBBb...
...HHHHHH...
...HeEeEH...
...HHHHHH...
....HMHH....
....SSSS....
...SsSsSs...
...SsSsSs...
.H.SsSsS.H.
....PPPP....
....PpPp....
....FFFF....
...CccccC...
..cccccccc..
................`;

  const SITTING_TYPING_2 = `
....BBBB....
...BbBBBb...
...HHHHHH...
...HeEeEH...
...HHHHHH...
....HMHH....
....SSSS....
...SsSsSs...
...SsSsSs...
..HSsSsSH..
....PPPP....
....PpPp....
....FFFF....
...CccccC...
..cccccccc..
................`;

  const SITTING_TYPING_3 = `
....BBBB....
...BbBBBb...
...HHHHHH...
...HeEeEH...
...HHHHHH...
....HMHH....
....SSSS....
...SsSsSs...
...SsSsSs...
H..SsSsS..H
....PPPP....
....PpPp....
....FFFF....
...CccccC...
..cccccccc..
................`;

  // ── SLEEPING AT DESK ──
  const SLEEPING = `
................
................
..BBBB..........
..BbBBb.........
..HHHhH.........
...--H..........
....SSSS........
...SsSsSs.......
..HHSSSSSHH.....
................
....PPPP........
....PpPp........
....FFFF........
...CccccC.......
..cccccccc......
................`;

  // ── WALKING (4-direction, 2 frames each) ──
  const WALK_DOWN_1 = `
....BBBB....
...BbBBBb...
...HHHHHH...
...HeEeEH...
...HHHHHH...
....HMHH....
....SSSS....
...SsSsSs...
...SsSsSs...
..HsSsSsH..
....PPPP....
...Pp..Pp...
...F....F...
...f....f...
................
................`;

  const WALK_DOWN_2 = `
....BBBB....
...BbBBBb...
...HHHHHH...
...HeEeEH...
...HHHHHH...
....HMHH....
....SSSS....
...SsSsSs...
...SsSsSs...
..HsSsSsH..
....PPPP....
....PpPp....
....F..F....
....f..f....
................
................`;

  // ── FURNITURE SPRITES ──
  const DESK_LEGEND = {
    '.': null,
    'D': '#6b4a2e', 'd': '#4a3420', 'T': '#8b6a4a', // desk wood
    'M': '#222838', 'm': '#1a1e2e', // monitor frame
    'S': '#3b82f6', 's': '#2563eb', // screen
    'K': '#444', 'k': '#333',       // keyboard
    'L': '#666',                      // monitor leg
  };

  const DESK_SPRITE = `
..MMMMMMMMMM..
..MsssssssssM..
..MsssSSsssM..
..MsssssssssM..
..MMMMMMMMMM..
......LL......
.....KKKK.....
..............
DDDDDDDDDDDDDD
DTTTTTTTTTTTTdD
DDDDDDDDDDDDDD
DTTTTTTTTTTTTdD
DDDDDDDDDDDDDdD
dddddddddddddd
D............dD
DddddddddddddD`;

  const PLANT_LEGEND = {
    '.': null,
    'G': '#00e436', 'g': '#008751', 'L': '#00b543', // leaves
    'T': '#ab5236', 't': '#742f29', // trunk/stem
    'P': '#c2c3c7', 'p': '#5f574f', // pot
  };

  const PLANT_SPRITE = `
......GG......
....GgGGgG....
...GgLGGLgG...
..GgLGggGLgG..
...GgLGGLgG...
....GgGGgG....
......TT......
......TT......
......Tt......
....PPPPPP....
...PppppppP...
...PppppppP...
...PppppppP...
....pppppp....
................
................`;

  const SERVER_LEGEND = {
    '.': null,
    'R': '#334155', 'r': '#1e293b', // rack body
    'F': '#475569', 'f': '#334155', // face plate
    'V': '#0f172a',                  // vent
    'G': '#22c55e', 'g': '#15803d', // green LED
    'O': '#f97316', 'o': '#ea580c', // orange LED
    'B': '#3b82f6', 'b': '#2563eb', // blue LED
  };

  const SERVER_SPRITE = `
RRRRRRRRRRRRRRRR
RFFFFFFFFFFFFFFr
RF.G.V.V.V.V.Fr
RF............Fr
RFFFFFFFFFFFFFFr
RF.O.V.V.V.V.Fr
RF............Fr
RFFFFFFFFFFFFFFr
RF.B.V.V.V.V.Fr
RF............Fr
RFFFFFFFFFFFFFFr
RF.G.V.V.V.V.Fr
RF............Fr
RFFFFFFFFFFFFFFr
Rrrrrrrrrrrrrrr
RRRRRRRRRRRRRRRR`;

  // ── WHITEBOARD ──
  const WB_LEGEND = {
    '.': null,
    'W': '#f8fafc', 'w': '#e2e8f0', // board
    'F': '#94a3b8', 'f': '#64748b', // frame
    'L': '#475569',                   // legs
    'R': '#ef4444', 'B': '#3b82f6', 'G': '#22c55e', 'Y': '#eab308', // marker scribbles
  };

  const WHITEBOARD_SPRITE = `
FFFFFFFFFFFFFFFF
FWWWWWWWWWWWWWwF
FW.RRR..BB...WwF
FW.R....B.B..WwF
FW.RRR..BB...WwF
FW...........WwF
FW..GGG.YYY..WwF
FW..G...Y....WwF
FW..GGG.YYY..WwF
FW...........WwF
FWWWWWWWWWWWWWwF
FwwwwwwwwwwwwwwF
FFFFFFFFFFFFFFFF
....LL..LL......
....LL..LL......
................`;

  // Generate all sprite frames for a given shirt color
  function generateAgentSprites(shirtColor, shirtShadow) {
    const legend = { ...AGENT_LEGEND, 'S': shirtColor, 's': shirtShadow };
    // Fix sleeping legend for dashes (closed eyes)
    const sleepLegend = { ...legend, '-': PAL.darkGray };

    const idle1 = parsePixelMap(SITTING_IDLE_1, legend);
    const idle2 = parsePixelMap(SITTING_IDLE_2, legend);
    const typing1 = parsePixelMap(SITTING_TYPING_1, legend);
    const typing2 = parsePixelMap(SITTING_TYPING_2, legend);
    const typing3 = parsePixelMap(SITTING_TYPING_3, legend);
    const sleeping = parsePixelMap(SLEEPING, sleepLegend);
    const walkDown1 = parsePixelMap(WALK_DOWN_1, legend);
    const walkDown2 = parsePixelMap(WALK_DOWN_2, legend);

    return {
      idle: [
        createSprite(idle1.width, idle1.height, idle1.pixels),
        createSprite(idle2.width, idle2.height, idle2.pixels),
      ],
      typing: [
        createSprite(typing1.width, typing1.height, typing1.pixels),
        createSprite(typing2.width, typing2.height, typing2.pixels),
        createSprite(typing3.width, typing3.height, typing3.pixels),
        createSprite(typing2.width, typing2.height, typing2.pixels), // bounce back
      ],
      sleeping: [createSprite(sleeping.width, sleeping.height, sleeping.pixels)],
      walking: [
        createSprite(walkDown1.width, walkDown1.height, walkDown1.pixels),
        createSprite(walkDown2.width, walkDown2.height, walkDown2.pixels),
      ],
    };
  }

  // Pre-generate furniture sprites
  function generateFurnitureSprites() {
    const desk = parsePixelMap(DESK_SPRITE, DESK_LEGEND);
    const plant = parsePixelMap(PLANT_SPRITE, PLANT_LEGEND);
    const server = parsePixelMap(SERVER_SPRITE, SERVER_LEGEND);
    const whiteboard = parsePixelMap(WHITEBOARD_SPRITE, WB_LEGEND);
    return {
      desk: createSprite(desk.width, desk.height, desk.pixels),
      plant: createSprite(plant.width, plant.height, plant.pixels),
      server: createSprite(server.width, server.height, server.pixels),
      whiteboard: createSprite(whiteboard.width, whiteboard.height, whiteboard.pixels),
    };
  }

  // ── AGENT COLOR → SHIRT MAPPING ──
  // Maps agent accent colors to pixel art shirt colors
  function getShirtColors(hexColor) {
    // Parse hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const shadow = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
    return { shirt: hexColor, shadow };
  }

  // Agent sprite cache by color
  const agentSpriteCache = {};
  function getAgentSprites(hexColor) {
    if (agentSpriteCache[hexColor]) return agentSpriteCache[hexColor];
    const { shirt, shadow } = getShirtColors(hexColor);
    agentSpriteCache[hexColor] = generateAgentSprites(shirt, shadow);
    return agentSpriteCache[hexColor];
  }

  // Pre-generate furniture on load
  let furnitureSprites = null;
  function getFurnitureSprites() {
    if (!furnitureSprites) furnitureSprites = generateFurnitureSprites();
    return furnitureSprites;
  }

  // ── DRAW API ──
  // Draw a sprite at canvas position (centered), with optional scale
  function drawSprite(ctx, sprite, x, y, scale) {
    scale = scale || 1;
    const w = sprite.width * scale;
    const h = sprite.height * scale;
    ctx.drawImage(sprite, x - w / 2, y - h / 2, w, h);
  }

  // Get animation frame based on time
  function getFrame(frames, time, fps) {
    fps = fps || 4;
    const idx = Math.floor((time / 1000) * fps) % frames.length;
    return frames[idx];
  }

  return {
    PAL,
    SPRITE_SIZE,
    SCALE,
    getAgentSprites,
    getFurnitureSprites,
    drawSprite,
    getFrame,
    createSprite,
    parsePixelMap,
    cache,
  };
})();
