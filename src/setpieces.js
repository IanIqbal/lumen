// ───────── leviathans: whales woven from light ─────────
function makeWhaleGeometry(n, L) {
  const pos = new Float32Array(n * 3), aT = new Float32Array(n), aFin = new Float32Array(n), aRnd = new Float32Array(n);
  const bodyR = (t) => 0.12 * Math.pow(Math.sin(Math.PI * clamp(t * 0.88 + 0.06, 0, 1)), 0.65) * (1 - 0.55 * t);
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let x = 0, y = 0, z = 0, fin = 0;
    if (r < 0.64) { // body surface
      const t = Math.pow(Math.random(), 0.9), rad = bodyR(t) * L, th = Math.random() * TAU, k = 0.93 + Math.random() * 0.07;
      x = Math.cos(th) * rad * k; y = Math.sin(th) * rad * 0.82 * k; if (y < 0) y *= 0.85; z = t * L;
    } else if (r < 0.73) { // throat grooves
      const t = 0.03 + Math.random() * 0.45, rad = bodyR(t) * L, th = -Math.PI / 2 + randi(-4, 4) * 0.13;
      x = Math.cos(th) * rad; y = Math.sin(th) * rad * 0.7; z = t * L;
    } else if (r < 0.84) { // long pectoral fins
      const side = Math.random() < 0.5 ? -1 : 1, u = Math.pow(Math.random(), 0.8), v = Math.random() - 0.5;
      const chord = 0.075 * L * (1 - u * 0.7) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.2)));
      x = side * (bodyR(0.27) * L * 0.8 + u * 0.24 * L);
      y = -bodyR(0.27) * L * 0.45 - u * 0.11 * L + (Math.random() - 0.5) * 0.022 * L * (1 - u * 0.6);
      z = 0.24 * L + u * 0.2 * L + v * chord;
      fin = u;
    } else if (r < 0.95) { // tail flukes
      const side = Math.random() < 0.5 ? -1 : 1, u = Math.random(), v = Math.random();
      x = side * u * 0.21 * L; y = (Math.random() - 0.5) * 0.02 * L * (1 - u * 0.5); z = L * (0.93 + u * 0.09 + v * 0.075 * (1 - u * 0.65));
    } else { // dorsal ridge
      const t = 0.55 + Math.random() * 0.3, rad = bodyR(t) * L;
      x = (Math.random() - 0.5) * 0.015 * L; y = rad * 0.82 + Math.random() * 0.025 * L; z = t * L;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    aT[i] = clamp(z / L, 0, 1); aFin[i] = fin; aRnd[i] = (r >= 0.64 && r < 0.72) || r >= 0.97 ? 0.85 + Math.random() * 0.15 : Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  g.setAttribute('aFin', new THREE.BufferAttribute(aFin, 1));
  g.setAttribute('aRnd', new THREE.BufferAttribute(aRnd, 1));
  return g;
}

const whales = (() => {
  const defs = [
    { L: 95, n: 16000, off: new V3(-52, 30, -120), c1: [0.35, 1.1, 1.6], c2: [0.7, 0.35, 1.6], ph: 0 },
    { L: 70, n: 12000, off: new V3(62, 44, -170), c1: [0.4, 1.4, 1.2], c2: [0.3, 0.5, 1.8], ph: 2.1 },
    { L: 34, n: 6000, off: new V3(-30, 22, -90), c1: [0.7, 1.4, 1.7], c2: [0.9, 0.5, 1.6], ph: 4.2 },
  ];
  const list = defs.map((d) => {
    const loc = {
      uLen: { value: d.L }, uAlpha: { value: 0 }, uPhaseOff: { value: d.ph },
      uC1: { value: new THREE.Color().setRGB(...d.c1) }, uC2: { value: new THREE.Color().setRGB(...d.c2) },
    };
    const pts = new THREE.Points(makeWhaleGeometry(d.n, d.L), mkMat(WHALE_VS, WHALE_FS, ADD, loc));
    pts.frustumCulled = false; pts.visible = false;
    scene.add(pts);
    return { ...d, pts, loc, pos: new V3(), cur: new V3(), vel: new V3(), t: 0 };
  });
  let on = false, appearT = 0, songT = 12;
  const look = new V3(), UP = new V3(0, 1, 0);
  return {
    get on() { return on; },
    appear(P) {
      if (on) return;
      on = true; appearT = 0; songT = 6;
      for (const w of list) {
        w.pts.visible = true;
        w.cur.set(w.off.x * 1.6, w.off.y - 60, w.off.z + 60);
        w.pos.copy(P).add(w.cur);
      }
    },
    update(dt, t, P, ascending, onSong) {
      if (!on) return;
      appearT += dt;
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        const tgt = new V3(
          w.off.x + Math.sin(t * 0.11 + w.ph) * 18,
          w.off.y + Math.sin(t * 0.17 + w.ph * 2) * 8 + (ascending ? 25 : 0),
          w.off.z + Math.sin(t * 0.06 + w.ph) * 45,
        );
        if (i === 2) tgt.add(new V3(Math.sin(t * 0.4) * 6, Math.sin(t * 0.5) * 3, 0)).add(list[0].cur).sub(list[0].off).add(new V3(18, -8, 25));
        w.cur.x = damp(w.cur.x, tgt.x, 0.25, dt); w.cur.y = damp(w.cur.y, tgt.y, 0.25, dt); w.cur.z = damp(w.cur.z, tgt.z, 0.2, dt);
        const prev = w.pos.clone();
        const minD = 55 + w.L * 0.5, cl = w.cur.length();
        if (cl < minD && appearT > 8) w.cur.multiplyScalar(lerp(1, minD / Math.max(cl, 1), 1 - Math.exp(-2 * dt)));
        w.pos.copy(P).add(w.cur);
        const gy = groundAt(w.pos.x, w.pos.z) + 22;
        if (w.pos.y < gy) { w.cur.y += gy - w.pos.y; w.pos.y = gy; }
        w.vel.subVectors(w.pos, prev);
        if (w.vel.lengthSq() > 1e-6) {
          // swim slightly across our path so we see them in profile
          const yaw = -Math.sign(w.off.x) * (0.55 + 0.15 * Math.sin(t * 0.13 + w.ph));
          w.vel.normalize().applyAxisAngle(UP, yaw);
          look.copy(w.pos).sub(w.vel);
          w.pts.position.copy(w.pos);
          w.pts.lookAt(look);
        }
        w.loc.uAlpha.value = smoothstep(0, 7, appearT - i * 1.5);
      }
      songT -= dt;
      if (songT <= 0) { songT = rand(16, 26); onSong(list[randi(0, 1)].cur.x > 0 ? 0.6 : -0.6); }
    },
    hide() { on = false; for (const w of list) w.pts.visible = false; },
  };
})();

// ───────── the ringed giant rising over the horizon ─────────
const planet = (() => {
  const loc = { uSunDir: { value: new V3(-1, 0.35, 0.25).normalize() }, uVis: { value: 0 } };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mkMat(PLANET_VS, PLANET_FS, {}, loc));
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.4, 192, 1), mkMat(RING_VS, RING_FS, { transparent: true, depthWrite: false, side: THREE.DoubleSide }, loc));
  ring.rotation.set(-Math.PI / 2 + 0.32, 0.22, 0.1);
  const grp = new THREE.Group();
  grp.add(ball, ring);
  grp.scale.setScalar(1000);
  grp.visible = false;
  ball.renderOrder = -5; ring.renderOrder = -4;
  ball.frustumCulled = ring.frustumCulled = false;
  scene.add(grp);
  let on = false, t = 0;
  const dir = new V3();
  return {
    rise() { on = true; t = 0; grp.visible = true; },
    instant() { on = true; t = 60; grp.visible = true; },
    update(dt, camPos) {
      if (!on) return;
      t += dt;
      const k = smoothstep(0, 28, t);
      dir.set(0.75, lerp(-0.2, 0.17, k), -1).normalize();
      grp.position.copy(camPos).addScaledVector(dir, 4400);
      grp.rotation.y = t * 0.004;
      loc.uVis.value = smoothstep(0, 4, t);
    },
  };
})();

// ───────── shooting stars ─────────
const meteors = (() => {
  const geo = new THREE.PlaneGeometry(1, 1);
  const items = Array.from({ length: 12 }, () => {
    const loc = { uA: { value: 0 }, uCol: { value: new THREE.Color().setRGB(1.6, 1.5, 1.3) } };
    const m = new THREE.Mesh(geo, mkMat(METEOR_VS, METEOR_FS, Object.assign({ side: THREE.DoubleSide }, ADD), loc));
    m.frustumCulled = false; m.visible = false;
    scene.add(m);
    return { m, loc, life: 0, life0: 1, rel: new V3(), vel: new V3(), len: 200 };
  });
  let rate = 0, acc = 0;
  const xA = new V3(), yA = new V3(), zA = new V3(), mat = new THREE.Matrix4();
  return {
    setRate(r) { rate = r; },
    update(dt, cam) {
      acc += dt * rate;
      while (acc > 1) {
        acc -= 1;
        const it = items.find((x) => x.life <= 0);
        if (it) {
          it.rel.set(rand(-1.2, 1.2), rand(0.25, 0.85), -rand(0.4, 1)).normalize().multiplyScalar(2600);
          it.vel.set(rand(-1, 1), -rand(0.25, 0.9), rand(-0.3, 0.3)).normalize().multiplyScalar(rand(1100, 1900));
          it.life = it.life0 = rand(0.6, 1.3); it.len = rand(160, 380); it.m.visible = true;
        }
      }
      for (const it of items) {
        if (it.life <= 0) continue;
        it.life -= dt;
        if (it.life <= 0) { it.m.visible = false; continue; }
        it.rel.addScaledVector(it.vel, dt);
        const p = cam.clone().add(it.rel);
        xA.copy(it.vel).normalize();
        zA.copy(cam).sub(p).normalize();
        yA.crossVectors(zA, xA).normalize();
        zA.crossVectors(xA, yA);
        mat.makeBasis(xA, yA, zA);
        it.m.quaternion.setFromRotationMatrix(mat);
        it.m.position.copy(p).addScaledVector(xA, -it.len * 0.5);
        it.m.scale.set(it.len, 4, 1);
        const k = it.life / it.life0;
        it.loc.uA.value = Math.sin(k * Math.PI);
      }
    },
  };
})();
