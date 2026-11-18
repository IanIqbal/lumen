// ───────── generic particle bursts (CPU simulated, GPU drawn) ─────────
class Particles {
  constructor(max) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max); this.size = new Float32Array(max); this.size0 = new Float32Array(max);
    this.life = new Float32Array(max); this.life0 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const g = (this.geo = new THREE.BufferGeometry());
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', mk(this.pos, 3)); g.setAttribute('aColor', mk(this.col, 3));
    g.setAttribute('aAlpha', mk(this.alpha, 1)); g.setAttribute('aSize', mk(this.size, 1));
    this.points = new THREE.Points(g, mkMat(PART_VS, PART_FS, ADD));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, c, size, life, drag = 1.5, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.size0[i] = size; this.size[i] = size; this.alpha[i] = 1;
    this.life[i] = life; this.life0[i] = life; this.drag[i] = drag; this.grav[i] = grav;
  }
  burst(p, n, c, speed, size, life, opts = {}) {
    const { drag = 2, grav = 0, inherit = null, spread = 1 } = opts;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - u * u), sp = speed * (0.3 + Math.random() * 0.7);
      let vx = Math.cos(a) * s * sp * spread, vy = u * sp, vz = Math.sin(a) * s * sp * spread;
      if (inherit) { vx += inherit.x; vy += inherit.y; vz += inherit.z; }
      this.spawn(p.x, p.y, p.z, vx, vy, vz, c, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), drag, grav);
    }
  }
  _copy(d, s) {
    const d3 = d * 3, s3 = s * 3;
    for (let k = 0; k < 3; k++) { this.pos[d3 + k] = this.pos[s3 + k]; this.vel[d3 + k] = this.vel[s3 + k]; this.col[d3 + k] = this.col[s3 + k]; }
    this.alpha[d] = this.alpha[s]; this.size[d] = this.size[s]; this.size0[d] = this.size0[s];
    this.life[d] = this.life[s]; this.life0[d] = this.life0[s]; this.drag[d] = this.drag[s]; this.grav[d] = this.grav[s];
  }
  update(dt) {
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; if (i !== this.n) this._copy(i, this.n); continue; }
      const i3 = i * 3, dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = this.life[i] / this.life0[i];
      this.alpha[i] = k * k * (3 - 2 * k);
      this.size[i] = this.size0[i] * (0.35 + 0.65 * k);
      i++;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aAlpha.needsUpdate = a.aSize.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}
const fx = new Particles(5000);

// ───────── glow textures ─────────
function makeGlowTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'flare') {
    g.translate(128, 128);
    for (const [w, a, len] of [[2.5, 1, 128], [1.2, 0.9, 128]]) {
      for (let r = 0; r < 2; r++) {
        const gr = g.createLinearGradient(-len, 0, len, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(-len, -w, len * 2, w * 2);
        g.rotate(Math.PI / 2);
      }
      g.rotate(Math.PI / 4);
    }
  } else {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.6)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}
const TEX_GLOW = makeGlowTexture('glow');
const TEX_FLARE = makeGlowTexture('flare');

// ───────── the spark (player) ─────────
const spark = new THREE.Group();
const sparkCoreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3, 3.2, 3.6) });
const sparkCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 3), sparkCoreMat);
const sprite = (tex, scale, op) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1, 1, 1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
  s.scale.setScalar(scale);
  return s;
};
const halo1 = sprite(TEX_GLOW, 5, 0.7), halo2 = sprite(TEX_GLOW, 18, 0.2), flare = sprite(TEX_FLARE, 9, 0.45);
spark.add(sparkCore, halo1, halo2, flare);
const orbiters = [];
for (let i = 0; i < 3; i++) {
  const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), sparkCoreMat);
  const h = sprite(TEX_GLOW, 1.1, 0.8); o.add(h);
  spark.add(o); orbiters.push(o);
}
spark.visible = false;
scene.add(spark);

// ───────── ribbon trail ─────────
class Trail {
  constructor(n) {
    this.n = n; this.pts = Array.from({ length: n }, () => new V3()); this.acc = 0;
    const g = (this.geo = new THREE.BufferGeometry());
    this.posArr = new Float32Array(n * 2 * 3);
    const aT = new Float32Array(n * 2), aSide = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) { aT[i * 2] = aT[i * 2 + 1] = i / (n - 1); aSide[i * 2] = -1; aSide[i * 2 + 1] = 1; }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    this.fade = new Float32Array(n * 2);
    g.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = mkMat(TRAIL_VS, TRAIL_FS, Object.assign({ side: THREE.DoubleSide }, ADD), { uIntensity: { value: 1 } });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  reset(p) { for (const q of this.pts) q.copy(p); }
  update(head, cam, width, dt) {
    this.acc += dt;
    const stepT = 1 / 60;
    while (this.acc >= stepT) {
      this.acc -= stepT;
      const last = this.pts.pop(); last.copy(head); this.pts.unshift(last);
    }
    this.pts[0].copy(head);
    const tan = new V3(), view = new V3(), side = new V3();
    for (let i = 0; i < this.n; i++) {
      const a = this.pts[Math.max(i - 1, 0)], b = this.pts[Math.min(i + 1, this.n - 1)];
      tan.subVectors(a, b); if (tan.lengthSq() < 1e-6) tan.set(0, 0, -1);
      view.subVectors(cam, this.pts[i]);
      side.crossVectors(tan, view).normalize();
      const al = Math.abs(tan.normalize().dot(view.normalize()));
      this.fade[i * 2] = this.fade[i * 2 + 1] = 1 - smoothstep(0.8, 0.985, al);
      const t = i / (this.n - 1);
      const w = width * Math.pow(1 - t, 0.7) * smoothstep(0, 0.04, t + 0.01);
      const p = this.pts[i], k = i * 6;
      this.posArr[k] = p.x - side.x * w; this.posArr[k + 1] = p.y - side.y * w; this.posArr[k + 2] = p.z - side.z * w;
      this.posArr[k + 3] = p.x + side.x * w; this.posArr[k + 4] = p.y + side.y * w; this.posArr[k + 5] = p.z + side.z * w;
    }
    this.geo.attributes.position.needsUpdate = this.geo.attributes.aFade.needsUpdate = true;
  }
}
const trail = new Trail(120);
trail.mesh.visible = false;

// ───────── constellation lines between consecutively gathered motes ─────────
const chain = (() => {
  const MAX = 96;
  const pos = new Float32Array(MAX * 2 * 3), birth = new Float32Array(MAX * 2).fill(-99);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(g, mkMat(CHAIN_VS, CHAIN_FS, ADD));
  lines.frustumCulled = false;
  scene.add(lines);
  let i = 0, last = null, lastT = -9;
  return {
    add(p, t) {
      if (last && t - lastT < 2.6 && last.distanceTo(p) < 70) {
        const k = i * 6;
        pos[k] = last.x; pos[k + 1] = last.y; pos[k + 2] = last.z; pos[k + 3] = p.x; pos[k + 4] = p.y; pos[k + 5] = p.z;
        birth[i * 2] = birth[i * 2 + 1] = t;
        g.attributes.position.needsUpdate = g.attributes.aBirth.needsUpdate = true;
        i = (i + 1) % MAX;
      }
      last = (last || new V3()).copy(p); lastT = t;
    },
    reset() { last = null; },
  };
})();

// ───────── motes: the scattered light ─────────
class Motes {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.type = new Float32Array(max); this.seed = new Float32Array(max);
    this.active = new Uint8Array(max); this.free = [];
    for (let i = max - 1; i >= 0; i--) { this.free.push(i); this.seed[i] = Math.random(); this.pos[i * 3 + 1] = -9999; }
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aType', new THREE.BufferAttribute(this.type, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.points = new THREE.Points(g, mkMat(MOTE_VS, MOTE_FS, ADD));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmp = new V3();
  }
  add(x, y, z, gold = false) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.active[i] = 1; this.alpha[i] = 0; this.type[i] = gold ? 1 : 0;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    return i;
  }
  kill(i) { this.active[i] = 0; this.alpha[i] = 0; this.pos[i * 3 + 1] = -9999; this.free.push(i); }
  clear() { for (let i = 0; i < this.max; i++) if (this.active[i]) this.kill(i); }
  // returns list of collected [index, x, y, z, gold]
  update(dt, P, magnetR, collectR, onCollect) {
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i]) continue;
      const i3 = i * 3;
      let x = this.pos[i3], y = this.pos[i3 + 1], z = this.pos[i3 + 2];
      if (z > P.z + 30) { this.kill(i); continue; }
      this.alpha[i] = Math.min(1, this.alpha[i] + dt * 1.5);
      const dx = P.x - x, dy = P.y - y, dz = P.z - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < magnetR) {
        const pull = (1 - d / magnetR) * 60 + 20;
        const k = Math.min(1, (pull * dt) / Math.max(d, 0.001));
        x += dx * k; y += dy * k; z += dz * k;
        this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      }
      if (d < collectR) { onCollect(i, x, y, z, this.type[i] > 0.5); this.kill(i); }
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aAlpha.needsUpdate = a.aType.needsUpdate = true;
  }
}
const motes = new Motes(700);

// ───────── void shards: hazards ─────────
const shardGeo = (() => {
  const g = new THREE.ConeGeometry(1, 1, 5, 1).toNonIndexed();
  g.translate(0, 0.5, 0);
  g.computeVertexNormals();
  return g;
})();
class Shards {
  constructor(max) {
    this.max = max;
    this.list = Array.from({ length: max }, () => ({ on: false, x: 0, y: 0, z: 0, r: 1, h: 1, near: false }));
    this.scaleArr = new Float32Array(max * 3).fill(1);
    const seeds = new Float32Array(max).map(() => Math.random());
    shardGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(this.scaleArr, 3).setUsage(THREE.DynamicDrawUsage));
    shardGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.mesh = new THREE.InstancedMesh(shardGeo, mkMat(SHARD_VS, SHARD_FS), max);
    this.mesh.frustumCulled = false;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new V3(); this.p = new V3();
    for (let i = 0; i < max; i++) this._hide(i);
    scene.add(this.mesh);
  }
  _hide(i) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); }
  add(x, y, z, r, h) {
    const i = this.list.findIndex((s) => !s.on);
    if (i < 0) return;
    const s = this.list[i];
    Object.assign(s, { on: true, x, y, z, r, h, near: false });
    this.e.set(rand(-0.08, 0.08), rand(0, TAU), rand(-0.08, 0.08));
    this.q.setFromEuler(this.e);
    this.s.set(r, h, r);
    this.m.compose(this.p.set(x, y, z), this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.scaleArr[i * 3] = r; this.scaleArr[i * 3 + 1] = h; this.scaleArr[i * 3 + 2] = r;
    shardGeo.attributes.aScale.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  remove(i) { this.list[i].on = false; this._hide(i); this.mesh.instanceMatrix.needsUpdate = true; }
  shatter(i, col) {
    const s = this.list[i];
    for (let k = 0; k < 40; k++) {
      const yy = s.y + Math.random() * s.h * 0.9;
      fx.spawn(s.x + rand(-1, 1) * s.r * 0.6, yy, s.z + rand(-1, 1) * s.r * 0.6, rand(-14, 14), rand(-4, 18), rand(-14, 14), col, rand(0.4, 1.1), rand(0.8, 1.8), 1.2, 9);
    }
    this.remove(i);
  }
  cull(zLimit) { for (let i = 0; i < this.max; i++) if (this.list[i].on && this.list[i].z > zLimit) this.remove(i); }
  clear() { for (let i = 0; i < this.max; i++) if (this.list[i].on) this.remove(i); }
}
const shards = new Shards(110);

// ───────── gates of light ─────────
class Gates {
  constructor(n) {
    this.items = [];
    const torus = new THREE.TorusGeometry(7, 0.3, 12, 96), disc = new THREE.CircleGeometry(7, 64);
    for (let i = 0; i < n; i++) {
      const loc = { uCol: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: 0 }, uAlpha: { value: 0 } };
      const ring = new THREE.Mesh(torus, mkMat(GATE_VS, GATE_FS, ADD, loc));
      const mem = new THREE.Mesh(disc, mkMat(GATE_VS, MEMBRANE_FS, Object.assign({ side: THREE.DoubleSide }, ADD), loc));
      const grp = new THREE.Group(); grp.add(ring, mem); grp.visible = false;
      scene.add(grp);
      this.items.push({ grp, loc, on: false, passed: false, t: 0 });
    }
  }
  add(x, y, z) {
    const g = this.items.find((it) => !it.on);
    if (!g) return;
    g.on = true; g.passed = false; g.t = 0; g.grp.visible = true; g.grp.position.set(x, y, z); g.grp.scale.setScalar(1);
    g.loc.uFlash.value = 0; g.loc.uAlpha.value = 0;
  }
  update(dt, P, prevZ, palCol, onPass) {
    for (const g of this.items) {
      if (!g.on) continue;
      g.t += dt;
      g.loc.uCol.value.copy(palCol);
      const p = g.grp.position;
      if (!g.passed) {
        g.loc.uAlpha.value = Math.min(1, g.loc.uAlpha.value + dt * 0.8);
        g.grp.rotation.z += dt * 0.3;
        if (prevZ >= p.z && P.z < p.z) {
          const dx = P.x - p.x, dy = P.y - p.y;
          if (dx * dx + dy * dy < 7.6 * 7.6) { g.passed = true; g.t = 0; onPass(g); }
        }
        if (P.z < p.z - 30) { g.on = false; g.grp.visible = false; }
      } else {
        g.loc.uFlash.value = Math.max(0, 1 - g.t * 1.5);
        g.grp.scale.setScalar(1 + g.t * 2.5);
        g.loc.uAlpha.value = Math.max(0, 1 - g.t * 1.2);
        if (g.t > 1) { g.on = false; g.grp.visible = false; }
      }
    }
  }
  clear() { for (const g of this.items) { g.on = false; g.grp.visible = false; } }
}
const gates = new Gates(5);

// ───────── flora: stalks with glowing bulbs that wake as you pass ─────────
class Flora {
  constructor(n) {
    this.n = n;
    this.items = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, h: 1, s: 1, lit: 0, sticky: 0, flash: 0, lean: 0, rot: 0 }));
    const stalkG = new THREE.CylinderGeometry(0.06, 0.16, 1, 5, 4); stalkG.translate(0, 0.5, 0);
    const bulbG = new THREE.IcosahedronGeometry(1, 1);
    this.lit = new Float32Array(n); const seeds = new Float32Array(n).map(() => Math.random());
    const litAttr = new THREE.InstancedBufferAttribute(this.lit, 1).setUsage(THREE.DynamicDrawUsage);
    const seedAttr = new THREE.InstancedBufferAttribute(seeds, 1);
    stalkG.setAttribute('aLit', litAttr); stalkG.setAttribute('aSeed', seedAttr);
    bulbG.setAttribute('aLit', litAttr); bulbG.setAttribute('aSeed', seedAttr);
    this.litAttr = litAttr;
    this.stalks = new THREE.InstancedMesh(stalkG, mkMat(FLORA_VS, STALK_FS), n);
    this.bulbs = new THREE.InstancedMesh(bulbG, mkMat(FLORA_VS, BULB_FS), n);
    this.stalks.frustumCulled = this.bulbs.frustumCulled = false;
    scene.add(this.stalks, this.bulbs);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new V3(); this.sc = new V3();
  }
  place(i, px, pz, near) {
    const it = this.items[i];
    for (let tries = 0; tries < 6; tries++) {
      const x = px + rand(-380, 380), z = near ? pz - rand(-20, 820) : pz - rand(720, 860);
      const h = terrainH(x, z);
      if (h < WATER + 0.6) continue;
      const tall = Math.random() < 0.15;
      Object.assign(it, { x, z, y: h - 0.3, h: tall ? rand(10, 18) : rand(2.5, 9), s: tall ? rand(1.2, 1.9) : rand(0.35, 1.0), lit: 0, sticky: 0, flash: 0, lean: rand(-0.12, 0.12), rot: rand(0, TAU) });
      break;
    }
    this.e.set(it.lean, it.rot, it.lean * 0.5);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(it.x, it.y, it.z), this.q, this.sc.set(1, it.h, 1));
    this.stalks.setMatrixAt(i, this.m);
    const top = new V3(0, it.h, 0).applyQuaternion(this.q);
    this.m.compose(this.v.set(it.x + top.x, it.y + top.y, it.z + top.z), this.q, this.sc.setScalar(it.s));
    this.bulbs.setMatrixAt(i, this.m);
    this.dirty = true;
  }
  init(px, pz) { for (let i = 0; i < this.n; i++) this.place(i, px, pz, true); }
  update(dt, P, camZ, base, wakeR, cap) {
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (it.z > camZ + 40) { this.place(i, P.x, P.z, false); continue; }
      const dx = P.x - it.x, dz = P.z - it.z, dy = P.y - it.y;
      if (it.sticky < cap && dx * dx + dz * dz + dy * dy * 0.3 < wakeR * wakeR) { if (it.sticky < 0.5) it.flash = 1; it.sticky = cap; }
      it.flash = Math.max(0, it.flash - dt * 1.2);
      const target = Math.max(base, it.sticky);
      it.lit = damp(it.lit, target, 2.5, dt);
      this.lit[i] = it.lit + it.flash * 0.8 * cap;
    }
    this.litAttr.needsUpdate = true;
    if (this.dirty) { this.stalks.instanceMatrix.needsUpdate = this.bulbs.instanceMatrix.needsUpdate = true; this.dirty = false; }
  }
  wakeAll(level) { for (const it of this.items) { it.sticky = Math.max(it.sticky, level); it.flash = 1; } }
}
const flora = new Flora(460);

// ───────── speed streaks while surging ─────────
const streaks = (() => {
  const N = 90, pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  const items = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, s: 1 }));
  const respawn = (it, c, ahead) => {
    const a = rand(0, TAU), r = rand(3, 22);
    it.x = c.x + Math.cos(a) * r; it.y = c.y + Math.sin(a) * r * 0.7; it.z = c.z - (ahead ? rand(20, 160) : rand(0, 160)); it.s = rand(0.6, 1.4);
  };
  let init = false;
  return {
    update(dt, cam, speed, amount, tint) {
      if (!init) { items.forEach((it) => respawn(it, cam, false)); init = true; }
      for (let i = 0; i < N; i++) {
        const it = items[i];
        if (it.z > cam.z + 2) respawn(it, cam, true);
        const len = speed * 0.06 * it.s;
        const k = i * 6;
        pos[k] = it.x; pos[k + 1] = it.y; pos[k + 2] = it.z; pos[k + 3] = it.x; pos[k + 4] = it.y; pos[k + 5] = it.z - len;
        const b = amount * 0.9 * it.s;
        col[k] = col[k + 3] = tint.r * b; col[k + 1] = col[k + 4] = tint.g * b; col[k + 2] = col[k + 5] = tint.b * b;
        col[k] *= 0.2; col[k + 1] *= 0.2; col[k + 2] *= 0.2;
      }
      g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true;
      lines.visible = amount > 0.01;
    },
  };
})();
