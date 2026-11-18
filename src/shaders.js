// ───────── GLSL building blocks ─────────
const GL_COMMON = /* glsl */ `
#define WATER -5.0
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = p - i; vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p); vec3 f = p - i; vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fogF(float d, float fd){ return 1.0 - exp(-pow(d / fd, 1.7)); }
`;

const GL_TERRAIN = /* glsl */ `
float terrainH(vec2 p){
  vec2 q = p * 0.0042; float h = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++){ h += a * vnoise(q); q = q * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  float m = vnoise(p * 0.0011 + vec2(5.3, 1.7));
  float mask = smoothstep(0.5, 0.82, m);
  float ridge = 0.0;
  if (mask > 0.0) {
    vec2 r = p * 0.0052; a = 0.55;
    for (int i = 0; i < 3; i++){ float n = 1.0 - abs(vnoise(r) * 2.0 - 1.0); ridge += a * n * n; r = r * 2.1 + vec2(3.7, 8.1); a *= 0.45; }
  }
  return (h - 0.42) * 46.0 + mask * ridge * 120.0;
}
`;

const GL_SKY = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uMoonDir; uniform vec3 uMoon; uniform float uMoonLit;
vec3 skyBase(vec3 d){
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
  col += uHorizon * 0.55 * exp(-abs(h) * 14.0);
  col = mix(col, uHorizon * 0.5, smoothstep(0.0, -0.35, h));
  float md = max(dot(d, uMoonDir), 0.0);
  col += uMoon * (pow(md, 10.0) * 0.04 + pow(md, 90.0) * 0.1) * (0.06 + uMoonLit);
  return col;
}
`;

// ───────── terrain ─────────
const TERRAIN_VS = GL_COMMON + GL_TERRAIN + /* glsl */ `
varying vec3 vWorld; varying vec3 vN; varying float vH;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = terrainH(wp.xz);
  float e = 3.0;
  float hx = terrainH(wp.xz + vec2(e, 0.0));
  float hz = terrainH(wp.xz + vec2(0.0, e));
  vN = normalize(vec3(h - hx, e, h - hz));
  float hy = max(h, WATER);
  vH = h;
  vWorld = vec3(wp.x, hy, wp.z);
  vec3 p = position; p.y = hy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const TERRAIN_FS = GL_COMMON + GL_SKY + /* glsl */ `
uniform float uTime, uBeat, uFogDist, uSkim;
uniform vec3 uPlayer, uGlow, uGround1, uGround2, uLine1, uLine2, uMoss, uWater, uMist, uRipple;
uniform vec4 uRip[6];
varying vec3 vWorld; varying vec3 vN; varying float vH;
void main(){
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  bool isWater = vH < WATER;
  vec3 N = isWater ? vec3(0.0, 1.0, 0.0) : normalize(vN);
  float diff = max(dot(N, normalize(uMoonDir + vec3(0.0, 0.6, 0.0))), 0.0);
  float slope = 1.0 - N.y;

  float hn = smoothstep(-12.0, 70.0, vH);
  vec3 base = mix(uGround1, uGround2, hn);
  float tex = vnoise(vWorld.xz * 0.08) * 0.5 + vnoise(vWorld.xz * 0.31) * 0.25;
  base *= 0.7 + tex * 0.7;
  vec3 col = base * (0.3 + 0.9 * diff);
  col += uHorizon * 0.3 * pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);

  // topographic contour lines (anti-aliased)
  float hv = vH / 3.5;
  float fw = fwidth(hv);
  float line = 1.0 - clamp(abs(fract(hv - 0.5) - 0.5) / max(fw * 1.2, 1e-4), 0.0, 1.0);
  float hv5 = vH / 17.5;
  float fw5 = fwidth(hv5);
  float major = 1.0 - clamp(abs(fract(hv5 - 0.5) - 0.5) / max(fw5 * 1.6, 1e-4), 0.0, 1.0);
  float lineFade = exp(-dist * 0.003) * (1.0 - smoothstep(0.15, 0.6, fw));
  vec3 lineCol = mix(uLine1, uLine2, clamp(smoothstep(-5.0, 60.0, vH) + 0.2 * sin(vWorld.x * 0.01 + uTime * 0.2), 0.0, 1.0));

  vec3 pv = vWorld - uPlayer;
  float pd = length(pv);
  float pl = 1.0 / (1.0 + pd * pd * 0.06);
  float plw = exp(-pd * 0.045);
  float lineI = (line * 0.5 + major * 0.95) * lineFade * (0.5 + 0.7 * uBeat + 4.0 * plw);

  if (!isWater) {
    col += lineCol * lineI;
    // bioluminescent moss patches
    float m1 = vnoise(vWorld.xz * 0.045 + 3.1);
    float m2 = vnoise(vWorld.xz * 0.23 + uTime * 0.05);
    // glowing dots, like bioluminescent caps, averaged out with distance to avoid shimmer
    vec2 cp = vWorld.xz * 0.55;
    vec2 cid = floor(cp); vec2 cf = cp - cid - 0.5;
    float ch = hash12(cid);
    vec2 co = vec2(hash12(cid + 7.3), hash12(cid + 3.1)) - 0.5;
    float dotK = step(0.45, ch) * smoothstep(0.22, 0.05, length(cf - co * 0.5));
    float dotMix = mix(0.07, dotK * 2.0, exp(-dist * 0.012));
    float moss = smoothstep(0.58, 0.8, m1) * (0.025 + 0.07 * m2 + dotMix) * smoothstep(0.35, 0.08, slope);
    float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + m1 * 20.0);
    col += uMoss * moss * pulse * (0.6 + 1.2 * plw) * 0.6;
  } else {
    float fres = pow(clamp(1.0 - V.y, 0.0, 1.0), 4.0);
    vec3 R = reflect(-V, N);
    vec3 w = uWater * 0.3 + skyBase(R) * (0.12 + 0.55 * fres);
    vec2 sp = vWorld.xz * 0.6 + vec2(uTime * 0.3, uTime * 0.17);
    float sparkle = pow(vnoise(sp) * vnoise(sp * 1.7 + 4.0), 6.0) * 12.0;
    w += uMoon * sparkle * 0.12 * (0.15 + uMoonLit) * exp(-dist * 0.004);
    float flow = vnoise(vWorld.xz * 0.03 + vec2(uTime * 0.05, -uTime * 0.08));
    float flow2 = vnoise(vWorld.xz * 0.12 - vec2(uTime * 0.1, 0.0));
    w += uWater * 1.6 * smoothstep(0.55, 0.95, flow * flow2 * 1.8);
    float shore = smoothstep(0.7, 0.0, WATER - vH);
    w += uLine1 * shore * 0.35 * (0.6 + 0.4 * sin(uTime * 2.0 + vWorld.x * 0.1));
    // a faint mirrored aurora shimmer
    w += (uLine2 * 0.03) * smoothstep(0.4, 0.9, vnoise(vec2(vWorld.x * 0.02, vWorld.z * 0.004 + uTime * 0.05))) * fres;
    // mirrored spark on the water
    vec3 mp = vec3(uPlayer.x, 2.0 * WATER - uPlayer.y, uPlayer.z);
    float g = max(dot(-V, normalize(mp - cameraPosition)), 0.0);
    float wob = 0.9994 + 0.0005 * vnoise(vWorld.xz * 0.8 + uTime * 2.0);
    w += uGlow * (smoothstep(wob, 1.0, g) * 2.5 + pow(g, 600.0) * 0.4);
    w += uGlow * pl * 0.12;
    col = w;
  }

  // warm pool of light beneath the spark
  col += uGlow * pl * (0.12 + 0.28 * diff) * (0.45 + 0.7 * uSkim);

  // awakening ripples
  for (int i = 0; i < 6; i++){
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w > 0.0 && age > 0.0 && age < 9.0){
      float rad = age * 150.0;
      float d = length(vWorld.xz - r.xy);
      float rq = (d - rad) / (6.0 + age * 5.0);
      float ring = exp(-rq * rq);
      float fade = exp(-age * 0.5) * r.w;
      col += uRipple * ring * fade * (0.35 + 3.0 * (line + major));
      col += uRipple * 0.12 * fade * smoothstep(rad, rad * 0.4, d) * (line + major);
    }
  }

  // low valley mist
  float mist = exp(-max(vH - WATER, 0.0) * 0.1) * 0.55;
  col = mix(col, uMist, mist * smoothstep(30.0, 220.0, dist));

  // fog into the sky colour of that direction
  float f = fogF(dist, uFogDist);
  f = max(f, smoothstep(600.0, 790.0, length(vWorld.xz - cameraPosition.xz)));
  col = mix(col, skyBase(-V), f);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// ───────── sky ─────────
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SKY_FS = GL_COMMON + GL_SKY + /* glsl */ `
uniform float uTime, uAurora, uStars, uNebula, uCorona, uMoonR;
uniform vec3 uAur1, uAur2;
varying vec3 vDir;

vec3 starLayer(vec3 d, float sc, float th, float seed, float gain){
  vec3 p = d * sc;
  vec3 id = floor(p);
  vec3 f = p - id - 0.5;
  float r = hash13(id + seed);
  if (r < th) return vec3(0.0);
  vec3 o = vec3(hash13(id + seed + 1.3), hash13(id + seed + 7.1), hash13(id + seed + 3.7)) - 0.5;
  float dd = length(f - o * 0.4);
  float k = (r - th) / (1.0 - th);
  float s = smoothstep(0.12 + 0.18 * k, 0.0, dd);
  s *= s;
  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + r * 4.0) + r * 91.0);
  vec3 c = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.85, 0.7), hash13(id + seed + 9.9));
  return c * s * tw * gain * (0.5 + k);
}

vec3 auroraF(vec3 d){
  if (d.y < 0.015) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 22; i++){
    float fi = float(i);
    float hgt = 1.0 + fi * 0.042;
    vec2 p = d.xz * (hgt / d.y);
    vec2 q = p * 0.26;
    q.x += sin(q.y * 0.8 + uTime * 0.07) * 1.3 + sin(q.y * 2.1 - uTime * 0.05) * 0.4;
    float n = vnoise(vec2(q.x * 1.25, q.y * 0.32 + uTime * 0.035));
    float curtain = pow(1.0 - abs(n * 2.0 - 1.0), 7.0);
    float det = vnoise(vec2(q.x * 9.0 + uTime * 0.35, fi * 0.25 + q.y));
    float k = curtain * (0.5 + 0.5 * det) * exp(-fi * 0.12);
    acc += mix(uAur1, uAur2, smoothstep(0.0, 21.0, fi)) * k;
  }
  float fade = smoothstep(0.015, 0.22, d.y) * smoothstep(1.0, 0.5, d.y);
  return acc * 0.1 * fade;
}

void main(){
  vec3 d = normalize(vDir);
  vec3 col = skyBase(d);
  float above = smoothstep(-0.03, 0.08, d.y);

  // galactic band
  vec3 bandN = normalize(vec3(0.35, 0.55, 0.75));
  float bd = dot(d, bandN);
  float band = exp(-bd * bd * 16.0);
  float n = vnoise3(d * 3.0) * 0.5 + vnoise3(d * 7.0 + 3.1) * 0.3 + vnoise3(d * 16.0 + 7.7) * 0.2;
  col += mix(uAur2, uAur1 * 0.5 + uAur2 * 0.5, n) * band * smoothstep(0.32, 0.85, n) * 0.07 * uNebula * above;
  col += vec3(0.6, 0.7, 1.0) * band * 0.012 * uStars * above;

  float dens = band * 0.025;
  vec3 st = starLayer(d, 80.0, 0.975 - dens, 0.0, 3.2)
          + starLayer(d, 170.0, 0.955 - dens * 2.0, 11.0, 1.4)
          + starLayer(d, 300.0, 0.94 - dens * 3.0, 23.0, 0.7);
  col += st * uStars * above;
  col += auroraF(d) * uAurora;

  // the moon — eclipsed at first, slowly uncovered chapter by chapter
  float md = dot(d, uMoonDir);
  if (md > 0.0) {
    vec3 t1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(t1, uMoonDir);
    vec2 lp = vec2(dot(d, t1), dot(d, t2)) / uMoonR;
    float r = length(lp);
    float disk = smoothstep(1.0, 0.985, r);
    vec2 sc = vec2(1.0, -0.3) * uMoonLit * 2.25;
    float lit = disk * smoothstep(0.985, 1.02, length(lp - sc));
    float tex = 0.72 + 0.28 * vnoise(lp * 2.5 + 3.0) - 0.22 * smoothstep(0.55, 0.78, vnoise(lp * 5.0 + 9.0)) - 0.1 * smoothstep(0.6, 0.8, vnoise(lp * 11.0));
    float limb = sqrt(max(1.0 - r * r, 0.0));
    vec3 surf = uMoon * tex * (0.5 + 0.5 * limb) * 1.35;
    col = mix(col, vec3(0.003, 0.004, 0.008) + uHorizon * 0.05, disk);
    col += surf * lit;
    float ang = atan(lp.y, lp.x);
    float streak = vnoise(vec2(ang * 4.0, uTime * 0.04)) * 0.6 + vnoise(vec2(ang * 11.0, uTime * 0.07 + 5.0)) * 0.4;
    float outside = smoothstep(0.98, 1.03, r);
    float cor = (exp(-(r - 1.0) * 10.0) * 1.6 + exp(-(r - 1.0) * 2.0) * (0.2 + 0.7 * streak * streak)) * outside;
    col += vec3(1.0, 0.9, 0.8) * cor * uCorona * 1.3;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// ───────── point sprites (motes, particles) ─────────
const MOTE_VS = /* glsl */ `
attribute float aSeed; attribute float aAlpha; attribute float aType;
uniform float uTime, uScale;
varying float vAlpha; varying float vType; varying float vSeed;
void main(){
  vec3 p = position;
  p.y += sin(uTime * 2.0 + aSeed * 6.2831) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.1);
  float pulse = 1.0 + 0.18 * sin(uTime * 4.0 + aSeed * 6.2831);
  float size = (aType > 0.5 ? 5.2 : 2.6) * pulse;
  gl_PointSize = min(size * uScale / dist, 420.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = aAlpha * smoothstep(780.0, 360.0, dist) * smoothstep(2.5, 9.0, dist);
  vType = aType; vSeed = aSeed;
}
`;
const MOTE_FS = /* glsl */ `
uniform vec3 uMote, uGold; uniform float uTime;
varying float vAlpha; varying float vType; varying float vSeed;
void main(){
  if (vAlpha < 0.002) discard;
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-r * r * 30.0) * 3.0;
  float halo = exp(-r * r * 5.0) * 0.55;
  vec3 col = vType > 0.5 ? uGold : uMote;
  float flare = 0.0;
  float a = uTime * (vType > 0.5 ? 1.2 : 0.4) + vSeed * 6.0;
  vec2 rc = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
  flare = (exp(-abs(rc.x) * 60.0) + exp(-abs(rc.y) * 60.0)) * exp(-r * 3.0) * (vType > 0.5 ? 1.6 : 0.5);
  vec3 o = col * (halo + flare) + vec3(1.0) * core;
  gl_FragColor = vec4(o * vAlpha, 1.0);
}
`;

const PART_VS = /* glsl */ `
attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
uniform float uScale;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 0.1);
  float ps = aSize * 0.4 * uScale / dist;
  gl_PointSize = clamp(ps, 1.0, 90.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vAlpha = aAlpha * min(ps, 1.0) * smoothstep(2.0, 9.0, dist);
}
`;
const PART_FS = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 7.0) * 0.55 + exp(-r2 * 40.0) * 1.2;
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;

// ───────── light trail ribbon ─────────
const TRAIL_VS = /* glsl */ `
attribute float aT; attribute float aSide; attribute float aFade;
varying float vT; varying float vSide; varying float vCam;
void main(){
  vT = aT; vSide = aSide;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vCam = smoothstep(3.5, 13.0, -mv.z) * aFade;
  gl_Position = projectionMatrix * mv;
}
`;
const TRAIL_FS = /* glsl */ `
uniform vec3 uTrailHead, uTrailTail; uniform float uIntensity;
varying float vT; varying float vSide; varying float vCam;
void main(){
  float t = clamp(vT, 0.0, 1.0);
  float edge = clamp(1.0 - vSide * vSide, 0.0, 1.0);
  float a = pow(1.0 - t, 1.5) * edge;
  vec3 col = mix(uTrailHead, uTrailTail, smoothstep(0.0, 0.6, t));
  float core = pow(edge, 8.0) * pow(1.0 - t, 2.0) * 1.6;
  gl_FragColor = vec4((col * a * 0.55 + vec3(core) * 0.7) * uIntensity * vCam, 1.0);
}
`;

// ───────── chain lines (constellations drawn by your combos) ─────────
const CHAIN_VS = /* glsl */ `
attribute float aBirth;
uniform float uTime;
varying float vA;
void main(){
  float age = uTime - aBirth;
  vA = exp(-age * 0.9) * smoothstep(0.0, 0.08, age);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const CHAIN_FS = /* glsl */ `
uniform vec3 uMote;
varying float vA;
void main(){ gl_FragColor = vec4(uMote * 2.2 * vA, 1.0); }
`;

// ───────── void shards (hazards) ─────────
const SHARD_VS = /* glsl */ `
attribute float aSeed; attribute vec3 aScale;
varying vec3 vNw; varying vec3 vWorld; varying float vY; varying float vSeed;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vNw = normalize(mat3(m) * (normal / (aScale * aScale)));
  vWorld = wp.xyz; vY = position.y; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SHARD_FS = /* glsl */ `
uniform vec3 uRim, uHorizon, uPlayer; uniform float uTime, uFogDist;
varying vec3 vNw; varying vec3 vWorld; varying float vY; varying float vSeed;
float fogF2(float d, float fd){ return 1.0 - exp(-pow(d / fd, 1.7)); }
void main(){
  vec3 N = normalize(vNw);
  vec3 toC = cameraPosition - vWorld; float dist = length(toC); vec3 V = toC / dist;
  float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.2);
  vec3 col = vec3(0.004, 0.003, 0.007);
  col += uHorizon * 0.5 * pow(max(reflect(-V, N).y, 0.0), 2.0);
  float pd = length(uPlayer - vWorld);
  float warn = smoothstep(150.0, 30.0, pd);
  float pulse = 0.6 + 0.4 * sin(uTime * (2.0 + 5.0 * warn) + vSeed * 6.28);
  col += uRim * fres * (0.5 + 1.8 * warn) * pulse;
  float vein = pow(0.5 + 0.5 * sin(vY * 16.0 - uTime * 3.0 + vSeed * 10.0), 14.0);
  col += uRim * vein * 0.8 * (0.3 + fres);
  col += uRim * smoothstep(0.8, 1.0, vY) * (1.4 + warn);
  float f = fogF2(dist, uFogDist);
  col = mix(col, uHorizon * 0.8, f);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ───────── flora (stalks + glowing bulbs) ─────────
const FLORA_VS = /* glsl */ `
attribute float aLit; attribute float aSeed;
uniform float uTime;
varying float vLit; varying float vSeed; varying vec3 vWorld; varying vec3 vNw; varying float vY;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec3 p = position;
  vec4 wp = m * vec4(p, 1.0);
  // gentle sway, more at the top
  float sway = sin(uTime * 0.9 + aSeed * 30.0 + wp.x * 0.02) * 0.35 * smoothstep(0.0, 1.0, position.y);
  wp.x += sway; wp.z += sway * 0.5;
  vNw = normalize(mat3(m) * normal);
  vWorld = wp.xyz; vLit = aLit; vSeed = aSeed; vY = position.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BULB_FS = /* glsl */ `
uniform vec3 uFlora, uDormant, uHorizon; uniform float uTime, uFogDist;
varying float vLit; varying float vSeed; varying vec3 vWorld; varying vec3 vNw; varying float vY;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(clamp(1.0 - abs(dot(normalize(vNw), V)), 0.0, 1.0), 2.0);
  float pulse = 0.8 + 0.2 * sin(uTime * 2.0 + vSeed * 20.0);
  vec3 hue = mix(uFlora, uFlora.gbr * 0.9, fract(vSeed * 3.7) * 0.45);
  float lit = clamp(vLit, 0.0, 1.0);
  vec3 col = mix(uDormant * (1.0 + fres), hue * 2.0 * pulse * (0.7 + 0.6 * fres), lit);
  col += vec3(1.0) * max(vLit - 1.0, 0.0) * 2.0;
  float dist = length(cameraPosition - vWorld);
  col *= mix(0.3, 1.0, smoothstep(6.0, 30.0, dist));
  float f = 1.0 - exp(-pow(dist / uFogDist, 1.7));
  col = mix(col, uHorizon * 0.8, f);
  gl_FragColor = vec4(col, 1.0);
}
`;
const STALK_FS = /* glsl */ `
uniform vec3 uFlora, uDormant, uHorizon; uniform float uTime, uFogDist;
varying float vLit; varying float vSeed; varying vec3 vWorld; varying vec3 vNw; varying float vY;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(clamp(1.0 - abs(dot(normalize(vNw), V)), 0.0, 1.0), 2.0);
  float lit = clamp(vLit, 0.0, 1.0);
  float y = clamp(vY, 0.0, 1.0);
  vec3 col = uDormant * 0.7 + uFlora * fres * 0.35 * lit * y;
  col += uFlora * 0.6 * lit * pow(y, 6.0);
  float dist = length(cameraPosition - vWorld);
  float f = 1.0 - exp(-pow(dist / uFogDist, 1.7));
  col = mix(col, uHorizon * 0.8, f);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ───────── gates ─────────
const GATE_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vPos;
void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const GATE_FS = /* glsl */ `
uniform vec3 uCol; uniform float uTime, uFlash, uAlpha;
varying vec2 vUv;
void main(){
  float flow = 0.55 + 0.45 * sin(vUv.x * 75.0 - uTime * 7.0);
  float rim = 0.6 + 0.4 * sin(vUv.y * 6.2831);
  gl_FragColor = vec4(uCol * (1.3 * flow * rim + uFlash * 2.5) * uAlpha, 1.0);
}
`;
const MEMBRANE_FS = /* glsl */ `
uniform vec3 uCol; uniform float uTime, uFlash, uAlpha;
varying vec3 vPos;
void main(){
  float r = length(vPos.xy) / 7.0;
  float a = atan(vPos.y, vPos.x);
  float sw = 0.5 + 0.5 * sin(a * 6.0 + r * 14.0 - uTime * 3.0);
  float ring = smoothstep(0.55, 1.0, r);
  float k = (ring * 0.35 + sw * 0.06 * r) * (1.0 - uFlash);
  gl_FragColor = vec4(uCol * k * uAlpha, 1.0);
}
`;

// ───────── leviathans (point-cloud whales) ─────────
const WHALE_VS = /* glsl */ `
attribute float aT; attribute float aFin; attribute float aRnd;
uniform float uTime, uScale, uLen, uAlpha, uPhaseOff;
uniform vec3 uC1, uC2;
varying vec3 vCol; varying float vA;
void main(){
  vec3 p = position;
  float t = aT;
  float tm = uTime + uPhaseOff;
  p.y += sin(t * 3.4 - tm * 1.15) * uLen * 0.04 * pow(t, 1.5);
  p.y += aFin * sin(tm * 0.9) * uLen * 0.07;
  p.x += sin(t * 2.0 - tm * 0.6) * uLen * 0.008 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.1);
  float ps = (0.18 + aRnd * 0.32) * uScale / dist;
  gl_PointSize = clamp(ps, 1.0, 24.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(tm * 2.5 + aRnd * 40.0 - t * 12.0);
  tw = 0.25 + 0.75 * tw * tw;
  vCol = mix(uC1, uC2, smoothstep(0.0, 1.0, t)) * tw * 0.42;
  vA = uAlpha * min(ps, 1.0) * smoothstep(1600.0, 500.0, dist) * smoothstep(25.0, 70.0, dist);
}
`;
const WHALE_FS = /* glsl */ `
varying vec3 vCol; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vCol * exp(-r2 * 3.0) * vA, 1.0);
}
`;

// ───────── planet + ring ─────────
const PLANET_VS = /* glsl */ `
varying vec3 vNw; varying vec3 vObj; varying vec3 vWorld;
void main(){
  vObj = position;
  vNw = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const PLANET_FS = GL_COMMON + /* glsl */ `
uniform vec3 uSunDir; uniform float uTime, uVis;
varying vec3 vNw; varying vec3 vObj; varying vec3 vWorld;
void main(){
  vec3 n = normalize(vNw);
  vec3 o = normalize(vObj);
  float lat = o.y;
  float lon = atan(o.z, o.x);
  float warp = vnoise(vec2(lon * 3.0 + uTime * 0.01, lat * 9.0)) * 1.4 + vnoise(vec2(lon * 9.0, lat * 30.0)) * 0.5;
  float bands = sin(lat * 26.0 + warp * 2.2);
  vec3 c1 = vec3(0.55, 0.32, 0.5), c2 = vec3(0.95, 0.62, 0.42), c3 = vec3(0.25, 0.5, 0.75);
  vec3 base = mix(c1, c2, 0.5 + 0.5 * bands);
  base = mix(base, c3, smoothstep(0.55, 0.85, vnoise(vec2(lon * 2.0, lat * 12.0 + 4.0))));
  float storm = smoothstep(0.08, 0.0, length(vec2((lon - 0.8) * 0.5, lat + 0.25)));
  base = mix(base, vec3(1.0, 0.85, 0.7), storm);
  float ndl = dot(n, uSunDir);
  float lit = smoothstep(-0.12, 0.45, ndl);
  vec3 col = base * lit * 0.9;
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 3.0);
  col += vec3(0.5, 0.65, 1.2) * rim * (0.15 + 1.4 * smoothstep(-0.35, 0.5, ndl));
  gl_FragColor = vec4(col * uVis, 1.0);
}
`;
const RING_VS = /* glsl */ `
varying float vR; varying vec3 vWorld;
void main(){
  vR = length(position.xy);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const RING_FS = GL_COMMON + /* glsl */ `
uniform float uVis;
varying float vR; varying vec3 vWorld;
void main(){
  float r = (vR - 1.35) / (2.4 - 1.35);
  float b = vnoise(vec2(r * 55.0, 0.5)) * 0.6 + vnoise(vec2(r * 190.0, 1.5)) * 0.4;
  float gap = smoothstep(0.02, 0.0, abs(r - 0.62)) ;
  float a = smoothstep(0.0, 0.04, r) * smoothstep(1.0, 0.88, r) * (0.2 + 0.8 * b) * (1.0 - gap * 0.9);
  vec3 col = mix(vec3(0.9, 0.7, 0.55), vec3(0.6, 0.65, 0.95), b) * 1.1;
  gl_FragColor = vec4(col, a * 0.85 * uVis);
}
`;

// ───────── meteors ─────────
const METEOR_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const METEOR_FS = /* glsl */ `
uniform float uA; uniform vec3 uCol;
varying vec2 vUv;
void main(){
  vec2 uv = clamp(vUv, 0.0, 1.0);
  float along = pow(uv.x, 3.0);
  float across = clamp(1.0 - abs(uv.y - 0.5) * 2.0, 0.0, 1.0);
  float k = along * pow(across, 3.0) + pow(uv.x, 40.0) * pow(across, 1.5) * 3.0;
  gl_FragColor = vec4(uCol * k * uA, 1.0);
}
`;

// ───────── ambient dust + rising lights (wrapped around the camera on the GPU) ─────────
const DUST_VS = /* glsl */ `
attribute float aRnd;
uniform vec3 uCam; uniform vec3 uBox; uniform float uTime, uScale, uBright, uRise, uSize;
varying float vA; varying float vR;
void main(){
  vec3 p = position + vec3(sin(uTime * 0.3 + aRnd * 20.0), cos(uTime * 0.25 + aRnd * 13.0), sin(uTime * 0.2 + aRnd * 7.0)) * 2.0;
  p.y += uTime * uRise * (0.5 + aRnd);
  p = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 0.1);
  float ps = uSize * (0.5 + aRnd) * uScale / d;
  gl_PointSize = clamp(ps, 1.0, 80.0);
  gl_Position = projectionMatrix * mv;
  float edge = 1.0 - smoothstep(0.3, 0.5, max(abs(p.x - uCam.x) / uBox.x, max(abs(p.y - uCam.y) / uBox.y, abs(p.z - uCam.z) / uBox.z)));
  vA = uBright * smoothstep(0.5, 5.0, d) * edge * min(ps, 1.0) * (0.35 + 0.65 * fract(aRnd * 13.7));
  vR = aRnd;
}
`;
const DUST_FS = /* glsl */ `
uniform vec3 uMote, uFlora;
varying float vA; varying float vR;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  vec3 col = mix(uMote, uFlora, step(0.5, fract(vR * 7.31)));
  gl_FragColor = vec4(col * exp(-r2 * 3.5) * vA, 1.0);
}
`;

// ───────── final grade: chromatic aberration, colour-return sweep, vignette, grain, fades ─────────
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uChroma: { value: 0 }, uSat: { value: 0.15 }, uSatR: { value: -0.5 },
    uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 1 }, uFadeCol: { value: new THREE.Color(0, 0, 0) },
    uVig: { value: 0.55 }, uRes: { value: new THREE.Vector2(1, 1) }, uWarp: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime, uChroma, uSat, uSatR, uFlash, uFade, uVig, uWarp;
uniform vec3 uFlashCol, uFadeCol; uniform vec2 uRes;
varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float aspect = uRes.x / uRes.y;
  float rr = length(c * vec2(aspect, 1.0));
  uv -= c * uWarp * rr * 0.08;
  vec2 off = c * (0.0015 + uChroma * 0.014);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + off).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - off).b;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float satMask = smoothstep(uSatR, uSatR - 0.18, rr);
  col = mix(vec3(lum), col, mix(uSat, 1.0, satMask));
  col *= 1.0 - uVig * smoothstep(0.25, 1.0, rr);
  col = mix(col, uFlashCol, clamp(uFlash, 0.0, 1.0));
  float g = fract(sin(dot(uv * uRes + fract(uTime * 7.13) * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.012;
  col = mix(max(col, 0.0), uFadeCol, clamp(uFade, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`,
};
