// Segunda leva de aparelhos 3D (cardio, máquinas, funcional, conforto e
// decoração). Mesmas regras de models.js: centrado na origem, frente para +z,
// 1 = uma célula. Quem usa o aparelho é posicionado por USE_SPOT e animado
// em posePerson com o mesmo ritmo (RATE) das peças móveis, para o boneco e
// a máquina andarem juntos.
import { PALETTE as P, INK } from '../draw/primitives.js';
import { Builder } from './kit.js';

const PI = Math.PI;
const TIER_ACCENT = { usado: '#b5a99a', novo: '#8ec5e8', profissional: '#f2cd5c' };
const accent = (tier) => TIER_ACCENT[tier] ?? TIER_ACCENT.usado;
const ROPE = '#e9d7a8';
const WOOD = '#c9a27a';
const WOOD_DARK = '#b88a55';
const GOLD = '#f2cd5c';
const SCREEN = '#3a4a5c';

/** Ritmo (rad/s) de cada movimento, compartilhado entre aparelho e aluno. */
export const RATE = {
  ellip: 4, climb: 3, row: 2.2, extend: 2.6, squat: 2.2, pull: 1.8,
  punch: 6, ropes: 9, cable: 2.4, press: 1.8, swing: 3, swim: 3.2, spar: 5,
};

/** Ida e volta suave entre 0 e 1. */
export const cycle = (t, rate) => (1 - Math.cos(t * rate)) / 2;

// Proporções do boneco (iguais às de models.js) para encaixar mãos e barras.
export const BODY = { HIP: 0.15, SHOULDER: 0.37, ARM: 0.26 };

/** Arremesso: ângulo do braço e altura da barra (para a plataforma olímpica). */
export function pressPose(t, active) {
  const k = active ? Math.min(1, cycle(t, RATE.press) * 1.15) : 0;
  return { armX: -0.48 - k * 2.52, k };
}

/**
 * Onde o aluno fica no aparelho (coordenadas do modelo, frente = +z).
 * face: +1 olha para a frente, -1 olha para o aparelho. spread: distância
 * entre vagas lado a lado. prop: objeto na mão.
 */
export const USE_SPOT = {
  esteira: { pose: 'use-run', z: 0.3, elev: 0.125, face: -1 },
  bicicleta: { pose: 'use-bike', z: 0.4, elev: 0.3, face: -1 },
  eliptico: { pose: 'use-ellip', z: 0.14, elev: 0.22, face: -1 },
  remo: { pose: 'use-row', z: 0.1, elev: 0.15, face: -1 },
  escada: { pose: 'use-climb', z: 0.2, elev: 0.28, face: -1 },
  kettlebell: { pose: 'use-swing', z: 0.95, face: 1, spread: 0.95, prop: 'kettlebell' },
  plataforma: { pose: 'use-press', z: -0.05, elev: 0.06, face: 1 },
  saco_pancada: { pose: 'use-punch', z: 0.62, face: -1, prop: 'gloves' },
  barra_fixa: { pose: 'use-pullup', z: 0, elev: 0.445, face: 1, spread: 0.9 },
  corda_naval: { pose: 'use-ropes', z: 1.2, face: -1 },
  extensora: { pose: 'use-extend', z: 0.0, elev: 0.28, face: 1 },
  smith: { pose: 'use-squat', z: -0.38, elev: 0.05, face: 1 },
  crossover: { pose: 'use-cable', z: 0.05, face: 1 },
  // Era 5. travel: vai e volta ao longo do aparelho (raias, pista); duel: dois de frente um para o outro.
  piscina: { pose: 'use-swim', z: 0, elev: 0.06, face: 1, spread: 1.4, travel: 1.25, travelRate: 0.45 },
  pista_corrida: { pose: 'use-run', z: 0, elev: 0.06, face: 1, travel: 2.3, travelRate: 0.7 },
  ringue: { pose: 'use-spar', z: 0, elev: 0.33, face: 1, spread: 1.1, duel: true },
};

function kettle(b, x, y, z, r, color) {
  b.sphere(r, color, { x, y: y + r * 0.9, z, sy: 0.9 }, 10, 7);
  b.torus(r * 0.55, r * 0.16, P.metalDark, { x, y: y + r * 1.75, z });
}

function cup(b, x, y, z, s, color) {
  b.cyl(0.05 * s, 0.06 * s, 0.04 * s, '#8f6a3c', { x, y, z }, 8);
  b.cyl(0.015 * s, 0.015 * s, 0.06 * s, color, { x, y: y + 0.04 * s, z }, 6);
  b.cyl(0.07 * s, 0.035 * s, 0.1 * s, color, { x, y: y + 0.1 * s, z }, 10);
  for (const sx of [-1, 1]) b.torus(0.025 * s, 0.008 * s, color, { x: x + sx * 0.07 * s, y: y + 0.16 * s, z });
}

export const MORE_EQUIP = {
  // ------------------------------------------------------------ cardio
  eliptico: {
    build(tier) {
      const b = new Builder();
      const a = accent(tier);
      b.rbox(0.5, 0.08, 1.75, P.metalDark, { z: 0.05 }, 0.03);
      b.rbox(0.56, 0.42, 0.4, a, { y: 0.04, z: -0.68 }, 0.08);
      for (const s of [-1, 1]) b.cyl(0.15, 0.15, 0.04, P.metal, { rz: PI / 2, x: s * 0.29, y: 0.26, z: -0.68 }, 12);
      b.box(0.08, 0.6, 0.08, P.metalDark, { y: 0.4, z: -0.6, rx: -0.15 });
      b.rbox(0.42, 0.16, 0.1, a, { y: 0.92, z: -0.5, rx: -0.5 }, 0.03);
      b.box(0.24, 0.09, 0.02, SCREEN, { y: 0.95, z: -0.45, rx: -0.5 });
      b.box(0.14, 0.03, 0.022, P.mint, { y: 0.98, z: -0.44, rx: -0.5 });
      if (tier === 'usado') b.box(0.13, 0.025, 0.06, ROPE, { x: 0.2, y: 0.42, z: -0.6, ry: 0.5 });
      const pedal = () => {
        const p = new Builder();
        p.rbox(0.14, 0.04, 0.34, P.rubber, {}, 0.015);
        p.box(0.04, 0.04, 0.55, P.metalDark, { y: -0.02, z: -0.42 });
        return p;
      };
      const handle = () => {
        const h = new Builder();
        h.box(0.04, 0.62, 0.04, P.metalDark, { y: -0.32 });
        h.box(0.055, 0.16, 0.055, P.rubber, { y: 0.16 });
        return h;
      };
      return {
        base: b,
        parts: [
          { name: 'pedalL', b: pedal(), pos: [-0.12, 0.18, 0.12] },
          { name: 'pedalR', b: pedal(), pos: [0.12, 0.18, 0.12] },
          { name: 'handL', b: handle(), pos: [-0.25, 0.5, -0.36] },
          { name: 'handR', b: handle(), pos: [0.25, 0.5, -0.36] },
        ],
      };
    },
    animate(p, t, o) {
      const a = o.active ? t * RATE.ellip : 0;
      const sides = [[p.pedalL, p.handL, 0], [p.pedalR, p.handR, PI]];
      for (const [pedal, hand, ph] of sides) {
        const base = pedal.userData.base;
        pedal.position.z = base.z + Math.cos(a + ph) * 0.12;
        pedal.position.y = base.y + Math.sin(a + ph) * 0.045;
        hand.rotation.x = o.active ? -Math.cos(a + ph) * 0.28 : 0;
      }
    },
  },

  remo: {
    build(tier) {
      const b = new Builder();
      const a = accent(tier);
      b.box(0.14, 0.06, 2.4, P.metal, { y: 0.16, z: 0.15 });
      b.box(0.5, 0.16, 0.1, P.metalDark, { z: 1.3 });
      b.box(0.6, 0.06, 0.32, P.metalDark, { z: -1.15 });
      b.box(0.16, 0.2, 0.3, P.metalDark, { y: 0.04, z: -0.98 });
      b.cyl(0.28, 0.28, 0.24, a, { rz: PI / 2, y: 0.33, z: -1.15 }, 14);
      b.box(0.04, 0.42, 0.04, P.metalDark, { y: 0.5, z: -1.02, rx: 0.4 });
      b.rbox(0.22, 0.15, 0.05, SCREEN, { y: 0.86, z: -0.88, rx: 0.4 }, 0.02);
      b.box(0.15, 0.03, 0.02, P.mint, { y: 0.92, z: -0.85, rx: 0.4 });
      for (const s of [-1, 1]) b.rbox(0.14, 0.04, 0.24, P.rubber, { x: s * 0.13, y: 0.22, z: -0.72, rx: -0.7 }, 0.015);
      const fan = new Builder();
      fan.box(0.03, 0.46, 0.06, P.metalDark, { y: -0.23 });
      fan.box(0.03, 0.06, 0.46, P.metalDark, { y: -0.03 });
      fan.cyl(0.05, 0.05, 0.04, P.metal, { rz: PI / 2 }, 8);
      const seat = new Builder();
      seat.box(0.18, 0.04, 0.2, P.metalDark, {});
      seat.rbox(0.3, 0.07, 0.3, P.pad, { y: 0.03 }, 0.03);
      const handle = new Builder();
      handle.box(0.36, 0.04, 0.04, P.rubber, { y: -0.02 });
      const chain = new Builder();
      chain.box(0.015, 0.015, 1, INK, { y: -0.0075, z: -0.5 });
      return {
        base: b,
        parts: [
          { name: 'fan', b: fan, pos: [0.15, 0.33, -1.15] },
          { name: 'seat', b: seat, pos: [0, 0.22, 0.1] },
          { name: 'handle', b: handle, pos: [0, 0.38, -0.52] },
          { name: 'chain', b: chain, pos: [0, 0.38, -0.52] },
        ],
      };
    },
    animate(p, t, o) {
      const c = o.active ? Math.sin(t * RATE.row) : 0;
      const seatZ = p.seat.userData.base.z + c * 0.32;
      p.seat.position.z = seatZ;
      const handleZ = seatZ - 0.42 + (c + 1) * 0.1;
      p.handle.position.z = handleZ;
      p.chain.position.z = handleZ;
      p.chain.scale.z = Math.max(0.05, handleZ + 0.92);
      p.fan.rotation.x = o.active ? t * 7 : 0;
    },
  },

  escada: {
    build(tier) {
      const b = new Builder();
      const a = accent(tier);
      b.rbox(0.8, 0.08, 1.8, P.metalDark, {}, 0.03);
      b.rbox(0.66, 0.92, 0.36, a, { y: 0.08, z: -0.7 }, 0.06);
      b.box(0.32, 0.13, 0.02, SCREEN, { y: 0.84, z: -0.51, rx: -0.4 });
      b.box(0.2, 0.035, 0.022, P.mint, { y: 0.89, z: -0.5, rx: -0.4 });
      for (const s of [-1, 1]) {
        b.box(0.05, 0.6, 0.05, P.metalDark, { x: s * 0.36, y: 0.08, z: 0.4 });
        b.box(0.05, 0.05, 0.98, P.metalDark, { x: s * 0.36, y: 0.66, z: -0.08 });
        b.box(0.065, 0.065, 0.3, P.rubber, { x: s * 0.36, y: 0.65, z: 0.15 });
      }
      if (tier === 'usado') b.box(0.13, 0.025, 0.06, ROPE, { x: 0.36, y: 0.71, z: -0.2, ry: 0.5 });
      const steps = new Builder();
      for (let i = 0; i < 5; i++) {
        steps.box(0.54, 0.05, 0.24, P.rubber, { y: i * 0.16, z: -i * 0.22 });
        steps.box(0.54, 0.012, 0.03, P.yellow, { y: i * 0.16 + 0.05, z: -i * 0.22 + 0.1 });
      }
      return { base: b, parts: [{ name: 'steps', b: steps, pos: [0, 0.1, 0.45] }] };
    },
    animate(p, t, o) {
      const k = o.active ? ((t * RATE.climb) / PI) % 1 : 0;
      const base = p.steps.userData.base;
      p.steps.position.y = base.y - k * 0.16;
      p.steps.position.z = base.z + k * 0.22;
    },
  },

  // ------------------------------------------------------------ peso livre
  kettlebell: {
    build() {
      const b = new Builder();
      for (const s of [-1, 1]) b.box(0.06, 0.52, 0.42, P.metalDark, { x: s * 0.88, z: -0.05 });
      b.rbox(1.82, 0.05, 0.42, '#d9cfc0', { y: 0.12, z: -0.05 }, 0.02);
      b.rbox(1.82, 0.05, 0.36, '#d9cfc0', { y: 0.44, z: -0.1 }, 0.02);
      const colors = [P.blue, P.green, P.yellow, P.orange, P.pad];
      colors.forEach((c, i) => kettle(b, -0.7 + i * 0.35, 0.17, -0.02, 0.07 + i * 0.01, c));
      colors.slice(0, 4).forEach((c, i) => kettle(b, -0.55 + i * 0.37, 0.49, -0.1, 0.055 + i * 0.007, c));
      return { base: b, parts: [] };
    },
  },

  plataforma: {
    build(tier) {
      const b = new Builder();
      b.rbox(1.9, 0.06, 1.9, P.rubber, {}, 0.02);
      b.box(1.0, 0.012, 1.86, '#d9b07a', { y: 0.06 });
      for (const x of [-0.17, 0.17]) b.box(0.01, 0.004, 1.86, WOOD_DARK, { x, y: 0.072 });
      if (tier === 'profissional') b.box(0.3, 0.006, 0.3, GOLD, { y: 0.074, z: -0.6 });
      if (tier === 'usado') b.box(0.13, 0.02, 0.06, ROPE, { x: 0.7, y: 0.06, z: 0.6, ry: 0.5 });
      for (const s of [-1, 1]) {
        b.box(0.12, 0.42, 0.12, P.metalDark, { x: s * 0.82, z: -0.78 });
        b.cyl(0.14, 0.14, 0.06, P.blue, { rz: PI / 2, x: s * 0.82, y: 0.2, z: -0.66 }, 10);
      }
      const bar = new Builder();
      bar.cyl(0.02, 0.02, 1.7, P.metal, { rz: PI / 2 }, 8);
      for (const s of [-1, 1]) {
        bar.cyl(0.2, 0.2, 0.07, P.pad, { rz: PI / 2, x: s * 0.6 }, 12);
        bar.cyl(0.16, 0.16, 0.05, P.yellow, { rz: PI / 2, x: s * 0.53 }, 12);
        bar.cyl(0.035, 0.035, 0.18, P.metal, { rz: PI / 2, x: s * 0.74 }, 8);
      }
      return { base: b, parts: [{ name: 'bar', b: bar, pos: [0, 0.26, 0.07] }] };
    },
    animate(p, t, o) {
      const spot = USE_SPOT.plataforma;
      const { armX } = pressPose(t, o.active);
      const handY = spot.elev + BODY.SHOULDER - BODY.ARM * Math.cos(armX);
      p.bar.position.y = Math.max(0.26, handY + 0.02);
      p.bar.position.z = spot.z - BODY.ARM * Math.sin(armX);
    },
  },

  // ------------------------------------------------------------ funcional
  saco_pancada: {
    build() {
      const b = new Builder();
      b.rbox(0.6, 0.05, 0.5, P.metalDark, { z: -0.15 }, 0.02);
      b.box(0.07, 1.0, 0.07, P.metalDark, { z: -0.38 });
      b.box(0.07, 0.07, 0.46, P.metalDark, { y: 0.95, z: -0.18 });
      const bag = new Builder();
      bag.box(0.012, 0.13, 0.012, INK, { y: -0.13 });
      bag.cyl(0.17, 0.17, 0.6, P.pad, { y: -0.72 }, 12);
      bag.cyl(0.175, 0.175, 0.06, P.white, { y: -0.42 }, 12);
      bag.cyl(0.172, 0.172, 0.05, P.padDark, { y: -0.73 }, 12);
      bag.cyl(0.172, 0.172, 0.05, P.padDark, { y: -0.17 }, 12);
      return { base: b, parts: [{ name: 'bag', b: bag, pos: [0, 0.95, 0.02] }] };
    },
    animate(p, t, o) {
      p.bag.rotation.x = o.active ? Math.abs(Math.sin(t * RATE.punch - 0.5)) * 0.16 : Math.sin(t * 1.3) * 0.015;
    },
  },

  barra_fixa: {
    build() {
      const b = new Builder();
      b.rbox(1.7, 0.03, 0.7, '#c9bdd8', {}, 0.015);
      for (const s of [-1, 1]) {
        b.box(0.08, 1.1, 0.08, P.metalDark, { x: s * 0.88 });
        b.box(0.1, 0.04, 0.6, P.metalDark, { x: s * 0.88 });
        b.box(0.06, 0.06, 0.28, P.metalDark, { x: s * 0.88, y: 0.15, z: -0.14, rx: 0.9 });
      }
      const bar = new Builder();
      bar.cyl(0.025, 0.025, 1.84, P.metal, { rz: PI / 2 }, 8);
      for (const x of [-0.45, 0.45]) bar.cyl(0.033, 0.033, 0.16, P.rubber, { rz: PI / 2, x }, 8);
      return { base: b, parts: [{ name: 'bar', b: bar, pos: [0, 1.06, 0] }] };
    },
    animate(p, t, o) {
      p.bar.position.y = p.bar.userData.base.y - (o.active ? cycle(t, RATE.pull) * 0.015 : 0);
    },
  },

  corda_naval: {
    build() {
      const b = new Builder();
      b.rbox(0.8, 0.02, 2.9, '#c9bdd8', {}, 0.01);
      b.rbox(0.36, 0.3, 0.3, P.metalDark, { z: -1.28 }, 0.04);
      b.torus(0.07, 0.02, P.metal, { y: 0.16, z: -1.12 });
      const parts = [];
      const N = 8;
      for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
        for (let i = 0; i < N; i++) {
          const seg = new Builder();
          seg.cyl(0.032, 0.032, 0.29, ROPE, { rx: PI / 2 }, 6);
          const u = (i + 0.5) / N;
          parts.push({ name: `rope${side}${i}`, b: seg, pos: [s * 0.12 * (0.4 + u * 0.6), 0.04, -1.12 + u * 2.08] });
        }
        const grip = new Builder();
        grip.cyl(0.04, 0.04, 0.12, P.rubber, { rx: PI / 2 }, 6);
        parts.push({ name: `grip${side}`, b: grip, pos: [s * 0.12, 0.04, 1.0] });
      }
      return { base: b, parts };
    },
    animate(p, t, o) {
      const N = 8;
      const w = t * RATE.ropes;
      const wave = (u, ph) => (o.active ? (0.03 + u * 0.13) * Math.sin(w + ph - u * 6) : 0);
      for (const [side, ph] of [['L', 0], ['R', PI]]) {
        for (let i = 0; i < N; i++) {
          const seg = p[`rope${side}${i}`];
          const u = (i + 0.5) / N;
          const y = wave(u, ph);
          const dy = wave(u + 0.5 / N, ph) - wave(u - 0.5 / N, ph);
          seg.position.y = seg.userData.base.y + y + u * 0.12 * (o.active ? 1 : 0.3);
          seg.rotation.x = -Math.atan2(dy + (o.active ? 0.12 : 0.036) / N, 2.08 / N);
        }
        const grip = p[`grip${side}`];
        grip.position.y = grip.userData.base.y + wave(1, ph) + (o.active ? 0.14 : 0.04);
      }
    },
  },

  // ------------------------------------------------------------ máquinas
  extensora: {
    build() {
      const b = new Builder();
      b.rbox(1.6, 0.05, 1.7, P.metalDark, {}, 0.02);
      b.box(0.5, 0.95, 0.22, P.metalDark, { y: 0.05, z: -0.68 });
      for (let i = 0; i < 6; i++) b.box(0.36, 0.06, 0.14, P.plate, { y: 0.1 + i * 0.075, z: -0.54 });
      b.box(0.6, 0.08, 0.3, P.metalDark, { y: 0.98, z: -0.68 });
      b.box(0.1, 0.08, 0.6, P.metalDark, { y: 0.3, z: -0.3 });
      b.box(0.1, 0.3, 0.1, P.metalDark, { y: 0.05, z: -0.05 });
      b.rbox(0.5, 0.1, 0.46, P.pad, { y: 0.33, z: -0.05 }, 0.04);
      b.rbox(0.5, 0.52, 0.1, P.pad, { y: 0.4, z: -0.32, rx: -0.15 }, 0.04);
      for (const s of [-1, 1]) {
        b.box(0.04, 0.3, 0.04, P.metalDark, { x: s * 0.32, y: 0.06, z: 0.0 });
        b.box(0.05, 0.05, 0.22, P.rubber, { x: s * 0.32, y: 0.36, z: -0.02 });
      }
      const arm = new Builder();
      arm.cyl(0.035, 0.035, 0.66, P.metal, { rz: PI / 2 }, 8);
      for (const s of [-1, 1]) arm.box(0.04, 0.2, 0.04, P.metalDark, { x: s * 0.3, y: -0.2 });
      arm.cyl(0.055, 0.055, 0.5, P.pad, { rz: PI / 2, y: -0.18 }, 10);
      return { base: b, parts: [{ name: 'arm', b: arm, pos: [0, 0.42, 0.14] }] };
    },
    animate(p, t, o) {
      p.arm.rotation.x = -(0.15 + (o.active ? cycle(t, RATE.extend) : 0) * 1.05);
    },
  },

  smith: {
    build() {
      const b = new Builder();
      b.rbox(1.9, 0.05, 2.7, '#d6c7b4', {}, 0.02);
      for (let i = 0; i < 4; i++) b.box(0.02, 0.006, 2.6, '#c2b29e', { x: -0.6 + i * 0.4, y: 0.05 });
      for (const s of [-1, 1]) {
        for (const z of [-0.45, -1.15]) b.box(0.1, 1.4, 0.1, P.metalDark, { x: s * 0.8, y: 0.05, z });
        b.box(0.1, 0.08, 0.8, P.metalDark, { x: s * 0.8, y: 1.45, z: -0.8 });
        b.box(0.16, 0.04, 0.14, P.yellow, { x: s * 0.8, y: 0.3, z: -0.45 });
        for (let i = 0; i < 2; i++) b.cyl(0.16 - i * 0.03, 0.16 - i * 0.03, 0.05, P.plate, { rx: PI / 2, x: s * 0.8, y: 0.5 + i * 0.35, z: -1.06 }, 10);
      }
      for (const z of [-0.45, -1.15]) b.box(1.7, 0.08, 0.1, P.metalDark, { y: 1.45, z });
      const bar = new Builder();
      bar.cyl(0.022, 0.022, 1.84, P.metal, { rz: PI / 2 }, 8);
      for (const s of [-1, 1]) {
        bar.box(0.14, 0.1, 0.14, P.metal, { x: s * 0.8, y: -0.05 });
        bar.cyl(0.16, 0.16, 0.07, P.plate, { rz: PI / 2, x: s * 0.62 }, 10);
        bar.cyl(0.12, 0.12, 0.06, P.pad, { rz: PI / 2, x: s * 0.54 }, 10);
      }
      return { base: b, parts: [{ name: 'bar', b: bar, pos: [0, 0.47, -0.45] }] };
    },
    animate(p, t, o) {
      p.bar.position.y = p.bar.userData.base.y - (o.active ? cycle(t, RATE.squat) * 0.11 : 0);
    },
  },

  crossover: {
    build() {
      const b = new Builder();
      b.rbox(2.9, 0.04, 1.5, '#d6c7b4', { z: -0.2 }, 0.02);
      for (const s of [-1, 1]) {
        b.rbox(0.36, 1.5, 0.36, P.metalDark, { x: s * 1.25, z: -0.6 }, 0.04);
        for (let i = 0; i < 5; i++) b.box(0.24, 0.05, 0.04, P.plate, { x: s * 1.25, y: 0.1 + i * 0.07, z: -0.41 });
        b.cyl(0.06, 0.06, 0.05, P.metal, { rx: PI / 2, x: s * 1.15, y: 1.36, z: -0.44 }, 10);
      }
      b.box(2.86, 0.1, 0.14, P.metalDark, { y: 1.5, z: -0.6 });
      const cable = () => {
        const c = new Builder();
        c.box(0.015, 0.95, 0.015, INK, { y: -0.95 });
        c.box(0.12, 0.04, 0.04, P.rubber, { y: -0.99 });
        return c;
      };
      const stack = () => new Builder().box(0.24, 0.06, 0.05, P.pad, {});
      return {
        base: b,
        parts: [
          { name: 'cableL', b: cable(), pos: [-1.15, 1.36, -0.44] },
          { name: 'cableR', b: cable(), pos: [1.15, 1.36, -0.44] },
          { name: 'stackL', b: stack(), pos: [-1.25, 0.46, -0.41] },
          { name: 'stackR', b: stack(), pos: [1.25, 0.46, -0.41] },
        ],
      };
    },
    animate(p, t, o) {
      const k = o.active ? cycle(t, RATE.cable) : 0;
      const th = 0.15 + k * 0.7;
      p.cableL.rotation.set(-0.55, 0, th);
      p.cableR.rotation.set(-0.55, 0, -th);
      for (const st of [p.stackL, p.stackR]) st.position.y = st.userData.base.y + k * 0.3;
    },
  },

  // ------------------------------------------------------------ filial
  // Balcão da recepção: a frente (+z) é o lado do gerente, com o computador;
  // as costas, com a faixa colorida e a campainha, ficam para quem chega.
  recepcao: {
    build() {
      const b = new Builder();
      b.box(2.7, 0.6, 0.6, '#c9a27a', { y: 0.02, z: -0.05 });
      b.box(2.82, 0.06, 0.72, P.white, { y: 0.62, z: -0.05 });
      b.box(2.74, 0.16, 0.03, P.pink, { y: 0.3, z: -0.37 });
      b.box(2.74, 0.05, 0.03, P.white, { y: 0.24, z: -0.375 });
      b.box(0.08, 0.06, 0.08, INK, { x: 0.45, y: 0.68, z: -0.06 });
      b.box(0.5, 0.32, 0.04, INK, { x: 0.45, y: 0.72, z: -0.04 });
      b.box(0.44, 0.26, 0.012, P.blue, { x: 0.45, y: 0.75, z: -0.017 });
      b.box(0.42, 0.02, 0.15, '#d8d4e2', { x: 0.45, y: 0.68, z: 0.16 });
      b.cyl(0.07, 0.08, 0.04, P.metal, { x: -0.55, y: 0.68, z: -0.24 }, 10);
      b.sphere(0.022, P.metalDark, { x: -0.55, y: 0.74, z: -0.24 }, 6, 4);
      b.cyl(0.08, 0.065, 0.13, '#e07b5c', { x: -1.12, y: 0.68, z: -0.12 }, 8);
      b.sphere(0.13, P.green, { x: -1.12, y: 0.92, z: -0.12 }, 6, 4);
      for (let i = 0; i < 3; i++) b.box(0.16, 0.012, 0.2, ['#fffdf8', P.yellow, P.mint][i], { x: 1.05, y: 0.68 + i * 0.013, z: 0.05, ry: 0.2 * i });
      return { base: b, parts: [] };
    },
  },

  // ------------------------------------------------------------ conforto
  geladeira: {
    build() {
      const b = new Builder();
      b.rbox(0.72, 1.12, 0.6, P.white, { y: 0.04, z: -0.06 }, 0.05);
      b.rbox(0.74, 0.16, 0.62, P.blue, { y: 1.12, z: -0.06 }, 0.04);
      b.box(0.4, 0.05, 0.01, P.white, { y: 1.17, z: 0.255 });
      b.box(0.58, 0.86, 0.02, '#cfeaf7', { y: 0.18, z: 0.245 });
      const colors = [P.orange, P.blue, P.green, P.pink];
      for (let r = 0; r < 3; r++) {
        b.box(0.56, 0.015, 0.02, P.metal, { y: 0.22 + r * 0.27, z: 0.252 });
        for (let c = 0; c < 4; c++) b.cyl(0.035, 0.035, 0.16, colors[(r + c) % 4], { x: -0.2 + c * 0.133, y: 0.24 + r * 0.27, z: 0.255 }, 6);
      }
      b.box(0.03, 0.36, 0.04, P.metalDark, { x: 0.24, y: 0.42, z: 0.28 });
      for (const s of [-1, 1]) b.box(0.08, 0.04, 0.08, P.metalDark, { x: s * 0.28, z: -0.06 });
      const bottle = new Builder();
      bottle.cyl(0.07, 0.07, 0.2, P.orange, {}, 10);
      bottle.cyl(0.072, 0.072, 0.07, P.white, { y: 0.06 }, 10);
      bottle.cyl(0.04, 0.06, 0.05, P.orange, { y: 0.2 }, 10);
      bottle.cyl(0.04, 0.04, 0.05, P.blue, { y: 0.25 }, 8);
      return { base: b, parts: [{ name: 'bottle', b: bottle, pos: [0, 1.28, -0.06] }] };
    },
    animate(p, t) {
      p.bottle.rotation.y = t * 1.2;
      p.bottle.position.y = p.bottle.userData.base.y + Math.abs(Math.sin(t * 2)) * 0.04;
    },
  },

  caixa_som: {
    build() {
      const b = new Builder();
      b.rbox(0.56, 0.86, 0.44, P.rubber, { y: 0.04, z: -0.04 }, 0.05);
      b.box(0.48, 0.78, 0.01, '#5d5775', { y: 0.08, z: 0.18 });
      for (const s of [-1, 1]) b.box(0.08, 0.04, 0.36, P.metalDark, { x: s * 0.2, z: -0.04 });
      b.box(0.1, 0.03, 0.02, P.mint, { x: 0.15, y: 0.82, z: 0.185 });
      const cone = (r) => {
        const c = new Builder();
        c.cyl(r, r, 0.03, '#2e2a3d', { rx: PI / 2 }, 14);
        c.torus(r, r * 0.12, P.metal, {});
        c.sphere(r * 0.35, P.metalDark, { z: 0.02, sz: 0.5 }, 8, 5);
        return c;
      };
      const note = () => {
        const n = new Builder();
        n.sphere(0.05, P.purple, { sx: 1.25, sy: 0.85, sz: 0.6 }, 8, 6);
        n.box(0.016, 0.17, 0.016, P.purple, { x: 0.05 });
        n.box(0.07, 0.025, 0.016, P.purple, { x: 0.08, y: 0.15, rz: -0.4 });
        return n;
      };
      return {
        base: b,
        parts: [
          { name: 'woofer', b: cone(0.17), pos: [0, 0.32, 0.19] },
          { name: 'tweeter', b: cone(0.08), pos: [0, 0.68, 0.19] },
          { name: 'note0', b: note(), pos: [0.16, 1.0, 0] },
          { name: 'note1', b: note(), pos: [-0.12, 1.0, 0] },
        ],
      };
    },
    animate(p, t, o) {
      const beat = (t * 2.2) % 1;
      const kick = o.on ? Math.max(0, 1 - beat * 4) : 0;
      p.woofer.scale.setScalar(1 + kick * 0.16);
      p.tweeter.scale.setScalar(1 + Math.max(0, 1 - ((t * 4.4) % 1) * 4) * 0.12 * (o.on ? 1 : 0));
      [p.note0, p.note1].forEach((n, i) => {
        const k = (t * 0.45 + i * 0.5) % 1;
        const base = n.userData.base;
        n.position.set(base.x + Math.sin(k * 6 + i) * 0.08, base.y + k * 0.6, base.z);
        n.scale.setScalar(o.on ? Math.max(0.01, Math.sin(k * PI)) : 0.01);
      });
    },
  },

  // ------------------------------------------------------------ Era 5: Centro Esportivo
  piscina: {
    build() {
      const b = new Builder();
      const DECK = '#ece6da';
      // borda de azulejo em volta da água
      b.rbox(6, 0.12, 0.3, DECK, { y: 0.06, z: -1.85 }, 0.03);
      b.rbox(6, 0.12, 0.3, DECK, { y: 0.06, z: 1.85 }, 0.03);
      b.rbox(0.3, 0.12, 3.4, DECK, { x: -2.85, y: 0.06 }, 0.03);
      b.rbox(0.3, 0.12, 3.4, DECK, { x: 2.85, y: 0.06 }, 0.03);
      b.box(5.4, 0.06, 3.4, '#4fa6d6', { y: 0.05 });
      b.box(5.4, 0.012, 3.4, '#7fcbec', { y: 0.085 });
      // raias (corda vermelha e branca) e marcas no fundo
      for (const x of [-1.4, 0, 1.4]) {
        for (let k = 0; k < 14; k++) b.box(0.05, 0.05, 0.22, k % 2 ? '#fffdf8' : '#e8646a', { x, y: 0.1, z: -1.55 + k * 0.24 });
      }
      for (const x of [-2.1, -0.7, 0.7, 2.1]) {
        b.box(0.06, 0.004, 2.6, '#2f6f9f', { x, y: 0.083 });
        // bloco de saída no fundo de cada raia
        b.rbox(0.36, 0.22, 0.26, '#fffdf8', { x, y: 0.2, z: -1.82 }, 0.03);
        b.box(0.3, 0.03, 0.1, P.blueDark, { x, y: 0.31, z: -1.8 });
      }
      // escadinha na frente
      for (const s of [-1, 1]) b.torus(0.12, 0.018, P.metal, { x: 2.35 + s * 0.14, y: 0.18, z: 1.62, ry: PI / 2 }, PI);
      const ripple = new Builder();
      for (let k = 0; k < 6; k++) {
        ripple.sphere(0.12, '#d8f1fb', { x: -2.2 + k * 0.9, z: ((k * 37) % 5) * 0.6 - 1.2, sy: 0.08, sx: 1.8 }, 8, 4);
      }
      return { base: b, parts: [{ name: 'ripple', b: ripple, pos: [0, 0.09, 0] }] };
    },
    animate(p, t, o) {
      p.ripple.position.x = Math.sin(t * 0.7) * 0.18;
      p.ripple.position.z = Math.cos(t * 0.5) * 0.12;
      p.ripple.scale.setScalar(o.active ? 1 + Math.sin(t * 2.2) * 0.12 : 0.9);
    },
  },

  pista_corrida: {
    build() {
      const b = new Builder();
      b.rbox(0.98, 0.06, 5.96, '#d9644f', { y: 0.03 }, 0.02);
      for (const s of [-1, 1]) b.box(0.035, 0.008, 5.9, '#fffdf8', { x: s * 0.42, y: 0.064 });
      b.box(0.86, 0.008, 0.06, '#fffdf8', { y: 0.064, z: 2.55 });
      for (let k = 0; k < 6; k++) b.box(0.12, 0.008, 0.12, k % 2 ? '#fffdf8' : INK, { x: -0.3 + k * 0.12, y: 0.065, z: -2.6 });
      // barreira no meio do caminho
      for (const s of [-1, 1]) b.box(0.03, 0.34, 0.03, P.metal, { x: s * 0.38, y: 0.2, z: -0.4 });
      b.box(0.8, 0.07, 0.03, '#fffdf8', { y: 0.36, z: -0.4 });
      b.box(0.8, 0.03, 0.032, P.pad, { y: 0.36, z: -0.4 });
      // cronômetro no fim da pista
      b.cyl(0.025, 0.025, 1.1, P.metalDark, { x: 0.46, y: 0.55, z: -2.92 }, 6);
      b.rbox(0.36, 0.2, 0.06, INK, { x: 0.46, y: 1.15, z: -2.92 }, 0.02);
      const clock = new Builder();
      clock.box(0.28, 0.1, 0.01, '#f2cd5c', {});
      return { base: b, parts: [{ name: 'clock', b: clock, pos: [0.46, 1.15, -2.885] }] };
    },
    animate(p, t, o) {
      p.clock.scale.x = o.active ? 0.4 + ((t * 0.9) % 1) * 0.6 : 1;
    },
  },

  ringue: {
    build() {
      const b = new Builder();
      b.rbox(3.8, 0.3, 3.8, '#3d6ea8', { y: 0.15 }, 0.05);
      b.rbox(3.6, 0.04, 3.6, '#f1ece2', { y: 0.31 }, 0.02);
      b.box(1.2, 0.006, 1.2, '#e2d8c8', { y: 0.333 });
      const corners = [[-1, -1, P.pad], [1, 1, P.blueDark], [1, -1, '#fffdf8'], [-1, 1, '#fffdf8']];
      for (const [sx, sz, c] of corners) {
        b.cyl(0.06, 0.06, 0.95, P.metalDark, { x: sx * 1.75, y: 0.78, z: sz * 1.75 }, 8);
        b.rbox(0.16, 0.5, 0.16, c, { x: sx * 1.7, y: 0.85, z: sz * 1.7 }, 0.05);
      }
      // degraus na frente
      b.rbox(0.7, 0.1, 0.3, P.metalDark, { x: 1.2, y: 0.05, z: 2.05 }, 0.02);
      b.rbox(0.7, 0.1, 0.3, P.metalDark, { x: 1.2, y: 0.16, z: 1.95 }, 0.02);
      const ropes = new Builder();
      for (const [y, c] of [[0.24, P.pad], [0.44, '#fffdf8'], [0.64, P.blueDark]]) {
        for (const s of [-1, 1]) {
          ropes.box(3.5, 0.035, 0.035, c, { y, z: s * 1.75 });
          ropes.box(0.035, 0.035, 3.5, c, { y, x: s * 1.75 });
        }
      }
      return { base: b, parts: [{ name: 'ropes', b: ropes, pos: [0, 0.33, 0] }] };
    },
    animate(p, t, o) {
      // as cordas tremem quando tem luta
      p.ropes.scale.y = o.active ? 1 + Math.sin(t * 14) * 0.03 : 1;
    },
  },

  banheira_gelo: {
    build() {
      const b = new Builder();
      b.rbox(0.9, 0.5, 1.8, '#fffdf8', { y: 0.25 }, 0.12);
      b.rbox(0.74, 0.02, 1.62, '#bfe6f5', { y: 0.49 }, 0.08);
      b.cyl(0.03, 0.03, 0.4, P.metal, { y: 0.66, z: -0.86 }, 6);
      b.box(0.04, 0.04, 0.22, P.metal, { y: 0.85, z: -0.78 });
      for (const s of [-1, 1]) b.rbox(0.12, 0.08, 0.2, P.metalDark, { x: s * 0.36, y: 0.04, z: s * 0.7 }, 0.02);
      const ice = new Builder();
      for (let k = 0; k < 7; k++) {
        ice.rbox(0.13, 0.1, 0.13, k % 2 ? '#e8f7ff' : '#cdeefb', { x: ((k * 29) % 5) * 0.12 - 0.24, z: k * 0.2 - 0.6, ry: k }, 0.02);
      }
      return { base: b, parts: [{ name: 'ice', b: ice, pos: [0, 0.52, 0] }] };
    },
    animate(p, t) {
      p.ice.position.y = p.ice.userData.base.y + Math.sin(t * 1.4) * 0.012;
      p.ice.rotation.y = Math.sin(t * 0.3) * 0.05;
    },
  },

  sauna: {
    build() {
      const b = new Builder();
      b.rbox(1.92, 1.5, 2.9, WOOD, { y: 0.75 }, 0.05);
      b.rbox(2.04, 0.12, 3.02, WOOD_DARK, { y: 1.56 }, 0.04);
      for (let k = 0; k < 6; k++) {
        const y = 0.2 + k * 0.23;
        for (const s of [-1, 1]) b.box(0.012, 0.02, 2.84, WOOD_DARK, { x: s * 0.965, y });
        b.box(1.86, 0.02, 0.012, WOOD_DARK, { y, z: -1.455 });
      }
      // porta de vidro fosco na frente e plaquinha de temperatura
      b.rbox(0.62, 1.12, 0.05, '#cfe6ee', { x: -0.4, y: 0.62, z: 1.46 }, 0.03);
      b.box(0.04, 0.22, 0.05, WOOD_DARK, { x: -0.16, y: 0.62, z: 1.5 });
      b.rbox(0.42, 0.22, 0.03, INK, { x: 0.45, y: 1.1, z: 1.465 }, 0.02);
      b.box(0.3, 0.07, 0.01, P.pad, { x: 0.45, y: 1.1, z: 1.483 });
      b.cyl(0.1, 0.12, 0.28, P.metalDark, { x: 0.6, y: 1.75, z: -1 }, 8);
      const steam = new Builder();
      for (let k = 0; k < 3; k++) steam.sphere(0.12 - k * 0.02, '#fffdf8', { y: k * 0.28, x: Math.sin(k) * 0.06 }, 8, 6);
      return { base: b, parts: [{ name: 'steam', b: steam, pos: [0.6, 2.0, -1] }] };
    },
    animate(p, t) {
      const k = (t * 0.45) % 1;
      p.steam.position.y = p.steam.userData.base.y + k * 0.35;
      p.steam.scale.setScalar(0.6 + k * 0.7);
      p.steam.visible = k < 0.92;
    },
  },

  // Escada da filial (Era 5): sobe para o fundo, com corrimão dos dois lados.
  escada_filial: {
    build() {
      const b = new Builder();
      for (let k = 0; k < 6; k++) {
        const h = 0.12 + k * 0.17;
        b.box(1.5, h, 0.3, k % 2 ? '#d8d0c4' : '#e6dfd3', { y: h / 2, z: 0.8 - k * 0.32 });
        b.box(1.5, 0.025, 0.06, '#b5a99a', { y: h + 0.012, z: 0.92 - k * 0.32 });
      }
      for (const s of [-1, 1]) {
        b.box(0.05, 0.05, 2.05, P.metalDark, { x: s * 0.8, y: 1.1, z: -0.05, rx: -0.43 });
        for (const z of [0.85, -0.85]) b.box(0.04, z > 0 ? 0.62 : 1.5, 0.04, P.metal, { x: s * 0.8, y: z > 0 ? 0.31 : 0.75, z });
      }
      b.rbox(0.5, 0.14, 0.04, P.blueDark, { x: 0.55, y: 1.75, z: -0.98 }, 0.02);
      b.box(0.3, 0.05, 0.01, '#fffdf8', { x: 0.55, y: 1.75, z: -0.955 });
      return { base: b, parts: [] };
    },
  },

  // ------------------------------------------------------------ decoração
  ring_light: {
    build() {
      const b = new Builder();
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * PI) / 3 + 0.3;
        b.box(0.03, 0.62, 0.03, P.rubber, { x: Math.sin(a) * 0.14, z: Math.cos(a) * 0.14 - 0.05, rx: Math.cos(a) * 0.32, rz: -Math.sin(a) * 0.32 });
      }
      b.cyl(0.02, 0.02, 0.62, P.metalDark, { y: 0.5, z: -0.05 }, 6);
      const ring = new Builder();
      ring.torus(0.24, 0.035, '#fffdf8', {});
      ring.torus(0.24, 0.012, '#fff6c8', { z: 0.03 });
      ring.box(0.02, 0.24, 0.02, P.metalDark, { y: -0.24 });
      ring.rbox(0.07, 0.12, 0.015, INK, { y: -0.06, z: 0.01 }, 0.008);
      const rec = new Builder();
      rec.sphere(0.016, P.pad, {}, 6, 4);
      return {
        base: b,
        parts: [
          { name: 'ring', b: ring, pos: [0, 1.32, -0.05] },
          { name: 'rec', b: rec, pos: [0.025, 1.33, -0.03] },
        ],
      };
    },
    animate(p, t) {
      // luz "respirando" e o pontinho vermelho de gravação piscando
      p.ring.scale.setScalar(1 + Math.sin(t * 2.4) * 0.015);
      p.rec.visible = Math.floor(t * 1.6) % 2 === 0;
    },
  },

  trofeus: {
    build() {
      const b = new Builder();
      b.box(0.8, 1.12, 0.05, WOOD_DARK, { z: -0.42 });
      for (const s of [-1, 1]) b.box(0.05, 1.12, 0.36, WOOD, { x: s * 0.38, z: -0.27 });
      for (const y of [0, 0.37, 0.74, 1.1]) b.box(0.76, 0.04, 0.36, WOOD, { y, z: -0.27 });
      cup(b, -0.2, 0.04, -0.27, 1.2, '#c9cbd6');
      cup(b, 0.18, 0.04, -0.27, 1.5, GOLD);
      cup(b, -0.12, 0.41, -0.27, 1.6, GOLD);
      cup(b, 0.22, 0.41, -0.27, 1.0, '#d9a066');
      for (let i = 0; i < 3; i++) {
        const x = -0.22 + i * 0.22;
        b.box(0.04, 0.12, 0.01, [P.blue, P.pad, P.green][i], { x, y: 0.88, z: -0.39 });
        b.cyl(0.045, 0.045, 0.015, [GOLD, '#c9cbd6', '#d9a066'][i], { rx: PI / 2, x, y: 0.85, z: -0.38 }, 10);
      }
      const big = new Builder();
      cup(big, 0, 0, 0, 2.2, GOLD);
      const spark = new Builder();
      spark.box(0.16, 0.025, 0.025, '#fffdf8', {});
      spark.box(0.025, 0.16, 0.025, '#fffdf8', { y: -0.08 });
      return {
        base: b,
        parts: [
          { name: 'big', b: big, pos: [0, 1.14, -0.27] },
          { name: 'spark', b: spark, pos: [0.16, 1.62, -0.15] },
        ],
      };
    },
    animate(p, t) {
      p.big.rotation.y = t * 0.8;
      const k = (t * 0.7) % 1;
      p.spark.rotation.z = t * 2;
      p.spark.scale.setScalar(Math.max(0.01, Math.sin(k * PI) * 1.1));
    },
  },
};
