// Modelos 3D low poly do jogo. Mesmas cores dos desenhos 2D (primitives.js).
// Unidade: 1 = uma célula da grade. Cada aparelho é montado centrado na origem,
// sem rotação, com a frente (área de uso) voltada para +z, como no desenho 2D
// (frente para +y). Partes animadas ficam separadas; o resto vira uma malha só.
import * as THREE from 'three';
import { PROFILES, EQUIPMENT, getEquipmentDef } from '../../config.js';
import { PALETTE as P, INK } from '../draw/primitives.js';
import { drawEquipmentShape } from '../draw/equipment.js';
import { Builder, MATS, solid, cached, withColorRemap } from './kit.js';
import { levelLook } from '../levelLook.js';
import { MORE_EQUIP, RATE, cycle, pressPose } from './moreEquipment.js';

const PI = Math.PI;

/** Barra com anilhas deitada no eixo x (centro em 0). */
function barbell(b, len, plateR, plateColor, y = 0) {
  b.cyl(0.025, 0.025, len, P.metal, { rz: PI / 2, y }, 8);
  for (const s of [-1, 1]) {
    b.cyl(plateR, plateR, 0.08, plateColor, { rz: PI / 2, x: s * (len / 2 - 0.2), y }, 10);
    b.cyl(plateR * 0.35, plateR * 0.35, 0.1, P.metal, { rz: PI / 2, x: s * (len / 2 - 0.2), y }, 8);
    b.cyl(0.05, 0.05, 0.06, P.metal, { rz: PI / 2, x: s * (len / 2 - 0.1), y }, 8);
  }
}

/**
 * Painel preso à parede (espelho e pôster). side é o lado do modelo que encosta
 * na parede: 0 = -x, 1 = +x, 2 = -z, 3 = +z, -1 = nenhum (fica em pé no meio).
 * O painel é montado no plano yz com a face para +x e depois girado.
 */
function wallPanel(b, W, D, side, make) {
  const L = side === 2 || side === 3 ? W : D;
  const panel = new Builder();
  make(panel, L);
  const inset = 0.07;
  if (side === 0) b.merge(panel, { x: -W / 2 + inset });
  else if (side === 1) b.merge(panel, { x: W / 2 - inset, ry: PI });
  else if (side === 2) b.merge(panel, { z: -D / 2 + inset, ry: -PI / 2 });
  else if (side === 3) b.merge(panel, { z: D / 2 - inset, ry: PI / 2 });
  else {
    b.merge(panel, { ry: -PI / 2 });
    b.box(Math.min(W, 1) * 0.7, 0.05, 0.3, P.metalDark, {});
  }
}

const wallTransform = (W, D, side) => {
  const inset = 0.07;
  if (side === 0) return { x: -W / 2 + inset, ry: 0 };
  if (side === 1) return { x: W / 2 - inset, ry: PI };
  if (side === 2) return { z: -D / 2 + inset, ry: -PI / 2 };
  if (side === 3) return { z: D / 2 - inset, ry: PI / 2 };
  return { ry: -PI / 2 };
};

let posterTexture = null;
let posterMat = null;
function getPosterMaterial() {
  if (!posterMat) posterMat = new THREE.MeshLambertMaterial({ map: getPosterTexture() });
  return posterMat;
}
function getPosterTexture() {
  if (posterTexture) return posterTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.setTransform(128 / 34, 0, 0, 128 / 38, 64, 64);
  drawEquipmentShape(ctx, 'poster', 48, 48, 0.5, { level: 1, active: false, on: false });
  posterTexture = new THREE.CanvasTexture(c);
  posterTexture.colorSpace = THREE.SRGBColorSpace;
  return posterTexture;
}

// ------------------------------------------------------------ aparelhos
// build(look, side) devolve { base: Builder, parts: [{ name, b: Builder, pos }] }.
const EQUIP = {
  esteira: {
    build(look) {
      const b = new Builder();
      b.rbox(0.74, 0.1, 1.78, P.metal, { z: 0.08 });
      b.box(0.56, 0.025, 1.46, P.rubber, { y: 0.1, z: 0.16 });
      for (const s of [-1, 1]) {
        b.box(0.07, 0.05, 1.46, P.metalDark, { x: s * 0.31, y: 0.1, z: 0.16 });
        b.box(0.06, 0.62, 0.07, P.metalDark, { x: s * 0.31, y: 0.1, z: -0.7 });
        b.box(0.05, 0.05, 0.44, P.metalDark, { x: s * 0.31, y: 0.5, z: -0.47 });
      }
      b.rbox(0.72, 0.22, 0.12, look.accent, { y: 0.62, z: -0.74, rx: -0.45 });
      b.box(0.3, 0.12, 0.02, '#3a4a5c', { y: 0.67, z: -0.67, rx: -0.45 });
      b.box(0.2, 0.035, 0.022, P.mint, { y: 0.705, z: -0.655, rx: -0.45 });
      const stripes = new Builder();
      for (const z of [-0.6, -0.2, 0.2]) stripes.box(0.54, 0.008, 0.05, '#6c6684', { z });
      return { base: b, parts: [{ name: 'stripes', b: stripes, pos: [0, 0.122, 0.16] }] };
    },
    animate(p, t, o) {
      p.stripes.position.z = p.stripes.userData.base.z + (o.active ? (t * 1.6) % 0.4 : 0);
    },
  },

  bicicleta: {
    build(look) {
      const b = new Builder();
      const a = look.accent;
      b.box(0.62, 0.05, 0.1, P.metalDark, { z: -0.72 });
      b.box(0.62, 0.05, 0.1, P.metalDark, { z: 0.72 });
      b.rbox(0.12, 0.09, 1.5, a, { y: 0.04 }, 0.03);
      b.box(0.09, 0.56, 0.09, a, { y: 0.1, z: -0.48, rx: 0.25 });
      b.rbox(0.56, 0.05, 0.07, P.rubber, { y: 0.66, z: -0.42 }, 0.02);
      b.box(0.08, 0.42, 0.08, a, { y: 0.1, z: 0.36, rx: -0.15 });
      b.rbox(0.26, 0.08, 0.32, P.pad, { y: 0.5, z: 0.42 }, 0.04);
      b.box(0.1, 0.28, 0.24, a, { y: 0.08, z: -0.6 });
      const wheel = new Builder();
      wheel.cyl(0.2, 0.2, 0.07, P.metal, { rz: PI / 2 }, 12);
      wheel.box(0.075, 0.3, 0.035, P.metalDark, { y: -0.15 });
      wheel.box(0.075, 0.035, 0.3, P.metalDark, { y: -0.0175 });
      const crank = new Builder();
      crank.box(0.035, 0.24, 0.035, P.metalDark, { y: -0.12 });
      crank.box(0.1, 0.03, 0.08, P.rubber, { x: 0.12, y: 0.105 });
      crank.box(0.1, 0.03, 0.08, P.rubber, { x: -0.12, y: -0.135 });
      return {
        base: b,
        parts: [
          { name: 'wheel', b: wheel, pos: [0.1, 0.3, -0.62] },
          { name: 'crank', b: crank, pos: [0, 0.22, -0.02] },
        ],
      };
    },
    animate(p, t, o) {
      const a = o.active ? t * 8 : 0;
      p.wheel.rotation.x = a;
      p.crank.rotation.x = a;
    },
  },

  supino: {
    build(look) {
      const b = new Builder();
      for (const s of [-1, 1]) {
        b.box(0.12, 0.8, 0.12, P.metalDark, { x: s * 0.62, z: -1.15 });
        b.box(0.14, 0.05, 0.45, P.metalDark, { x: s * 0.62, z: -1.1 });
        b.box(0.1, 0.06, 0.16, P.metal, { x: s * 0.62, y: 0.7, z: -1.06 });
      }
      b.box(0.1, 0.28, 0.1, P.metalDark, { z: -0.5 });
      b.box(0.1, 0.28, 0.1, P.metalDark, { z: 0.72 });
      b.box(0.5, 0.05, 0.12, P.metalDark, { z: -0.5 });
      b.rbox(0.52, 0.12, 1.6, P.pad, { y: 0.28, z: 0.1 }, 0.05);
      b.box(0.025, 0.006, 1.45, P.padDark, { x: -0.13, y: 0.4, z: 0.1 });
      b.box(0.74, 0.06, 0.2, P.metalDark, { z: 1.2 });
      if (look.level === 3) b.box(0.24, 0.04, 0.12, P.yellow, { y: 0.06, z: 1.2 });
      const bar = new Builder();
      barbell(bar, 2.0, 0.2, P.plate);
      return { base: b, parts: [{ name: 'bar', b: bar, pos: [0, 0.8, -1.12] }] };
    },
    animate(p, t, o) {
      p.bar.position.y = p.bar.userData.base.y + (o.active ? Math.max(0, Math.sin(t * 3)) * 0.14 : 0);
    },
  },

  halteres: {
    build() {
      const b = new Builder();
      const colors = [P.blue, P.green, P.yellow, P.orange, P.pad];
      for (const s of [-1, 1]) b.box(0.08, 0.56, 0.5, P.metalDark, { x: s * 0.88, z: -0.05 });
      b.rbox(1.84, 0.06, 0.52, '#d9cfc0', { y: 0.12, z: -0.05 }, 0.02);
      b.rbox(1.84, 0.06, 0.36, '#d9cfc0', { y: 0.42, z: -0.12, rx: 0.3 }, 0.02);
      colors.forEach((c, i) => {
        const x = -0.72 + i * 0.36;
        const r = 0.055 + i * 0.008;
        b.cyl(0.02, 0.02, 0.3, P.metalDark, { rx: PI / 2, x, y: 0.18 + r, z: -0.05 }, 6);
        for (const s of [-1, 1]) b.cyl(r, r, 0.07, c, { rx: PI / 2, x, y: 0.18 + r, z: -0.05 + s * 0.13 }, 8);
        const r2 = r * 0.8;
        b.cyl(0.018, 0.018, 0.24, P.metalDark, { rx: PI / 2 + 0.3, x, y: 0.5 + r2, z: -0.12 }, 6);
        for (const s of [-1, 1]) b.cyl(r2, r2, 0.06, c, { rx: PI / 2 + 0.3, x, y: 0.5 + r2 - s * 0.03, z: -0.12 + s * 0.1 }, 8);
      });
      return { base: b, parts: [] };
    },
  },

  rack_agachamento: {
    build() {
      const b = new Builder();
      b.rbox(2.8, 0.06, 2.8, '#d6c7b4', {}, 0.03);
      for (let i = 0; i < 6; i++) b.box(0.02, 0.006, 2.7, '#c2b29e', { x: -1.15 + i * 0.46, y: 0.06 });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) b.box(0.14, 1.45, 0.14, P.metalDark, { x: sx * 0.95, z: sz * 0.95, y: 0.06 });
        b.box(0.1, 0.1, 2.04, INK, { x: sx * 0.95, y: 1.45 });
        b.box(2.04, 0.1, 0.1, INK, { z: sx * 0.95, y: 1.45 });
        b.box(0.08, 0.06, 1.95, P.metal, { x: sx * 0.95, y: 0.5 });
        b.box(0.16, 0.05, 0.12, P.metal, { x: sx * 0.95, y: 1.0, z: 0.1 });
      }
      const bar = new Builder();
      barbell(bar, 2.65, 0.27, P.pad);
      return { base: b, parts: [{ name: 'bar', b: bar, pos: [0, 1.08, 0.1] }] };
    },
    animate(p, t, o) {
      p.bar.position.y = p.bar.userData.base.y + (o.active ? Math.sin(t * 2.4) * 0.16 : 0);
    },
  },

  colchonete: {
    build() {
      const b = new Builder();
      [P.purple, P.mint, P.pink].forEach((c, i) => {
        b.rbox(0.56, 0.05, 1.7, c, { x: -0.6 + i * 0.6 }, 0.025);
        b.box(0.03, 0.004, 1.5, '#c9bdd8', { x: -0.6 + i * 0.6, y: 0.05 });
      });
      b.sphere(0.14, P.orange, { x: 0.72, y: 0.19, z: -0.72 }, 10, 7);
      return { base: b, parts: [] };
    },
  },

  maquina_peito: {
    build() {
      const b = new Builder();
      b.rbox(1.7, 0.05, 1.6, P.metalDark, { z: -0.05 }, 0.02);
      b.box(0.52, 1.2, 0.22, P.metalDark, { y: 0.05, z: -0.72 });
      for (let i = 0; i < 6; i++) b.box(0.38, 0.06, 0.16, P.plate, { y: 0.1 + i * 0.075, z: -0.56 });
      b.box(1.5, 0.1, 0.16, P.metalDark, { y: 1.15, z: -0.72 });
      b.box(0.08, 0.36, 0.08, P.metalDark, { y: 0.05, z: 0.08 });
      b.rbox(0.5, 0.1, 0.44, P.pad, { y: 0.38, z: 0.08 }, 0.04);
      b.rbox(0.5, 0.62, 0.1, P.pad, { y: 0.42, z: -0.24 }, 0.04);
      const arm = (side) => {
        const a = new Builder();
        a.box(0.08, 0.08, 0.72, P.metalDark, { y: -0.04, z: 0.36 });
        a.cyl(0.04, 0.04, 0.3, P.rubber, { y: -0.34, z: 0.68, x: side * 0.02 }, 8);
        return a;
      };
      return {
        base: b,
        parts: [
          { name: 'armL', b: arm(-1), pos: [-0.62, 0.98, -0.62] },
          { name: 'armR', b: arm(1), pos: [0.62, 0.98, -0.62] },
        ],
      };
    },
    animate(p, t, o) {
      const s = o.active ? 0.25 + Math.sin(t * 3) * 0.25 : 0.08;
      p.armL.rotation.y = s;
      p.armR.rotation.y = -s;
    },
  },

  puxador: {
    build() {
      const b = new Builder();
      b.rbox(1.4, 0.05, 0.3, P.metalDark, { z: 0.75 }, 0.02);
      b.rbox(0.4, 0.05, 1.6, P.metalDark, {}, 0.02);
      b.box(0.13, 1.5, 0.13, P.metalDark, { z: -0.72 });
      b.box(0.12, 0.1, 0.78, P.metalDark, { y: 1.42, z: -0.39 });
      b.cyl(0.07, 0.07, 0.06, P.metal, { rz: PI / 2, y: 1.38, z: -0.04 }, 10);
      for (let i = 0; i < 5; i++) b.box(0.3, 0.06, 0.14, P.plate, { y: 0.08 + i * 0.075, z: -0.56 });
      b.box(0.08, 0.32, 0.08, P.metalDark, { z: 0.25 });
      b.rbox(0.56, 0.12, 0.42, P.pad, { y: 0.32, z: 0.25 }, 0.05);
      b.box(0.05, 0.6, 0.05, P.metalDark, { z: 0.0 });
      b.rbox(0.5, 0.1, 0.13, P.pad, { y: 0.6, z: 0.0 }, 0.04);
      const bar = new Builder();
      bar.box(1.1, 0.045, 0.045, P.metal, { y: -0.0225 });
      for (const s of [-1, 1]) bar.box(0.18, 0.06, 0.06, P.rubber, { x: s * 0.46, y: -0.03 });
      bar.box(0.015, 0.36, 0.015, INK, {});
      return { base: b, parts: [{ name: 'bar', b: bar, pos: [0, 1.0, -0.04] }] };
    },
    animate(p, t, o) {
      p.bar.position.y = p.bar.userData.base.y - (o.active ? Math.abs(Math.sin(t * 2.6)) * 0.2 : 0);
    },
  },

  leg_press: {
    build() {
      const b = new Builder();
      b.rbox(2.5, 0.08, 2.8, '#ddd5c8', {}, 0.04);
      for (const s of [-1, 1]) {
        b.box(0.12, 0.12, 2.2, P.metalDark, { x: s * 0.7, y: 0.44, z: -0.38, rx: 0.42 });
        b.box(0.1, 0.86, 0.1, P.metalDark, { x: s * 0.7, z: -1.22 });
      }
      b.box(0.6, 0.25, 0.5, P.metalDark, { y: 0.06, z: 0.85 });
      b.rbox(0.9, 0.14, 0.6, P.pad, { y: 0.3, z: 0.8 }, 0.05);
      b.rbox(0.9, 0.62, 0.13, P.padDark, { y: 0.32, z: 1.18, rx: -0.5 }, 0.05);
      const sled = new Builder();
      sled.rbox(1.6, 0.12, 0.75, P.metal, { y: -0.06, rx: 0.42 }, 0.03);
      for (const s of [-1, 1]) {
        sled.cyl(0.22, 0.22, 0.1, P.plate, { rz: PI / 2, x: s * 0.92 }, 10);
        sled.cyl(0.07, 0.07, 0.14, P.metal, { rz: PI / 2, x: s * 0.92 }, 8);
      }
      return { base: b, parts: [{ name: 'sled', b: sled, pos: [0, 0.72, -0.52] }] };
    },
    animate(p, t, o) {
      const d = o.active ? Math.sin(t * 2.2) * 0.16 : 0;
      const base = p.sled.userData.base;
      p.sled.position.y = base.y + d * Math.sin(0.42);
      p.sled.position.z = base.z - d * Math.cos(0.42);
    },
  },

  bebedouro: {
    build() {
      const b = new Builder();
      b.rbox(0.5, 0.72, 0.42, P.white, { z: -0.08 }, 0.05);
      b.box(0.38, 0.04, 0.14, P.metal, { y: 0.56, z: 0.16 });
      b.box(0.05, 0.08, 0.06, P.metalDark, { y: 0.62, z: 0.1 });
      b.cyl(0.05, 0.05, 0.05, P.blueDark, { y: 0.72, z: -0.08 }, 8);
      b.cyl(0.16, 0.16, 0.3, '#bfe3f5', { y: 0.77, z: -0.08 }, 10);
      b.box(0.03, 0.18, 0.01, '#ffffff', { x: -0.07, y: 0.83, z: 0.075 });
      return { base: b, parts: [] };
    },
  },

  ventilador: {
    build() {
      const b = new Builder();
      b.cyl(0.24, 0.27, 0.05, P.white, {}, 12);
      b.cyl(0.03, 0.03, 0.7, P.metalDark, { y: 0.05 }, 6);
      b.rbox(0.18, 0.18, 0.2, P.white, { y: 0.68, z: -0.07 }, 0.06);
      b.torus(0.29, 0.018, P.metal, { y: 0.77, z: 0.07 });
      const blades = new Builder();
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * PI) / 3;
        blades.sphere(0.13, P.blue, { x: Math.sin(a) * 0.13, y: Math.cos(a) * 0.13, rz: -a, sx: 0.55, sz: 0.15 }, 8, 5);
      }
      blades.sphere(0.05, P.metalDark, {}, 8, 5);
      return { base: b, parts: [{ name: 'blades', b: blades, pos: [0, 0.77, 0.06] }] };
    },
    animate(p, t, o) {
      p.blades.rotation.z = o.on ? -t * 12 : 0;
    },
  },

  espelho: {
    wall: true,
    build(look, side) {
      const b = new Builder();
      wallPanel(b, 1, 2, side, (pb, L) => {
        pb.rbox(0.06, 1.0, L - 0.14, P.metal, { y: 0.1 }, 0.025);
        pb.box(0.02, 0.9, L - 0.26, '#cfeaf7', { x: 0.032, y: 0.15 });
        pb.box(0.005, 0.4, 0.035, '#ffffff', { x: 0.044, y: 0.55, z: -L / 2 + 0.35, rx: 0.6 });
        pb.box(0.005, 0.7, 0.025, '#ffffff', { x: 0.044, y: 0.35, z: 0.05, rx: 0.6 });
      });
      return { base: b, parts: [] };
    },
  },

  poster: {
    wall: true,
    build(look, side) {
      const b = new Builder();
      wallPanel(b, 1, 1, side, (pb) => {
        pb.rbox(0.04, 0.66, 0.7, P.yellow, { y: 0.32 }, 0.02);
      });
      return { base: b, parts: [] };
    },
    extras(group, side) {
      const m = new THREE.Mesh(POSTER_PLANE(), getPosterMaterial());
      const tr = wallTransform(1, 1, side);
      const inner = new THREE.Group();
      inner.position.set(tr.x ?? 0, 0.65, tr.z ?? 0);
      inner.rotation.y = tr.ry;
      m.rotation.y = PI / 2;
      m.position.x = 0.022;
      inner.add(m);
      group.add(inner);
      return [m];
    },
  },

  vestiario: {
    build() {
      const b = new Builder();
      const wall = '#e2d6ef';
      b.rbox(3.84, 0.04, 2.84, '#efe6f7', {}, 0.02);
      b.box(3.84, 0.55, 0.08, wall, { z: -1.38 });
      for (const s of [-1, 1]) {
        b.box(0.08, 0.55, 2.84, wall, { x: s * 1.88 });
        b.box(1.545, 0.55, 0.08, wall, { x: s * 1.1475, z: 1.38 });
      }
      const lockers = [P.blue, P.mint, P.yellow];
      for (let i = 0; i < 6; i++) {
        const x = -1.55 + i * 0.62;
        b.rbox(0.56, 0.72, 0.32, lockers[i % 3], { x, y: 0.04, z: -1.16 }, 0.03);
        b.box(0.03, 0.08, 0.02, INK, { x: x + 0.18, y: 0.42, z: -0.995 });
        b.box(0.4, 0.015, 0.01, '#ffffff', { x, y: 0.62, z: -0.996 });
      }
      for (const x of [1.0, 1.55]) {
        b.rbox(0.46, 0.04, 0.66, '#d6eef7', { x, y: 0.04, z: -0.3 }, 0.02);
        b.cyl(0.018, 0.018, 0.66, P.metalDark, { x, y: 0.04, z: -0.6 }, 6);
        b.sphere(0.055, P.metalDark, { x, y: 0.68, z: -0.54 }, 8, 5);
      }
      b.box(0.04, 0.62, 0.72, '#d6eef7', { x: 1.28, y: 0.04, z: -0.3 });
      b.box(0.04, 0.62, 0.72, '#d6eef7', { x: 0.73, y: 0.04, z: -0.3 });
      b.rbox(1.45, 0.2, 0.26, '#c9a27a', { x: -0.7, y: 0.04, z: 0.2 }, 0.04);
      return { base: b, parts: [] };
    },
  },

  planta: {
    build() {
      const b = new Builder();
      b.cyl(0.21, 0.16, 0.3, '#c9845a', {}, 8);
      b.cyl(0.23, 0.23, 0.05, '#c9845a', { y: 0.27 }, 8);
      b.cyl(0.19, 0.19, 0.012, '#7a5a44', { y: 0.31 }, 8);
      const leaves = new Builder();
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * PI) / 5 + 0.4;
        leaves.sphere(0.14, P.green, {
          x: Math.sin(a) * 0.11, y: 0.17, z: Math.cos(a) * 0.11, rx: 0.55, ry: a, order: 'YXZ', sx: 0.62, sy: 1.35, sz: 0.24,
        }, 8, 6);
      }
      leaves.sphere(0.13, P.greenDark, { y: 0.24, sx: 0.55, sy: 1.5, sz: 0.25, ry: 0.8 }, 8, 6);
      return { base: b, parts: [{ name: 'leaves', b: leaves, pos: [0, 0.3, 0] }] };
    },
    animate(p, t) {
      p.leaves.rotation.z = Math.sin(t * 1.5) * 0.08;
    },
  },

  ...MORE_EQUIP,
};

const POSTER_PLANE = () => cached('poster|plane', () => new THREE.PlaneGeometry(0.62, 0.58));

/**
 * Adorno do nível no chão do aparelho: moldura colorida na borda (nível 2)
 * ou moldura escura com filete dourado e LED na frente (nível 3).
 */
function addLevelTrim(b, W, D, look) {
  if (look.level < 2) return;
  const t = 0.06;
  const h = 0.035;
  const e = 0.02;
  const frame = (color, inset, thick, height, y = 0) => {
    for (const s of [-1, 1]) {
      b.box(W - 2 * inset, height, thick, color, { y, z: s * (D / 2 - inset - thick / 2) });
      b.box(thick, height, D - 2 * inset - 2 * thick, color, { y, x: s * (W / 2 - inset - thick / 2) });
    }
  };
  frame(look.trim, e, t, h);
  if (look.level === 3) {
    frame(look.badge, e + t * 0.35, t * 0.3, 0.008, h);
    b.box(Math.max(0.3, W * 0.5), 0.012, 0.025, look.led, { y: h + 0.008, z: D / 2 - e - t / 2 });
  }
  // plaquinha com a marca no canto da frente
  b.rbox(0.2, 0.06, 0.03, look.badge, { x: W / 2 - e - t - 0.14, y: 0.005, z: D / 2 - e - t / 2 }, 0.012);
}

/** Aparelhos de treino (com vagas) ganham o adorno do nível; decoração só muda de cor. */
function hasLevelTrim(type) {
  const def = EQUIPMENT[type];
  return !!def && !def.wallMounted && !def.fixed && def.tiers.some((t) => t.capacity > 0);
}

/** Monta (ou reaproveita) a geometria de um aparelho. side só importa para itens de parede. */
function equipmentSpec(type, level, side) {
  const def = EQUIP[type] ?? EQUIP.halteres;
  const look = levelLook(level);
  const key = `eq|${type}|${look.level}|${def.wall ? side : ''}`;
  return cached(key, () => withColorRemap(look.remap, () => {
    const { base, parts } = def.build(look, side);
    if (hasLevelTrim(type)) {
      const [W, D] = getEquipmentDef(type).size;
      addLevelTrim(base, W, D, look);
    }
    const baseGeo = base.build();
    const built = parts.map((p) => ({ name: p.name, geo: p.b.build(), pos: p.pos }));
    let height = baseGeo.boundingBox.max.y;
    for (const p of built) height = Math.max(height, p.pos[1] + p.geo.boundingBox.max.y);
    return { def, base: baseGeo, parts: built, height };
  }));
}

/** Diz se o aparelho tem modelo 3D próprio (o resto cai no rack de halteres). */
export function hasEquipmentModel(type) {
  return Object.hasOwn(EQUIP, type);
}

/**
 * Cria a representação 3D de um aparelho no nível dado (1 padrão, 2 e 3 melhores).
 * Retorna { group, meshes, parts, height, animate(t, opts) }.
 */
export function makeEquipment(type, level = 1, side = -1) {
  const spec = equipmentSpec(type, level, side);
  const group = new THREE.Group();
  const body = solid(spec.base);
  group.add(body);
  const meshes = [body];
  const parts = {};
  for (const p of spec.parts) {
    const m = solid(p.geo);
    m.position.set(...p.pos);
    m.userData.base = m.position.clone();
    group.add(m);
    meshes.push(m);
    parts[p.name] = m;
  }
  const extra = spec.def.extras ? spec.def.extras(group, side, level) : [];
  const animate = spec.def.animate ? (t, o) => spec.def.animate(parts, t, o) : () => {};
  return { group, meshes, extra, parts, height: spec.height, animate };
}

// ------------------------------------------------------------ pessoas
// Proporções do boneco 2D: pernas 0,15, tronco 0,26, cabeça grande (raio 0,17).
const HIP = 0.15;
const SHOULDER = 0.37;
const HEAD_Y = 0.57;
const HEAD_R = 0.17;
const PANTS = ['#4a4560', '#5d6b8a', '#6e5a7a'];
// Braços e pernas: contorno fino e sem sombra própria (o tronco já faz sombra).
const LIMB = { outline: MATS.outlineThin, cast: false };

function addFace(b, skin, { blush = true } = {}) {
  b.sphere(HEAD_R, skin, { y: HEAD_Y }, 10, 8);
  for (const s of [-1, 1]) {
    b.sphere(0.022, INK, { x: s * 0.06, y: HEAD_Y + 0.02, z: HEAD_R - 0.012 }, 6, 4);
    if (blush) b.sphere(0.03, '#f2b2a8', { x: s * 0.1, y: HEAD_Y - 0.03, z: HEAD_R - 0.035, sz: 0.4 }, 6, 4);
  }
}

function addHair(b, look) {
  const c = look.hair;
  const capO = { y: HEAD_Y, rx: -0.5, z: -0.005 };
  switch (look.hairStyle) {
    case 'bald':
      b.sphere(0.04, '#fff6ee', { x: -0.07, y: HEAD_Y + 0.12, z: 0.04, sy: 0.5 }, 6, 4);
      break;
    case 'long':
      b.cap(HEAD_R + 0.014, c, capO);
      b.rbox(0.32, 0.3, 0.12, c, { y: HEAD_Y - 0.26, z: -0.09 }, 0.05);
      break;
    case 'bun':
      b.cap(HEAD_R + 0.012, c, capO);
      b.sphere(0.075, c, { y: HEAD_Y + 0.19, z: -0.05 }, 8, 6);
      break;
    case 'curly':
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * PI * 2;
        if (Math.cos(a) > 0.55) continue;
        b.sphere(0.075, c, { x: Math.sin(a) * 0.13, y: HEAD_Y + 0.09, z: Math.cos(a) * 0.13 - 0.01 }, 7, 5);
      }
      b.sphere(0.11, c, { y: HEAD_Y + 0.13, z: -0.02 }, 8, 6);
      break;
    case 'ponytail':
      b.cap(HEAD_R + 0.012, c, capO);
      b.sphere(0.07, c, { y: HEAD_Y - 0.04, z: -0.2, sy: 1.6 }, 7, 5);
      break;
    default:
      b.cap(HEAD_R + 0.012, c, capO);
  }
}

function bodyGeo(look, profileId) {
  const key = `body|${profileId}|${look.skin}|${look.hair}|${look.hairStyle}|${look.age}`;
  return cached(key, () => {
    const sig = PROFILES[profileId].signature;
    const b = new Builder();
    const wide = profileId === 'iniciante' ? 0.04 : 0;
    b.rbox(0.27 + wide, 0.26, 0.18, sig.shirt, { y: HIP - 0.01 }, 0.06);
    if (profileId === 'marombeiro') for (const s of [-1, 1]) b.sphere(0.05, look.skin, { x: s * 0.12, y: SHOULDER - 0.01 }, 6, 4);
    if (profileId === 'corredor') b.box(0.276, 0.03, 0.186, sig.accent, { y: SHOULDER - 0.08 });
    addFace(b, look.skin);
    addHair(b, look);
    if (look.age === 'senior') for (const s of [-1, 1]) b.torus(0.036, 0.008, INK, { x: s * 0.06, y: HEAD_Y + 0.02, z: HEAD_R + 0.005 });
    if (sig.accessory === 'towel') {
      // toalhinha dobrada no ombro, caindo na frente e nas costas
      b.rbox(0.11, 0.035, 0.2, sig.accent, { x: 0.085, y: SHOULDER + 0.005 }, 0.012);
      for (const z of [-0.095, 0.095]) b.rbox(0.1, 0.13, 0.025, sig.accent, { x: 0.085, y: SHOULDER - 0.12, z }, 0.01);
      b.box(0.102, 0.012, 0.027, P.blue, { x: 0.085, y: SHOULDER - 0.1, z: 0.095 });
    }
    if (sig.accessory === 'medal') {
      // medalha de ouro pendurada na fita azul
      for (const s of [-1, 1]) b.box(0.025, 0.13, 0.012, P.blueDark, { x: s * 0.035, y: SHOULDER - 0.05, z: 0.094, rz: s * 0.35 });
      b.cyl(0.042, 0.042, 0.014, P.yellow, { y: SHOULDER - 0.13, z: 0.1, rx: PI / 2 }, 10);
      b.cyl(0.022, 0.022, 0.016, '#e5b53a', { y: SHOULDER - 0.13, z: 0.102, rx: PI / 2 }, 8);
    }
    if (sig.accessory === 'visor') {
      b.torus(HEAD_R + 0.006, 0.02, sig.accent, { y: HEAD_Y + 0.08, rx: PI / 2 });
      b.rbox(0.26, 0.025, 0.12, sig.accent, { y: HEAD_Y + 0.07, z: HEAD_R }, 0.01);
      for (const s of [-1, 1]) b.sphere(0.045, INK, { x: s * (HEAD_R + 0.01), y: HEAD_Y }, 6, 4);
    }
    return b.build();
  });
}

function armGeo(look, profileId, side) {
  const key = `arm|${profileId}|${look.skin}|${side}`;
  return cached(key, () => {
    const sig = PROFILES[profileId].signature;
    const b = new Builder();
    b.box(0.07, 0.17, 0.07, look.skin, { y: -0.19 });
    b.sphere(0.045, look.skin, { y: -0.2 }, 6, 4);
    if (profileId !== 'marombeiro') b.box(0.076, 0.07, 0.076, sig.shirt, { y: -0.065 });
    else b.box(0.076, 0.03, 0.076, sig.accent, { y: -0.15 });
    if (sig.accessory === 'wristband' && side > 0) {
      b.rbox(0.075, 0.095, 0.075, '#fffdf8', { y: -0.33, z: 0.05 }, 0.015);
      b.box(0.078, 0.025, 0.078, P.pad, { y: -0.25, z: 0.05 });
    }
    if (sig.accessory === 'phone' && side > 0) {
      // celular na mão, com a capinha da cor do look
      b.rbox(0.055, 0.1, 0.018, sig.accent, { y: -0.34, z: 0.045 }, 0.008);
      b.box(0.04, 0.075, 0.004, INK, { y: -0.328, z: 0.055 });
    }
    if (sig.accessory === 'towel' && side < 0) {
      // garrafa térmica de café
      b.cyl(0.032, 0.032, 0.15, P.metalDark, { y: -0.36, z: 0.05 }, 8);
      b.cyl(0.034, 0.034, 0.035, P.pad, { y: -0.225, z: 0.05 }, 8);
    }
    if (sig.accessory === 'bottle' && side < 0) {
      b.cyl(0.03, 0.03, 0.13, '#dff2ff', { y: -0.34, z: 0.05 }, 8);
      b.cyl(0.022, 0.022, 0.03, P.yellow, { y: -0.21, z: 0.05 }, 8);
    }
    return b.build();
  });
}

function legGeo(pants, shoe) {
  return cached(`leg|${pants}|${shoe}`, () => {
    const b = new Builder();
    b.box(0.09, 0.13, 0.1, pants, { y: -HIP + 0.02 });
    b.rbox(0.1, 0.045, 0.15, shoe, { y: -HIP, z: 0.025 }, 0.015);
    return b.build();
  });
}

const MOUTHS = {};
function mouthGeo(mood) {
  if (!MOUTHS[mood]) {
    const b = new Builder();
    const o = { y: HEAD_Y - 0.06, z: HEAD_R - 0.01 };
    if (mood === 'happy') b.torus(0.035, 0.009, INK, { ...o, y: o.y + 0.02, rz: PI }, PI);
    else if (mood === 'sad') b.torus(0.03, 0.009, INK, { ...o, y: o.y - 0.02 }, PI);
    else b.box(0.05, 0.012, 0.012, INK, { ...o, y: o.y - 0.006 });
    MOUTHS[mood] = b.build();
  }
  return MOUTHS[mood];
}

function addLimbs(root, rig, look, profileId, pants, shoe) {
  const wide = profileId === 'iniciante' ? 0.02 : 0;
  for (const s of [-1, 1]) {
    const leg = solid(legGeo(pants, shoe), LIMB);
    leg.position.set(s * 0.07, HIP, 0);
    root.add(leg);
    const arm = solid(armGeo(look, profileId, s), LIMB);
    arm.position.set(s * (0.17 + wide), SHOULDER, 0);
    root.add(arm);
    rig[s < 0 ? 'legL' : 'legR'] = leg;
    rig[s < 0 ? 'armL' : 'armR'] = arm;
  }
}

/** Aluno: tronco e cabeça numa malha só; braços, pernas e boca animados. */
export function makePerson(look, profileId) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const rig = { root, inner };
  rig.body = solid(bodyGeo(look, profileId));
  inner.add(rig.body);
  rig.mouth = new THREE.Mesh(mouthGeo('neutral'), MATS.body);
  rig.mouthMood = 'neutral';
  inner.add(rig.mouth);
  const shoe = profileId === 'corredor' ? PROFILES.corredor.signature.accent : profileId === 'iniciante' ? '#ffffff' : P.rubber;
  addLimbs(inner, rig, look, profileId, PANTS[look.shade] ?? PANTS[0], shoe);
  const k = 0.92 + (look.body - 0.85) * 0.25;
  root.userData.scale = new THREE.Vector3(k, look.height, k);
  return rig;
}

export function setMood(rig, mood) {
  if (rig.mouthMood === mood) return;
  rig.mouthMood = mood;
  rig.mouth.geometry = mouthGeo(mood);
}

// Objetos de mão usados em alguns aparelhos (kettlebell, luvas de boxe).
const PROP_OF = { 'use-swing': 'kettlebell', 'use-punch': 'gloves', 'use-spar': 'gloves' };
const tripodGeo = () => cached('prop|tripod', () => {
  const b = new Builder();
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * PI) / 3;
    b.box(0.018, 0.42, 0.018, P.rubber, { x: Math.sin(a) * 0.07, z: Math.cos(a) * 0.07, rx: Math.cos(a) * 0.25, rz: -Math.sin(a) * 0.25 });
  }
  b.box(0.015, 0.2, 0.015, P.metalDark, { y: 0.4 });
  b.rbox(0.1, 0.06, 0.015, INK, { y: 0.58, rx: 0.2 }, 0.006);
  b.sphere(0.012, P.pad, { x: 0.03, y: 0.62, z: 0.01 }, 6, 4);
  return b.build();
});
const kettleGeo = () => cached('prop|kettlebell', () => {
  const b = new Builder();
  b.sphere(0.065, P.plate, { y: -0.07, sy: 0.9 }, 8, 6);
  b.torus(0.035, 0.012, P.metalDark, { y: -0.005, ry: PI / 2 });
  return b.build();
});
const gloveGeo = () => cached('prop|glove', () => {
  const b = new Builder();
  b.sphere(0.058, P.pad, { sx: 1.05, sz: 1.15 }, 8, 6);
  b.box(0.08, 0.03, 0.08, P.white, { y: 0.03 });
  return b.build();
});

function showProp(rig, names) {
  for (const name of names) {
    if (rig.props?.[name]) continue;
    rig.props ??= {};
    const meshes = [];
    if (name === 'tripod') {
      // tripé com celular filmando o treino, de frente para o aluno
      const m = solid(tripodGeo(), LIMB);
      m.position.set(0.32, 0, 0.42);
      m.rotation.y = PI + 0.6;
      rig.root.add(m);
      meshes.push(m);
    } else if (name === 'kettlebell') {
      const m = solid(kettleGeo(), LIMB);
      m.position.set(-0.17, -0.25, 0.02);
      rig.armR.add(m);
      meshes.push(m);
    } else {
      for (const arm of [rig.armL, rig.armR]) {
        const m = solid(gloveGeo(), LIMB);
        m.position.set(0, -0.25, 0.01);
        arm.add(m);
        meshes.push(m);
      }
    }
    rig.props[name] = meshes;
  }
  if (rig.props) for (const [k, list] of Object.entries(rig.props)) for (const m of list) m.visible = names.includes(k);
}

/**
 * Pose do aluno. state: walk | wait | idle | use-run | use-bike | use-lift |
 * use-stretch | use-ellip | use-row | use-climb | use-swing | use-press |
 * use-punch | use-pullup | use-ropes | use-extend | use-squat | use-cable.
 * Movimentos presos a uma máquina usam só t (sem seed) para seguir o RATE dela.
 */
export function posePerson(rig, state, t, seed, profileId) {
  const phase = t * 6 + seed;
  let bob = 0;
  let lean = 0;
  let slide = 0;
  let squash = 1;
  let legL = 0;
  let legR = 0;
  let armL = 0;
  let armR = 0;
  let armZ = 0;
  let legZ = 0;
  if (state === 'walk') {
    bob = Math.abs(Math.sin(phase * 1.2)) * 0.035;
    legL = Math.sin(phase * 1.2) * 0.6;
    legR = -legL;
    armL = -legL * 0.7;
    armR = legL * 0.7;
  } else if (state === 'use-run') {
    bob = Math.abs(Math.sin(phase * 2)) * 0.04;
    legL = Math.sin(phase * 2) * 0.75;
    legR = -legL;
    armL = -legL * 0.8;
    armR = legL * 0.8;
  } else if (state === 'use-bike') {
    const s = Math.sin(phase * 1.6) * 0.35;
    legL = -1.2 + s;
    legR = -1.2 - s;
    armL = armR = -0.9;
  } else if (state === 'use-lift') {
    const up = (Math.sin(phase * 0.6) + 1) / 2;
    armL = armR = -0.4 - up * 2.2;
    squash = 1 - up * 0.05;
  } else if (state === 'use-stretch') {
    squash = 0.9 + Math.sin(phase * 0.5) * 0.06;
    armZ = 1.1 + Math.sin(phase * 0.5) * 0.4;
  } else if (state === 'use-ellip') {
    const c = Math.cos(t * RATE.ellip);
    bob = Math.abs(Math.sin(t * RATE.ellip)) * 0.02;
    legL = c * 0.35;
    legR = -c * 0.35;
    armL = -1.0 - c * 0.3;
    armR = -1.0 + c * 0.3;
  } else if (state === 'use-row') {
    const c = Math.sin(t * RATE.row);
    slide = -c * 0.32;
    legL = legR = -1.3 - c * 0.22;
    armL = armR = -1.0 + c * 0.5;
    lean = -c * 0.2;
  } else if (state === 'use-climb') {
    const s = Math.sin(t * RATE.climb);
    bob = Math.abs(s) * 0.03;
    legL = -Math.max(0, s) * 0.9;
    legR = -Math.max(0, -s) * 0.9;
    armL = armR = -0.7;
  } else if (state === 'use-swing') {
    const s = Math.sin(t * RATE.swing + seed);
    armL = armR = -0.8 - s * 0.8;
    lean = (1 - (s + 1) / 2) * 0.35;
    squash = 1 - (1 - (s + 1) / 2) * 0.06;
  } else if (state === 'use-press') {
    const { armX, k } = pressPose(t, true);
    armL = armR = armX;
    armZ = 0.15;
    squash = 1 - (1 - k) * 0.05;
  } else if (state === 'use-punch') {
    const s = Math.sin(t * RATE.punch);
    armL = -1.2 - Math.max(0, s) * 0.45;
    armR = -1.2 - Math.max(0, -s) * 0.45;
    armZ = 0.2;
    bob = Math.abs(s) * 0.012;
    legL = -0.25;
    legR = 0.2;
  } else if (state === 'use-pullup') {
    const up = cycle(t, RATE.pull);
    bob = up * 0.166;
    armZ = 2.8 - up * 0.95;
    legL = legR = -0.25;
  } else if (state === 'use-ropes') {
    const s = Math.sin(t * RATE.ropes);
    armL = -0.8 + s * 0.35;
    armR = -0.8 - s * 0.35;
    squash = 0.9;
    lean = 0.15;
  } else if (state === 'use-extend') {
    const k = cycle(t, RATE.extend);
    legL = legR = -(1.0 + k * 0.55);
    armL = armR = -0.2;
    armZ = 0.25;
  } else if (state === 'use-squat') {
    const down = cycle(t, RATE.squat);
    squash = 1 - down * 0.3;
    armL = armR = -2.7;
    armZ = 0.35;
  } else if (state === 'use-cable') {
    const k = cycle(t, RATE.cable);
    armL = armR = -1.1;
    armZ = 1.25 - k * 1.0;
  } else if (state === 'use-kick') {
    // coice no glúteo: tronco no apoio, uma perna empurra para trás
    const k = cycle(t, RATE.kick);
    lean = 0.45;
    legL = -0.15;
    legR = 0.15 + k * 1.1;
    armL = armR = -1.25;
  } else if (state === 'use-crunch') {
    // abdominal sentado: mãos nas almofadas e tronco dobrando para a frente
    const k = cycle(t, RATE.crunch);
    lean = 0.05 + k * 0.5;
    legL = legR = -1.4;
    armL = armR = -2.5;
    armZ = 0.15;
  } else if (state === 'use-flex') {
    // flexora sentada: perna esticada que dobra para baixo do banco
    const k = cycle(t, RATE.flex);
    legL = legR = -(1.55 - k * 0.9);
    armL = armR = -0.2;
    armZ = 0.25;
  } else if (state === 'use-calf') {
    // panturrilha: sobe na ponta do pé com as ombreiras nos ombros
    bob = cycle(t, RATE.calf) * 0.06;
    armL = armR = -2.9;
    armZ = 0.45;
  } else if (state === 'use-fly') {
    // voador sentado: braços abrem e fecham na frente do peito
    const k = cycle(t, RATE.cable);
    legL = legR = -1.4;
    armL = armR = -1.4;
    armZ = 1.2 - k * 1.0;
  } else if (state === 'use-abduct') {
    // abdutora: sentado, joelhos abrindo para os lados
    const k = cycle(t, RATE.abduct);
    legL = legR = -1.4;
    legZ = k * 0.45;
    armL = armR = -0.3;
    armZ = 0.3;
  } else if (state === 'use-shoulder') {
    // desenvolvimento sentado: empurra as manoplas acima da cabeça
    const { armX } = pressPose(t, true);
    legL = legR = -1.4;
    armL = armR = armX;
    armZ = 0.25;
  } else if (state === 'use-thrust') {
    // hip thrust: costas no banco, quadril sobe e desce com a barra
    const k = cycle(t, RATE.thrust);
    lean = -(1.05 + k * 0.4);
    legL = legR = 1.0 + k * 0.4 - 1.6;
    bob = k * 0.08;
    armL = armR = -0.6;
    armZ = 0.2;
  } else if (state === 'use-swim') {
    // nado crawl: deitado na água, braçada alternada e pernada curtinha
    const s = Math.sin(t * RATE.swim + seed);
    lean = 1.45;
    armL = -1.6 + s * 1.5;
    armR = -1.6 - s * 1.5;
    legL = Math.sin(t * RATE.swim * 2.5 + seed) * 0.25;
    legR = -legL;
    bob = Math.sin(t * RATE.swim * 2 + seed) * 0.01;
  } else if (state === 'use-spar') {
    // luta de treino: guarda alta, jab alternado e ginga
    const s = Math.sin(t * RATE.spar + seed);
    armL = -1.35 - Math.max(0, s) * 0.5;
    armR = -1.35 - Math.max(0, -s) * 0.5;
    armZ = 0.25;
    bob = Math.abs(Math.sin(t * RATE.spar * 0.5 + seed)) * 0.03;
    legL = -0.3;
    legR = 0.25;
    lean = 0.08;
  } else if (state === 'wait') {
    bob = Math.sin(phase * 0.5) * 0.008;
    if (profileId === 'influencer' && (t * 0.25 + seed * 0.1) % 1 < 0.35) {
      // pose de selfie: celular para cima, pezinho levantado
      armR = -2.5;
      armZ = 0.25;
      legL = -0.35;
    }
    if (profileId === 'corredor') {
      bob = Math.abs(Math.sin(phase * 1.6)) * 0.025;
      legL = Math.sin(phase * 1.6) * 0.3;
      legR = -legL;
    }
  }
  rig.inner.position.set(0, bob, slide);
  rig.inner.rotation.x = lean;
  rig.inner.scale.y = squash;
  rig.legL.rotation.x = legL;
  rig.legR.rotation.x = legR;
  rig.legL.rotation.z = -legZ;
  rig.legR.rotation.z = legZ;
  rig.armL.rotation.x = armL;
  rig.armR.rotation.x = armR;
  rig.armL.rotation.z = -armZ;
  rig.armR.rotation.z = armZ;
  const props = [];
  if (PROP_OF[state]) props.push(PROP_OF[state]);
  if (profileId === 'influencer' && state.startsWith('use-')) props.push('tripod');
  showProp(rig, props);
}

// ------------------------------------------------------------ equipe
// Faxineiro(a): macacão azul, boné amarelo e esfregão.
// Técnico(a): macacão laranja, boné vermelho, chave inglesa e caixa de ferramentas.
const UNIFORM = {
  zelador: { overall: P.blueDark, cap: P.yellow, brim: '#e5b53a', badge: P.yellow, shirt: '#fffdf8' },
  tecnico: { overall: '#e07b3c', cap: P.pad, brim: P.padDark, badge: P.white, shirt: '#d8d4e2' },
};
const uniformOf = (role) => UNIFORM[role] ?? UNIFORM.zelador;

function staffBodyGeo(look, role) {
  return cached(`staff|${role}|${look.skin}|${look.hair}|${look.hairStyle}`, () => {
    const u = uniformOf(role);
    const b = new Builder();
    b.rbox(0.27, 0.26, 0.18, u.shirt, { y: HIP - 0.01 }, 0.06);
    b.rbox(0.25, 0.2, 0.186, u.overall, { y: HIP - 0.01 }, 0.05);
    for (const s of [-1, 1]) b.box(0.03, 0.08, 0.19, u.overall, { x: s * 0.08, y: HIP + 0.18 });
    b.box(0.07, 0.05, 0.01, u.badge, { y: HIP + 0.1, z: 0.095 });
    if (role === 'tecnico') {
      b.box(0.29, 0.035, 0.2, '#6b4a33', { y: HIP + 0.01 });
      b.box(0.04, 0.07, 0.03, P.metal, { x: 0.1, y: HIP - 0.04, z: 0.1 });
      b.box(0.03, 0.08, 0.03, P.yellow, { x: -0.1, y: HIP - 0.05, z: 0.1 });
    }
    addFace(b, look.skin);
    if (look.hairStyle === 'long') b.rbox(0.3, 0.26, 0.1, look.hair, { y: HEAD_Y - 0.22, z: -0.1 }, 0.05);
    b.cap(HEAD_R + 0.016, u.cap, { y: HEAD_Y + 0.01, rx: -0.35 });
    b.rbox(0.2, 0.025, 0.14, u.brim, { y: HEAD_Y + 0.09, z: HEAD_R - 0.01 }, 0.01);
    b.torus(0.035, 0.009, INK, { y: HEAD_Y - 0.04, z: HEAD_R - 0.01, rz: PI }, PI);
    return b.build();
  });
}

const mopGeo = () => cached('mop', () => {
  const b = new Builder();
  b.box(0.03, 0.52, 0.03, '#a07f5c', { y: 0.02, z: 0.06, rx: 0.32 });
  b.rbox(0.22, 0.05, 0.11, '#e9e2f0', { z: 0.14 }, 0.02);
  return b.build();
});

const wrenchGeo = () => cached('wrench', () => {
  const b = new Builder();
  b.box(0.03, 0.2, 0.025, P.metal, { y: -0.2 });
  b.box(0.08, 0.035, 0.025, P.metal, { y: -0.035 });
  b.box(0.025, 0.04, 0.025, P.metal, { x: -0.03, y: -0.005 });
  b.box(0.025, 0.025, 0.025, P.metal, { x: 0.03, y: 0 });
  return b.build();
});

const toolboxGeo = () => cached('toolbox', () => {
  const b = new Builder();
  b.rbox(0.26, 0.12, 0.14, P.pad, {}, 0.02);
  b.box(0.27, 0.02, 0.15, P.padDark, { y: 0.09 });
  b.box(0.12, 0.05, 0.02, P.metalDark, { y: 0.12 });
  b.box(0.05, 0.02, 0.01, P.yellow, { y: 0.05, z: 0.071 });
  return b.build();
});

export function makeCleaner(look, role = 'zelador') {
  const u = uniformOf(role);
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const rig = { root, inner, role };
  rig.body = solid(staffBodyGeo(look, role));
  inner.add(rig.body);
  for (const s of [-1, 1]) {
    const leg = solid(legGeo(u.overall, INK), LIMB);
    leg.position.set(s * 0.07, HIP, 0);
    inner.add(leg);
    const arm = solid(staffArmGeo(look.skin, u.shirt), LIMB);
    arm.position.set(s * 0.17, SHOULDER, 0);
    inner.add(arm);
    rig[s < 0 ? 'legL' : 'legR'] = leg;
    rig[s < 0 ? 'armL' : 'armR'] = arm;
  }
  if (role === 'tecnico') {
    rig.tool = solid(wrenchGeo(), LIMB);
    rig.tool.position.set(0, -0.2, 0.04);
    rig.tool.rotation.x = -PI / 2;
    rig.armR.add(rig.tool);
    rig.toolbox = solid(toolboxGeo(), { outline: MATS.outlineThin });
    rig.toolbox.position.set(-0.24, 0, 0.12);
    rig.toolbox.rotation.y = 0.4;
    root.add(rig.toolbox);
  } else {
    rig.mop = solid(mopGeo(), { outline: MATS.outlineThin });
    rig.mop.position.set(0.24, 0, 0.08);
    root.add(rig.mop);
  }
  const k = 0.92 + (look.body - 0.85) * 0.25;
  root.userData.scale = new THREE.Vector3(k, look.height, k);
  return rig;
}

// ------------------------------------------------------------ gerente da filial
// Blazer na cor do estilo da filial, camisa branca, crachá e prancheta.
function managerBodyGeo(look, color) {
  return cached(`manager|${color}|${look.skin}|${look.hair}|${look.hairStyle}`, () => {
    const b = new Builder();
    b.rbox(0.27, 0.26, 0.18, '#fffdf8', { y: HIP - 0.01 }, 0.06);
    for (const s of [-1, 1]) b.rbox(0.1, 0.25, 0.19, color, { x: s * 0.085, y: HIP - 0.005 }, 0.04);
    b.rbox(0.27, 0.25, 0.08, color, { y: HIP - 0.005, z: -0.055 }, 0.04);
    b.box(0.035, 0.12, 0.012, INK, { y: HIP + 0.1, z: 0.095 });
    b.box(0.06, 0.035, 0.01, P.yellow, { x: 0.075, y: HIP + 0.17, z: 0.1 });
    addFace(b, look.skin);
    addHair(b, look);
    return b.build();
  });
}

const clipboardGeo = () => cached('clipboard', () => {
  const b = new Builder();
  b.box(0.13, 0.17, 0.015, '#c9a27a', {});
  b.box(0.11, 0.13, 0.017, '#fffdf8', { y: 0.015 });
  b.box(0.05, 0.02, 0.02, P.metalDark, { y: 0.16 });
  return b.build();
});

export function makeManager(look, color = P.blue) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const rig = { root, inner, role: 'gerente' };
  rig.body = solid(managerBodyGeo(look, color));
  inner.add(rig.body);
  for (const s of [-1, 1]) {
    const leg = solid(legGeo('#4a4560', INK), LIMB);
    leg.position.set(s * 0.07, HIP, 0);
    inner.add(leg);
    const arm = solid(staffArmGeo(look.skin, color), LIMB);
    arm.position.set(s * 0.17, SHOULDER, 0);
    inner.add(arm);
    rig[s < 0 ? 'legL' : 'legR'] = leg;
    rig[s < 0 ? 'armL' : 'armR'] = arm;
  }
  rig.clip = solid(clipboardGeo(), LIMB);
  rig.clip.position.set(0, -0.3, 0.06);
  rig.clip.rotation.x = -0.9;
  rig.armL.add(rig.clip);
  const k = 0.92 + (look.body - 0.85) * 0.25;
  root.userData.scale = new THREE.Vector3(k, look.height, k);
  return rig;
}

/** Gerente: anda até o balcão e, parado, confere a prancheta e acena para quem chega. */
export function poseManager(rig, mode, t, seed) {
  const phase = t * 6 + seed;
  const walk = mode === 'walk';
  const swing = walk ? Math.sin(phase * 1.2) * 0.6 : 0;
  rig.inner.position.y = walk ? Math.abs(Math.sin(phase * 1.2)) * 0.035 : Math.sin(t * 1.6 + seed) * 0.006;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = walk ? -swing * 0.5 - 0.4 : -0.85;
  const wave = !walk && (t * 0.35 + seed) % 4 < 0.9;
  rig.armR.rotation.x = walk ? swing * 0.7 : wave ? -2.6 : -0.15;
  rig.armR.rotation.z = wave ? 0.35 + Math.sin(t * 10) * 0.3 : 0;
  rig.inner.rotation.y = walk ? 0 : Math.sin(t * 0.5 + seed) * 0.25;
}

function staffArmGeo(skin, sleeve) {
  return cached(`carm|${skin}|${sleeve}`, () => {
    const b = new Builder();
    b.box(0.07, 0.17, 0.07, skin, { y: -0.19 });
    b.sphere(0.045, skin, { y: -0.2 }, 6, 4);
    b.box(0.076, 0.07, 0.076, sleeve, { y: -0.065 });
    return b.build();
  });
}

/** mode: walk | idle | clean (faxineiro) | fix (técnico, agachado batendo a chave). */
export function poseCleaner(rig, mode, t, seed) {
  const phase = t * 6 + seed;
  const walk = mode === 'walk';
  const swing = walk ? Math.sin(phase * 1.2) * 0.6 : 0;
  rig.inner.position.y = walk ? Math.abs(Math.sin(phase * 1.2)) * 0.035 : 0;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.7;
  if (rig.role === 'tecnico') {
    const fix = mode === 'fix';
    const tap = fix ? Math.sin(phase * 2.4) : 0;
    rig.inner.scale.y = fix ? 0.86 : 1;
    rig.inner.rotation.x = fix ? 0.25 : 0;
    rig.armR.rotation.x = fix ? -1.25 + tap * 0.45 : walk ? swing * 0.7 : -0.25;
    rig.armR.rotation.z = fix ? 0.15 + Math.max(0, tap) * 0.2 : 0;
    if (fix) rig.armL.rotation.x = -0.9;
    rig.toolbox.visible = mode !== 'walk';
    return;
  }
  const sweep = mode === 'clean' ? Math.sin(phase * 1.4) : 0;
  rig.armR.rotation.x = -0.5 + sweep * 0.3;
  rig.mop.rotation.y = sweep * 0.5;
  rig.mop.position.x = 0.24 + sweep * 0.05;
}

// ------------------------------------------------------------ Whey, o gato
const CAT = '#f29a5c';
const STRIPE = '#d9773a';
function catGeo(pose) {
  return cached(`cat|${pose}`, () => {
    const b = new Builder();
    if (pose === 'sleep') {
      b.sphere(0.17, CAT, { y: 0.09, sx: 1.25, sy: 0.55, sz: 1 }, 10, 7);
      for (const x of [-0.06, 0.03, 0.12]) b.box(0.025, 0.02, 0.14, STRIPE, { x, y: 0.17 });
      b.sphere(0.11, CAT, { x: -0.18, y: 0.1, z: 0.05 }, 9, 7);
      for (const s of [-1, 1]) b.cone(0.04, 0.07, CAT, { x: -0.18 + s * 0.06, y: 0.17, z: 0.03, rz: -s * 0.35 }, 4);
      for (const s of [-1, 1]) b.box(0.035, 0.008, 0.01, INK, { x: -0.18 + s * 0.04, y: 0.11, z: 0.155 });
      b.torus(0.17, 0.03, CAT, { y: 0.05, rx: PI / 2, rz: 0.4 }, PI * 0.8);
    } else {
      b.sphere(0.16, CAT, { y: 0.15, sz: 1.15 }, 10, 7);
      for (const z of [-0.08, 0, 0.08]) b.box(0.14, 0.02, 0.025, STRIPE, { y: 0.29, z });
      b.sphere(0.13, CAT, { y: 0.37, z: 0.07 }, 10, 8);
      for (const s of [-1, 1]) {
        b.cone(0.045, 0.085, CAT, { x: s * 0.075, y: 0.44, z: 0.06, rz: -s * 0.3 }, 4);
        b.sphere(0.045, CAT, { x: s * 0.07, y: 0.04, z: 0.15 }, 6, 4);
        b.sphere(0.02, INK, { x: s * 0.05, y: 0.39, z: 0.19 }, 6, 4);
      }
      b.sphere(0.016, P.pad, { y: 0.355, z: 0.2 }, 6, 4);
    }
    return b.build();
  });
}

const tailGeo = () => cached('cat|tail', () => {
  const b = new Builder();
  b.cyl(0.026, 0.032, 0.28, CAT, { rx: -0.5, y: 0.12, z: -0.06 }, 6);
  b.box(0.06, 0.02, 0.06, STRIPE, { y: 0.2, z: -0.1 });
  return b.build();
});

export function makeWhey() {
  const root = new THREE.Group();
  const rig = { root, pose: null };
  rig.sit = solid(catGeo('sit'));
  rig.sleep = solid(catGeo('sleep'));
  rig.tail = solid(tailGeo(), { outline: MATS.outlineThin });
  rig.tail.position.set(0, 0.08, -0.16);
  root.add(rig.sit, rig.sleep, rig.tail);
  return rig;
}

export function poseWhey(rig, mood, t) {
  const sleeping = mood === 'sleep';
  rig.sit.visible = !sleeping;
  rig.tail.visible = !sleeping;
  rig.sleep.visible = sleeping;
  if (sleeping) {
    const breathe = 1 + Math.sin(t * 2) * 0.04;
    rig.sleep.scale.set(breathe, 1 / breathe, breathe);
  } else rig.tail.rotation.z = Math.sin(t * (mood === 'alert' ? 6 : 3)) * 0.5;
}

