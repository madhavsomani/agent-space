// ===== HIGH-FIVE CELEBRATIONS =====
// When an agent finishes work (working→idle), they high-five the nearest available agent
const highFives = []; // {agent1, agent2, startTime, duration, x, y, color1, color2, confetti:[]}
function triggerHighFive(agentName, color) {
  const desk = deskPositions[agentName];
  if (!desk) return;
  // Find nearest desk agent that isn't the same agent
  let bestDist = Infinity, bestName = null;
  for (const [name, pos] of Object.entries(deskPositions)) {
    if (name === agentName) continue;
    const d = Math.abs(pos.gx - desk.gx) + Math.abs(pos.gy - desk.gy);
    if (d < bestDist) { bestDist = d; bestName = name; }
  }
  if (!bestName) return;
  const partner = deskPositions[bestName];
  const p1 = isoToScreen(desk.gx, desk.gy);
  const p2 = isoToScreen(partner.gx, partner.gy);
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - 20;
  // Generate confetti
  const confetti = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 3;
    confetti.push({
      x: mx, y: my, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
      life: 1, color: ['#FFD700','#FF6B6B','#4ECDC4','#A78BFA','#F97316','#34D399','#00D4FF','#FF69B4'][i % 8],
      size: 2 + Math.random() * 3, rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.3
    });
  }
  const partnerAgent = agentData.find(a => a.name === bestName);
  if (highFives.length >= 10) { highFives[0] = highFives[highFives.length - 1]; highFives.pop(); }
  highFives.push({
    agent1: agentName, agent2: bestName,
    startTime: Date.now(), duration: 2500,
    x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, mx, my,
    color1: color, color2: partnerAgent?.color || '#888',
    confetti
  });
  showToast(agentName, color, 'finished work! 🎉✋', '✅');
}

function drawHighFives(time) {
  for (let i = highFives.length - 1; i >= 0; i--) {
    const hf = highFives[i];
    const elapsed = time - hf.startTime;
    if (elapsed > hf.duration) { highFives[i]=highFives[highFives.length-1]; highFives.pop(); continue; }
    const progress = elapsed / hf.duration;

    // Phase 1 (0-0.3): hands reach toward middle
    // Phase 2 (0.3-0.5): CLAP + burst
    // Phase 3 (0.5-1): confetti falls, fades out
    const fadeOut = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;

    oCtx.save();
    oCtx.globalAlpha = fadeOut;

    // Draw reaching hands
    if (progress < 0.5) {
      const reach = progress < 0.3 ? progress / 0.3 : 1;
      const ease = 1 - Math.pow(1 - reach, 3);
      // Hand 1 (from agent1 toward middle)
      const h1x = hf.x1 + (hf.mx - hf.x1) * ease;
      const h1y = hf.y1 - 20 + (hf.my - (hf.y1 - 20)) * ease;
      // Hand 2 (from agent2 toward middle)
      const h2x = hf.x2 + (hf.mx - hf.x2) * ease;
      const h2y = hf.y2 - 20 + (hf.my - (hf.y2 - 20)) * ease;
      // Arms
      oCtx.strokeStyle = hf.color1; oCtx.lineWidth = 3; oCtx.lineCap = 'round';
      oCtx.beginPath(); oCtx.moveTo(hf.x1, hf.y1 - 20); oCtx.lineTo(h1x, h1y); oCtx.stroke();
      oCtx.strokeStyle = hf.color2;
      oCtx.beginPath(); oCtx.moveTo(hf.x2, hf.y2 - 20); oCtx.lineTo(h2x, h2y); oCtx.stroke();
      // Hands
      oCtx.fillStyle = '#ffe0b2';
      oCtx.beginPath(); oCtx.arc(h1x, h1y, 4, 0, Math.PI * 2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(h2x, h2y, 4, 0, Math.PI * 2); oCtx.fill();
    }

    // Clap impact burst (at phase 0.3)
    if (progress >= 0.28 && progress < 0.55) {
      const burstP = (progress - 0.28) / 0.27;
      const burstR = 8 + burstP * 30;
      const burstA = (1 - burstP) * 0.5;
      oCtx.beginPath(); oCtx.arc(hf.mx, hf.my, burstR, 0, Math.PI * 2);
      oCtx.fillStyle = `rgba(255,215,0,${burstA})`; oCtx.fill();
      // Star burst lines
      if (burstP < 0.5) {
        oCtx.strokeStyle = `rgba(255,215,0,${(0.5 - burstP) * 0.8})`;
        oCtx.lineWidth = 2;
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2;
          const r1 = burstR * 0.5, r2 = burstR;
          oCtx.beginPath();
          oCtx.moveTo(hf.mx + Math.cos(a) * r1, hf.my + Math.sin(a) * r1);
          oCtx.lineTo(hf.mx + Math.cos(a) * r2, hf.my + Math.sin(a) * r2);
          oCtx.stroke();
        }
      }
      // "✋" emoji at impact
      if (burstP < 0.4) {
        oCtx.font = `${14 + burstP * 8}px serif`; oCtx.textAlign = 'center';
        oCtx.globalAlpha = (0.4 - burstP) * 2.5 * fadeOut;
        oCtx.fillText('🙏', hf.mx, hf.my - 5);
        oCtx.globalAlpha = fadeOut;
      }
    }

    // Confetti particles
    hf.confetti.forEach(c => {
      c.x += c.vx; c.y += c.vy; c.vy += 0.12; c.vx *= 0.98;
      c.life -= 0.012; c.rot += c.rotSpeed;
      if (c.life <= 0) return;
      oCtx.save();
      oCtx.globalAlpha = c.life * fadeOut;
      oCtx.translate(c.x, c.y);
      oCtx.rotate(c.rot);
      oCtx.fillStyle = c.color;
      oCtx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      oCtx.restore();
    });

    oCtx.restore();
  }
}

// ===== PRE-SLEEP STRETCH & YAWN =====
const preSleepAnimations = {}; // {agentName: {startTime, duration, color}}
function triggerPreSleep(agentName, color) {
  preSleepAnimations[agentName] = { startTime: Date.now(), duration: 3000, color };
}
function isInPreSleep(agentName) {
  const ps = preSleepAnimations[agentName];
  if (!ps) return false;
  if (Date.now() - ps.startTime > ps.duration) { delete preSleepAnimations[agentName]; return false; }
  return true;
}
function drawPreSleepAgent(agent, gx, gy, time) {
  const ps = preSleepAnimations[agent.name];
  if (!ps) return;
  const elapsed = time - ps.startTime;
  const progress = Math.min(1, elapsed / ps.duration);
  const baseP = isoToScreen(gx, gy);
  const px = baseP.x;
  const baseY = baseP.y - 20;

  // Phase 1 (0-0.4): Arms rise up in stretch
  // Phase 2 (0.4-0.7): Big yawn, arms out
  // Phase 3 (0.7-1.0): Slump down toward desk

  // Shadow
  oCtx.beginPath(); oCtx.ellipse(px, baseP.y+4, 10, 4, 0, 0, Math.PI*2);
  oCtx.fillStyle = 'rgba(0,0,0,0.2)'; oCtx.fill();

  // Body sway as they get sleepy
  const sway = progress > 0.5 ? Math.sin(time/300) * (progress-0.5)*6 : 0;
  const slumpY = progress > 0.7 ? (progress-0.7)/0.3 * 12 : 0;

  oCtx.save();
  oCtx.translate(px + sway, baseY + slumpY);

  // Legs
  oCtx.fillStyle = '#1e293b';
  oCtx.fillRect(-5, 24, 4, 10);
  oCtx.fillRect(1, 24, 4, 10);

  // Body
  const grad = oCtx.createLinearGradient(-10, 6, 10, 24);
  grad.addColorStop(0, agent.color); grad.addColorStop(1, shadeColor(agent.color, -25));
  oCtx.fillStyle = grad;
  roundRect(oCtx, -10, 6, 20, 18, 4); oCtx.fill();

  // Arms — stretch up then droop
  const armRaise = progress < 0.4 ? progress/0.4 : progress < 0.7 ? 1 - (progress-0.4)/0.3*0.3 : 0.7 - (progress-0.7)/0.3*0.7;
  const armAngle = -Math.PI/2 * armRaise;
  const armLen = 16;
  oCtx.fillStyle = shadeColor(agent.color, -15);
  // Left arm
  const laX = -12 + Math.cos(armAngle-0.3)*armLen;
  const laY = 10 + Math.sin(armAngle-0.3)*armLen;
  oCtx.save(); oCtx.lineWidth=5; oCtx.lineCap='round'; oCtx.strokeStyle=shadeColor(agent.color,-15);
  oCtx.beginPath(); oCtx.moveTo(-10,12); oCtx.lineTo(laX, laY); oCtx.stroke(); oCtx.restore();
  // Right arm
  const raX = 12 + Math.cos(-armAngle+0.3+Math.PI)*-armLen;
  const raY = 10 + Math.sin(-armAngle+0.3+Math.PI)*-armLen;
  oCtx.save(); oCtx.lineWidth=5; oCtx.lineCap='round'; oCtx.strokeStyle=shadeColor(agent.color,-15);
  oCtx.beginPath(); oCtx.moveTo(10,12); oCtx.lineTo(raX, raY); oCtx.stroke(); oCtx.restore();
  // Hands
  oCtx.fillStyle='#ffe0b2';
  oCtx.beginPath(); oCtx.arc(laX, laY, 3, 0, Math.PI*2); oCtx.fill();
  oCtx.beginPath(); oCtx.arc(raX, raY, 3, 0, Math.PI*2); oCtx.fill();

  // Head — tilts back during yawn
  const headTilt = progress > 0.3 && progress < 0.75 ? Math.sin((progress-0.3)/0.45*Math.PI)*0.2 : 0;
  oCtx.save(); oCtx.rotate(-headTilt);
  oCtx.beginPath(); oCtx.arc(0, 0, 10, 0, Math.PI*2);
  oCtx.fillStyle='#d4a574'; oCtx.fill();
  oCtx.beginPath(); oCtx.arc(0, -4, 10, Math.PI, Math.PI*2);
  oCtx.fillStyle='#1e293b'; oCtx.fill();

  // Eyes — squeezing shut during yawn
  const eyeSquint = progress > 0.35 && progress < 0.75;
  if (eyeSquint) {
    // Tight shut eyes with crinkle lines
    oCtx.strokeStyle='#333'; oCtx.lineWidth=1.5; oCtx.lineCap='round';
    oCtx.beginPath(); oCtx.moveTo(-5,-1); oCtx.lineTo(-1,0); oCtx.stroke();
    oCtx.beginPath(); oCtx.moveTo(1,0); oCtx.lineTo(5,-1); oCtx.stroke();
    // Crinkle lines
    oCtx.lineWidth=0.5; oCtx.globalAlpha=0.4;
    oCtx.beginPath(); oCtx.moveTo(-6,-3); oCtx.lineTo(-5,-1.5); oCtx.stroke();
    oCtx.beginPath(); oCtx.moveTo(6,-3); oCtx.lineTo(5,-1.5); oCtx.stroke();
    oCtx.globalAlpha=1;
  } else if (progress > 0.75) {
    // Drowsy half-closed eyes
    oCtx.strokeStyle='#333'; oCtx.lineWidth=1;
    const droop = (progress-0.75)/0.25;
    oCtx.beginPath(); oCtx.moveTo(-5,-1); oCtx.lineTo(-1,-1+droop); oCtx.stroke();
    oCtx.beginPath(); oCtx.moveTo(1,-1+droop); oCtx.lineTo(5,-1); oCtx.stroke();
  } else {
    // Normal eyes getting heavy
    oCtx.fillStyle='#1e293b';
    oCtx.beginPath(); oCtx.arc(-3,-1, 1.5, 0, Math.PI*2); oCtx.fill();
    oCtx.beginPath(); oCtx.arc(3,-1, 1.5, 0, Math.PI*2); oCtx.fill();
  }

  // Mouth — big yawn
  if (progress > 0.35 && progress < 0.75) {
    const yawnP = (progress - 0.35) / 0.4;
    const yawnSize = Math.sin(yawnP * Math.PI) * 5 + 1;
    oCtx.fillStyle='#4a2020';
    oCtx.beginPath(); oCtx.ellipse(0, 4, yawnSize*0.8, yawnSize, 0, 0, Math.PI*2); oCtx.fill();
    // Tongue hint
    if (yawnSize > 3) {
      oCtx.fillStyle='#c06060';
      oCtx.beginPath(); oCtx.ellipse(0, 4+yawnSize*0.3, yawnSize*0.4, yawnSize*0.3, 0, 0, Math.PI); oCtx.fill();
    }
  } else {
    oCtx.strokeStyle='#8B4513'; oCtx.lineWidth=1;
    oCtx.beginPath(); oCtx.moveTo(-2,4); oCtx.lineTo(2,4); oCtx.stroke();
  }
  oCtx.restore(); // head tilt

  oCtx.restore(); // main translate

  // Floating yawn text / emoji
  if (progress > 0.3 && progress < 0.8) {
    const tp = (progress - 0.3) / 0.5;
    const ta = tp < 0.2 ? tp/0.2 : tp > 0.7 ? (1-tp)/0.3 : 1;
    oCtx.globalAlpha = ta * 0.7;
    oCtx.font = `${12+tp*4}px serif`; oCtx.textAlign='center';
    oCtx.fillText('🥱', px + 18, baseY - 14 - tp*12);
    oCtx.globalAlpha = 1;
  }

  // "Getting sleepy..." bubble
  if (progress > 0.5 && progress < 0.95) {
    const ba = progress < 0.6 ? (progress-0.5)*10 : progress > 0.85 ? (0.95-progress)*10 : 1;
    oCtx.globalAlpha = ba * 0.6;
    const txt = progress > 0.8 ? '💤 Goodnight...' : '😴 Getting sleepy...';
    oCtx.font = '8px system-ui'; oCtx.textAlign = 'center';
    const tw = oCtx.measureText(txt).width + 12;
    const bx = px - tw/2, by = baseP.y - 55;
    oCtx.fillStyle = 'rgba(30,20,60,0.8)';
    roundRect(oCtx, bx, by, tw, 14, 7); oCtx.fill();
    oCtx.strokeStyle = agent.color; oCtx.lineWidth = 0.5;
    roundRect(oCtx, bx, by, tw, 14, 7); oCtx.stroke();
    oCtx.fillStyle = '#e0d8f0';
    oCtx.fillText(txt, px, by + 10);
    oCtx.globalAlpha = 1;
  }

  // Name
  oCtx.font='bold 10px system-ui'; oCtx.textAlign='center'; oCtx.fillStyle=agent.color;
  oCtx.fillText(agent.name, baseP.x, baseP.y+48);
  oCtx.font='8px system-ui'; oCtx.fillStyle='#64748b';
  oCtx.fillText(agent.role, baseP.x, baseP.y+58);
}

// ===== GOODBYE WAVE ANIMATIONS =====
const goodbyeWaves = []; // {agentName, color, startTime, duration, x, y, armAngle, moon/stars particles}
function triggerGoodbyeWave(agentName, color) {
  const desk = deskPositions[agentName] || getAutoDesk(agentName);
  if (!desk) return;
  const p = isoToScreen(desk.gx, desk.gy);
  // Create moon & stars particles that drift up
  const particles = [];
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: p.x - 15 + Math.random() * 30,
      y: p.y - 30,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -0.5 - Math.random() * 1.2,
      life: 1,
      char: ['✨','⭐','🌙','💤','🌟'][i % 5],
      size: 8 + Math.random() * 6,
    });
  }
  if (goodbyeWaves.length >= 10) { goodbyeWaves[0] = goodbyeWaves[goodbyeWaves.length - 1]; goodbyeWaves.pop(); }
  goodbyeWaves.push({
    agentName, color, startTime: Date.now(), duration: 3000,
    x: p.x, y: p.y - 20, particles
  });
}

function drawGoodbyeWaves(time) {
  for (let i = goodbyeWaves.length - 1; i >= 0; i--) {
    const gw = goodbyeWaves[i];
    const elapsed = time - gw.startTime;
    if (elapsed > gw.duration) { goodbyeWaves[i]=goodbyeWaves[goodbyeWaves.length-1]; goodbyeWaves.pop(); continue; }
    const progress = elapsed / gw.duration;
    const fadeOut = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;

    oCtx.save();
    oCtx.globalAlpha = fadeOut;

    // Waving arm (right arm swings back and forth)
    if (progress < 0.8) {
      const wavePhase = elapsed / 200; // fast wave
      const armAngle = Math.sin(wavePhase) * 0.6 - 0.8; // wave arc
      const armLen = 14;
      const shoulderX = gw.x + 9, shoulderY = gw.y + 8;
      const handX = shoulderX + Math.cos(armAngle) * armLen;
      const handY = shoulderY + Math.sin(armAngle) * armLen;

      // Arm
      oCtx.strokeStyle = gw.color;
      oCtx.lineWidth = 4;
      oCtx.lineCap = 'round';
      oCtx.beginPath();
      oCtx.moveTo(shoulderX, shoulderY);
      oCtx.lineTo(handX, handY);
      oCtx.stroke();

      // Hand
      oCtx.fillStyle = '#ffe0b2';
      oCtx.beginPath(); oCtx.arc(handX, handY, 3.5, 0, Math.PI * 2); oCtx.fill();

      // Motion lines near hand
      const lineAlpha = (1 - progress) * 0.4;
      oCtx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
      oCtx.lineWidth = 1;
      for (let l = 0; l < 3; l++) {
        const lx = handX + 5 + l * 4;
        const ly = handY - 3 + l * 3;
        oCtx.beginPath();
        oCtx.moveTo(lx, ly);
        oCtx.lineTo(lx + 4, ly - 1);
        oCtx.stroke();
      }
    }

    // "👋 Goodnight!" text bubble
    if (progress < 0.6) {
      const bubbleAlpha = progress < 0.1 ? progress / 0.1 : progress > 0.45 ? (0.6 - progress) / 0.15 : 1;
      const bubbleY = gw.y - 25 - progress * 15;
      oCtx.globalAlpha = bubbleAlpha * fadeOut;
      oCtx.fillStyle = 'rgba(30,20,60,0.85)';
      roundRect(oCtx, gw.x - 32, bubbleY - 10, 64, 20, 8);
      oCtx.fill();
      oCtx.strokeStyle = gw.color;
      oCtx.lineWidth = 1;
      roundRect(oCtx, gw.x - 32, bubbleY - 10, 64, 20, 8);
      oCtx.stroke();
      oCtx.font = '10px system-ui';
      oCtx.fillStyle = '#fff';
      oCtx.textAlign = 'center';
      oCtx.fillText('👋 Goodnight!', gw.x, bubbleY + 4);
      oCtx.globalAlpha = fadeOut;
    }

    // Drifting particles (stars, moon, sparkles)
    gw.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.008;
      if (p.life <= 0) return;
      oCtx.globalAlpha = p.life * fadeOut * 0.8;
      oCtx.font = `${p.size}px serif`;
      oCtx.textAlign = 'center';
      oCtx.fillText(p.char, p.x, p.y);
    });

    oCtx.restore();
  }
}

// ===== STATUS CHANGE SPARKLES =====
const statusSparkles = [];
const MAX_SPARKLES = 80;
function emitSparkles(agentName, color) {
  const pos = deskPositions[agentName];
  if(!pos) return;
  const p = isoToScreen(pos.gx, pos.gy);
  for(let i=0;i<12;i++){
    if(statusSparkles.length>=MAX_SPARKLES){ statusSparkles[0]=statusSparkles[statusSparkles.length-1]; statusSparkles.pop(); }
    const angle = (i/12)*Math.PI*2 + Math.random()*0.5;
    const speed = 1.5+Math.random()*2;
    statusSparkles.push({x:p.x,y:p.y-20,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,color,size:2+Math.random()*2});
  }
}

// ===== TOAST NOTIFICATIONS =====
const prevAgentStatus = {};
// showToast is defined once near end of file — this call-site uses the hoisted version
function checkStatusChanges(agents) {
  agents.forEach(a => {
    const prev = prevAgentStatus[a.name];
    if (prev && prev !== a.status) {
      emitSparkles(a.name, a.color);
      if (a.status === 'working') showToast(a.name, a.color, 'started working', '🟢');
      else if (a.status === 'sleeping') { triggerPreSleep(a.name, a.color); triggerGoodbyeWave(a.name, a.color); showToast(a.name, a.color, 'went to sleep', '💤'); }
      else if (a.status === 'idle' && prev === 'working') {
        // Agent just finished work — celebrate with a high-five!
        triggerHighFive(a.name, a.color);
      }
      else if (a.status === 'idle') showToast(a.name, a.color, 'is idle', '🟡');
    }
    prevAgentStatus[a.name] = a.status;
  });
}
