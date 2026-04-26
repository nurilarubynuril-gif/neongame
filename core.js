/* ═══════════════════════════════════════════
   GEOBLAST — core.js
   Audio, Levels, Particles
   ═══════════════════════════════════════════ */

// ── AUDIO MODULE ──
const Audio = (() => {
  let ctx, muted = false, musicGain, sfxGain;
  const init = () => {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ctx.createGain(); musicGain.gain.value = 0.25; musicGain.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.4; sfxGain.connect(ctx.destination);
  };
  const note = (freq, dur, type = 'square', dest = sfxGain) => {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(dest);
    o.start(); o.stop(ctx.currentTime + dur);
  };
  let musicInterval = null;
  return {
    init,
    toggle() { muted = !muted; return muted; },
    isMuted() { return muted; },
    jump() { note(520, 0.12, 'sine'); note(780, 0.1, 'sine'); },
    doubleJump() { note(660, 0.1, 'sine'); setTimeout(() => note(990, 0.1, 'sine'), 50); },
    die() {
      note(200, 0.3, 'sawtooth'); note(120, 0.5, 'sawtooth');
      setTimeout(() => note(80, 0.4, 'sawtooth'), 100);
    },
    portal() { note(440, 0.15, 'sine'); note(660, 0.15, 'sine'); note(880, 0.15, 'sine'); },
    win() {
      [523,659,784,1047].forEach((f,i) => setTimeout(() => note(f, 0.25, 'sine'), i*120));
    },
    startMusic() {
      if (musicInterval) return;
      const bassNotes = [130,146,164,174,130,146,164,196];
      let idx = 0;
      musicInterval = setInterval(() => {
        if (!ctx || muted) return;
        note(bassNotes[idx % bassNotes.length], 0.18, 'triangle', musicGain);
        note(bassNotes[idx % bassNotes.length] * 2, 0.08, 'sine', musicGain);
        idx++;
      }, 220);
    },
    stopMusic() { if (musicInterval) { clearInterval(musicInterval); musicInterval = null; } }
  };
})();

// ── PARTICLES ──
class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8;
    this.life = 1; this.decay = 0.02 + Math.random() * 0.03;
    this.size = 2 + Math.random() * 4;
    this.color = color || '#00f5ff';
  }
  update() { this.x += this.vx; this.y += this.vy; this.life -= this.decay; }
  draw(c) {
    if (this.life <= 0) return;
    c.globalAlpha = this.life;
    c.shadowBlur = 10; c.shadowColor = this.color;
    c.fillStyle = this.color;
    c.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    c.shadowBlur = 0; c.globalAlpha = 1;
  }
}

const Particles = {
  list: [],
  emit(x, y, count, color) {
    for (let i = 0; i < count; i++) this.list.push(new Particle(x, y, color));
  },
  update() { this.list.forEach(p => p.update()); this.list = this.list.filter(p => p.life > 0); },
  draw(c) { this.list.forEach(p => p.draw(c)); },
  clear() { this.list = []; }
};

// ── LEVEL BUILDER ──
// Object types: 'platform','spike','moving_spike','portal','gap','pillar','moving_platform'
const Levels = (() => {
  const U = 40; // unit size
  const GROUND = 360; // ground Y

  // Section generators — each returns array of objects
  const flat = (startX, len) => [{type:'platform', x:startX, y:GROUND, w:len, h:20}];

  const spikes = (startX, count, spacing) => {
    const objs = [{type:'platform', x:startX, y:GROUND, w:count*spacing+U, h:20}];
    for (let i = 0; i < count; i++)
      objs.push({type:'spike', x:startX + i*spacing + spacing/2, y:GROUND, size:U});
    return objs;
  };

  const gap = (startX, gapW) => [
    {type:'platform', x:startX, y:GROUND, w:U*2, h:20},
    {type:'platform', x:startX + U*2 + gapW, y:GROUND, w:U*2, h:20}
  ];

  const pillars = (startX, count) => {
    const objs = [{type:'platform', x:startX, y:GROUND, w:count*U*3+U, h:20}];
    for (let i = 0; i < count; i++) {
      const h = 50 + Math.random()*60;
      objs.push({type:'pillar', x:startX+i*U*3+U, y:GROUND-h, w:U, h:h});
    }
    return objs;
  };

  const movingSpikes = (startX, count) => {
    const objs = [{type:'platform', x:startX, y:GROUND, w:count*U*3+U*2, h:20}];
    for (let i = 0; i < count; i++)
      objs.push({type:'moving_spike', x:startX+i*U*3+U, y:GROUND-U*2, size:U,
                  moveY:true, minY:GROUND-U*3, maxY:GROUND-U, speed:1.5+Math.random()});
    return objs;
  };

  const portalSection = (startX) => [
    {type:'platform', x:startX, y:GROUND, w:U*8, h:20},
    {type:'portal', x:startX+U*3, y:GROUND-U*2, w:U, h:U*2, portalType:'flip'}
  ];

  const staircase = (startX, steps, dir) => {
    const objs = [];
    for (let i = 0; i < steps; i++) {
      const py = dir === 'up' ? GROUND - (i+1)*30 : GROUND - (steps-i)*30;
      objs.push({type:'platform', x:startX + i*U*2, y:py, w:U*2, h:12});
    }
    return objs;
  };

  const movingPlatforms = (startX, count) => {
    const objs = [];
    for (let i = 0; i < count; i++)
      objs.push({type:'moving_platform', x:startX+i*U*4, y:GROUND-U*2, w:U*2.5, h:12,
                  moveY:true, minY:GROUND-U*3.5, maxY:GROUND-U, speed:1+Math.random()});
    return objs;
  };

  // Build a full level from section list
  const buildLevel = (sections) => {
    let objs = [], cx = 0;
    sections.forEach(sec => {
      let result = [];
      switch (sec[0]) {
        case 'flat':       result = flat(cx, sec[1]||U*8); cx += sec[1]||U*8; break;
        case 'spikes':     result = spikes(cx, sec[1]||3, sec[2]||U*1.8); cx += (sec[1]||3)*(sec[2]||U*1.8)+U; break;
        case 'gap':        result = gap(cx, sec[1]||U*3); cx += U*4 + (sec[1]||U*3); break;
        case 'pillars':    result = pillars(cx, sec[1]||3); cx += (sec[1]||3)*U*3+U; break;
        case 'moving':     result = movingSpikes(cx, sec[1]||2); cx += (sec[1]||2)*U*3+U*2; break;
        case 'portal':     result = portalSection(cx); cx += U*8; break;
        case 'stairs':     result = staircase(cx, sec[1]||4, sec[2]||'up'); cx += (sec[1]||4)*U*2; break;
        case 'movplat':    result = movingPlatforms(cx, sec[1]||3); cx += (sec[1]||3)*U*4; break;
      }
      objs = objs.concat(result);
    });
    return { objects: objs, totalLength: cx };
  };

  // Predefined levels
  const presets = [
    { name:'Easy', color:'#39ff14', speed:5, sections:[
      ['flat',400],['spikes',2,80],['flat',200],['gap',100],['flat',200],
      ['spikes',3,80],['flat',200],['pillars',2],['flat',200],['gap',120],
      ['flat',200],['spikes',2,80],['flat',300]
    ]},
    { name:'Medium', color:'#ffe600', speed:6, sections:[
      ['flat',300],['spikes',3,70],['gap',120],['flat',100],['moving',2],
      ['flat',200],['pillars',3],['gap',140],['spikes',4,65],['flat',200],
      ['portal'],['flat',200],['stairs',4,'up'],['spikes',2,70],['flat',300]
    ]},
    { name:'Hard', color:'#ff6600', speed:7, sections:[
      ['flat',200],['spikes',4,60],['gap',150],['moving',3],['flat',100],
      ['pillars',4],['portal'],['spikes',5,55],['gap',160],['movplat',3],
      ['moving',2],['stairs',5,'up'],['spikes',3,60],['portal'],['flat',200]
    ]},
    { name:'Insane', color:'#ff0090', speed:8, sections:[
      ['flat',200],['spikes',5,55],['moving',3],['gap',160],['pillars',5],
      ['portal'],['spikes',6,50],['movplat',4],['moving',3],['portal'],
      ['stairs',6,'up'],['gap',180],['spikes',4,50],['moving',2],['flat',200]
    ]},
    { name:'Demon', color:'#bf00ff', speed:9, sections:[
      ['flat',150],['spikes',6,50],['moving',4],['portal'],['gap',180],
      ['pillars',5],['movplat',4],['spikes',7,45],['portal'],['moving',3],
      ['stairs',7,'up'],['gap',200],['moving',3],['spikes',5,45],['portal'],
      ['flat',200]
    ]}
  ];

  // Infinite mode generator
  const infiniteSections = [
    ['flat',200],['spikes',2,75],['spikes',3,70],['gap',110],['gap',130],
    ['pillars',2],['pillars',3],['moving',1],['moving',2],['portal'],
    ['stairs',3,'up'],['stairs',4,'up'],['movplat',2],['movplat',3]
  ];

  return {
    GROUND, U, presets,
    buildLevel,
    getLevel(idx) {
      const p = presets[idx];
      const l = buildLevel(p.sections);
      return { ...l, name:p.name, color:p.color, speed:p.speed, isInfinite:false };
    },
    generateInfiniteChunk(startX, difficulty) {
      const count = 3 + Math.floor(Math.random() * 3);
      const sections = [];
      for (let i = 0; i < count; i++) {
        const pool = infiniteSections.slice(0, Math.min(infiniteSections.length, 6 + difficulty*2));
        const sec = pool[Math.floor(Math.random() * pool.length)];
        sections.push(sec);
      }
      let objs = [], cx = startX;
      sections.forEach(sec => {
        let result = [];
        switch (sec[0]) {
          case 'flat':    result = flat(cx, sec[1]||200); cx += sec[1]||200; break;
          case 'spikes':  result = spikes(cx, sec[1]||3, sec[2]||70); cx += (sec[1]||3)*(sec[2]||70)+40; break;
          case 'gap':     result = gap(cx, sec[1]||120); cx += 160 + (sec[1]||120); break;
          case 'pillars': result = pillars(cx, sec[1]||3); cx += (sec[1]||3)*120+40; break;
          case 'moving':  result = movingSpikes(cx, sec[1]||2); cx += (sec[1]||2)*120+80; break;
          case 'portal':  result = portalSection(cx); cx += 320; break;
          case 'stairs':  result = staircase(cx, sec[1]||4, sec[2]||'up'); cx += (sec[1]||4)*80; break;
          case 'movplat': result = movingPlatforms(cx, sec[1]||3); cx += (sec[1]||3)*160; break;
        }
        objs = objs.concat(result);
      });
      return { objects: objs, endX: cx };
    }
  };
})();
