// Cidade vista de cima, para o mapa 2D de reserva (sem WebGL). Mesma planta
// do 3D (cityLayout.js), desenhada com telhados, ruas e árvores simples.
import { INK, box, circle, ellipse } from './primitives.js';

const ROOF = {
  house: (l) => l.roof, sobrado: (l) => l.roof, museu: () => '#f2cd5c', shop: (l) => l.accent,
  predio: (l) => l.wall, torre: (l) => l.wall, galpao: (l) => l.roof, fabrica: (l) => l.roof, megafit: () => '#8ec5e8',
};

export function drawCity2D(ctx, plan, T) {
  ctx.save();
  if (plan.river) {
    const r = plan.river;
    ctx.fillStyle = '#efe0c4';
    ctx.fillRect(r.x0 * T, (r.z0 - 0.5) * T, (r.x1 - r.x0) * T, (r.z1 - r.z0 + 1) * T);
    ctx.fillStyle = '#9fd3ea';
    ctx.fillRect(r.x0 * T, r.z0 * T, (r.x1 - r.x0) * T, (r.z1 - r.z0) * T);
  }
  for (const s of plan.streets) {
    ctx.fillStyle = '#b9b4c4';
    ctx.fillRect(s.x0 * T, s.z0 * T, (s.x1 - s.x0) * T, (s.z1 - s.z0) * T);
  }
  for (const b of plan.blocks) {
    if (b.academy) continue;
    ctx.fillStyle = '#e9e4dc';
    ctx.fillRect(b.x0 * T, b.z0 * T, (b.x1 - b.x0) * T, (b.z1 - b.z0) * T);
    ctx.fillStyle = b.ring === 'outer' ? '#cfe6c0' : plan.ground;
    ctx.fillRect((b.x0 + 0.55) * T, (b.z0 + 0.55) * T, (b.x1 - b.x0 - 1.1) * T, (b.z1 - b.z0 - 1.1) * T);
  }
  for (const l of plan.lots) {
    const x = (l.x0 + 0.3) * T;
    const y = (l.z0 + 0.3) * T;
    const w = (l.x1 - l.x0 - 0.6) * T;
    const h = (l.z1 - l.z0 - 0.6) * T;
    if (l.kind === 'park') {
      box(ctx, x, y, w, h, 10, '#c8e3b4', 'rgba(61,53,80,0.25)', 1.5);
      if (l.pond) ellipse(ctx, x + w / 2, y + h / 2, w * 0.2, h * 0.15, '#9fd3ea');
      continue;
    }
    const lift = Math.min(10, 3 + l.h * 2);
    ctx.fillStyle = 'rgba(61,53,80,0.12)';
    ctx.fillRect(x + lift, y + lift, w, h);
    box(ctx, x, y, w, h, 4, (ROOF[l.kind] ?? (() => l.wall))(l) ?? '#e6e1d8', INK, 1.5);
    if (l.kind === 'torre' || l.kind === 'predio') {
      box(ctx, x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.4, 3, '#fffdf8', 'rgba(61,53,80,0.3)', 1);
    }
  }
  for (const t of plan.trees) {
    circle(ctx, t.x * T, t.z * T, 13 * t.s, '#9ccf8a', INK, 1.5);
    circle(ctx, t.x * T + 5 * t.s, t.z * T - 5 * t.s, 7 * t.s, '#b0dc9e', null);
  }
  ctx.restore();
}
