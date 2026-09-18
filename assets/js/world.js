/* ==========================================================================
   Mohith Dande — WebGL environment  ·  "Signal Core"
   One particle sculpture that re-forms itself for every chapter, scrubbed
   directly by scroll position, over a living data ocean.

   Budget: 4 draw calls per frame (sky, stars, ocean, core). No textures,
   no lights, no post-processing, no per-frame allocations or scene walks.
   All motion runs in vertex shaders; JS only updates a few uniforms.

   Chapters → forms
     0 Intro    globe with live routes out of Amritapuri
     1 About    5-layer network, Security → Impact, signal flowing through
     2 Builds   geodesic defence lattice around a protected core
     3 Stack    six stacked plates that light with the group being read
     4 Journey  rising double helix with six milestones
     5 Contact  afterlight galaxy

   Reads window.PortfolioState (written by script.js). Never captures input.
   ========================================================================== */
import * as THREE from 'three';

const canvas = document.getElementById('world');
const root = document.documentElement;
const state = window.PortfolioState || (window.PortfolioState = { c: 0, chapter: 0, journey: 0, stack: [0, 0, 0, 0, 0, 0], pointerX: 0, pointerY: 0 });
const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ----------------------------------------------------------------------
   Helpers
   ---------------------------------------------------------------------- */
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260917);
function gauss() {
  let u = 0; while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}
function onSphere() {
  const u = rand() * 2 - 1, t = rand() * TAU, s = Math.sqrt(1 - u * u);
  return [s * Math.cos(t), u, s * Math.sin(t)];
}
function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
const fbm3 = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.1;

function webgl2Available() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}

function detectQuality() {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const w = window.innerWidth;
  if (mem <= 3 || w < 640 || (coarse && cores <= 4)) return 'low';
  if (coarse || w < 1100 || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

const PRESETS = {
  high:   { dpr: 1.5,  core: 18000, oceanStep: 1.35, stars: 2400 },
  medium: { dpr: 1.25, core: 12000, oceanStep: 1.8,  stars: 1600 },
  low:    { dpr: 1.0,  core: 6500,  oceanStep: 2.6,  stars: 800 }
};

/* palette, indexed from the shaders */
const PAL = ['#6cd3e0', '#8f86d6', '#ece6da', '#5cc39b', '#e2584c', '#f0b88c', '#5b8def', '#fff4e2'];
const CYAN = 0, VIOLET = 1, WARM = 2, EMERALD = 3, ALERT = 4, AMBER = 5, BLUE = 6, HOT = 7;

/* ----------------------------------------------------------------------
   Shots: camera framing, sky and tone for each chapter
   sx/sy shift the subject on screen (NDC) without changing perspective,
   so the sculpture sits beside the copy instead of behind it.
   ---------------------------------------------------------------------- */
const SHOTS = [
  { dist: 33, theta: 0.15, phi: 0.16, lookY: 0.0, sx: 0.42, sy: -0.04, scale: 1.0,  bright: 1.0,  spin: 0.09,
    top: '#03050a', bot: '#060d15', g1: '#0c2c38', p1: [0.72, 0.5], g2: '#0f0c28', p2: [0.1, 0.05], ocean: 0.9, oceanA: '#2a8ea0', oceanB: '#5b4fb0' },
  { dist: 32, theta: 0.85, phi: 0.24, lookY: 0.0, sx: 0.4, sy: 0.16, scale: 1.0,  bright: 0.72, spin: 0.05,
    top: '#03040a', bot: '#080a17', g1: '#18163a', p1: [0.72, 0.48], g2: '#08222c', p2: [0.15, 0.95], ocean: 0.8, oceanA: '#6c5fd0', oceanB: '#2a8ea0' },
  { dist: 36, theta: 1.75, phi: 0.08, lookY: 1.0, sx: 0.02, sy: 0.06, scale: 1.3,  bright: 0.6,  spin: 0.06,
    top: '#020408', bot: '#050e16', g1: '#092733', p1: [0.5, 0.55], g2: '#120d26', p2: [0.9, 0.1], ocean: 0.65, oceanA: '#2a8ea0', oceanB: '#3b6fd8' },
  { dist: 33, theta: 2.55, phi: 0.62, lookY: 0.0, sx: -0.04, sy: 0.0, scale: 1.0, bright: 0.8, spin: 0.035,
    top: '#03040a', bot: '#0a0915', g1: '#1f1128', p1: [0.55, 0.5], g2: '#08212a', p2: [0.1, 0.1], ocean: 0.7, oceanA: '#8f86d6', oceanB: '#e2584c' },
  { dist: 29, theta: 3.3,  phi: 0.1,  lookY: 0.0, sx: -0.56, sy: 0.0,  scale: 1.0,  bright: 0.85, spin: 0.12,
    top: '#03050a', bot: '#051016', g1: '#092c25', p1: [0.22, 0.5], g2: '#20150d', p2: [0.7, 1.0], ocean: 0.8, oceanA: '#5cc39b', oceanB: '#2a8ea0' },
  { dist: 33, theta: 4.1,  phi: 0.3,  lookY: 1.5, sx: 0.0,  sy: -0.3, scale: 1.35, bright: 0.95, spin: 0.045,
    top: '#060509', bot: '#170e0c', g1: '#4a2812', p1: [0.5, 0.2], g2: '#191230', p2: [0.85, 0.95], ocean: 0.75, oceanA: '#f0b88c', oceanB: '#8f86d6' }
];
const N = SHOTS.length;
const COLOR_KEYS = ['top', 'bot', 'g1', 'g2', 'oceanA', 'oceanB'];
SHOTS.forEach((s) => COLOR_KEYS.forEach((k) => { s[k] = new THREE.Color(s[k]); }));

/* ----------------------------------------------------------------------
   Shape builder
   Each particle stores, per shape: position (vec3 float) and a packed
   byte vec4 → along-path (r), path id (g), colour + special index (b), size (a).
   ---------------------------------------------------------------------- */
function shapeBuffer(n) { return { p: new Float32Array(n * 3), m: new Uint8Array(n * 4), i: 0, n }; }
function emit(S, x, y, z, color = CYAN, size = 1, along = 0, group = 0, special = -1) {
  if (S.i >= S.n) return false;
  const k = S.i++;
  S.p[k * 3] = x; S.p[k * 3 + 1] = y; S.p[k * 3 + 2] = z;
  S.m[k * 4] = Math.round(clamp(along, 0, 1) * 255);
  S.m[k * 4 + 1] = group & 255;
  S.m[k * 4 + 2] = color + 16 * (special + 1);
  S.m[k * 4 + 3] = Math.round(clamp((size - 0.35) / 3, 0, 1) * 255);
  return true;
}
function fill(S, fn) { while (S.i < S.n) fn(); }
const quota = (S, f) => Math.floor(S.n * f);

/* 0 — globe with live routes out of Amritapuri */
function buildGlobe(S) {
  const R = 7;
  const at = (lat, lon, r = R) => {
    const la = lat * D2R, lo = (lon - 76.49) * D2R;   // Amritapuri faces the camera
    return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)];
  };
  // dotted graticule
  for (let k = quota(S, 0.24); k > 0;) {
    if (rand() < 0.5) {
      const lat = -75 + 15 * Math.floor(rand() * 11);
      if (rand() > Math.cos(lat * D2R)) continue;
      const [x, y, z] = at(lat, rand() * 360); emit(S, x, y, z, rand() < 0.75 ? CYAN : BLUE, 0.75);
    } else {
      const [x, y, z] = at(-88 + rand() * 176, Math.floor(rand() * 12) * 30); emit(S, x, y, z, rand() < 0.75 ? CYAN : BLUE, 0.75);
    }
    k--;
  }
  // landmass scatter
  for (let k = quota(S, 0.3), guard = 0; k > 0 && guard < 4e6; guard++) {
    const [ux, uy, uz] = onSphere();
    const v = fbm3(ux * 1.7 + 3.1, uy * 1.7, uz * 1.7 - 2.3);
    if (v > 0.54 || rand() < 0.04) {
      emit(S, ux * R, uy * R, uz * R, v > 0.54 ? (rand() < 0.6 ? WARM : CYAN) : VIOLET, rand() < 0.03 ? 2.2 : 0.95);
      k--;
    }
  }
  // routes to data-centre cities, lifted great circles with travelling signal
  const B = at(9.09, 76.49, 1);
  const cities = [[1.35, 103.8], [50.1, 8.7], [38.9, -77.4], [35.7, 139.7], [-23.5, -46.6], [-33.9, 151.2], [51.5, -0.1], [25.2, 55.3], [37.8, -122.4], [19.1, 72.9]];
  const vb = new THREE.Vector3(...B), va = new THREE.Vector3(), tmp = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const nArc = quota(S, 0.17);
  for (let k = 0; k < nArc; k++) {
    const ci = k % cities.length;
    va.set(...at(cities[ci][0], cities[ci][1], 1));
    const ang = vb.angleTo(va);
    const t = rand();
    // slerp between unit vectors
    qa.setFromUnitVectors(vb, va); qb.identity().slerp(qa, t);
    tmp.copy(vb).applyQuaternion(qb);
    const lift = R * (1 + (0.12 + ang * 0.14) * Math.sin(Math.PI * t));
    emit(S, tmp.x * lift, tmp.y * lift, tmp.z * lift, rand() < 0.8 ? CYAN : WARM, 0.9, t, ci + 1);
  }
  // city nodes
  for (let k = quota(S, 0.03); k > 0; k--) {
    const c = cities[k % cities.length]; const [x, y, z] = at(c[0], c[1], R * 1.01);
    emit(S, x + gauss() * 0.1, y + gauss() * 0.1, z + gauss() * 0.1, WARM, 1.5);
  }
  // orbital rings
  const tiltX = 0.45, tiltZ = 0.22, cx = Math.cos(tiltX), sxn = Math.sin(tiltX), cz = Math.cos(tiltZ), szn = Math.sin(tiltZ);
  for (let k = quota(S, 0.14); k > 0; k--) {
    const outer = rand() < 0.3, r = (outer ? 12.2 : 10.4) + gauss() * 0.07, a = rand() * TAU;
    let x = Math.cos(a) * r, y = gauss() * 0.04, z = Math.sin(a) * r;
    const y1 = y * cx - z * sxn, z1 = y * sxn + z * cx; y = y1; z = z1;
    const x2 = x * cz - y * szn, y2 = x * szn + y * cz;
    emit(S, x2, y2, z, outer ? VIOLET : CYAN, outer ? 0.6 : 0.75, a / TAU, outer ? 41 : 40);
  }
  // Amritapuri beacon + beam
  for (let k = quota(S, 0.06); k > 0; k--) {
    if (rand() < 0.55) emit(S, B[0] * R + gauss() * 0.16, B[1] * R + gauss() * 0.16, B[2] * R + gauss() * 0.16, EMERALD, 1.7, 0, 0, 0);
    else { const t = rand(), r = R + t * 3.4; emit(S, B[0] * r, B[1] * r, B[2] * r, EMERALD, 1.0, t, 50, 0); }
  }
  fill(S, () => { const [x, y, z] = onSphere(), r = R * (1.15 + rand() * 0.6); emit(S, x * r, y * r, z * r, VIOLET, 0.5); });
}

/* 1 — five-layer network: Security → Data → Intelligence → Application → Impact */
function buildNetwork(S) {
  const counts = [6, 9, 12, 9, 5];
  const colors = [ALERT, WARM, CYAN, VIOLET, EMERALD];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const layers = counts.map((n, l) => {
    const x = -7.6 + l * 3.8, arr = [];
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt((i + 0.5) / n) * (1.3 + n * 0.3);
      arr.push([x, Math.sin(i * golden) * r, Math.cos(i * golden) * r]);
    }
    return arr;
  });
  const edges = [];
  for (let l = 0; l < layers.length - 1; l++) {
    layers[l].forEach((p) => {
      const next = layers[l + 1];
      for (let j = 0; j < 3; j++) edges.push([p, next[Math.floor(rand() * next.length)], l]);
    });
  }
  // neurons
  for (let k = quota(S, 0.22); k > 0; k--) {
    const l = Math.floor(rand() * layers.length), p = layers[l][Math.floor(rand() * layers[l].length)];
    const hot = rand() < 0.2;
    emit(S, p[0] + gauss() * 0.18, p[1] + gauss() * 0.18, p[2] + gauss() * 0.18, hot ? HOT : colors[l], hot ? 1.8 : 1.1);
  }
  // layer rings
  for (let k = quota(S, 0.13); k > 0; k--) {
    const l = Math.floor(rand() * layers.length), r = 1.3 + counts[l] * 0.3 + 0.9, a = rand() * TAU;
    emit(S, layers[l][0][0], Math.sin(a) * r, Math.cos(a) * r, colors[l], 0.6);
  }
  // synapses: one wave of signal travelling through the whole system
  for (let k = quota(S, 0.55); k > 0; k--) {
    const [a, b, l] = edges[Math.floor(rand() * edges.length)], t = rand();
    const bow = Math.sin(Math.PI * t) * 0.25;
    emit(S, lerp(a[0], b[0], t), lerp(a[1], b[1], t) + bow, lerp(a[2], b[2], t), rand() < 0.7 ? CYAN : VIOLET, 0.7, (l + t) / 4, 60);
  }
  fill(S, () => emit(S, (rand() - 0.5) * 22, gauss() * 4.5, gauss() * 4.5, VIOLET, 0.45));
}

/* 2 — geodesic defence lattice around a protected core */
function buildLattice(S) {
  const R = 8.4;
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const verts = [], vIndex = new Map(), edgeSet = new Set(), edges = [];
  const key = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(4)).join(',');
  const vid = (i) => {
    const k = key(i);
    if (!vIndex.has(k)) { vIndex.set(k, verts.length); verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]); }
    return vIndex.get(k);
  };
  for (let i = 0; i < pos.count; i += 3) {
    const a = vid(i), b = vid(i + 1), c = vid(i + 2);
    [[a, b], [b, c], [c, a]].forEach(([u, v]) => {
      const k = u < v ? u + ':' + v : v + ':' + u;
      if (!edgeSet.has(k)) { edgeSet.add(k); edges.push([verts[u], verts[v]]); }
    });
  }
  geo.dispose();
  // lattice edges
  for (let k = quota(S, 0.46); k > 0; k--) {
    const ei = Math.floor(rand() * edges.length), [a, b] = edges[ei], t = rand();
    let x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t), z = lerp(a[2], b[2], t);
    const l = R / Math.hypot(x, y, z);
    emit(S, x * l, y * l, z * l, rand() < 0.8 ? CYAN : BLUE, 0.75, t, 1 + (ei % 250));
  }
  // lattice nodes
  for (let k = quota(S, 0.1); k > 0; k--) {
    const v = verts[Math.floor(rand() * verts.length)];
    emit(S, v[0] * R + gauss() * 0.12, v[1] * R + gauss() * 0.12, v[2] * R + gauss() * 0.12, WARM, 1.4);
  }
  // protected core
  for (let k = quota(S, 0.22); k > 0; k--) {
    const [x, y, z] = onSphere(), band = Math.abs(Math.sin(y * 9)) > 0.55;
    const r = 3.1 + gauss() * 0.05;
    emit(S, x * r, y * r, z * r, band ? AMBER : WARM, band ? 1.1 : 0.8);
  }
  // spokes from core to shell
  for (let k = quota(S, 0.12); k > 0; k--) {
    const si = Math.floor(rand() * 12), v = verts[si], t = rand(), r = lerp(3.2, R, t);
    emit(S, v[0] * r, v[1] * r, v[2] * r, CYAN, 0.7, t, 200 + si);
  }
  fill(S, () => { const [x, y, z] = onSphere(), r = R * (1.1 + rand() * 0.5); emit(S, x * r, y * r, z * r, VIOLET, 0.45); });
}

/* 3 — the stack: six plates, same order as the layers diagram */
function buildStack(S) {
  const colors = [WARM, CYAN, BLUE, VIOLET, ALERT, EMERALD];
  const H = 4.3, gap = 3.1, top = 7.75;
  const iso = (u, v, y) => [(u - v) * 0.7071, y, (u + v) * 0.7071];
  const perPlate = quota(S, 0.145);
  for (let i = 0; i < 6; i++) {
    const y = top - i * gap;
    for (let k = 0; k < perPlate; k++) {
      const r = rand(); let u, v, size = 0.7;
      if (r < 0.34) { u = (Math.floor(rand() * 7) / 6) * 2 * H - H; v = rand() * 2 * H - H; }
      else if (r < 0.6) { v = (Math.floor(rand() * 7) / 6) * 2 * H - H; u = rand() * 2 * H - H; }
      else if (r < 0.92) { const e = Math.floor(rand() * 4), t = rand() * 2 * H - H; u = e === 0 ? -H : e === 1 ? H : t; v = e === 2 ? -H : e === 3 ? H : t; size = 1.0; }
      else { u = rand() * 2 * H - H; v = rand() * 2 * H - H; size = 0.5; }
      const [x, yy, z] = iso(u, v, y + gauss() * 0.03);
      emit(S, x, yy, z, colors[i], size, 0, 0, i);
    }
  }
  // connectors carrying signal down the stack
  const posts = [[0, 0]];
  for (let k = quota(S, 0.08); k > 0; k--) {
    const pi = 0, t = rand();
    const [x, y, z] = iso(posts[pi][0], posts[pi][1], top - t * gap * 5);
    emit(S, x + gauss() * 0.05, y, z + gauss() * 0.05, rand() < 0.5 ? HOT : CYAN, 0.8, t, 80);
  }
  fill(S, () => { const [x, y, z] = iso((rand() - 0.5) * 18, (rand() - 0.5) * 18, (rand() - 0.5) * 20); emit(S, x, y, z, VIOLET, 0.4); });
}

/* 4 — journey: rising double helix with six milestones */
function buildHelix(S) {
  const R = 3.3, Y = 9, turns = 2.3;
  const strand = (t, off) => { const a = t * TAU * turns + off; return [Math.cos(a) * R, -Y + t * 2 * Y, Math.sin(a) * R]; };
  for (let k = quota(S, 0.5); k > 0; k--) {
    const b = rand() < 0.5, t = rand(), [x, y, z] = strand(t, b ? Math.PI : 0);
    emit(S, x + gauss() * 0.06, y + gauss() * 0.06, z + gauss() * 0.06, b ? VIOLET : CYAN, 0.85, t, b ? 91 : 90);
  }
  for (let k = quota(S, 0.11); k > 0; k--) {
    const t = Math.floor(rand() * 40) / 40 + 0.0125, s = rand(), a = strand(t, 0), b = strand(t, Math.PI);
    emit(S, lerp(a[0], b[0], s), lerp(a[1], b[1], s), lerp(a[2], b[2], s), WARM, 0.5);
  }
  for (let k = quota(S, 0.24); k > 0; k--) {
    const i = Math.floor(rand() * 6), y = -Y + ((i + 0.5) / 6) * 2 * Y;
    if (rand() < 0.5) emit(S, gauss() * 0.28, y + gauss() * 0.28, gauss() * 0.28, WARM, 1.6, 0, 0, i);
    else { const a = rand() * TAU, r = 1.15 + gauss() * 0.04; emit(S, Math.cos(a) * r, y, Math.sin(a) * r, AMBER, 0.8, a / TAU, 100 + i, i); }
  }
  fill(S, () => {
    const t = rand(), a = t * TAU * 1.2 + gauss() * 0.4, r = 6 + rand() * 3.5;
    emit(S, Math.cos(a) * r, -Y - 1 + t * (2 * Y + 2), Math.sin(a) * r, rand() < 0.5 ? EMERALD : CYAN, 0.45);
  });
}

/* 5 — afterlight galaxy */
function buildGalaxy(S) {
  for (let k = quota(S, 0.17); k > 0; k--) {
    const r = Math.abs(gauss()) * 1.7, a = rand() * TAU;
    emit(S, Math.cos(a) * r, gauss() * 0.4 * Math.exp(-r * 0.3), Math.sin(a) * r, rand() < 0.6 ? AMBER : HOT, 1.1);
  }
  for (let k = quota(S, 0.52); k > 0; k--) {
    const arm = rand() < 0.5 ? 0 : Math.PI, r = 1.4 + Math.pow(rand(), 0.85) * 13;
    const a = arm + Math.log(r) * 2.3 + gauss() * (0.22 + r * 0.012);
    const col = r < 4.5 ? AMBER : r < 9 ? (rand() < 0.5 ? WARM : AMBER) : (rand() < 0.6 ? CYAN : VIOLET);
    emit(S, Math.cos(a) * r, gauss() * 0.22, Math.sin(a) * r, col, rand() < 0.02 ? 2.0 : 0.8);
  }
  for (let k = quota(S, 0.13); k > 0; k--) {
    const a = rand() * TAU, r = 16 + gauss() * 0.12;
    emit(S, Math.cos(a) * r, gauss() * 0.05, Math.sin(a) * r, rand() < 0.6 ? CYAN : VIOLET, 0.7, a / TAU, 120);
  }
  fill(S, () => { const a = rand() * TAU, r = Math.sqrt(rand()) * 19; emit(S, Math.cos(a) * r, gauss() * 0.6, Math.sin(a) * r, VIOLET, 0.4); });
}

/* particle k of every shape shares the same height rank, so re-forming flows
   instead of exploding; one shared shuffle keeps any draw-range cut random */
function orderShapes(shapes, n) {
  const ranked = shapes.map((S) => {
    const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
    return Array.from(idx).sort((a, b) => S.p[a * 3 + 1] - S.p[b * 3 + 1]);
  });
  const perm = new Uint32Array(n); for (let i = 0; i < n; i++) perm[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  return shapes.map((S, s) => {
    const p = new Float32Array(n * 3), m = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      const src = ranked[s][perm[k]];
      p.set(S.p.subarray(src * 3, src * 3 + 3), k * 3);
      m.set(S.m.subarray(src * 4, src * 4 + 4), k * 4);
    }
    return { p, m };
  });
}

/* ----------------------------------------------------------------------
   Shaders
   ---------------------------------------------------------------------- */
const HASH_GLSL = /* glsl */`
  float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  vec3 hash31(float n) { return fract(sin(vec3(n * 127.1, n * 311.7, n * 74.7)) * 43758.5453); }
`;

const coreVertex = /* glsl */`
  attribute vec3 aP1, aP2, aP3, aP4, aP5;
  attribute vec4 aM0, aM1, aM2, aM3, aM4, aM5;
  attribute float aSeed;
  uniform float uMorph, uTime, uScale, uBright, uIntro, uSize;
  uniform float uStack[6];
  uniform float uMile[6];
  uniform vec3 uPal[8];
  varying vec3 vColor;
  varying float vAlpha;
  ${HASH_GLSL}

  void look(int s, vec4 m, out vec3 col, out float bright, out float size) {
    float along = m.r;
    float grp = floor(m.g * 255.0 + 0.5);
    float code = floor(m.b * 255.0 + 0.5);
    float sp = floor(code / 16.0) - 1.0;
    col = uPal[int(mod(code, 16.0))];
    size = 0.35 + m.a * 3.0;
    bright = 1.0;
    if (grp > 0.5) {
      float h = fract(uTime * (0.1 + hash11(grp) * 0.09) + hash11(grp + 3.7));
      float d = abs(along - h); d = min(d, 1.0 - d);
      float p = exp(-d * d * 700.0);
      bright += p * 3.2;
      size *= 1.0 + p * 1.3;
      col = mix(col, uPal[7], p * 0.55);
    }
    if (sp > -0.5) {
      int k = int(sp);
      if (s == 0) { bright *= 1.3 + (0.5 + 0.5 * sin(uTime * 2.6)) * 1.4; }
      else if (s == 3) { bright *= 0.4 + uStack[k] * 1.9; size *= 1.0 + uStack[k] * 0.25; }
      else if (s == 4) { float a = uMile[k]; bright *= 0.35 + a * 2.4; size *= 1.0 + a * 0.5; col = mix(col, uPal[5], a * 0.5); }
    }
  }

  void main() {
    vec3 P[6] = vec3[6](position, aP1, aP2, aP3, aP4, aP5);
    vec4 M[6] = vec4[6](aM0, aM1, aM2, aM3, aM4, aM5);
    float mm = clamp(uMorph, 0.0, 5.0);
    int i0 = int(min(floor(mm), 4.0));
    float f = mm - float(i0);
    // staggered per particle, so each form re-assembles like a swarm
    float st = aSeed * 0.45;
    float g = smoothstep(st, st + 0.55, f);
    vec3 p = mix(P[i0], P[i0 + 1], g);

    float tr = sin(3.14159 * g);
    vec3 rnd = hash31(aSeed * 91.7) - 0.5;
    p += rnd * tr * (3.0 + aSeed * 5.0);
    float sw = tr * (0.9 + aSeed * 1.2);
    float cs = cos(sw), sn = sin(sw);
    p.xz = mat2(cs, -sn, sn, cs) * p.xz;
    p += 0.06 * sin(uTime * 0.6 + aSeed * vec3(13.0, 17.0, 19.0) * 6.2831);

    // first load: gather in from a wide cloud
    float intro = uIntro * uIntro * (3.0 - 2.0 * uIntro);
    p = mix(normalize(rnd + 1e-4) * (16.0 + aSeed * 22.0), p, intro);

    vec3 c0, c1; float b0, b1, s0, s1;
    look(i0, M[i0], c0, b0, s0);
    look(i0 + 1, M[i0 + 1], c1, b1, s1);
    vec3 col = mix(c0, c1, g);
    float bright = mix(b0, b1, g);
    float size = mix(s0, s1, g);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = max(-mv.z, 0.5);
    float px = size * uSize * uScale / depth;
    float ps = max(px, 1.0);
    gl_PointSize = min(ps, 64.0);
    float twinkle = 0.8 + 0.2 * sin(uTime * 1.7 + aSeed * 310.0);
    vAlpha = bright * uBright * twinkle * (px * px) / (ps * ps) * smoothstep(1.0, 6.0, depth) * mix(0.0, 1.0, intro);
    vColor = col;
    gl_Position = projectionMatrix * mv;
  }
`;

const pointFragment = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d2 = dot(c, c);
    float a = max(1.0 - d2, 0.0);
    a *= a;
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <colorspace_fragment>
  }
`;

const oceanVertex = /* glsl */`
  attribute float aSeed;
  uniform float uTime, uScale, uBright;
  uniform vec3 uColA, uColB;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float w = sin(p.x * 0.11 + uTime * 0.45) * 0.9
            + sin(p.z * 0.085 - uTime * 0.32 + p.x * 0.035) * 1.1
            + sin((p.x + p.z) * 0.2 + uTime * 0.7) * 0.35;
    float dist = length(p.xz);
    float R = fract(uTime * 0.045) * 110.0;
    float ring = exp(-pow(dist - R, 2.0) * 0.04) * (1.0 - R / 110.0);
    p.y += w + ring * 1.4;
    float crest = smoothstep(0.4, 2.1, w);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = max(-mv.z, 0.5);
    float px = (0.9 + crest * 0.9 + ring * 1.5) * 0.1 * uScale / depth;
    float ps = max(px, 1.0);
    gl_PointSize = min(ps, 16.0);
    vColor = mix(uColA, uColB, clamp(dist / 90.0 + (1.0 - crest) * 0.25, 0.0, 1.0));
    vColor = mix(vColor, vec3(1.0, 0.96, 0.9), ring * 0.5);
    vAlpha = uBright * (0.5 + crest * 1.1 + ring * 1.6) * (px * px) / (ps * ps)
           * exp(-depth * 0.014) * smoothstep(4.0, 16.0, depth) * (1.0 - smoothstep(70.0, 100.0, dist));
    gl_Position = projectionMatrix * mv;
  }
`;

const starVertex = /* glsl */`
  attribute float aSeed;
  uniform float uTime, uScale;
  uniform vec3 uPal[8];
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(-mv.z, 1.0);
    float px = (0.6 + aSeed * aSeed * 2.4) * 0.5 * uScale / depth;
    float ps = max(px, 1.0);
    gl_PointSize = min(ps, 6.0);
    vColor = aSeed > 0.7 ? uPal[0] : aSeed > 0.4 ? uPal[2] : uPal[1];
    vAlpha = (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.4 + aSeed) + aSeed * 90.0))) * (px * px) / (ps * ps) * 0.9;
    gl_Position = projectionMatrix * mv;
  }
`;

const skyFragment = /* glsl */`
  uniform vec3 uTop, uBot, uG1, uG2;
  uniform vec2 uP1, uP2;
  uniform float uAspect, uTime;
  varying vec2 vUv;
  void main() {
    vec3 col = mix(uBot, uTop, smoothstep(0.0, 1.0, vUv.y));
    vec2 a = vec2(uAspect, 1.0);
    vec2 d1 = (vUv - uP1) * a; col += uG1 * exp(-dot(d1, d1) * 2.4);
    vec2 d2 = (vUv - uP2) * a; col += uG2 * exp(-dot(d2, d2) * 3.2);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    // dither to kill banding in the dark gradient
    float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor.rgb += (n - 0.5) / 255.0;
  }
`;

/* ----------------------------------------------------------------------
   World
   ---------------------------------------------------------------------- */
function init() {
  const quality = detectQuality();
  const P = PRESETS[quality];
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  let reduced = mqReduced.matches || saveData;
  let dprNow = Math.min(window.devicePixelRatio || 1, P.dpr);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: quality === 'low' ? 'low-power' : 'high-performance'
  });
  renderer.setPixelRatio(dprNow);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x04060a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 1200);
  const palette = PAL.map((h) => new THREE.Color(h));
  const blend = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending };

  /* ---------- sky ---------- */
  const skyGeo = new THREE.BufferGeometry();
  skyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uG1: { value: new THREE.Color() }, uG2: { value: new THREE.Color() },
      uP1: { value: new THREE.Vector2() }, uP2: { value: new THREE.Vector2() },
      uAspect: { value: 1 }, uTime: { value: 0 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: skyFragment,
    depthTest: false, depthWrite: false
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false; sky.renderOrder = 0;
  scene.add(sky);

  /* ---------- stars ---------- */
  const starGeo = new THREE.BufferGeometry();
  {
    const n = P.stars, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = onSphere(), r = 260 + rand() * 260;
      pos.set([x * r, Math.abs(y) * r * 0.9 + 10, z * r], i * 3);
      seed[i] = rand();
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  }
  const starMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uPal: { value: palette } }, vertexShader: starVertex, fragmentShader: pointFragment, ...blend });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false; stars.renderOrder = 1;
  scene.add(stars);

  /* ---------- data ocean ---------- */
  const oceanGeo = new THREE.BufferGeometry();
  {
    const E = 100, step = P.oceanStep, side = Math.floor((2 * E) / step);
    const n = side * side, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
      const k = i * side + j;
      pos[k * 3] = -E + i * step + (rand() - 0.5) * step * 0.3;
      pos[k * 3 + 1] = -14;
      pos[k * 3 + 2] = -E + j * step + (rand() - 0.5) * step * 0.3;
      seed[k] = rand();
    }
    oceanGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    oceanGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  }
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uBright: { value: 1 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() } },
    vertexShader: oceanVertex, fragmentShader: pointFragment, ...blend
  });
  const ocean = new THREE.Points(oceanGeo, oceanMat);
  ocean.frustumCulled = false; ocean.renderOrder = 2;
  scene.add(ocean);

  /* ---------- signal core ---------- */
  const count = P.core;
  const builders = [buildGlobe, buildNetwork, buildLattice, buildStack, buildHelix, buildGalaxy];
  const shapes = orderShapes(builders.map((b) => { const S = shapeBuffer(count); b(S); return S; }), count);
  const coreGeo = new THREE.BufferGeometry();
  shapes.forEach((sh, i) => {
    coreGeo.setAttribute(i === 0 ? 'position' : 'aP' + i, new THREE.BufferAttribute(sh.p, 3));
    coreGeo.setAttribute('aM' + i, new THREE.BufferAttribute(sh.m, 4, true));
  });
  {
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = rand();
    coreGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  }
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uMorph: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1 }, uBright: { value: 1 },
      uIntro: { value: reduced ? 1 : 0 }, uSize: { value: quality === 'low' ? 0.07 : 0.05 },
      uStack: { value: new Float32Array(6) }, uMile: { value: new Float32Array(6) }, uPal: { value: palette }
    },
    vertexShader: coreVertex, fragmentShader: pointFragment, ...blend
  });
  const core = new THREE.Points(coreGeo, coreMat);
  core.frustumCulled = false; core.renderOrder = 3;
  scene.add(core);

  /* ---------- per-frame scene state ---------- */
  const shot = { top: new THREE.Color(), bot: new THREE.Color(), g1: new THREE.Color(), g2: new THREE.Color(), oceanA: new THREE.Color(), oceanB: new THREE.Color() };
  let portrait = 0;
  let cur = 0, time = 0, spinAngle = 0, px = 0, py = 0;
  const bootTime = performance.now();
  const stackActive = new Float32Array(6), mileActive = new Float32Array(6);

  // flawlessly track the scroll progress
  function ease(c) {
    return c;
  }

  function sampleShot(e) {
    const i = Math.min(Math.floor(e), N - 2), f = clamp(e - i, 0, 1);
    const a = SHOTS[i], b = SHOTS[i + 1];
    ['dist', 'theta', 'phi', 'lookY', 'sx', 'sy', 'scale', 'bright', 'spin', 'ocean'].forEach((k) => { shot[k] = lerp(a[k], b[k], f); });
    COLOR_KEYS.forEach((k) => shot[k].copy(a[k]).lerp(b[k], f));
    shot.p1x = lerp(a.p1[0], b.p1[0], f); shot.p1y = lerp(a.p1[1], b.p1[1], f);
    shot.p2x = lerp(a.p2[0], b.p2[0], f); shot.p2y = lerp(a.p2[1], b.p2[1], f);
  }

  function targetProgress() {
    return typeof state.progressAt === 'function' ? state.progressAt() : (state.c || 0);
  }

  function applyScene(dt, targetC, immediate) {
    // scroll → world perfectly in sync
    cur = targetC;
    const e = ease(clamp(cur, 0, N - 1));
    sampleShot(e);

    const motion = reduced ? 0 : 1;
    time += dt * motion;
    if (reduced) time = 14.0;

    if (!reduced && !immediate) {
      px = state.pointerX;
      py = state.pointerY;
    }

    // camera orbit around the core
    const dist = shot.dist * lerp(1, 1.25, portrait);
    const theta = shot.theta + px * 0.12;
    const phi = clamp(shot.phi + py * 0.06, -0.2, 1.1);
    camera.position.set(Math.sin(theta) * Math.cos(phi) * dist, shot.lookY + Math.sin(phi) * dist, Math.cos(theta) * Math.cos(phi) * dist);
    camera.lookAt(0, shot.lookY, 0);
    camera.updateMatrixWorld();
    const pe = camera.projectionMatrix.elements;
    pe[8] = -shot.sx * lerp(1, 0.08, portrait);
    pe[9] = -(shot.sy + portrait * 0.12);

    spinAngle += dt * shot.spin * motion;
    core.rotation.y = spinAngle;
    core.scale.setScalar(shot.scale);
    stars.rotation.y = time * 0.004;

    coreMat.uniforms.uMorph.value = e;
    coreMat.uniforms.uTime.value = time;
    coreMat.uniforms.uBright.value = shot.bright * lerp(1, 0.95, portrait);
    if (!reduced) coreMat.uniforms.uIntro.value = clamp((performance.now() - bootTime - 250) / 2600, 0, 1);

    // stack plates follow the group being read
    const inStack = state.chapter === 3;
    for (let i = 0; i < 6; i++) {
      const goal = inStack ? 0.32 + (state.stack ? state.stack[i] : 0) * 0.8 : 0.5;
      stackActive[i] = goal;
      const mg = state.chapter >= 4 ? (i === state.journey ? 1 : i < state.journey ? 0.5 : 0.12) : 0.3;
      mileActive[i] = mg;
    }
    coreMat.uniforms.uStack.value = stackActive;
    coreMat.uniforms.uMile.value = mileActive;

    oceanMat.uniforms.uTime.value = time;
    oceanMat.uniforms.uBright.value = shot.ocean;
    oceanMat.uniforms.uColA.value.copy(shot.oceanA);
    oceanMat.uniforms.uColB.value.copy(shot.oceanB);
    starMat.uniforms.uTime.value = time;

    const su = skyMat.uniforms;
    su.uTop.value.copy(shot.top); su.uBot.value.copy(shot.bot);
    su.uG1.value.copy(shot.g1); su.uG2.value.copy(shot.g2);
    su.uP1.value.set(shot.p1x, shot.p1y); su.uP2.value.set(shot.p2x, shot.p2y);
    su.uTime.value = time;
  }

  /* ---------- sizing ---------- */
  let lastW = window.innerWidth, lastH = window.innerHeight;
  function resize(force) {
    const w = window.innerWidth, h = window.innerHeight;
    const coarse = matchMedia('(pointer: coarse)').matches;
    // ignore mobile URL-bar height jitter; the canvas stretches via CSS meanwhile
    if (!force && coarse && w === lastW && Math.abs(h - lastH) < 160) return;
    lastW = w; lastH = h;
    renderer.setPixelRatio(dprNow);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    portrait = clamp((1.15 - aspect) * 1.6, 0, 1);
    camera.aspect = aspect;
    camera.fov = lerp(42, 58, portrait);
    camera.updateProjectionMatrix();
    const scale = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * D2R) / 2));
    coreMat.uniforms.uScale.value = scale;
    oceanMat.uniforms.uScale.value = scale;
    starMat.uniforms.uScale.value = scale;
    skyMat.uniforms.uAspect.value = aspect;
    if (reduced) renderStatic();
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => resize(false), 150); });
  resize(true);

  /* ---------- adaptive quality ----------
     Learns the display refresh rate, then steps down only if frames stay
     below it: resolution first, then particle count, then the ocean. */
  let running = false, raf = 0, last = performance.now();
  const deltas = [];
  let targetHz = 0, winT = 0, winN = 0, strikes = 0, coreDraw = count;

  function degrade() {
    if (dprNow > 0.85) { dprNow = Math.max(0.75, dprNow - 0.25); resize(true); return; }
    if (coreDraw > count * 0.5) { coreDraw = Math.floor(coreDraw * 0.7); coreGeo.setDrawRange(0, coreDraw); return; }
    if (ocean.visible) { ocean.visible = false; return; }
    reduced = true; stop(); renderStatic();
  }
  function adapt(ms, now) {
    if (now - bootTime < 1800 || ms > 250 || root.classList.contains('dialog-open')) return;
    if (!targetHz) {
      deltas.push(ms);
      if (deltas.length >= 90) {
        deltas.sort((a, b) => a - b);
        const hz = 1000 / deltas[45];
        targetHz = Math.max(60, [60, 75, 90, 100, 120, 144, 165, 240].reduce((best, v) => (Math.abs(v - hz) < Math.abs(best - hz) ? v : best), 60));
      }
      return;
    }
    winT += ms; winN++;
    if (winT < 2000) return;
    const fps = (winN * 1000) / winT;
    winT = 0; winN = 0;
    if (fps < targetHz * 0.8) { if (++strikes >= 2) { strikes = 0; degrade(); } } else strikes = 0;
  }

  let skip = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const ms = now - last;
    // a case file is open: nothing to watch behind it, spend the GPU on the dialog
    if (root.classList.contains('dialog-open')) { skip = !skip; if (skip) return; }
    last = now;
    const dt = Math.min(ms / 1000, 0.066);
    applyScene(dt, targetProgress(), now - bootTime < 900);
    renderer.render(scene, camera);
    adapt(ms, now);
  }
  function start() {
    if (running || reduced || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function renderStatic() {
    // reduced motion: hold each chapter's composition, cut on chapter change
    applyScene(0, state.chapter || 0, true);
    renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (reduced) renderStatic();
    else start();
  });
  window.addEventListener('portfolio:chapter', () => { if (reduced) renderStatic(); });
  window.addEventListener('portfolio:motion', (e) => {
    reduced = !!(e.detail && e.detail.reduced) || saveData;
    if (reduced) { stop(); coreMat.uniforms.uIntro.value = 1; renderStatic(); }
    else start();
  });

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); root.classList.add('no-webgl'); });

  window.addEventListener('pagehide', (e) => {
    stop();
    if (e.persisted) return;
    [skyGeo, starGeo, oceanGeo, coreGeo, skyMat, starMat, oceanMat, coreMat].forEach((d) => d.dispose());
    renderer.dispose();
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) (reduced ? renderStatic() : start()); });

  // first frame
  applyScene(0, reduced ? state.chapter || 0 : targetProgress(), true);
  renderer.render(scene, camera);
  canvas.classList.add('is-ready');
  root.classList.add('webgl-ready');
  root.setAttribute('data-quality', quality);
  if (reduced) renderStatic(); else start();
}

if (!canvas || !webgl2Available()) {
  root.classList.add('no-webgl');
} else {
  try { init(); } catch (err) {
    console.warn('[world] WebGL environment disabled:', err);
    root.classList.add('no-webgl');
  }
}
