// ───────── renderer, camera, post-processing, sky, terrain, ambient dust ─────────
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  $('loading').textContent = 'LUMEN needs WebGL, which this browser could not start.';
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.75);
let pixelRatio = Math.min(MAX_PR, 1.0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.3, 14000);
camera.position.set(0, 30, 12);

const MSAA = renderer.capabilities.isWebGL2 ? Math.min(4, renderer.capabilities.maxSamples || 0) : 0;
const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: MSAA });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.42, 0.7);
composer.addPass(bloom);
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = Math.max(innerWidth, 2), h = Math.max(innerHeight, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  grade.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
}
addEventListener('resize', resize);
resize();

// ───────── sky dome ─────────
const skyMat = mkMat(SKY_VS, SKY_FS, { side: THREE.BackSide, depthWrite: false, depthTest: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), skyMat);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

// ───────── terrain: one GPU-displaced grid that follows the player in whole cells ─────────
const T_CELL = 5;
const terrainGeo = new THREE.PlaneGeometry(1600, 1000, 320, 200);
terrainGeo.rotateX(-Math.PI / 2);
terrainGeo.translate(0, 0, -400); // most of the grid lies ahead of the player
const terrain = new THREE.Mesh(terrainGeo, mkMat(TERRAIN_VS, TERRAIN_FS));
terrain.frustumCulled = false;
scene.add(terrain);
function updateTerrain(px, pz) {
  terrain.position.set(Math.round(px / T_CELL) * T_CELL, 0, Math.round(pz / T_CELL) * T_CELL);
}

// ───────── awakening ripples across the land ─────────
let ripIdx = 0;
function addRipple(x, z, strength = 1) {
  U.uRip.value[ripIdx].set(x, z, U.uTime.value, strength);
  ripIdx = (ripIdx + 1) % U.uRip.value.length;
}

// ───────── dust motes drifting around the camera (pure GPU) ─────────
function makeDust(count, box, local) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3), r = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    p[i * 3] = rand(-0.5, 0.5) * box.x; p[i * 3 + 1] = rand(-0.5, 0.5) * box.y; p[i * 3 + 2] = rand(-0.5, 0.5) * box.z;
    r[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(r, 1));
  const m = mkMat(DUST_VS, DUST_FS, ADD, Object.assign({ uCam: { value: new V3() }, uBox: { value: box }, uBright: { value: 1 }, uRise: { value: 0 }, uSize: { value: 0.12 } }, local));
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}
const dust = makeDust(1400, new V3(160, 70, 220), { uBright: { value: 0.45 }, uSize: { value: 0.09 } });
// the finale's rising lights (hidden until the end)
const risers = makeDust(4000, new V3(900, 500, 1100), { uBright: { value: 0 }, uRise: { value: 9 }, uSize: { value: 0.9 } });
