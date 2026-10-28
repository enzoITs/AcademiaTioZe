// Biblioteca vetorial de equipamentos (vista de cima). Cada função desenha
// o aparelho centrado na origem, sem rotação, com a frente (área de uso)
// voltada para +y. Pode ser trocada por sprites no futuro: basta manter
// a assinatura draw(ctx, w, h, t, opts).
import { PALETTE as P, INK, box, circle, ellipse, line, roundRect, fillStroke } from './primitives.js';

const TIER_ACCENT = { usado: '#b5a99a', novo: '#8ec5e8', profissional: '#f2cd5c' };

function plateStack(ctx, x, y, r, color = P.plate) {
  circle(ctx, x, y, r, color);
  circle(ctx, x, y, r * 0.35, P.metal, INK, 1.5);
}

function tape(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5);
  box(ctx, -6, -2.5, 12, 5, 1, '#e9d7a8', 'rgba(61,53,80,0.5)', 1);
  ctx.restore();
}

const DRAW = {
  esteira(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 8, P.metal);
    // console no fundo
    box(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, 16, 5, TIER_ACCENT[o.tier]);
    box(ctx, -8, -h / 2 + 9, 16, 8, 2, '#3a4a5c', INK, 1.5);
    ctx.fillStyle = '#a8e6cf';
    ctx.fillRect(-6, -h / 2 + 11, 12 * (o.active ? 0.5 + 0.5 * Math.sin(t * 3) ** 2 : 0.3), 4);
    // esteira (lona) com listras em movimento
    roundRect(ctx, -w / 2 + 10, -h / 2 + 26, w - 20, h - 36, 4);
    ctx.fillStyle = P.rubber;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    const off = o.active ? (t * 40) % 10 : 0;
    for (let y = -h / 2 + 20 + off; y < h / 2; y += 10) line(ctx, -w / 2, y, w / 2, y, 'rgba(255,255,255,0.18)', 2);
    ctx.restore();
    roundRect(ctx, -w / 2 + 10, -h / 2 + 26, w - 20, h - 36, 4);
    fillStroke(ctx, null);
    line(ctx, -w / 2 + 7, -h / 2 + 24, -w / 2 + 7, h / 2 - 12, P.metalDark, 3);
    line(ctx, w / 2 - 7, -h / 2 + 24, w / 2 - 7, h / 2 - 12, P.metalDark, 3);
    if (o.tier === 'usado') tape(ctx, w / 2 - 9, 0);
  },
  bicicleta(ctx, w, h, t, o) {
    ellipse(ctx, 0, 6, w / 2 - 8, h / 2 - 12, 'rgba(61,53,80,0.08)');
    box(ctx, -5, -h / 2 + 12, 10, h - 26, 5, TIER_ACCENT[o.tier]);
    // volante (roda de inércia)
    ctx.save();
    ctx.translate(0, -h / 2 + 18);
    circle(ctx, 0, 0, 10, P.metal);
    ctx.rotate(o.active ? t * 8 : 0);
    line(ctx, -7, 0, 7, 0, P.metalDark, 2);
    line(ctx, 0, -7, 0, 7, P.metalDark, 2);
    ctx.restore();
    // guidão
    line(ctx, -14, -h / 2 + 32, 14, -h / 2 + 32, INK, 4);
    line(ctx, -14, -h / 2 + 32, 14, -h / 2 + 32, P.rubber, 2);
    // banco
    box(ctx, -9, h / 2 - 34, 18, 13, 6, P.pad);
    // pedais
    const a = o.active ? t * 8 : 0;
    circle(ctx, Math.cos(a) * 9, 4 + Math.sin(a) * 4, 3.5, P.rubber, INK, 1.5);
    circle(ctx, -Math.cos(a) * 9, 4 - Math.sin(a) * 4, 3.5, P.rubber, INK, 1.5);
  },
  supino(ctx, w, h, t, o) {
    // suportes e barra no fundo
    box(ctx, -w / 2 + 8, -h / 2 + 8, 8, 22, 3, P.metalDark);
    box(ctx, w / 2 - 16, -h / 2 + 8, 8, 22, 3, P.metalDark);
    const lift = o.active ? Math.max(0, Math.sin(t * 3)) * 6 : 0;
    const by = -h / 2 + 22 + lift;
    line(ctx, -w / 2 + 4, by, w / 2 - 4, by, INK, 5);
    line(ctx, -w / 2 + 4, by, w / 2 - 4, by, P.metal, 3);
    plateStack(ctx, -w / 2 + 10, by, 9);
    plateStack(ctx, w / 2 - 10, by, 9);
    // banco
    box(ctx, -13, -h / 2 + 34, 26, h - 50, 9, P.pad);
    line(ctx, -7, -h / 2 + 42, -7, h / 2 - 22, P.padDark, 2);
    box(ctx, -18, h / 2 - 20, 36, 8, 4, P.metalDark);
    if (o.tier === 'profissional') box(ctx, -6, h / 2 - 19, 12, 6, 2, P.yellow, INK, 1);
    if (o.tier === 'usado') tape(ctx, 8, 0);
  },
  halteres(ctx, w, h) {
    box(ctx, -w / 2 + 4, -h / 2 + 8, w - 8, h - 16, 6, '#d9cfc0');
    line(ctx, -w / 2 + 8, 0, w / 2 - 8, 0, P.metalDark, 2);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 16 + (i * (w - 32)) / (n - 1);
      const s = 4 + i * 0.7;
      line(ctx, x, -9, x, 9, P.metalDark, 3);
      box(ctx, x - s, -12, s * 2, 6, 2, [P.blue, P.green, P.yellow, P.orange, P.pad][i]);
      box(ctx, x - s, 6, s * 2, 6, 2, [P.blue, P.green, P.yellow, P.orange, P.pad][i]);
    }
  },
  rack_agachamento(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 6, '#d6c7b4');
    ctx.strokeStyle = 'rgba(61,53,80,0.15)';
    ctx.lineWidth = 1;
    for (let x = -w / 2 + 18; x < w / 2 - 6; x += 14) line(ctx, x, -h / 2 + 8, x, h / 2 - 8, 'rgba(61,53,80,0.12)', 1);
    const posts = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of posts) box(ctx, sx * (w / 2 - 18) - 6, sy * (h / 2 - 18) - 6, 12, 12, 3, P.metalDark);
    line(ctx, -w / 2 + 18, -h / 2 + 18, w / 2 - 18, -h / 2 + 18, INK, 4);
    line(ctx, -w / 2 + 18, h / 2 - 18, w / 2 - 18, h / 2 - 18, INK, 4);
    const sq = o.active ? Math.sin(t * 2.4) * 3 : 0;
    line(ctx, -w / 2 + 8, sq, w / 2 - 8, sq, INK, 6);
    line(ctx, -w / 2 + 8, sq, w / 2 - 8, sq, P.metal, 4);
    plateStack(ctx, -w / 2 + 16, sq, 12, P.pad);
    plateStack(ctx, w / 2 - 16, sq, 12, P.pad);
  },
  colchonete(ctx, w, h) {
    const mats = [P.purple, P.mint, P.pink];
    mats.forEach((c, i) => {
      const mw = (w - 16) / 3;
      box(ctx, -w / 2 + 6 + i * (mw + 2), -h / 2 + 6, mw, h - 12, 6, c);
      line(ctx, -w / 2 + 6 + i * (mw + 2) + mw / 2, -h / 2 + 12, -w / 2 + 6 + i * (mw + 2) + mw / 2, h / 2 - 12, 'rgba(61,53,80,0.12)', 2);
    });
    circle(ctx, w / 2 - 14, -h / 2 + 14, 6, P.orange, INK, 1.5);
  },
  maquina_peito(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, 18, 5, P.metalDark);
    // pilha de pesos
    for (let i = 0; i < 4; i++) box(ctx, -12, -h / 2 + 8 + i * 3.5, 24, 3, 1, P.plate, null);
    const arm = o.active ? Math.sin(t * 3) * 6 : 0;
    line(ctx, -w / 2 + 12, -h / 2 + 26, -w / 2 + 14 + arm, 10, INK, 5);
    line(ctx, w / 2 - 12, -h / 2 + 26, w / 2 - 14 - arm, 10, INK, 5);
    circle(ctx, -w / 2 + 14 + arm, 12, 5, P.rubber);
    circle(ctx, w / 2 - 14 - arm, 12, 5, P.rubber);
    box(ctx, -14, -h / 2 + 28, 28, 14, 6, P.pad);
    box(ctx, -14, 4, 28, 18, 7, P.pad);
  },
  puxador(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, 14, 4, P.metalDark);
    const pull = o.active ? Math.abs(Math.sin(t * 2.6)) * 8 : 0;
    line(ctx, 0, -h / 2 + 12, 0, -6 + pull, INK, 1.5);
    line(ctx, -w / 2 + 10, -6 + pull, w / 2 - 10, -6 + pull, INK, 5);
    line(ctx, -w / 2 + 10, -6 + pull, w / 2 - 10, -6 + pull, P.metal, 3);
    box(ctx, -15, 4, 30, 16, 7, P.blue);
    box(ctx, -20, h / 2 - 12, 40, 6, 3, P.metalDark);
  },
  leg_press(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 8, -h / 2 + 6, w - 16, h - 12, 8, '#ddd5c8');
    line(ctx, -w / 2 + 22, -h / 2 + 10, -w / 2 + 22, h / 2 - 20, P.metalDark, 5);
    line(ctx, w / 2 - 22, -h / 2 + 10, w / 2 - 22, h / 2 - 20, P.metalDark, 5);
    const push = o.active ? Math.sin(t * 2.2) * 8 : 0;
    box(ctx, -w / 2 + 14, -h / 2 + 18 + push, w - 28, 20, 4, P.metal);
    plateStack(ctx, -w / 2 + 16, -h / 2 + 28 + push, 11);
    plateStack(ctx, w / 2 - 16, -h / 2 + 28 + push, 11);
    box(ctx, -18, 10, 36, 18, 8, P.pad);
    box(ctx, -18, 28, 36, 14, 6, P.padDark);
  },
  bebedouro(ctx, w, h, t) {
    box(ctx, -w / 2 + 9, -h / 2 + 7, w - 18, h - 12, 6, P.white);
    circle(ctx, 0, -2, 9, '#bfe3f5');
    ellipse(ctx, -3, -5, 3, 2, 'rgba(255,255,255,0.9)');
    const drop = (t * 1.2) % 1;
    ellipse(ctx, 0, 10 + drop * 4, 2, 2.6, P.blueDark);
  },
  ventilador(ctx, w, h, t, o) {
    circle(ctx, 0, 0, w / 2 - 6, P.white);
    ctx.save();
    ctx.rotate(o.on ? t * 12 : 0);
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ellipse(ctx, 0, -9, 5, 9, P.blue, INK, 1.5);
    }
    ctx.restore();
    circle(ctx, 0, 0, 4, P.metalDark, INK, 1.5);
    ctx.strokeStyle = 'rgba(61,53,80,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, w / 2 - 9, 0, Math.PI * 2);
    ctx.stroke();
  },
  espelho(ctx, w, h) {
    box(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 4, '#cfeaf7');
    line(ctx, -w / 2 + 12, -h / 2 + 22, -w / 2 + 24, -h / 2 + 10, 'rgba(255,255,255,0.95)', 3);
    line(ctx, -w / 2 + 12, -h / 2 + 40, w / 2 - 10, -h / 2 + 16, 'rgba(255,255,255,0.7)', 2);
    line(ctx, -w / 2 + 14, 22, w / 2 - 12, 4, 'rgba(255,255,255,0.6)', 2);
  },
  vestiario(ctx, w, h) {
    box(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 6, '#efe6f7');
    // armários
    for (let i = 0; i < 6; i++) {
      const lx = -w / 2 + 10 + i * ((w - 20) / 6);
      box(ctx, lx, -h / 2 + 8, (w - 20) / 6 - 2, 26, 3, [P.blue, P.mint, P.yellow][i % 3]);
      circle(ctx, lx + (w - 20) / 12 - 1, -h / 2 + 22, 1.5, INK, null);
    }
    // chuveiros
    for (let i = 0; i < 2; i++) {
      const sx = w / 2 - 40 + i * 22;
      box(ctx, sx - 9, -h / 2 + 46, 18, 34, 4, '#d6eef7');
      circle(ctx, sx, -h / 2 + 52, 3, P.metalDark, INK, 1);
    }
    box(ctx, -w / 2 + 14, 4, 70, 12, 5, '#c9a27a');
    // abertura da porta na frente
    ctx.fillStyle = '#efe6f7';
    ctx.fillRect(-18, h / 2 - 7, 36, 6);
    line(ctx, -18, h / 2 - 4, -18, h / 2 - 16, INK, 2);
    line(ctx, 18, h / 2 - 4, 18, h / 2 - 16, INK, 2);
  },
  planta(ctx, w, h, t) {
    ellipse(ctx, 0, 10, 11, 8, '#c9845a', INK, 2);
    const sway = Math.sin(t * 1.5) * 0.08;
    ctx.save();
    ctx.rotate(sway);
    [[-9, -6, -0.6], [8, -8, 0.6], [0, -14, 0], [-4, 2, -1.2], [6, 0, 1.1]].forEach(([x, y, r]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ellipse(ctx, 0, 0, 6, 10, P.green, INK, 1.5);
      line(ctx, 0, -7, 0, 7, P.greenDark, 1);
      ctx.restore();
    });
    ctx.restore();
  },
  poster(ctx, w, h) {
    box(ctx, -w / 2 + 7, -h / 2 + 5, w - 14, h - 10, 3, P.yellow);
    circle(ctx, 0, -5, 6, '#eac0a0', INK, 1.5);
    line(ctx, -4, -2, 4, -2, '#5a3a28', 2);
    box(ctx, -7, 2, 14, 10, 3, '#f2cd5c', INK, 1.5);
    line(ctx, -9, 15, 9, 15, P.pad, 2);
  },
};

export function drawEquipmentShape(ctx, type, w, h, t, opts) {
  (DRAW[type] ?? DRAW.halteres)(ctx, w, h, t, opts);
}
