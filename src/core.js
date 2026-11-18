import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

window.__lumenLoaded = true;

// ───────── small helpers ─────────
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fract = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
const WATER = -5.0;

// ───────── noise (mirrors the GLSL versions exactly) ─────────
function hash12(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
// The landscape. Rolling hills + ridged mountain ranges in some regions + lakes below WATER.
function terrainH(x, z) {
  let qx = x * 0.0042, qz = z * 0.0042, h = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { h += a * vnoise(qx, qz); qx = qx * 2.03 + 17.1; qz = qz * 2.03 + 9.2; a *= 0.5; }
  const m = vnoise(x * 0.0011 + 5.3, z * 0.0011 + 1.7);
  const mask = smoothstep(0.5, 0.82, m);
  let ridge = 0;
  if (mask > 0) {
    let rx = x * 0.0052, rz = z * 0.0052; a = 0.55;
    for (let i = 0; i < 3; i++) { const n = 1 - Math.abs(vnoise(rx, rz) * 2 - 1); ridge += a * n * n; rx = rx * 2.1 + 3.7; rz = rz * 2.1 + 8.1; a *= 0.45; }
  }
  return (h - 0.42) * 46 + mask * ridge * 120;
}
const groundAt = (x, z) => Math.max(terrainH(x, z), WATER);

// ───────── chapters ─────────
const PHASES = [
  { name: 'The Void', sub: 'Gather the scattered light.', at: 0, roman: 'I' },
  { name: 'First Light', sub: 'The land remembers its colours.', at: 45, roman: 'II' },
  { name: 'The Bloom', sub: 'Where light falls, life answers.', at: 160, roman: 'III' },
  { name: 'Leviathans', sub: 'You were never alone up here.', at: 320, roman: 'IV' },
  { name: 'Celestia', sub: 'The sky opens its eyes.', at: 520, roman: 'V' },
  { name: 'Ascension', sub: 'Now, rise.', at: 760, roman: 'VI' },
];

// ───────── palettes: one per chapter, blended continuously ─────────
const PAL_RAW = [
  { // 0 · the void — near-monochrome, eclipsed moon
    zenith: [0.002, 0.003, 0.008], horizon: [0.018, 0.02, 0.032], ground1: [0.006, 0.007, 0.01], ground2: [0.02, 0.022, 0.03],
    line1: [0.16, 0.19, 0.26], line2: [0.2, 0.22, 0.3], moss: [0, 0, 0], water: [0.004, 0.005, 0.01], mist: [0.02, 0.024, 0.035],
    mote: [0.9, 0.95, 1.1], flora: [0.5, 0.6, 0.8], rim: [1.3, 0.12, 0.3], aur1: [0.1, 0.9, 0.6], aur2: [0.5, 0.2, 1.0],
    trailHead: [0.9, 0.95, 1.2], trailTail: [0.3, 0.35, 0.6], ripple: [0.6, 0.7, 1.0], glow: [0.5, 0.55, 0.7],
    aurora: 0, moonLit: 0, stars: 0.75, nebula: 0.12, corona: 1,
  },
  { // 1 · first light — teal dawn
    zenith: [0.004, 0.008, 0.03], horizon: [0.04, 0.06, 0.13], ground1: [0.01, 0.016, 0.04], ground2: [0.03, 0.045, 0.09],
    line1: [0.1, 0.85, 1.1], line2: [0.35, 0.45, 1.5], moss: [0.05, 0.6, 0.5], water: [0.01, 0.05, 0.1], mist: [0.05, 0.08, 0.16],
    mote: [0.6, 1.1, 1.3], flora: [0.3, 1.1, 1.2], rim: [1.4, 0.12, 0.4], aur1: [0.1, 1.0, 0.6], aur2: [0.3, 0.3, 1.2],
    trailHead: [0.7, 1.2, 1.4], trailTail: [0.2, 0.4, 1.0], ripple: [0.3, 1.0, 1.2], glow: [0.35, 0.75, 0.9],
    aurora: 0.55, moonLit: 0.22, stars: 1.0, nebula: 0.5, corona: 0.75,
  },
  { // 2 · the bloom — violet, magenta, living green
    zenith: [0.008, 0.004, 0.03], horizon: [0.08, 0.035, 0.14], ground1: [0.012, 0.006, 0.03], ground2: [0.04, 0.02, 0.07],
    line1: [1.2, 0.25, 1.1], line2: [0.15, 1.1, 0.95], moss: [0.25, 1.2, 0.5], water: [0.03, 0.015, 0.08], mist: [0.08, 0.03, 0.12],
    mote: [1.3, 0.7, 1.4], flora: [1.5, 0.45, 1.3], rim: [1.5, 0.2, 0.2], aur1: [0.2, 1.0, 0.5], aur2: [0.9, 0.2, 1.0],
    trailHead: [1.3, 0.8, 1.4], trailTail: [0.6, 0.2, 1.0], ripple: [1.2, 0.4, 1.2], glow: [0.8, 0.45, 0.9],
    aurora: 1.0, moonLit: 0.45, stars: 1.0, nebula: 0.8, corona: 0.5,
  },
  { // 3 · leviathans — deep ocean blues
    zenith: [0.002, 0.01, 0.03], horizon: [0.02, 0.09, 0.18], ground1: [0.004, 0.016, 0.04], ground2: [0.015, 0.05, 0.1],
    line1: [0.15, 0.7, 1.6], line2: [0.55, 0.35, 1.7], moss: [0.05, 0.9, 1.3], water: [0.0, 0.12, 0.22], mist: [0.02, 0.07, 0.14],
    mote: [0.6, 1.2, 1.7], flora: [0.25, 1.1, 1.8], rim: [1.5, 0.2, 0.5], aur1: [0.1, 1.0, 0.8], aur2: [0.3, 0.4, 1.4],
    trailHead: [0.7, 1.2, 1.7], trailTail: [0.2, 0.3, 1.2], ripple: [0.3, 0.9, 1.6], glow: [0.4, 0.7, 1.0],
    aurora: 1.15, moonLit: 0.7, stars: 1.1, nebula: 1.0, corona: 0.25,
  },
  { // 4 · celestia — gold and rose
    zenith: [0.015, 0.008, 0.04], horizon: [0.25, 0.1, 0.13], ground1: [0.03, 0.015, 0.03], ground2: [0.09, 0.045, 0.06],
    line1: [1.7, 0.95, 0.3], line2: [1.5, 0.35, 0.75], moss: [1.3, 0.7, 0.25], water: [0.18, 0.07, 0.09], mist: [0.22, 0.09, 0.13],
    mote: [1.6, 1.2, 0.6], flora: [1.7, 0.85, 0.45], rim: [1.0, 0.1, 0.6], aur1: [0.9, 0.8, 0.3], aur2: [1.0, 0.3, 0.8],
    trailHead: [1.6, 1.3, 0.8], trailTail: [1.0, 0.3, 0.6], ripple: [1.6, 1.0, 0.5], glow: [1.0, 0.7, 0.5],
    aurora: 1.0, moonLit: 0.92, stars: 1.2, nebula: 1.1, corona: 0.08,
  },
  { // 5 · ascension — radiant
    zenith: [0.02, 0.018, 0.06], horizon: [0.3, 0.2, 0.25], ground1: [0.035, 0.025, 0.045], ground2: [0.09, 0.065, 0.085],
    line1: [2.0, 1.6, 1.1], line2: [1.1, 1.3, 2.0], moss: [1.3, 1.1, 0.8], water: [0.16, 0.12, 0.2], mist: [0.2, 0.14, 0.17],
    mote: [2, 1.8, 1.4], flora: [2.0, 1.5, 1.1], rim: [1.2, 0.6, 0.9], aur1: [0.6, 1.2, 0.9], aur2: [1.2, 0.6, 1.3],
    trailHead: [2, 1.8, 1.5], trailTail: [1.2, 0.7, 1.2], ripple: [1.8, 1.6, 1.2], glow: [1.2, 1.0, 0.9],
    aurora: 1.3, moonLit: 1.0, stars: 1.3, nebula: 1.2, corona: 0,
  },
];
const PAL_COLOR_KEYS = Object.keys(PAL_RAW[0]).filter((k) => Array.isArray(PAL_RAW[0][k]));
const PAL_NUM_KEYS = Object.keys(PAL_RAW[0]).filter((k) => !Array.isArray(PAL_RAW[0][k]));
const PALS = PAL_RAW.map((p) => {
  const o = {};
  for (const k of PAL_COLOR_KEYS) o[k] = new THREE.Color().setRGB(p[k][0], p[k][1], p[k][2]);
  for (const k of PAL_NUM_KEYS) o[k] = p[k];
  return o;
});

// One shared uniform bag. Every material receives these, so updating once updates everything.
const U = {
  uTime: { value: 0 }, uBeat: { value: 0 }, uFogDist: { value: 560 },
  uPlayer: { value: new V3() }, uSkim: { value: 0 }, uScale: { value: 800 },
  uMoonDir: { value: new V3(-0.36, 0.2, -1).normalize() }, uMoonR: { value: 0.055 },
  uMoon: { value: new THREE.Color().setRGB(1.0, 0.96, 0.9) },
  uGold: { value: new THREE.Color().setRGB(1.8, 1.3, 0.45) },
  uDormant: { value: new THREE.Color().setRGB(0.014, 0.016, 0.024) },
  uRip: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 0, -99, 0)) },
};
for (const k of PAL_COLOR_KEYS) U['u' + k[0].toUpperCase() + k.slice(1)] = { value: new THREE.Color() };
for (const k of PAL_NUM_KEYS) U['u' + k[0].toUpperCase() + k.slice(1)] = { value: 0 };

function applyPalette(f) {
  f = clamp(f, 0, PALS.length - 1);
  const i = Math.min(Math.floor(f), PALS.length - 2), t = f - i;
  const A = PALS[i], B = PALS[i + 1];
  for (const k of PAL_COLOR_KEYS) U['u' + k[0].toUpperCase() + k.slice(1)].value.copy(A[k]).lerp(B[k], t);
  for (const k of PAL_NUM_KEYS) U['u' + k[0].toUpperCase() + k.slice(1)].value = lerp(A[k], B[k], t);
}
applyPalette(0);

const mkMat = (vertexShader, fragmentShader, extra = {}, local = {}) =>
  new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: Object.assign({}, U, local), ...extra });
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

// A tiny game-time scheduler (pauses with the game).
const timers = [];
let gameClock = 0;
function after(sec, fn) { timers.push({ t: gameClock + sec, fn }); }
function runTimers() {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (timers[i].t <= gameClock) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  }
}
