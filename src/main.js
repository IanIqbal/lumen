// ───────── game state ─────────
const audio = new AudioEngine();
const G = {
  state: 'title', // title → play → (fading) → finale → end → play (endless)
  t: 0, playT: 0, introT: -1,
  phase: 0, awaken: 0, endless: false, paused: false,
  motes: 0, combo: 0, bestCombo: 0, comboT: 0, closeCalls: 0, gatesPassed: 0,
  light: 72, boosting: false, surge: 0, invuln: 0,
  shake: 0, chroma: 0, flash: 0, warp: 0, skim: 0, scrapeT: 0, beat: 0,
  satR: -0.5, sat: 0.15, fade: 1,
  finT: 0, fadeT: 0, slowmo: 1,
};
const P = new V3(0, 30, 0);     // spark position
const PV = { vx: 0, vy: 0, speed: 30, roll: 0, pitch: 0, yaw: 0, dir: new V3(0, 0, -1) };
let prevZ = 0;

// ───────── input ─────────
const input = { mx: 0, my: 0, keys: new Set(), held: false, touch: null, touchStick: { x: 0, y: 0 }, lastMouse: 0, kx: 0, ky: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
const reticle = $('reticle');
addEventListener('mousemove', (e) => {
  input.mx = (e.clientX / innerWidth) * 2 - 1;
  input.my = (e.clientY / innerHeight) * 2 - 1;
  input.lastMouse = performance.now();
  reticle.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});
addEventListener('mousedown', (e) => { if (e.button === 0 && e.target === canvas) input.held = true; });
addEventListener('mouseup', () => { input.held = false; });
addEventListener('blur', () => { input.held = false; input.keys.clear(); if (G.state === 'play' || G.state === 'finale') setPaused(true); });
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { input.held = true; e.preventDefault(); }
  if (k === 'escape' || k === 'p') { if (G.state === 'play' || G.state === 'fading') setPaused(!G.paused); }
  if (k === 'm') toggleMute();
  if (k === 'f') toggleFullscreen();
  if (k === 'n' && e.shiftKey && G.state === 'play' && !G.endless && G.phase < 5) { G.motes = Math.max(G.motes, PHASES[G.phase + 1].at); } // hidden: skip ahead
  input.keys.add(k);
});
addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ') input.held = false; input.keys.delete(k); });
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  input.touch = { id: t.identifier, x: t.clientX, y: t.clientY };
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (input.touch && t.identifier === input.touch.id) {
      input.touchStick.x = clamp((t.clientX - input.touch.x) / 70, -1, 1);
      input.touchStick.y = clamp((t.clientY - input.touch.y) / 70, -1, 1);
    }
  }
  e.preventDefault();
}, { passive: false });
const endTouch = (e) => { for (const t of e.changedTouches) if (input.touch && t.identifier === input.touch.id) { input.touch = null; input.touchStick.x = input.touchStick.y = 0; } };
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
const tb = $('touchBoost');
tb.addEventListener('touchstart', (e) => { input.held = true; tb.classList.add('on'); e.preventDefault(); }, { passive: false });
tb.addEventListener('touchend', () => { input.held = false; tb.classList.remove('on'); });

function steering(dt) {
  if (window.__lumen && window.__lumen.autopilot) return autopilot();
  const k = input.keys;
  const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  const ky = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  input.kx = damp(input.kx, kx, 6, dt); input.ky = damp(input.ky, ky, 6, dt);
  if (kx || ky || Math.abs(input.kx) > 0.02 || Math.abs(input.ky) > 0.02) return { x: input.kx, y: input.ky };
  if (input.touch || isTouch) return { x: input.touchStick.x, y: -input.touchStick.y };
  const dz = (v) => (Math.abs(v) < 0.04 ? 0 : clamp((v - Math.sign(v) * 0.04) * 1.45, -1, 1));
  return { x: dz(input.mx), y: dz(-input.my) };
}

function autopilot() {
  // test-only: steer toward the nearest mote ahead, dodge shards
  let best = null, bd = 1e9;
  for (let i = 0; i < motes.max; i++) {
    if (!motes.active[i]) continue;
    const z = motes.pos[i * 3 + 2];
    if (z > P.z - 4 || z < P.z - 160) continue;
    const dx = motes.pos[i * 3] - P.x, dy = motes.pos[i * 3 + 1] - P.y, d = Math.abs(dx) + Math.abs(dy) + (P.z - z) * 0.3;
    if (d < bd) { bd = d; best = [dx, dy, P.z - z]; }
  }
  let x = 0, y = 0;
  if (best) { const tt = Math.max(best[2] / Math.max(PV.speed, 1), 0.25); x = clamp(best[0] / tt / 36, -1, 1); y = clamp(best[1] / tt / 26, -1, 1); }
  for (const s of shards.list) {
    if (!s.on || s.z > P.z || s.z < P.z - 50) continue;
    const dx = P.x - s.x; if (Math.abs(dx) < s.r + 5 && P.y < s.y + s.h) x = dx >= 0 ? 1 : -1;
  }
  return { x, y };
}

// ───────── UI helpers ─────────
const ui = {
  hud: $('hud'), phNum: $('phNum'), phName: $('phName'), phProg: $('phProg'), motes: $('motes'), combo: $('combo'), mult: $('mult'),
  lightFill: $('lightFill'), lightWrap: $('lightWrap'), hint: $('hint'), toasts: $('toasts'), story: $('storyText'),
  banner: $('banner'), bNum: $('bNum'), bName: $('bName'), bSub: $('bSub'), fade: $('fade'), msg: $('msg'),
};
let lastToast = {};
function toast(text, cls = '', key = text, cooldown = 1.2) {
  if (lastToast[key] && G.t - lastToast[key] < cooldown) return;
  lastToast[key] = G.t;
  if (ui.toasts.children.length > 4) ui.toasts.firstChild.remove();
  const d = document.createElement('div');
  d.className = 'toast ' + cls; d.textContent = text;
  d.style.marginLeft = `${rand(-40, 40)}px`;
  d.addEventListener('animationend', () => d.remove());
  ui.toasts.appendChild(d);
}
function story(text, dur) {
  ui.story.textContent = text; ui.story.classList.add('show');
  after(dur, () => ui.story.classList.remove('show'));
}
function banner(i) {
  const ph = PHASES[i];
  ui.bNum.textContent = `Chapter ${ph.roman}`; ui.bName.textContent = ph.name; ui.bSub.textContent = ph.sub;
  ui.banner.classList.add('show');
  after(5.5, () => ui.banner.classList.remove('show'));
}
function showMsg(text, dur) { ui.msg.textContent = text; ui.msg.classList.add('show'); after(dur, () => ui.msg.classList.remove('show')); }
function setFade(v, sec, col = [0, 0, 0]) {
  ui.fade.style.transition = `opacity ${sec}s ease`;
  ui.fade.style.background = `rgb(${col.join(',')})`;
  ui.fade.style.opacity = v;
}
function toggleMute() { audio.setMuted(!audio.muted); $('muteBtn').textContent = audio.muted ? '×' : '♪'; }
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}
$('muteBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
$('fsBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
function setPaused(p) {
  if (G.state !== 'play' && G.state !== 'fading' && G.state !== 'finale') return;
  G.paused = p;
  $('pause').classList.toggle('show', p);
  document.body.classList.toggle('playing', !p);
  if (p) audio.suspend(); else audio.resume();
}
$('resume').addEventListener('click', () => setPaused(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'play' || G.state === 'finale') setPaused(true); else audio.suspend(); } else if (!G.paused) audio.resume(); });

// ───────── spawning the world ahead ─────────
const SPAWN_AHEAD = 560;
const spawn = { nextMote: 0, nextShard: 0, nextGate: 0, pathX: 0, pathY: 24, recent: [] };
const PATTERNS = ['line', 'wave', 'helix', 'ring', 'arc', 'skim', 'spiral', 'cluster', 'wave', 'helix', 'skim'];

function moteAt(x, y, z, gold) {
  const g = groundAt(x, z);
  y = Math.max(y, g + 2.2);
  motes.add(x, y, z, gold);
  spawn.recent.push({ x, y, z });
}
function spawnPattern(z0) {
  const kind = G.phase === 0 && G.motes < 12 ? pick(['line', 'wave', 'arc']) : pick(PATTERNS);
  spawn.pathX = clamp(spawn.pathX + rand(-38, 38), P.x - 75, P.x + 75);
  const gx = groundAt(spawn.pathX, z0);
  spawn.pathY = clamp(lerp(spawn.pathY, gx + rand(6, 26), 0.7), WATER + 6, 120);
  const cx = spawn.pathX, cy = spawn.pathY;
  const goldChance = 0.04 + G.phase * 0.01;
  let len = 60;
  switch (kind) {
    case 'line': for (let i = 0; i < 10; i++) moteAt(cx + Math.sin(i * 0.4) * 3, cy, z0 - i * 6.5, Math.random() < goldChance); len = 65; break;
    case 'wave': for (let i = 0; i < 14; i++) moteAt(cx + Math.sin(i * 0.5) * 11, cy + Math.cos(i * 0.35) * 4, z0 - i * 6, Math.random() < goldChance); len = 84; break;
    case 'helix': for (let i = 0; i < 18; i++) { const a = i * 0.55; moteAt(cx + Math.cos(a) * 5.5, cy + Math.sin(a) * 5.5, z0 - i * 4.5, false); } len = 81; break;
    case 'ring': for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; moteAt(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, z0, false); } moteAt(cx, cy, z0, true); len = 20; break;
    case 'arc': for (let i = 0; i < 13; i++) { const u = (i - 6) / 6; moteAt(cx + u * 6, cy + (1 - u * u) * 16, z0 - i * 6, i === 6); } len = 78; break;
    case 'skim': for (let i = 0; i < 16; i++) { const x = cx + Math.sin(i * 0.3) * 6, z = z0 - i * 6; moteAt(x, groundAt(x, z) + 2.4, z, i === 15 && Math.random() < 0.5); } len = 96; break;
    case 'spiral': for (let i = 0; i < 24; i++) { const a = i * 0.45, s = i % 2 ? Math.PI : 0; moteAt(cx + Math.cos(a + s) * 7, cy + Math.sin(a + s) * 7, z0 - i * 3.5, false); } len = 84; break;
    case 'cluster': for (let i = 0; i < 11; i++) moteAt(cx + rand(-7, 7), cy + rand(-5, 5), z0 - rand(0, 14), false); moteAt(cx, cy, z0 - 7, true); len = 30; break;
  }
  return len;
}
function spawnShardCluster(z0) {
  const flank = Math.random() < 0.55;
  const side = Math.random() < 0.5 ? -1 : 1;
  const cx = flank ? spawn.pathX + side * rand(13, 26) : P.x + rand(-130, 130);
  const pts = [[cx, z0, rand(2.2, 4.2), rand(16, 46)]];
  const n = randi(1, 3);
  for (let i = 0; i < n; i++) pts.push([cx + rand(-9, 9), z0 + rand(-9, 9), rand(1, 2.4), rand(7, 22)]);
  for (const [x, z, r, h] of pts) {
    let ok = true;
    for (const m of spawn.recent) { const dx = m.x - x, dz = m.z - z; if (dx * dx + dz * dz < (r + 7) * (r + 7)) { ok = false; break; } }
    if (ok) shards.add(x, terrainH(x, z) - 1.5, z, r, h);
  }
}
function streamWorld() {
  const ahead = P.z - SPAWN_AHEAD;
  spawn.recent = spawn.recent.filter((m) => m.z < P.z + 40);
  while (spawn.nextMote > ahead) {
    const len = spawnPattern(spawn.nextMote);
    spawn.nextMote -= len + rand(30, 70);
  }
  const shardRate = G.state === 'finale' ? 0 : [0, 0.6, 1.0, 1.35, 1.6, 0][G.phase] * (G.endless ? 1.6 : 1);
  while (spawn.nextShard > ahead) {
    if (shardRate > 0) spawnShardCluster(spawn.nextShard);
    spawn.nextShard -= shardRate > 0 ? rand(60, 130) / shardRate : 120;
  }
  while (spawn.nextGate > ahead) {
    if (G.phase >= 1 && G.state !== 'finale') {
      const gy = Math.max(groundAt(spawn.pathX, spawn.nextGate) + 9, spawn.pathY);
      gates.add(spawn.pathX, gy, spawn.nextGate);
    }
    spawn.nextGate -= rand(520, 820);
  }
}

// ───────── chapters ─────────
function advancePhase() {
  G.phase++;
  const ph = G.phase;
  audio.riser(1.8);
  G.warp = 0.6;
  after(1.8, () => {
    G.slowmo = 0.28;
    audio.impact();
    audio.setPhase(ph);
    addRipple(P.x, P.z, 2.6);
    G.flash = 0.55; G.shake = 0.8; G.chroma = 1;
    grade.uniforms.uFlashCol.value.setRGB(1, 1, 1);
    G.light = Math.min(100, G.light + 40);
    banner(ph);
    fx.burst(P, 160, U.uMote.value, 45, 1.2, 2.2, { drag: 1.2 });
    if (ph === 1) { G.satR = 0.001; meteors.setRate(0.07); }
    if (ph === 2) flora.wakeAll(0.6);
    if (ph === 3) { whales.appear(P); after(4, () => audio.whale(-0.5)); after(6, () => toast('they have been waiting', 'big', 'lev', 9)); }
    if (ph === 4) { planet.rise(); meteors.setRate(1.3); }
    if (ph === 5) startFinale();
  });
}

function startFinale() {
  G.state = 'finale'; G.finT = 0;
  ui.hud.classList.remove('on');
  document.body.classList.remove('playing');
  audio.finale();
  for (let i = 0; i < shards.max; i++) if (shards.list[i].on) shards.shatter(i, U.uRim.value);
  gates.clear();
  flora.wakeAll(1.2);
  meteors.setRate(4);
  if (!whales.on) whales.appear(P);
  after(3.5, () => story('The light remembers where it came from.', 4.5));
  after(9.5, () => story('Go home, little star.', 4));
}

function finishGame() {
  G.state = 'end';
  document.body.classList.remove('playing');
  $('sMotes').textContent = G.motes;
  $('sCombo').textContent = G.bestCombo;
  $('sClose').textContent = G.closeCalls;
  const s = Math.floor(G.playT);
  $('sTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('end').classList.add('show');
  ui.hud.classList.remove('on');
  audio.setPhase(1);
}

function startEndless() {
  $('end').classList.remove('show');
  G.state = 'play'; G.endless = true; G.phase = 4; G.awaken = 4;
  audio.setPhase(4);
  P.set(P.x, groundAt(P.x, P.z) + 30, P.z);
  PV.dir.set(0, 0, -1); PV.speed = 50; PV.vx = PV.vy = 0;
  U.uMoonR.value = 0.055;
  G.light = 100; G.combo = 0; chain.reset();
  trail.reset(P);
  motes.clear(); shards.clear();
  spawn.nextMote = spawn.nextShard = P.z - 120; spawn.nextGate = P.z - 300; spawn.pathX = P.x; spawn.pathY = P.y;
  flora.init(P.x, P.z); flora.wakeAll(1);
  planet.instant(); meteors.setRate(1.3);
  risers.material.uniforms.uBright.value = 0.45;
  if (!whales.on) whales.appear(P);
  G.flash = 0; G.fade = 0;
  setFade(0, 3, [255, 255, 255]);
  document.body.classList.add('playing');
  ui.hud.classList.add('on');
  ui.phNum.textContent = 'Endless'; ui.phName.textContent = 'Drift';
  after(1.5, () => { ui.bNum.textContent = 'Endless'; ui.bName.textContent = 'Drift'; ui.bSub.textContent = 'The world is awake. Fly as long as you like.'; ui.banner.classList.add('show'); after(5, () => ui.banner.classList.remove('show')); });
}

// ───────── gathering, combos, danger ─────────
function multiplier() { return G.combo >= 70 ? 5 : G.combo >= 45 ? 4 : G.combo >= 25 ? 3 : G.combo >= 10 ? 2 : 1; }
const tmpC = new THREE.Color();
function onCollect(i, x, y, z, gold) {
  const prevMult = multiplier();
  G.combo++; G.comboT = 2.8;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  G.motes += gold ? 5 : 1;
  const m = multiplier();
  G.light = Math.min(100, G.light + (gold ? 12 : 2.2 + m * 0.5));
  const pan = clamp((x - P.x) / 12, -1, 1);
  const p = new V3(x, y, z);
  if (gold) {
    audio.gold(pan);
    fx.burst(p, 60, U.uGold.value, 22, 1.0, 1.6, { inherit: new V3(0, 0, -PV.speed * 0.85), drag: 1.5 });
    addRipple(x, z, 0.9);
    G.flash = Math.max(G.flash, 0.12);
    grade.uniforms.uFlashCol.value.setRGB(1, 0.9, 0.7);
    toast('radiant', 'gold', 'gold', 0.5);
  } else {
    audio.pluck(G.combo - 1, pan);
    fx.burst(p, 14, U.uMote.value, 14, 0.6, 0.9, { inherit: new V3(0, 0, -PV.speed * 0.85), drag: 1.5 });
  }
  chain.add(p, U.uTime.value);
  ui.combo.classList.add('bump'); setTimeout(() => ui.combo.classList.remove('bump'), 120);
  if (m > prevMult) { toast(`chain ×${m}`, 'gold big', 'mult' + m, 3); fx.burst(P, 50, U.uGold.value, 20, 0.8, 1.2, { inherit: new V3(0, 0, -PV.speed * 0.85), drag: 1.5 }); }
}

function hurt(amount, label) {
  if (G.invuln > 0) return;
  G.light -= amount; G.invuln = 1.1;
  G.shake = 1; G.chroma = 1.4; G.flash = 0.25;
  grade.uniforms.uFlashCol.value.setRGB(1.0, 0.1, 0.25);
  if (G.combo >= 5) toast(`chain broken · ${G.combo}`, 'bad', 'broken', 1);
  G.combo = 0; chain.reset();
  toast(label, 'bad', label, 1);
  audio.hit();
  fx.burst(P, 40, U.uRim.value, 26, 0.7, 1.0);
}

function checkShards(dt) {
  for (let i = 0; i < shards.max; i++) {
    const s = shards.list[i];
    if (!s.on) continue;
    if (s.z > P.z + 40) { shards.remove(i); continue; }
    if (Math.abs(s.z - P.z) > s.r + 6) continue;
    const y = P.y - s.y;
    if (y < 0 || y > s.h) continue;
    const rr = s.r * (1 - y / s.h) * 0.9;
    const dx = P.x - s.x, dz = P.z - s.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < rr + 0.55) {
      hurt(22, 'the void bites');
      PV.vx += Math.sign(dx || 1) * 30;
      shards.shatter(i, U.uRim.value);
    } else if (!s.near && d < rr + 4.2 && G.invuln <= 0) {
      s.near = true;
      G.closeCalls++;
      G.light = Math.min(100, G.light + 4);
      toast('close call', '', 'close', 0.6);
      audio.nearMiss(clamp(-dx / 4, -1, 1));
      G.chroma = Math.max(G.chroma, 0.5);
    }
  }
}

// ───────── title / intro ─────────
function begin() {
  if (G.state !== 'title') return;
  audio.init(); audio.start(); audio.ignite();
  $('title').classList.add('gone');
  document.body.classList.add('playing');
  G.state = 'play'; G.introT = 0; G.playT = 0;
  G.light = 72;
  P.set(P.x, Math.max(P.y, groundAt(P.x, P.z) + 22), P.z);
  PV.speed = 26; PV.vx = PV.vy = 0;
  spark.visible = true; trail.mesh.visible = true; trail.reset(P);
  fx.burst(P, 220, U.uMote.value, 40, 1.0, 2.5, { drag: 1.0 });
  G.flash = 0.8; grade.uniforms.uFlashCol.value.setRGB(1, 1, 1);
  motes.clear();
  spawn.nextMote = P.z - 200; spawn.nextShard = P.z - 300; spawn.nextGate = P.z - 400; spawn.pathX = P.x; spawn.pathY = P.y;
  after(1.2, () => story('The world has gone dark.', 3.0));
  after(5.0, () => story('Its light lies scattered, sleeping.', 3.2));
  after(9.0, () => story('You are the last spark.', 3.2));
  after(13.0, () => { banner(0); ui.hud.classList.add('on'); });
  after(15.0, () => { ui.hint.innerHTML = isTouch ? 'drag to steer · hold surge · fly low to skim' : 'move the mouse to steer · hold click or space to surge · fly low to skim'; ui.hint.classList.add('show'); });
  after(24.0, () => ui.hint.classList.remove('show'));
}
$('begin').addEventListener('click', begin);
$('drift').addEventListener('click', startEndless);
$('again').addEventListener('click', () => location.reload());
addEventListener('keydown', (e) => { if (e.key === 'Enter' && G.state === 'title' && !$('begin').disabled) begin(); });

// ───────── simulation ─────────
const camTarget = new V3(), camLook = new V3(), lookTmp = new V3();
let camRoll = 0;

function updatePlay(dt) {
  G.playT += dt;
  if (G.introT >= 0) G.introT += dt;
  const st = steering(dt);
  const controlOK = G.introT > 1.5 || G.introT < 0;
  const sx = controlOK ? st.x : 0, sy = controlOK ? st.y : 0;

  // speed
  G.boosting = input.held && G.light > 4 && G.state !== 'fading';
  if (G.boosting) G.light -= 3.2 * dt;
  G.surge = Math.max(0, G.surge - dt);
  const base = 44 + G.phase * 2.5 + (G.endless ? 6 : 0);
  let target = base;
  if (G.boosting) target = base * 1.85;
  if (G.surge > 0) target = Math.max(target, base * 2.1);
  if (G.state === 'fading') target = 14;
  if (G.introT >= 0 && G.introT < 3) target = lerp(26, base, smoothstep(0, 3, G.introT));
  PV.speed = damp(PV.speed, target, G.boosting || G.surge > 0 ? 2.5 : 1.5, dt);

  PV.vx = damp(PV.vx, sx * 36, 4.5, dt);
  PV.vy = damp(PV.vy, sy * 26, 4.5, dt);
  P.x += PV.vx * dt;
  P.y += PV.vy * dt;
  prevZ = P.z;
  P.z -= PV.speed * dt;

  // ground & ceiling
  const g = groundAt(P.x, P.z);
  const alt = P.y - g;
  const ceil = Math.max(110, g + 14);
  if (P.y > ceil) { P.y = damp(P.y, ceil, 6, dt); PV.vy = Math.min(PV.vy, 0); }
  if (alt < 1.2) {
    P.y = g + 1.2;
    if (PV.vy < 0) PV.vy = 2;
    if (G.state === 'play') {
      G.light -= 9 * dt;
      G.scrapeT -= dt;
      if (G.scrapeT <= 0) { audio.scrape(); G.scrapeT = 0.12; toast('scraping', 'bad', 'scrape', 1.5); }
      G.shake = Math.max(G.shake, 0.35);
      tmpC.setRGB(2, 0.9, 0.4);
      for (let k = 0; k < 3; k++) fx.spawn(P.x, P.y - 0.8, P.z, rand(-10, 10), rand(4, 14), rand(5, 20), tmpC, rand(0.2, 0.5), rand(0.3, 0.7), 2, 25);
    }
  }
  const skimNow = alt < 6 && G.state === 'play';
  G.skim = damp(G.skim, skimNow ? 1 : 0, 6, dt);
  if (skimNow) {
    G.light = Math.min(100, G.light + 2.0 * dt);
    G.comboT = Math.max(G.comboT, 0.6);
    toast(g <= WATER + 0.01 ? 'skimming the water' : 'skimming', '', 'skim', 4);
    const water = g <= WATER + 0.01;
    tmpC.copy(water ? U.uWater.value : U.uLine1.value).multiplyScalar(water ? 4 : 1.5);
    for (let k = 0; k < (water ? 4 : 2); k++) fx.spawn(P.x + rand(-1, 1), g + 0.2, P.z + rand(0, 2), rand(-6, 6), rand(3, water ? 16 : 8), rand(10, 25), tmpC, rand(0.25, 0.6), rand(0.4, 0.9), 2, water ? 22 : 4);
  }

  // light drains: you must keep gathering
  const introCalm = G.introT >= 0 && G.introT < 14;
  if (G.state === 'play' && !introCalm) G.light -= [0.55, 0.85, 1.0, 1.15, 1.3, 1.3][G.phase] * dt;
  G.invuln = Math.max(0, G.invuln - dt);

  // combo timeout
  G.comboT -= dt;
  if (G.comboT <= 0 && G.combo > 0) { if (G.combo >= 8) toast(`chain of ${G.combo}`, '', 'chainEnd', 1); G.combo = 0; chain.reset(); }

  streamWorld();
  motes.update(dt, P, 7 + multiplier() * 0.6, 2.1, onCollect);
  gates.update(dt, P, prevZ, U.uMote.value, (gt) => {
    G.surge = 2.6; G.gatesPassed++;
    G.light = Math.min(100, G.light + 14);
    G.flash = Math.max(G.flash, 0.18); G.warp = 0.5;
    grade.uniforms.uFlashCol.value.setRGB(1, 1, 1);
    addRipple(gt.grp.position.x, gt.grp.position.z, 1.4);
    fx.burst(gt.grp.position, 90, U.uMote.value, 30, 0.9, 1.4);
    audio.gate();
    toast('surge', 'big', 'gate', 0.5);
  });
  if (G.state === 'play') checkShards(dt);

  // chapter progress
  if (!G.endless && G.state === 'play' && G.phase < 5 && G.motes >= PHASES[G.phase + 1].at) advancePhase();

  // running out of light
  if (G.state === 'play' && G.light <= 0) {
    G.light = 0; G.state = 'fading'; G.fadeT = 0;
    G.combo = 0; chain.reset();
    showMsg('Your light flickers…', 2.4);
    after(2.6, () => showMsg('…but it does not go out.', 2.6));
  }
  if (G.state === 'fading') {
    G.fadeT += dt;
    G.fade = smoothstep(0, 2, G.fadeT) * 0.85 * (1 - smoothstep(4.2, 6, G.fadeT));
    if (G.fadeT > 4 && G.fadeT - dt <= 4) {
      for (let i = 0; i < shards.max; i++) if (shards.list[i].on && shards.list[i].z < P.z + 20 && shards.list[i].z > P.z - 260) shards.remove(i);
      G.light = 60; G.invuln = 3;
      fx.burst(P, 160, U.uMote.value, 35, 1.0, 2);
      audio.ignite();
    }
    if (G.fadeT > 6) { G.state = 'play'; G.fade = 0; }
  }
  G.light = Math.max(0, G.light);
}

const FIN_DIR = new V3(), FIN_UP = new V3(0, 0.22, 0);
function updateFinale(dt) {
  G.finT += dt;
  G.playT += dt;
  const T = G.finT;
  const st = steering(dt);
  // bend course toward the moon and climb
  const toMoon = U.uMoonDir.value;
  const k = smoothstep(0.5, 7, T);
  PV.dir.set(0, 0.05, -1).normalize().lerp(FIN_DIR.copy(toMoon).add(FIN_UP).normalize(), k).normalize();
  PV.speed = damp(PV.speed, lerp(60, 190, smoothstep(2, 14, T)), 0.8, dt);
  PV.vx = damp(PV.vx, st.x * 20, 3, dt);
  PV.vy = damp(PV.vy, st.y * 14, 3, dt);
  prevZ = P.z;
  P.addScaledVector(PV.dir, PV.speed * dt);
  P.x += PV.vx * dt; P.y += PV.vy * dt;
  const g = groundAt(P.x, P.z);
  if (P.y < g + 4) P.y = g + 4;
  G.light = Math.min(100, G.light + 20 * dt);
  motes.update(dt, P, 14, 3, onCollect);
  // the moon grows until it fills the sky
  U.uMoonR.value = lerp(0.055, 1.6, Math.pow(smoothstep(6, 17, T), 2.2));
  risers.material.uniforms.uBright.value = smoothstep(0, 4, T) * 1.4;
  G.warp = Math.max(G.warp, smoothstep(10, 16, T) * 0.8);
  if (T > 14.5 && T - dt <= 14.5) setFade(1, 3, [255, 252, 245]);
  if (T > 18 && T - dt <= 18) finishGame();
}

function updateTitle(dt) {
  // a slow, quiet drift over the dark land behind the title
  P.z -= 22 * dt;
  P.x = Math.sin(G.t * 0.05) * 60;
  const g = groundAt(P.x, P.z - 60);
  P.y = damp(P.y, Math.max(g, groundAt(P.x, P.z)) + 26, 0.8, dt);
  PV.speed = 22;
  if (spawn.nextMote > P.z - SPAWN_AHEAD) { spawn.pathX = P.x; spawn.pathY = P.y - 4; streamWorld(); }
  motes.update(dt, P, 0, 0, () => {});
}

function updateCamera(dt) {
  const finale = G.state === 'finale' || G.state === 'end';
  if (G.state === 'title') {
    camTarget.set(P.x, P.y + 3, P.z + 12);
    camera.position.lerp(camTarget, 1 - Math.exp(-3 * dt));
    camLook.set(P.x + Math.sin(G.t * 0.07) * 20, P.y + 2 + Math.sin(G.t * 0.1) * 4, P.z - 100);
    camera.lookAt(camLook);
    camera.fov = 62;
  } else {
    const speedN = clamp((PV.speed - 40) / 60, 0, 1);
    const back = 10.5 + speedN * 4 + G.skim * -1.5;
    const up = 2.8 - G.skim * 0.9;
    if (finale) {
      camTarget.copy(P).addScaledVector(PV.dir, -back).add(new V3(0, up, 0));
    } else {
      camTarget.set(P.x - PV.vx * 0.12, P.y + up - PV.vy * 0.05, P.z + back);
    }
    const intro = G.introT >= 0 && G.introT < 3.5 ? 1 - smoothstep(0, 3.5, G.introT) : 0;
    if (intro > 0) camTarget.add(new V3(0, 6 * intro, 14 * intro));
    camera.position.x = damp(camera.position.x, camTarget.x, 5, dt);
    camera.position.y = damp(camera.position.y, camTarget.y, 5, dt);
    camera.position.z = finale ? damp(camera.position.z, camTarget.z, 6, dt) : damp(camera.position.z, camTarget.z, 12, dt);
    const cg = groundAt(camera.position.x, camera.position.z) + 1.4;
    if (camera.position.y < cg) camera.position.y = cg;
    if (finale) camLook.copy(P).addScaledVector(PV.dir, 40).add(new V3(0, 1, 0));
    else camLook.set(P.x + PV.vx * 0.35, P.y + 0.6 + PV.vy * 0.25, P.z - 30);
    camera.lookAt(camLook);
    camRoll = damp(camRoll, -PV.vx * 0.0045, 4, dt);
    camera.rotateZ(camRoll);
    camera.fov = damp(camera.fov, 64 + speedN * 20 + G.surge * 2 + (finale ? smoothstep(4, 14, G.finT) * 14 : 0), 3, dt);
  }
  if (G.shake > 0) {
    const s = G.shake * G.shake * 0.35;
    camera.position.add(new V3(rand(-s, s), rand(-s, s), rand(-s, s)));
    G.shake = Math.max(0, G.shake - dt * 1.8);
  }
  camera.updateProjectionMatrix();
}

function updateSpark(dt) {
  spark.position.copy(P);
  PV.roll = damp(PV.roll, -PV.vx * 0.025, 5, dt);
  const lightK = clamp(G.light / 100, 0, 1);
  const flick = G.light < 20 ? 0.6 + 0.4 * Math.sin(G.t * 23) * Math.sin(G.t * 7.3) : 1;
  const pulse = 1 + 0.06 * Math.sin(G.t * 5) + G.beat * 0.08;
  const glow = (0.45 + 0.55 * lightK) * flick * pulse;
  halo1.scale.setScalar(2.4 * glow + G.skim * 0.8);
  halo2.scale.setScalar(7 * glow + (G.boosting ? 2.5 : 0));
  halo2.material.opacity = 0.16 * glow;
  halo1.material.color.copy(U.uTrailHead.value).multiplyScalar(0.8);
  halo2.material.color.copy(U.uGlow.value).multiplyScalar(2);
  flare.material.rotation = G.t * 0.25 + PV.roll;
  flare.scale.setScalar(4.2 * glow * (1 + (G.boosting || G.surge > 0 ? 0.5 : 0)));
  sparkCoreMat.color.setRGB(3, 3.2, 3.6).multiplyScalar(glow);
  const n = Math.min(3, multiplier() - 1 + (G.combo > 0 ? 1 : 0));
  orbiters.forEach((o, i) => {
    const a = G.t * 3 + (i / 3) * TAU;
    o.visible = i < n;
    o.position.set(Math.cos(a) * 1.3, Math.sin(a * 1.3) * 0.5, Math.sin(a) * 1.3);
  });
  // sparkle dust shed by the spark
  if (spark.visible && Math.random() < dt * (20 + PV.speed * 0.6)) {
    fx.spawn(P.x + rand(-0.3, 0.3), P.y + rand(-0.3, 0.3), P.z + rand(0, 0.6), rand(-2, 2), rand(-2, 2), rand(2, 8), U.uTrailHead.value, rand(0.12, 0.3), rand(0.6, 1.4), 1.2, -1);
  }
  const trailW = 0.55 + (G.boosting || G.surge > 0 ? 0.35 : 0) + G.skim * 0.2;
  trail.mat.uniforms.uIntensity.value = 0.6 + 0.5 * lightK;
  trail.update(P, camera.position, trailW, dt);
}

// ───────── HUD ─────────
let hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }
function updateHUD() {
  if (G.state === 'title') return;
  if (!G.endless) {
    const ph = PHASES[G.phase];
    setText(ui.phNum, 'num', `Chapter ${ph.roman}`);
    setText(ui.phName, 'name', ph.name);
    const next = PHASES[G.phase + 1];
    const prog = next ? clamp((G.motes - ph.at) / (next.at - ph.at), 0, 1) : 1;
    ui.phProg.style.width = `${(prog * 100).toFixed(1)}%`;
  }
  setText(ui.motes, 'motes', String(G.motes));
  const cv = G.combo >= 3 ? `chain <b>${G.combo}</b>` : '';
  if (hudCache.combo !== cv) { hudCache.combo = cv; ui.combo.innerHTML = cv; }
  const m = multiplier();
  setText(ui.mult, 'mult', m > 1 ? `×${m} radiance` : '');
  ui.lightFill.style.width = `${clamp(G.light, 0, 100).toFixed(1)}%`;
  const low = G.light < 25;
  if (hudCache.low !== low) { hudCache.low = low; ui.lightWrap.classList.toggle('low', low); }
}

// ───────── main loop ─────────
const clock = new THREE.Clock();
let frameAvg = 16, qualityT = 0;
const flora_base = [0, 0.04, 0.42, 0.5, 0.62, 0.9];
const flora_cap = [0.32, 0.6, 1, 1, 1, 1.1];

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 1 / 20);

  // adaptive resolution keeps things smooth on slower machines (ignores throttled/background frames)
  if (rawDt < 0.1 && !document.hidden) {
    frameAvg = lerp(frameAvg, rawDt * 1000, 0.05);
    qualityT += rawDt;
    if (qualityT > 2.5 && !G.paused) {
      qualityT = 0;
      if (frameAvg > 24 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); resize(); }
      else if (frameAvg < 13 && pixelRatio < MAX_PR) { pixelRatio = Math.min(MAX_PR, pixelRatio + 0.1); resize(); }
    }
  }
  tick(dt);
  composer.render();
}

function tick(dt) {
  if (G.slowmo < 1) { G.slowmo = Math.min(1, G.slowmo + dt * 0.55); dt *= G.slowmo; }
  if (!G.paused) {
    G.t += dt; gameClock += dt;
    U.uTime.value = G.t;
    runTimers();

    if (G.state === 'title') updateTitle(dt);
    else if (G.state === 'play' || G.state === 'fading') updatePlay(dt);
    else if (G.state === 'finale') updateFinale(dt);

    // palette follows the chapter
    const targetAwaken = G.endless ? 4 : G.phase;
    G.awaken = damp(G.awaken, targetAwaken, 0.45, dt);
    if (Math.abs(G.awaken - targetAwaken) < 0.002) G.awaken = targetAwaken;
    applyPalette(G.awaken);

    // the world reacting to the music
    if (audio.ctx) {
      const now = audio.now();
      while (audio.beats.length && audio.beats[0].t <= now) { G.beat = Math.max(G.beat, audio.beats.shift().v); }
    }
    G.beat = Math.max(0, G.beat - dt * 3.5);
    U.uBeat.value = G.beat * smoothstep(0.5, 2.5, G.awaken);

    U.uPlayer.value.copy(P);
    U.uSkim.value = G.skim;
    updateTerrain(P.x, P.z);
    sky.position.copy(camera.position);

    if (G.state !== 'title') updateSpark(dt);
    updateCamera(dt);

    const ph = Math.min(Math.round(G.awaken), 5);
    flora.update(dt, P, camera.position.z, G.endless ? 1 : flora_base[ph], G.phase === 0 ? 30 : 70, G.endless ? 1 : flora_cap[ph]);
    whales.update(dt, G.t, P, G.state === 'finale' || G.state === 'end', (pan) => audio.whale(pan));
    planet.update(dt, camera.position);
    meteors.update(dt, camera.position);
    fx.update(dt);
    const surgeAmt = clamp((PV.speed - 60) / 40, 0, 1) * (G.state === 'title' ? 0 : 1);
    streaks.update(dt, camera.position, PV.speed, surgeAmt, U.uTrailHead.value);

    dust.material.uniforms.uCam.value.copy(camera.position);
    risers.material.uniforms.uCam.value.copy(camera.position);
    U.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    // post
    const gu = grade.uniforms;
    G.flash = Math.max(0, G.flash - dt * 1.6);
    G.chroma = Math.max(0, G.chroma - dt * 1.4);
    G.warp = Math.max(0, G.warp - dt * 0.5);
    if (G.satR > 0 && G.satR < 3) G.satR += dt * 0.7;
    gu.uTime.value = G.t;
    gu.uFlash.value = G.flash;
    gu.uChroma.value = G.chroma + surgeAmt * 0.35;
    gu.uSatR.value = G.satR;
    gu.uSat.value = G.phase >= 1 && G.satR >= 3 ? 1 : 0.18;
    gu.uWarp.value = G.warp + surgeAmt * 0.3;
    gu.uFade.value = G.fade;
    gu.uVig.value = 0.5 + (G.light < 25 && G.state === 'play' ? 0.3 * (1 - G.light / 25) : 0);
    bloom.strength = 0.85 + G.beat * 0.12 + G.flash * 0.6 + (G.state === 'finale' ? smoothstep(5, 15, G.finT) * 0.45 : 0);

    audio.update(clamp((PV.speed - 20) / 90, 0, 1), G.skim, G.boosting || G.surge > 0 ? 1 : 0, G.state === 'finale' || G.state === 'end' ? 100 : G.light);
    updateHUD();
  }
}

// debug/test hook (harmless for players): lets the game be stepped and auto-flown
window.__lumen = {
  G, P, PV, U, audio, motes, shards, whales, renderer, composer, input, bloom, grade, scene, camera, spark, terrain, fx, flora, planet, applyPalette,
  autopilot: false,
  sim(sec, step = 1 / 60) { for (let t = 0; t < sec; t += step) tick(step); },
  timeRender(n = 10) {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) composer.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return (performance.now() - t0) / n;
  },
  begin, setPR(v) { pixelRatio = v; resize(); },
};

// ───────── boot ─────────
P.set(0, groundAt(0, 0) + 26, 0);
camera.position.set(0, P.y + 3, 12);
flora.init(P.x, P.z);
spawn.nextMote = P.z - 150; spawn.nextShard = P.z - 9e9; spawn.nextGate = P.z - 9e9;
// warm up the shaders while the title fades in
composer.render();
$('loading').classList.add('gone');
const btn = $('begin');
btn.disabled = false; btn.textContent = 'Begin';
setFade(0, 3);
G.fade = 0;
frame();
