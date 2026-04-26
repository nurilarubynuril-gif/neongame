/* ═══════════════════════════════════════════
   GEOBLAST — game.js
   Main engine: player, physics, rendering, UI
   ═══════════════════════════════════════════ */

(() => {
  // ── DOM refs ──
  const canvas = document.getElementById('gameCanvas');
  const c = canvas.getContext('2d');
  const bgCanvas = document.getElementById('bgCanvas');
  const bc = bgCanvas.getContext('2d');
  const progressBar = document.getElementById('progress-bar');
  const muteBtn = document.getElementById('mute-btn');

  // Screens
  const screenMenu = document.getElementById('screen-menu');
  const screenLevels = document.getElementById('screen-levels');
  const screenGO = document.getElementById('screen-gameover');
  const screenWin = document.getElementById('screen-win');
  const screens = [screenMenu, screenLevels, screenGO, screenWin];

  const show = el => { screens.forEach(s => s.classList.add('hidden')); el.classList.remove('hidden'); };
  const hideAll = () => screens.forEach(s => s.classList.add('hidden'));

  // ── Canvas sizing ──
  const resize = () => {
    canvas.width = bgCanvas.width = window.innerWidth;
    canvas.height = bgCanvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  resize();

  // ── GAME STATE ──
  const STATE = { MENU:0, PLAYING:1, DEAD:2, WIN:3, LEVELS:4 };
  let state = STATE.MENU;
  let currentLevel = -1; // -1 = infinite
  let score = 0, bestProgress = 0;

  // Player
  let player = {};
  const resetPlayer = () => {
    player = {
      x: 120, y: Levels.GROUND - 40,
      w: 34, h: 34,
      vy: 0, speed: 5,
      grounded: false,
      jumps: 0, maxJumps: 2,
      gravFlip: false, // gravity portal flip
      rotation: 0,
      dead: false, trail: []
    };
  };

  // Level data
  let levelObjs = [], levelLength = 0, levelSpeed = 5;
  let camX = 0, infGenX = 0, infDifficulty = 0;

  // Stars for background
  const stars = [];
  for (let i = 0; i < 120; i++)
    stars.push({ x:Math.random()*3000, y:Math.random()*600, s:Math.random()*2+0.5, b:Math.random() });

  // ── INPUT ──
  const keys = {};
  let jumpPressed = false;
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); keys[e.code] = true; jumpPressed = true; }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  // Touch / click
  canvas.addEventListener('mousedown', () => { jumpPressed = true; });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); jumpPressed = true; }, {passive:false});

  // ── START LEVEL ──
  const startLevel = (idx) => {
    Audio.init(); Audio.startMusic();
    resetPlayer();
    Particles.clear();
    camX = 0; score = 0;
    if (idx === -1) {
      // Infinite
      currentLevel = -1;
      levelObjs = [{type:'platform', x:0, y:Levels.GROUND, w:600, h:20}];
      levelLength = Infinity;
      levelSpeed = 5;
      infGenX = 600; infDifficulty = 0;
      // Generate initial chunks
      for (let i = 0; i < 5; i++) {
        const chunk = Levels.generateInfiniteChunk(infGenX, infDifficulty);
        levelObjs = levelObjs.concat(chunk.objects);
        infGenX = chunk.endX;
      }
    } else {
      currentLevel = idx;
      const lvl = Levels.getLevel(idx);
      levelObjs = lvl.objects;
      levelLength = lvl.totalLength;
      levelSpeed = lvl.speed;
    }
    player.speed = levelSpeed;
    state = STATE.PLAYING;
    hideAll();
  };

  // ── COLLISION ──
  const rectRect = (a, b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;

  const pointInTriangle = (px, py, x1,y1,x2,y2,x3,y3) => {
    const d1 = (px-x2)*(y1-y2)-(x1-x2)*(py-y2);
    const d2 = (px-x3)*(y2-y3)-(x2-x3)*(py-y3);
    const d3 = (px-x1)*(y3-y1)-(x3-x1)*(py-y1);
    const hasNeg = (d1<0)||(d2<0)||(d3<0);
    const hasPos = (d1>0)||(d2>0)||(d3>0);
    return !(hasNeg && hasPos);
  };

  const spikeCollision = (px, py, pw, ph, spike) => {
    const s = spike.size * 0.7;
    const sx = spike.x, sy = spike.y;
    // Spike triangle: tip at top, base at bottom (or flipped)
    const flip = spike.flipped;
    const x1 = sx, y1 = flip ? sy + s : sy - s;
    const x2 = sx - s/2, y2 = flip ? sy : sy;
    const x3 = sx + s/2, y3 = flip ? sy : sy;
    // Check corners of player rect
    const corners = [[px,py],[px+pw,py],[px,py+ph],[px+pw,py+ph],[px+pw/2,py],[px+pw/2,py+ph]];
    for (const [cx,cy] of corners) if (pointInTriangle(cx,cy,x1,y1,x2,y2,x3,y3)) return true;
    // Also check bounding box overlap as fallback
    const bx = sx-s/2, by = flip?sy:sy-s, bw = s, bh = s;
    if (rectRect({x:px,y:py,w:pw,h:ph},{x:bx+4,y:by+4,w:bw-8,h:bh-8})) return true;
    return false;
  };

  // ── UPDATE ──
  const GRAVITY = 0.6;
  const JUMP_FORCE = -12;

  const update = () => {
    if (state !== STATE.PLAYING || player.dead) return;
    const p = player;
    const gDir = p.gravFlip ? -1 : 1;

    // Move right
    p.x += p.speed;
    camX = p.x - canvas.width * 0.3;

    // Gravity
    p.vy += GRAVITY * gDir;
    p.y += p.vy;

    // Rotation (cosmetic spin)
    p.rotation += p.speed * 3 * (Math.PI/180);

    // Jump input
    if (jumpPressed) {
      jumpPressed = false;
      if (p.jumps < p.maxJumps) {
        p.vy = JUMP_FORCE * gDir;
        p.jumps++;
        if (p.jumps === 1) { Audio.jump(); Particles.emit(p.x+p.w/2, p.y+p.h, 8, '#00f5ff'); }
        else { Audio.doubleJump(); Particles.emit(p.x+p.w/2, p.y+p.h, 12, '#bf00ff'); }
      }
    }
    jumpPressed = false;

    // Trail
    p.trail.push({x:p.x, y:p.y, a:1});
    if (p.trail.length > 12) p.trail.shift();
    p.trail.forEach(t => t.a *= 0.88);

    // Grounded flag
    p.grounded = false;

    // Collision with level objects
    const viewL = camX - 200, viewR = camX + canvas.width + 200;

    for (const obj of levelObjs) {
      // Skip off-screen objects
      if (obj.x + (obj.w||obj.size||40) < viewL || obj.x - (obj.w||40) > viewR) continue;

      if (obj.type === 'platform' || obj.type === 'moving_platform') {
        const plat = {x:obj.x, y:obj._cy||obj.y, w:obj.w, h:obj.h};
        // Landing on top (normal gravity)
        if (!p.gravFlip) {
          if (p.x+p.w > plat.x && p.x < plat.x+plat.w &&
              p.y+p.h >= plat.y && p.y+p.h <= plat.y+plat.h+p.vy+2 && p.vy >= 0) {
            p.y = plat.y - p.h; p.vy = 0; p.grounded = true; p.jumps = 0;
          }
        } else {
          // Flipped: land on bottom of platform
          if (p.x+p.w > plat.x && p.x < plat.x+plat.w &&
              p.y <= plat.y+plat.h && p.y >= plat.y+plat.h+p.vy-2 && p.vy <= 0) {
            p.y = plat.y + plat.h; p.vy = 0; p.grounded = true; p.jumps = 0;
          }
        }
      }

      if (obj.type === 'pillar') {
        const b = {x:obj.x, y:obj.y, w:obj.w, h:obj.h};
        if (rectRect({x:p.x,y:p.y,w:p.w,h:p.h}, b)) {
          // Hit side = die, landing on top = ok
          if (p.x + p.w - p.speed - 2 <= b.x) { die(); return; }
          if (!p.gravFlip && p.vy >= 0 && p.y+p.h - p.vy <= b.y+4) {
            p.y = b.y - p.h; p.vy = 0; p.grounded = true; p.jumps = 0;
          } else { die(); return; }
        }
      }

      if (obj.type === 'spike' || obj.type === 'moving_spike') {
        const sy = obj._cy != null ? obj._cy : obj.y;
        if (spikeCollision(p.x, p.y, p.w, p.h, {...obj, y:sy})) { die(); return; }
      }

      if (obj.type === 'portal') {
        const pr = {x:obj.x, y:obj.y, w:obj.w, h:obj.h};
        if (rectRect({x:p.x,y:p.y,w:p.w,h:p.h}, pr) && !obj._used) {
          obj._used = true;
          p.gravFlip = !p.gravFlip;
          p.vy = 0;
          Audio.portal();
          Particles.emit(p.x+p.w/2, p.y+p.h/2, 20, '#ffe600');
        }
      }
    }

    // Floor / ceiling death
    if (p.y > canvas.height + 100 || p.y < -200) { die(); return; }

    // Update moving objects
    for (const obj of levelObjs) {
      if (obj.x + (obj.w||obj.size||40) < viewL - 400 || obj.x > viewR + 400) continue;
      if ((obj.type === 'moving_spike' || obj.type === 'moving_platform') && obj.moveY) {
        if (obj._cy == null) obj._cy = obj.y;
        if (obj._dir == null) obj._dir = 1;
        obj._cy += obj.speed * obj._dir;
        if (obj._cy >= obj.maxY) obj._dir = -1;
        if (obj._cy <= obj.minY) obj._dir = 1;
      }
    }

    // Score & progress
    score = Math.floor(p.x / 10);

    // Speed ramp (infinite mode)
    if (currentLevel === -1) {
      player.speed = levelSpeed + Math.floor(score / 200) * 0.3;
      infDifficulty = Math.floor(score / 300);
      // Generate more chunks
      if (p.x + canvas.width * 2 > infGenX) {
        const chunk = Levels.generateInfiniteChunk(infGenX, infDifficulty);
        levelObjs = levelObjs.concat(chunk.objects);
        infGenX = chunk.endX;
        // Cleanup far-away objects
        levelObjs = levelObjs.filter(o => o.x + (o.w||o.size||200) > p.x - 1000);
      }
    } else {
      // Check win
      if (p.x >= levelLength - 100) { winLevel(); return; }
    }

    Particles.update();
  };

  const die = () => {
    player.dead = true;
    state = STATE.DEAD;
    Audio.die(); Audio.stopMusic();
    Particles.emit(player.x+player.w/2, player.y+player.h/2, 40, '#ff0090');
    const prog = currentLevel === -1 ? score : Math.min(100, Math.floor(player.x/levelLength*100));
    if (prog > bestProgress) bestProgress = prog;
    document.getElementById('go-progress').textContent = (currentLevel===-1 ? score : prog+'%');
    document.getElementById('go-score').textContent = score;
    document.getElementById('go-best').textContent = (currentLevel===-1 ? bestProgress : bestProgress+'%');
    setTimeout(() => show(screenGO), 600);
  };

  const winLevel = () => {
    state = STATE.WIN;
    Audio.win(); Audio.stopMusic();
    Particles.emit(player.x+player.w/2, player.y+player.h/2, 50, '#39ff14');
    document.getElementById('win-score').textContent = score;
    setTimeout(() => show(screenWin), 400);
  };

  // ── DRAW ──
  const drawBg = () => {
    const w = canvas.width, h = canvas.height;
    // Gradient sky
    const grad = c.createLinearGradient(0,0,0,h);
    grad.addColorStop(0, '#050520'); grad.addColorStop(0.5, '#0a0a30'); grad.addColorStop(1, '#0f0528');
    c.fillStyle = grad; c.fillRect(0,0,w,h);

    // Grid lines
    c.strokeStyle = 'rgba(0,245,255,0.06)'; c.lineWidth = 1;
    const gx = 80, offX = camX % gx, offY = 0;
    for (let x = -offX; x < w; x += gx) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke(); }
    for (let y = offY; y < h; y += gx) { c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); }

    // Stars
    stars.forEach(s => {
      const sx = ((s.x - camX*0.15) % (w+100) + w + 100) % (w+100);
      s.b += 0.02; const a = 0.4 + Math.sin(s.b)*0.4;
      c.globalAlpha = a; c.fillStyle = '#fff';
      c.fillRect(sx, s.y, s.s, s.s);
    });
    c.globalAlpha = 1;
  };

  const drawObj = (obj) => {
    const sx = obj.x - camX, sy = obj._cy != null ? obj._cy : obj.y;

    switch(obj.type) {
      case 'platform':
      case 'moving_platform': {
        const glow = obj.type === 'moving_platform' ? 'rgba(191,0,255,0.5)' : 'rgba(0,245,255,0.3)';
        c.shadowBlur = 8; c.shadowColor = glow;
        c.fillStyle = obj.type === 'moving_platform' ? '#1a0a2e' : '#0a1628';
        c.fillRect(sx, sy, obj.w, obj.h);
        // Top edge glow
        c.fillStyle = obj.type === 'moving_platform' ? '#bf00ff' : '#00f5ff';
        c.fillRect(sx, sy, obj.w, 2);
        c.shadowBlur = 0;
        break;
      }
      case 'spike':
      case 'moving_spike': {
        const s = obj.size * 0.7;
        const flip = obj.flipped;
        c.save(); c.translate(sx, sy);
        c.shadowBlur = 15; c.shadowColor = obj.type==='moving_spike' ? '#ff6600' : '#ff0090';
        c.fillStyle = obj.type==='moving_spike' ? '#ff6600' : '#ff0060';
        c.beginPath();
        c.moveTo(0, flip ? s : -s);
        c.lineTo(-s/2, flip ? 0 : 0);
        c.lineTo(s/2, flip ? 0 : 0);
        c.closePath(); c.fill();
        c.shadowBlur = 0; c.restore();
        break;
      }
      case 'pillar': {
        c.shadowBlur = 6; c.shadowColor = 'rgba(255,0,144,0.4)';
        c.fillStyle = '#1a0014';
        c.fillRect(sx, obj.y, obj.w, obj.h);
        c.strokeStyle = '#ff0090'; c.lineWidth = 1.5;
        c.strokeRect(sx, obj.y, obj.w, obj.h);
        c.shadowBlur = 0;
        break;
      }
      case 'portal': {
        // Glowing portal ring
        const px = sx + obj.w/2, py = obj.y + obj.h/2;
        const t = Date.now()/300;
        c.save(); c.translate(px, py);
        c.shadowBlur = 25; c.shadowColor = '#ffe600';
        c.strokeStyle = '#ffe600'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(0, 0, obj.w*0.8, obj.h*0.7, 0, 0, Math.PI*2); c.stroke();
        // Inner glow
        c.strokeStyle = 'rgba(255,230,0,0.4)'; c.lineWidth = 6;
        c.beginPath(); c.ellipse(0, 0, obj.w*0.6, obj.h*0.5, t, 0, Math.PI*2); c.stroke();
        // Arrow
        c.fillStyle = '#ffe600'; c.font = 'bold 18px Orbitron';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('⇅', 0, 0);
        c.shadowBlur = 0; c.restore();
        break;
      }
    }
  };

  const drawPlayer = () => {
    const p = player;
    const sx = p.x - camX, sy = p.y;
    // Trail
    p.trail.forEach(t => {
      const tx = t.x - camX;
      c.globalAlpha = t.a * 0.4;
      c.shadowBlur = 10; c.shadowColor = '#00f5ff';
      c.fillStyle = '#00f5ff';
      c.fillRect(tx+4, t.y+4, p.w-8, p.h-8);
    });
    c.globalAlpha = 1; c.shadowBlur = 0;

    // Player cube with rotation
    c.save();
    c.translate(sx + p.w/2, sy + p.h/2);
    c.rotate(p.rotation);
    // Glow
    c.shadowBlur = 20; c.shadowColor = p.gravFlip ? '#ffe600' : '#00f5ff';
    // Body
    const grad = c.createLinearGradient(-p.w/2,-p.h/2,p.w/2,p.h/2);
    grad.addColorStop(0, p.gravFlip ? '#ffe600' : '#00f5ff');
    grad.addColorStop(1, p.gravFlip ? '#ff6600' : '#0088ff');
    c.fillStyle = grad;
    c.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    // Border
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.strokeRect(-p.w/2, -p.h/2, p.w, p.h);
    // Inner icon
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(-4, -4, 8, 8);
    c.shadowBlur = 0;
    c.restore();
  };

  const drawHUD = () => {
    const w = canvas.width;
    // Progress
    let prog;
    if (currentLevel === -1) {
      prog = 'Score: ' + score;
      progressBar.style.width = '0%';
    } else {
      prog = Math.min(100, Math.floor(player.x / levelLength * 100)) + '%';
      progressBar.style.width = prog;
    }
    // Top HUD
    c.font = '14px Rajdhani, sans-serif';
    c.fillStyle = 'rgba(0,245,255,0.7)';
    c.textAlign = 'left';
    c.shadowBlur = 6; c.shadowColor = '#00f5ff';
    const label = currentLevel === -1 ? 'INFINITE MODE' : Levels.presets[currentLevel].name.toUpperCase();
    c.fillText(label, 20, 30);
    c.textAlign = 'right';
    c.fillText(prog, w - 20, 30);
    // Speed indicator
    c.fillText('Speed: ' + player.speed.toFixed(1), w - 20, 50);
    c.shadowBlur = 0;
    // Jumps indicator
    const jc = player.maxJumps - player.jumps;
    for (let i = 0; i < player.maxJumps; i++) {
      c.fillStyle = i < jc ? '#00f5ff' : 'rgba(0,245,255,0.2)';
      c.fillRect(20 + i*16, 40, 10, 10);
    }
  };

  // ── MAIN LOOP ──
  let lastTime = 0;
  const loop = (time) => {
    const dt = time - lastTime;
    lastTime = time;

    if (state === STATE.PLAYING) {
      update();
      drawBg();
      // Draw visible objects
      const viewL = camX - 100, viewR = camX + canvas.width + 100;
      for (const obj of levelObjs) {
        const ox = obj.x, ow = obj.w || obj.size || 40;
        if (ox + ow >= viewL && ox <= viewR) drawObj(obj);
      }
      drawPlayer();
      Particles.draw(c);
      drawHUD();
    } else if (state === STATE.DEAD) {
      // Keep drawing last frame + particles
      drawBg();
      const viewL = camX - 100, viewR = camX + canvas.width + 100;
      for (const obj of levelObjs) {
        const ox = obj.x, ow = obj.w || obj.size || 40;
        if (ox + ow >= viewL && ox <= viewR) drawObj(obj);
      }
      Particles.update();
      Particles.draw(c);
    } else {
      // Menu background
      drawBg();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // ── UI EVENTS ──
  document.getElementById('btn-play-inf').addEventListener('click', () => startLevel(-1));
  document.getElementById('btn-levels').addEventListener('click', () => {
    buildLevelGrid();
    show(screenLevels);
  });
  document.getElementById('btn-back-menu').addEventListener('click', () => show(screenMenu));
  document.getElementById('btn-restart').addEventListener('click', () => startLevel(currentLevel));
  document.getElementById('btn-go-menu').addEventListener('click', () => { state=STATE.MENU; show(screenMenu); });
  document.getElementById('btn-next-level').addEventListener('click', () => {
    const next = currentLevel + 1;
    startLevel(next < Levels.presets.length ? next : 0);
  });
  document.getElementById('btn-win-menu').addEventListener('click', () => { state=STATE.MENU; show(screenMenu); });
  muteBtn.addEventListener('click', () => {
    Audio.init();
    const m = Audio.toggle();
    muteBtn.textContent = m ? '🔇' : '🔊';
    if (m) Audio.stopMusic();
    else if (state === STATE.PLAYING) Audio.startMusic();
  });

  const buildLevelGrid = () => {
    const grid = document.getElementById('level-grid');
    grid.innerHTML = '';
    Levels.presets.forEach((lv, i) => {
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      btn.style.borderColor = lv.color;
      btn.style.color = lv.color;
      btn.style.boxShadow = `0 0 12px ${lv.color}44`;
      btn.innerHTML = `<span class="lvl-num">${i+1}</span><span class="lvl-name">${lv.name}</span>`;
      btn.addEventListener('click', () => startLevel(i));
      grid.appendChild(btn);
    });
  };

  // Show menu on start
  show(screenMenu);
})();
