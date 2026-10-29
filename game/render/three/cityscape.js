// Cidade em volta da academia, em 3D low poly: ruas, calçadas, casas,
// sobrados, lojas com toldo e letreiro, prédios, torres de vidro, galpões,
// praças, rio com ponte, postes, árvores, carros passando e pedestres.
// A planta vem de cityLayout.js. Só os lados que a câmera enxerga (sul e
// leste) ganham porta e janelas, para economizar geometria.
import * as THREE from 'three';
import { PROFILE_IDS } from '../../config.js';
import { createLook } from '../../simulation/students.js';
import { createRng, nextRandom } from '../../utils/random.js';
import { INK, FONT_TITLE, FONT_UI, box as roundedBox } from '../draw/primitives.js';
import { Builder, MATS, solid, col, cached } from './kit.js';
import { makePerson, posePerson } from './models.js';
import { cityPlan } from '../cityLayout.js';

const PI = Math.PI;
const ASPHALT = '#b9b4c4';
const WALKWAY = '#e9e4dc';
const CURB = '#d9d2c8';
const FRAME = '#fffdf8';
const PANE = '#9fbfd6';
const CANOPY = ['#9ccf8a', '#8cc47a', '#a8d896', '#7fba6e'];
const CAM_TILT = -0.5;
const CAM_AZIMUTH = THREE.MathUtils.degToRad(30);

// Janelas acesas e lâmpadas: um material só, que acende à noite.
const glowMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const DAY_TINT = new THREE.Color('#ffffff');
const NIGHT_TINT = new THREE.Color('#6d6a86');
const NIGHT_GLOW = new THREE.Color('#ffc964');
const NO_GLOW = new THREE.Color('#000000');

const hash = (seed, i) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Telhado de quatro águas: pirâmide de base quadrada já alinhada aos eixos. */
const hipRoof = () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(PI / 4);

/** Retângulo útil do prédio dentro do lote, recuado na frente (quintal) e com teto de tamanho. */
function footprint(lot, { margin = 0.3, front = 0, maxW = 99, maxD = 99 } = {}) {
  let x0 = lot.x0 + margin;
  let x1 = lot.x1 - margin;
  let z0 = lot.z0 + margin;
  let z1 = lot.z1 - margin;
  if (lot.face === 's') z1 -= front;
  if (lot.face === 'n') z0 += front;
  if (lot.face === 'e') x1 -= front;
  if (lot.face === 'w') x0 += front;
  // encolhe pelos fundos (a frente continua na rua)
  if (x1 - x0 > maxW) {
    if (lot.face === 'w') x1 = x0 + maxW;
    else x0 = x1 - maxW;
  }
  if (z1 - z0 > maxD) {
    if (lot.face === 'n') z1 = z0 + maxD;
    else z0 = z1 - maxD;
  }
  return { x0, x1, z0, z1, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/** Painel fino (janela, porta, vitrine) colado numa fachada visível ('s' ou 'e'). */
function onFace(b, r, face, along, y, w, h, color, out = 0.012, depth = 0.02) {
  if (face === 's') b.box(w, h, depth, color, { x: r.x0 + along, y, z: r.z1 + out });
  else if (face === 'e') b.box(depth, h, w, color, { x: r.x1 + out, y, z: r.z0 + along });
}

/** Fileiras de janelas em todos os andares de uma fachada visível. */
function windows(b, glow, r, face, { y0 = 0, floors = 1, floorH = 1, spacing = 0.95, pw = 0.32, ph = 0.32, seed = 1, lit = 0.4, skip = null }) {
  const len = face === 's' ? r.w : r.d;
  const n = Math.max(1, Math.floor((len - 0.25) / spacing));
  const step = len / n;
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * floorH + floorH * 0.34;
    for (let i = 0; i < n; i++) {
      if (skip && skip(f, i, n)) continue;
      const along = step * (i + 0.5);
      onFace(b, r, face, along, y - 0.03, pw + 0.08, ph + 0.08, FRAME, 0.008, 0.016);
      const on = hash(seed, f * 37 + i) < lit;
      onFace(on ? glow : b, r, face, along, y, pw, ph, on ? '#cfe6f5' : PANE, 0.016, 0.02);
    }
  }
}

const VISIBLE = ['s', 'e'];

function tree(b, x, z, s = 1, seed = 1) {
  b.cyl(0.06 * s, 0.08 * s, 0.6 * s, '#a07f5c', { x, z }, 6);
  b.add(new THREE.IcosahedronGeometry(0.42 * s, 0), CANOPY[Math.floor(hash(seed, 1) * CANOPY.length)], { x, y: 0.82 * s, z });
  b.add(new THREE.IcosahedronGeometry(0.28 * s, 0), CANOPY[Math.floor(hash(seed, 2) * CANOPY.length)], { x: x + 0.14 * s, y: 1.12 * s, z: z - 0.08 * s });
}

function bush(b, x, z, s = 1) {
  b.add(new THREE.IcosahedronGeometry(0.22 * s, 0), '#9ccf8a', { x, y: 0.16 * s, z });
}

// ------------------------------------------------------------ construções
function house(b, glow, lot, signs) {
  const two = lot.kind === 'sobrado';
  const r = footprint(lot, { margin: 0.32, front: 0.45, maxW: two ? 3.4 : 3.2, maxD: 3.2 });
  const h = lot.h;
  b.box(r.w + 0.06, 0.08, r.d + 0.06, '#d9cfc0', { x: r.cx, z: r.cz });
  b.box(r.w, h, r.d, lot.wall, { x: r.cx, z: r.cz });
  const roofH = 0.42 + Math.min(r.w, r.d) * 0.12;
  b.add(hipRoof(), lot.roof, { x: r.cx, y: h + roofH / 2, z: r.cz, sx: r.w + 0.3, sy: roofH, sz: r.d + 0.3 });
  if (hash(lot.seed, 9) < 0.5) b.box(0.18, 0.42, 0.18, '#b5735a', { x: r.cx + r.w * 0.22, y: h + 0.05, z: r.cz - r.d * 0.18 });
  const floors = two ? 2 : 1;
  for (const face of VISIBLE) {
    const front = face === lot.face;
    windows(b, glow, r, face, {
      floors, floorH: h / floors, spacing: 0.9, seed: lot.seed + (face === 's' ? 0 : 7), lit: lot.lit * 0.9,
      skip: front ? (f, i, n) => f === 0 && i === Math.floor(n / 2) : null,
    });
    if (front) {
      const along = (face === 's' ? r.w : r.d) / 2;
      if (lot.kind === 'museu') {
        // a garagem do Tio Zé: portão de enrolar e placa amarela
        onFace(b, r, face, along, 0.04, 0.95, 0.72, '#9aa0b5', 0.012, 0.03);
        for (let k = 1; k < 5; k++) onFace(b, r, face, along, 0.04 + k * 0.14, 0.92, 0.015, '#7f8499', 0.03, 0.01);
        signs.push({ text: lot.label, fill: '#f2cd5c', ink: INK, face, r, along, y: h + 0.02, w: 1.6, h: 0.34 });
      } else {
        onFace(b, r, face, along, 0.02, 0.34, 0.58, '#a07f5c', 0.014, 0.03);
        onFace(b, r, face, along + 0.1, 0.3, 0.04, 0.04, '#f2cd5c', 0.034, 0.01);
      }
    }
  }
  // quintal da frente: cerquinha e um arbusto
  if (VISIBLE.includes(lot.face)) {
    const fr = { x0: lot.x0 + 0.15, x1: lot.x1 - 0.15, z0: lot.z0 + 0.15, z1: lot.z1 - 0.15 };
    fr.w = fr.x1 - fr.x0;
    fr.d = fr.z1 - fr.z0;
    const len = lot.face === 's' ? fr.w : fr.d;
    for (let a = 0.1; a < len; a += 0.32) {
      if (Math.abs(a - len / 2) < 0.35) continue; // portãozinho
      onFace(b, fr, lot.face, a, 0, 0.05, 0.26, '#fffdf8', 0, 0.05);
    }
    onFace(b, fr, lot.face, len / 2, 0.16, len, 0.03, '#fffdf8', 0, 0.04);
    const by = lot.face === 's' ? { x: fr.x0 + 0.4, z: fr.z1 - 0.3 } : { x: fr.x1 - 0.3, z: fr.z0 + 0.4 };
    bush(b, by.x, by.z, 1.1);
    if (lot.armando) signs.push({ text: lot.label, fill: '#fffdf8', ink: INK, face: lot.face, r: fr, along: len * 0.25, y: 0.3, w: 1.2, h: 0.28 });
  }
}

function shop(b, glow, lot, signs) {
  const r = footprint(lot, { margin: 0.22, front: 0.12, maxD: 3.6 });
  const h = lot.h;
  const ground = Math.min(1.05, h);
  b.box(r.w, h, r.d, lot.wall, { x: r.cx, z: r.cz });
  b.box(r.w + 0.08, 0.08, r.d + 0.08, '#d6d0dd', { x: r.cx, y: h, z: r.cz }); // platibanda
  if (hash(lot.seed, 4) < 0.6) b.cyl(0.22, 0.22, 0.3, '#8ec5e8', { x: r.cx - r.w * 0.25, y: h + 0.08, z: r.cz - r.d * 0.2 }, 8);
  for (const face of VISIBLE) {
    const len = face === 's' ? r.w : r.d;
    if (face === lot.face) {
      // vitrine, porta e toldo listrado
      onFace(glow, r, face, len * 0.4, 0.12, len * 0.55, 0.55, '#cfe6f5', 0.016, 0.02);
      onFace(b, r, face, len * 0.4, 0.08, len * 0.6, 0.06, FRAME, 0.014, 0.03);
      onFace(b, r, face, len * 0.82, 0.02, 0.34, 0.62, '#a07f5c', 0.014, 0.03);
      const stripes = Math.max(3, Math.round(len / 0.32));
      for (let k = 0; k < stripes; k++) {
        const color = k % 2 ? '#fffdf8' : lot.accent;
        const along = (len / stripes) * (k + 0.5);
        if (face === 's') b.box(len / stripes, 0.04, 0.42, color, { x: r.x0 + along, y: ground - 0.04, z: r.z1 + 0.2, rx: 0.42 });
        else b.box(0.42, 0.04, len / stripes, color, { x: r.x1 + 0.2, y: ground - 0.04, z: r.z0 + along, rz: -0.42 });
      }
      if (lot.label) signs.push({ text: lot.label, fill: lot.accent, ink: INK, face, r, along: len / 2, y: ground + 0.05, w: Math.min(len - 0.2, 1.9), h: 0.32 });
      if (h > 1.4) windows(b, glow, r, face, { y0: ground, floors: 1, floorH: h - ground, spacing: 0.85, seed: lot.seed, lit: lot.lit });
    } else {
      windows(b, glow, r, face, { floors: h > 1.4 ? 2 : 1, floorH: h > 1.4 ? h / 2 : h, spacing: 0.9, seed: lot.seed + 3, lit: lot.lit * 0.8 });
    }
  }
}

function predio(b, glow, lot) {
  const r = footprint(lot, { margin: 0.35, front: 0.2, maxW: 3.8, maxD: 3.6 });
  const floors = lot.floors ?? 4;
  const h = lot.h;
  const fh = h / floors;
  b.box(r.w, h, r.d, lot.wall, { x: r.cx, z: r.cz });
  b.box(r.w + 0.1, 0.1, r.d + 0.1, '#d6d0dd', { x: r.cx, y: h, z: r.cz });
  b.box(0.5, 0.35, 0.5, '#e9e4dc', { x: r.cx + r.w * 0.2, y: h + 0.1, z: r.cz });
  b.cyl(0.015, 0.015, 0.6, '#8f92a6', { x: r.cx - r.w * 0.3, y: h + 0.1, z: r.cz - r.d * 0.2 }, 4);
  for (const face of VISIBLE) {
    windows(b, glow, r, face, { floors, floorH: fh, spacing: 0.75, pw: 0.3, ph: fh * 0.5, seed: lot.seed + (face === 'e' ? 11 : 0), lit: lot.lit });
    // sacadas
    if (face === lot.face) {
      const len = face === 's' ? r.w : r.d;
      for (let f = 1; f < floors; f++) onFace(b, r, face, len / 2, f * fh - 0.02, len * 0.7, 0.05, '#d6d0dd', 0.08, 0.16);
      onFace(b, r, face, len / 2, 0.02, 0.4, 0.5, '#a07f5c', 0.014, 0.03);
    }
  }
}

function torre(b, glow, lot) {
  const r = footprint(lot, { margin: 0.4, front: 0.3, maxW: 3.4, maxD: 3.4 });
  const floors = lot.floors ?? 7;
  const h = lot.h;
  const fh = h / floors;
  b.box(r.w, h, r.d, lot.wall, { x: r.cx, z: r.cz });
  b.box(r.w + 0.12, 0.3, r.d + 0.12, lot.trim, { x: r.cx, z: r.cz }); // térreo
  b.box(r.w * 0.6, 0.35, r.d * 0.6, lot.trim, { x: r.cx, y: h, z: r.cz }); // coroa
  b.cyl(0.02, 0.02, 0.8, '#8f92a6', { x: r.cx, y: h + 0.35, z: r.cz }, 4);
  glow.sphere(0.05, '#e8646a', { x: r.cx, y: h + 1.17, z: r.cz }, 6, 4);
  for (const face of VISIBLE) {
    const len = face === 's' ? r.w : r.d;
    for (let f = 1; f <= floors; f++) onFace(b, r, face, len / 2, f * fh - 0.03, len + 0.02, 0.05, lot.trim, 0.01, 0.03);
    const n = Math.max(2, Math.floor(len / 0.6));
    for (let i = 1; i < n; i++) onFace(b, r, face, (len / n) * i, 0.3, 0.035, h - 0.3, lot.trim, 0.01, 0.03);
    // andares acesos à noite
    for (let f = 0; f < floors; f++) {
      if (hash(lot.seed, f + (face === 'e' ? 50 : 0)) >= lot.lit) continue;
      onFace(glow, r, face, len / 2, f * fh + 0.08, len - 0.1, fh - 0.16, '#cfe6f5', 0.004, 0.01);
    }
  }
}

function galpao(b, glow, lot) {
  const r = footprint(lot, { margin: 0.25, front: 0.4 });
  const h = lot.h;
  b.box(r.w, h, r.d, lot.wall, { x: r.cx, z: r.cz });
  // telhado em dente de serra, com a parte de vidro virada para o norte
  const teeth = Math.max(2, Math.round(r.w / 1.2));
  const tw = r.w / teeth;
  for (let k = 0; k < teeth; k++) {
    const x = r.x0 + tw * (k + 0.5);
    b.box(tw, 0.04, r.d + 0.06, lot.roof, { x, y: h + 0.18, z: r.cz, rz: 0.32 });
    b.box(0.03, 0.34, r.d, '#cfe6f5', { x: x + tw / 2 - 0.02, y: h, z: r.cz });
  }
  for (const face of VISIBLE) {
    const len = face === 's' ? r.w : r.d;
    if (face === lot.face) {
      onFace(b, r, face, len * 0.35, 0.02, Math.min(1.4, len * 0.45), Math.min(1.0, h - 0.2), '#9aa0b5', 0.014, 0.03);
      for (let k = 1; k < 6; k++) onFace(b, r, face, len * 0.35, 0.02 + k * 0.16, Math.min(1.36, len * 0.44), 0.015, '#7f8499', 0.032, 0.01);
      onFace(b, r, face, len * 0.82, 0.02, 0.3, 0.55, '#a07f5c', 0.014, 0.03);
    }
    windows(b, glow, r, face, { y0: h * 0.55, floors: 1, floorH: h * 0.45, spacing: 1.1, pw: 0.5, ph: 0.18, seed: lot.seed + 5, lit: lot.lit * 0.6 });
  }
  if (lot.kind === 'fabrica') {
    const cx = r.x0 + r.w * 0.25;
    const cz = r.z0 + 0.4;
    b.cyl(0.2, 0.26, 3.2, '#c9a27a', { x: cx, z: cz }, 10);
    for (const y of [2.2, 2.8]) b.cyl(0.215, 0.215, 0.16, '#e8646a', { x: cx, y, z: cz }, 10);
  }
}

function megafit(b, glow, lot, signs) {
  const r = footprint(lot, { margin: 0.25, front: 0.1 });
  const h = lot.h;
  b.box(r.w, h, r.d, '#dfe2ea', { x: r.cx, z: r.cz });
  b.box(r.w + 0.08, 0.12, r.d + 0.08, '#8ec5e8', { x: r.cx, y: h, z: r.cz });
  for (const face of VISIBLE) {
    const len = face === 's' ? r.w : r.d;
    onFace(glow, r, face, len / 2, 0.15, len - 0.3, h - 0.45, '#bfe3f5', 0.012, 0.02);
    for (let i = 1; i < 5; i++) onFace(b, r, face, (len / 5) * i, 0.15, 0.04, h - 0.45, '#fffdf8', 0.02, 0.03);
  }
  // letreiro no telhado, virado para a câmera
  signs.push({ text: 'MegaFit', fill: '#8ec5e8', ink: '#fffdf8', billboard: true, x: r.cx, y: h + 0.62, z: r.cz, w: 2.2, h: 0.62, big: true });
  b.box(0.05, 0.5, 0.05, '#8f92a6', { x: r.cx - 0.8, y: h, z: r.cz });
  b.box(0.05, 0.5, 0.05, '#8f92a6', { x: r.cx + 0.8, y: h, z: r.cz });
}

function park(b, glow, lot, ground) {
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  ground.box(w, 0.015, d, '#c8e3b4', { x: cx, y: 0.03, z: cz });
  ground.box(w * 0.8, 0.01, 0.35, '#efe0c4', { x: cx, y: 0.045, z: cz });
  ground.box(0.35, 0.01, d * 0.8, '#efe0c4', { x: cx, y: 0.045, z: cz });
  if (lot.pond) {
    b.cyl(1.2, 1.2, 0.03, '#9fd3ea', { x: cx, y: 0.03, z: cz, sz: 0.62 }, 20);
    b.cyl(1.28, 1.28, 0.02, '#d9cfc0', { x: cx, y: 0.025, z: cz, sz: 0.66 }, 20);
  }
  // banquinhos e um parquinho
  for (const [dx, dz] of [[-0.9, 0.55], [0.9, -0.55]]) {
    b.box(0.7, 0.06, 0.22, '#c9a27a', { x: cx + dx, y: 0.2, z: cz + dz });
    for (const s of [-1, 1]) b.box(0.05, 0.2, 0.18, '#7f6a8e', { x: cx + dx + s * 0.3, z: cz + dz });
  }
  if (!lot.pond && w > 2.4 && d > 2.4) {
    const px = lot.x0 + 0.7;
    const pz = lot.z1 - 0.8;
    b.box(0.3, 0.6, 0.3, '#f2cd5c', { x: px, z: pz });
    b.box(0.26, 0.04, 0.9, '#e8646a', { x: px, y: 0.32, z: pz + 0.5, rx: 0.55 });
    for (const s of [-1, 1]) b.box(0.05, 0.7, 0.05, '#8ec5e8', { x: px + 0.9 + s * 0.35, z: pz });
    b.box(0.76, 0.05, 0.05, '#8ec5e8', { x: px + 0.9, y: 0.7, z: pz });
  }
}

const BUILD = { house, sobrado: house, museu: house, shop, predio, torre, galpao, fabrica: galpao, megafit, park };

// ------------------------------------------------------------ carros
function carGeometry(color, fusca = false) {
  return cached(`car|${color}|${fusca}`, () => {
    const b = new Builder();
    if (fusca) {
      b.sphere(0.5, color, { y: 0.26, sx: 1.05, sy: 0.5, sz: 0.52 }, 12, 8);
      b.sphere(0.3, color, { x: -0.05, y: 0.42, sx: 1.05, sy: 0.75, sz: 0.8 }, 10, 6);
      b.box(0.36, 0.12, 0.47, '#9fc4dc', { x: -0.05, y: 0.42 });
    } else {
      b.box(1.12, 0.26, 0.52, color, { y: 0.1 });
      b.box(0.62, 0.24, 0.48, color, { x: -0.06, y: 0.36 });
      b.box(0.6, 0.13, 0.49, '#9fc4dc', { x: -0.06, y: 0.41 });
      b.box(0.02, 0.15, 0.42, '#9fc4dc', { x: 0.25, y: 0.4 });
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) b.cyl(0.11, 0.11, 0.07, INK, { rx: PI / 2, x: sx * 0.34, y: 0.11, z: sz * 0.25 }, 10);
      b.box(0.02, 0.06, 0.1, '#fff3b0', { x: 0.555, y: 0.2, z: sx * 0.16 });
      b.box(0.02, 0.06, 0.1, '#e8646a', { x: -0.555, y: 0.2, z: sx * 0.16 });
    }
    return b.build();
  });
}

function addCar(b, x, z, dir, color, fusca) {
  // dir 'h': frente para +x; 'v': frente para +z
  b.add(carGeometry(color, fusca).clone(), null, { x, z, ry: dir === 'v' ? -PI / 2 : 0 });
}

// ------------------------------------------------------------ placas
const signCache = new Map();
function signMaterial(text, fill, ink, big) {
  const key = `${text}|${fill}|${ink}|${big}|${typeof document !== 'undefined' ? document.fonts?.status : ''}`;
  let m = signCache.get(key);
  if (m) return m;
  const k = 4;
  const wPx = big ? 140 : Math.max(70, text.length * 8 + 24);
  const hPx = big ? 40 : 22;
  const c = document.createElement('canvas');
  c.width = (wPx + 6) * k;
  c.height = (hPx + 6) * k;
  const ctx = c.getContext('2d');
  ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
  roundedBox(ctx, -wPx / 2, -hPx / 2, wPx, hPx, big ? 8 : 5, fill);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = big ? `700 24px ${FONT_TITLE}` : `800 11px ${FONT_UI}`;
  const scale = Math.min(1, (wPx - 10) / ctx.measureText(text).width);
  ctx.save();
  ctx.scale(scale, 1);
  ctx.fillText(text, 0, 1);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  m = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  signCache.set(key, m);
  return m;
}

function signMesh(s) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), signMaterial(s.text, s.fill, s.ink, s.big));
  mesh.userData.ownGeometry = true;
  mesh.raycast = () => {};
  if (s.billboard) {
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.set(CAM_TILT, CAM_AZIMUTH, 0, 'YXZ');
  } else if (s.face === 's') {
    mesh.position.set(s.r.x0 + s.along, s.y + s.h / 2, s.r.z1 + 0.04);
  } else {
    mesh.position.set(s.r.x1 + 0.04, s.y + s.h / 2, s.r.z0 + s.along);
    mesh.rotation.y = PI / 2;
  }
  return mesh;
}

// ------------------------------------------------------------ a cidade
export class Cityscape {
  constructor() {
    this.group = new THREE.Group();
    this.static = [];
    this.cars = [];
    this.walkers = [];
    this.key = null;
  }

  /** Monta (ou remonta) a cidade para o tamanho atual da academia. */
  build(opts) {
    const key = JSON.stringify(opts);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const plan = cityPlan(opts);
    this.plan = plan;
    const ground = new Builder();
    const body = new Builder();
    const glow = new Builder();
    const signs = [];
    const { rows } = opts;

    // ruas, faixas, faixas de pedestre e pontes
    for (const s of plan.streets) {
      ground.box(s.x1 - s.x0, 0.02, s.z1 - s.z0, ASPHALT, { x: (s.x0 + s.x1) / 2, y: -0.026, z: (s.z0 + s.z1) / 2 });
      if (s.dir === 'v') {
        const cx = (s.x0 + s.x1) / 2;
        for (let z = s.z0 + 0.6; z < s.z1 - 0.6; z += 1.5) {
          if (z > plan.main.z0 - 0.6 && z < plan.main.z1 + 0.6) continue;
          if (plan.river && z > plan.river.z0 - 0.4 && z < plan.river.z1 + 0.4) continue;
          ground.box(0.08, 0.006, 0.6, '#fffdf8', { x: cx, y: -0.006, z });
        }
        // faixa de pedestre dos dois lados da rua principal
        for (const z of [plan.main.z0 - 0.55, plan.main.z1 + 0.55]) {
          for (let x = s.x0 + 0.2; x < s.x1 - 0.1; x += 0.38) ground.box(0.2, 0.006, 0.7, '#fffdf8', { x: x + 0.1, y: -0.006, z });
        }
      } else {
        const cz = (s.z0 + s.z1) / 2;
        for (let x = s.x0 + 0.6; x < s.x1 - 0.6; x += 1.5) ground.box(0.6, 0.006, 0.08, '#fffdf8', { x, y: -0.006, z: cz });
      }
    }
    if (plan.river) {
      const r = plan.river;
      ground.box(r.x1 - r.x0, 0.02, r.z1 - r.z0, '#9fd3ea', { x: (r.x0 + r.x1) / 2, y: -0.035, z: (r.z0 + r.z1) / 2 });
      for (const z of [r.z0 - 0.25, r.z1 + 0.25]) ground.box(r.x1 - r.x0, 0.03, 0.5, '#efe0c4', { x: (r.x0 + r.x1) / 2, y: -0.03, z });
      for (let i = 0; i < 18; i++) {
        const x = r.x0 + ((i * 7.3) % (r.x1 - r.x0));
        ground.box(0.5, 0.004, 0.05, '#cfeaf7', { x, y: -0.012, z: r.z0 + 0.6 + ((i * 1.7) % Math.max(0.5, r.z1 - r.z0 - 1.2)) });
      }
      for (const br of plan.bridges) {
        body.box(br.x1 - br.x0, 0.12, br.z1 - br.z0, '#c9c3d1', { x: (br.x0 + br.x1) / 2, y: -0.02, z: (br.z0 + br.z1) / 2 });
        for (const x of [br.x0 + 0.06, br.x1 - 0.06]) {
          body.box(0.06, 0.32, br.z1 - br.z0, '#fffdf8', { x, y: 0.1, z: (br.z0 + br.z1) / 2 });
        }
      }
    }
    // calçadas e chão dos quarteirões
    for (const blk of plan.blocks) {
      if (blk.academy) {
        const walk = (x0, z0, x1, z1) => ground.box(x1 - x0, 0.05, z1 - z0, WALKWAY, { x: (x0 + x1) / 2, y: -0.02, z: (z0 + z1) / 2 });
        walk(blk.x0, blk.z0, blk.x0 + 0.6, blk.z1);
        walk(blk.x1 - 0.6, blk.z0, blk.x1, blk.z1);
        walk(blk.x0, blk.z0, blk.x1, blk.z0 + 0.6);
        continue;
      }
      ground.box(blk.x1 - blk.x0, 0.05, blk.z1 - blk.z0, WALKWAY, { x: (blk.x0 + blk.x1) / 2, y: -0.02, z: (blk.z0 + blk.z1) / 2 });
      ground.box(blk.x1 - blk.x0 - 1.1, 0.012, blk.z1 - blk.z0 - 1.1, blk.ring === 'outer' ? '#cfe6c0' : plan.ground, {
        x: (blk.x0 + blk.x1) / 2, y: 0.03, z: (blk.z0 + blk.z1) / 2,
      });
    }
    // calçada do outro lado da rua principal (faixa contínua)
    ground.box(plan.bounds.x1 - plan.bounds.x0, 0.056, 0.6, CURB, { x: (plan.bounds.x0 + plan.bounds.x1) / 2, y: -0.02, z: plan.main.z1 + 0.3 });

    for (const lot of plan.lots) {
      if (lot.kind === 'park') park(body, glow, lot, ground);
      else BUILD[lot.kind]?.(body, glow, lot, signs);
    }
    plan.trees.forEach((t, i) => tree(body, t.x, t.z, t.s, i + 1));
    for (const l of plan.lamps) {
      body.cyl(0.035, 0.045, 1.25, '#5d5775', { x: l.x, z: l.z }, 6);
      body.box(0.32, 0.04, 0.04, '#5d5775', { x: l.x + 0.14, y: 1.23, z: l.z });
      glow.sphere(0.07, '#fff3b0', { x: l.x + 0.28, y: 1.2, z: l.z }, 8, 5);
    }
    for (const c of plan.parked) addCar(body, c.x, c.z, c.dir, c.color, c.fusca);

    const built = (b) => (b.parts.length ? b.build() : null);
    const meshes = [];
    const g = built(ground);
    if (g) {
      const m = new THREE.Mesh(g, MATS.flat);
      m.receiveShadow = true;
      meshes.push(m);
    }
    const bg = built(body);
    if (bg) meshes.push(solid(bg, { outline: MATS.outlineThin, receive: true }));
    const gg = built(glow);
    if (gg) {
      const m = new THREE.Mesh(gg, glowMat);
      m.receiveShadow = true;
      meshes.push(m);
    }
    for (const m of meshes) {
      m.userData.ownGeometry = true;
      m.raycast = () => {};
      this.group.add(m);
      this.static.push(m);
    }
    for (const s of signs) {
      const m = signMesh(s);
      this.group.add(m);
      this.static.push(m);
    }

    // carros passando na rua principal e nas laterais
    const rng = createRng(((opts.seed ?? 1) * 97 + 13) >>> 0);
    const colors = ['#e8646a', '#8ec5e8', '#f2cd5c', '#fffdf8', '#7cc98a', '#b9a3e3', '#f29a5c'];
    const span = [plan.bounds.x0 - 3, plan.bounds.x1 + 3];
    const lanes = [
      { z: plan.main.lanes[0], dir: -1, speed: 2.1, n: 3, near: true },
      { z: plan.main.lanes[1], dir: 1, speed: 2.5, n: 3 },
    ];
    for (const lane of lanes) {
      for (let i = 0; i < lane.n; i++) {
        const mesh = solid(carGeometry(colors[Math.floor(nextRandom(rng) * colors.length)]), { outline: MATS.outlineThin });
        mesh.raycast = () => {};
        mesh.rotation.y = lane.dir > 0 ? 0 : PI;
        this.group.add(mesh);
        const x = span[0] + ((span[1] - span[0]) / lane.n) * (i + nextRandom(rng) * 0.5);
        this.cars.push({ mesh, axis: 'x', pos: x, fixed: lane.z, dir: lane.dir, speed: lane.speed, span, near: lane.near });
      }
    }
    const vspan = [plan.bounds.z0 - 3, plan.bounds.z1 + 3];
    plan.sideStreets.forEach((x, i) => {
      const dir = i === 0 ? 1 : -1;
      const mesh = solid(carGeometry(colors[Math.floor(nextRandom(rng) * colors.length)]), { outline: MATS.outlineThin });
      mesh.raycast = () => {};
      mesh.rotation.y = dir > 0 ? -PI / 2 : PI / 2;
      this.group.add(mesh);
      this.cars.push({ mesh, axis: 'z', pos: vspan[0] + nextRandom(rng) * (vspan[1] - vspan[0]), fixed: x + (dir > 0 ? 0.55 : -0.55), dir, speed: 1.8, span: vspan });
    });

    // pedestres nas calçadas da rua principal
    for (let i = 0; i < 6; i++) {
      const profile = PROFILE_IDS[Math.floor(nextRandom(rng) * PROFILE_IDS.length)];
      const look = createLook(rng);
      const rig = makePerson(look, profile);
      rig.root.scale.copy(rig.root.userData.scale);
      this.group.add(rig.root);
      const z = plan.sidewalks[i % 2] + (nextRandom(rng) - 0.5) * 0.15;
      this.walkers.push({
        rig, profile, z, y: i % 2 ? 0.03 : 0.04, x: span[0] + 6 + nextRandom(rng) * (span[1] - span[0] - 12),
        dir: nextRandom(rng) < 0.5 ? -1 : 1, speed: 0.7 + nextRandom(rng) * 0.5, seed: i * 3.7, min: span[0] + 5, max: span[1] - 5,
      });
    }
    this.rows = rows;
  }

  /** Anima carros e pedestres e acende as janelas à noite. */
  update(t, dt, { night = false, truck = false } = {}) {
    glowMat.color.copy(night ? NIGHT_TINT : DAY_TINT);
    glowMat.emissive.copy(night ? NIGHT_GLOW : NO_GLOW);
    for (const c of this.cars) {
      c.pos += c.dir * c.speed * dt;
      if (c.pos > c.span[1]) c.pos = c.span[0];
      if (c.pos < c.span[0]) c.pos = c.span[1];
      if (c.axis === 'x') c.mesh.position.set(c.pos, 0, c.fixed);
      else c.mesh.position.set(c.fixed, 0, c.pos);
      // dia da inauguração: o caminhão de mudança ocupa a faixa perto da porta
      c.mesh.visible = !(truck && c.near);
    }
    for (const w of this.walkers) {
      w.x += w.dir * w.speed * dt;
      if (w.x > w.max) w.dir = -1;
      if (w.x < w.min) w.dir = 1;
      const root = w.rig.root;
      root.position.set(w.x, w.y, w.z);
      root.rotation.y = w.dir > 0 ? PI / 2 : -PI / 2;
      posePerson(w.rig, 'walk', t, w.seed, w.profile);
    }
  }

  clear() {
    for (const m of this.static) {
      this.group.remove(m);
      m.geometry?.dispose();
      if (m.userData.outline) m.userData.outline.geometry?.dispose();
    }
    for (const c of this.cars) this.group.remove(c.mesh);
    for (const w of this.walkers) this.group.remove(w.rig.root);
    this.static = [];
    this.cars = [];
    this.walkers = [];
  }

  dispose() {
    this.clear();
    this.key = null;
  }
}
