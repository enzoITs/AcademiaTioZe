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

function kettleTop(ctx, x, y, r, color) {
  circle(ctx, x, y, r, color, INK, 1.5);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.2, r * 0.55, Math.PI, 0);
  ctx.strokeStyle = P.metalDark;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function cupTop(ctx, x, y, r, color) {
  circle(ctx, x, y, r, color, INK, 1.5);
  circle(ctx, x, y, r * 0.5, 'rgba(255,255,255,0.45)', null);
}

// Segunda leva de aparelhos (mesmo estilo, vista de cima, frente para +y).
Object.assign(DRAW, {
  eliptico(ctx, w, h, t, o) {
    box(ctx, -10, -h / 2 + 6, 20, h - 12, 6, P.metalDark);
    box(ctx, -w / 2 + 8, -h / 2 + 6, w - 16, 20, 6, TIER_ACCENT[o.tier]);
    const a = o.active ? t * 4 : 0;
    box(ctx, -12, 6 + Math.cos(a) * 6, 9, 18, 3, P.rubber);
    box(ctx, 3, 6 - Math.cos(a) * 6, 9, 18, 3, P.rubber);
    line(ctx, -w / 2 + 8, -h / 2 + 30, -w / 2 + 8, -h / 2 + 46 + Math.cos(a) * 4, P.metalDark, 4);
    line(ctx, w / 2 - 8, -h / 2 + 30, w / 2 - 8, -h / 2 + 46 - Math.cos(a) * 4, P.metalDark, 4);
  },
  remo(ctx, w, h, t, o) {
    line(ctx, 0, -h / 2 + 30, 0, h / 2 - 8, P.metal, 7);
    line(ctx, -14, h / 2 - 8, 14, h / 2 - 8, P.metalDark, 4);
    circle(ctx, 0, -h / 2 + 18, 14, TIER_ACCENT[o.tier]);
    circle(ctx, 0, -h / 2 + 18, 5, P.metalDark, INK, 1.5);
    box(ctx, -12, -h / 2 + 36, 9, 12, 3, P.rubber);
    box(ctx, 3, -h / 2 + 36, 9, 12, 3, P.rubber);
    const c = o.active ? Math.sin(t * 2.2) : 0;
    box(ctx, -9, 0 + c * 15, 18, 15, 5, P.pad);
    line(ctx, -9, -h / 2 + 52 + (c + 1) * 10, 9, -h / 2 + 52 + (c + 1) * 10, P.rubber, 4);
  },
  escada(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 6, P.metalDark);
    box(ctx, -w / 2 + 8, -h / 2 + 7, w - 16, 22, 6, TIER_ACCENT[o.tier]);
    roundRect(ctx, -14, -h / 2 + 32, 28, h - 44, 4);
    fillStroke(ctx, P.rubber);
    const off = o.active ? (t * 14) % 11 : 0;
    ctx.save();
    roundRect(ctx, -14, -h / 2 + 32, 28, h - 44, 4);
    ctx.clip();
    for (let y = -h / 2 + 32 + off; y < h / 2; y += 11) line(ctx, -14, y, 14, y, P.yellow, 2);
    ctx.restore();
    line(ctx, -w / 2 + 8, -h / 2 + 30, -w / 2 + 8, h / 2 - 14, INK, 3);
    line(ctx, w / 2 - 8, -h / 2 + 30, w / 2 - 8, h / 2 - 14, INK, 3);
  },
  kettlebell(ctx, w, h) {
    box(ctx, -w / 2 + 4, -h / 2 + 8, w - 8, h - 16, 6, '#d9cfc0');
    [P.blue, P.green, P.yellow, P.orange, P.pad].forEach((c, i) => kettleTop(ctx, -w / 2 + 16 + i * ((w - 32) / 4), 2, 5 + i * 0.6, c));
  },
  plataforma(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 6, P.rubber);
    box(ctx, -w / 4, -h / 2 + 5, w / 2, h - 10, 2, '#d9b07a', null);
    line(ctx, -w / 12, -h / 2 + 6, -w / 12, h / 2 - 6, 'rgba(61,53,80,0.2)', 1);
    line(ctx, w / 12, -h / 2 + 6, w / 12, h / 2 - 6, 'rgba(61,53,80,0.2)', 1);
    const lift = o.active ? Math.max(0, Math.sin(t * 1.8)) * 4 : 0;
    const by = 4 - lift;
    line(ctx, -w / 2 + 8, by, w / 2 - 8, by, INK, 5);
    line(ctx, -w / 2 + 8, by, w / 2 - 8, by, P.metal, 3);
    for (const s of [-1, 1]) box(ctx, s * (w / 2 - 22) - 4, by - 14, 8, 28, 3, P.pad);
  },
  saco_pancada(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 10, -h / 2 + 4, w - 20, 10, 3, P.metalDark);
    line(ctx, 0, -h / 2 + 9, 0, -2, P.metalDark, 4);
    const sw = o.active ? Math.abs(Math.sin(t * 6)) * 3 : 0;
    circle(ctx, 0, 2 - sw, 12, P.pad);
    circle(ctx, 0, 2 - sw, 6, P.white, INK, 1.5);
  },
  barra_fixa(ctx, w, h) {
    box(ctx, -w / 2 + 6, -h / 2 + 8, w - 12, h - 16, 6, '#c9bdd8', null);
    for (const s of [-1, 1]) box(ctx, s * (w / 2 - 10) - 5, -h / 2 + 6, 10, h - 12, 3, P.metalDark);
    line(ctx, -w / 2 + 10, 0, w / 2 - 10, 0, INK, 5);
    line(ctx, -w / 2 + 10, 0, w / 2 - 10, 0, P.metal, 3);
    for (const x of [-w / 4, w / 4]) line(ctx, x - 5, 0, x + 5, 0, P.rubber, 5);
  },
  corda_naval(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 6, -h / 2 + 4, w - 12, h - 8, 6, '#c9bdd8', null);
    box(ctx, -9, -h / 2 + 6, 18, 14, 4, P.metalDark);
    for (const [s, ph] of [[-1, 0], [1, Math.PI]]) {
      ctx.beginPath();
      for (let y = -h / 2 + 18; y <= h / 2 - 10; y += 4) {
        const u = (y + h / 2) / h;
        const x = s * (4 + u * 6) + (o.active ? Math.sin(t * 9 + ph - u * 6) * u * 5 : 0);
        if (y === -h / 2 + 18) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#e9d7a8';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  },
  extensora(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, 18, 5, P.metalDark);
    for (let i = 0; i < 4; i++) box(ctx, -12, -h / 2 + 8 + i * 3.5, 24, 3, 1, P.plate, null);
    box(ctx, -14, -h / 2 + 28, 28, 10, 4, P.pad);
    box(ctx, -14, -6, 28, 22, 7, P.pad);
    const k = o.active ? (1 - Math.cos(t * 2.6)) / 2 : 0;
    line(ctx, -16, 18 + k * 8, 16, 18 + k * 8, INK, 8);
    line(ctx, -16, 18 + k * 8, 16, 18 + k * 8, P.pad, 6);
  },
  smith(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 6, '#d6c7b4');
    for (const s of [-1, 1]) {
      box(ctx, s * (w / 2 - 14) - 6, -h / 2 + 10, 12, 12, 3, P.metalDark);
      box(ctx, s * (w / 2 - 14) - 6, -h / 2 + 40, 12, 12, 3, P.metalDark);
      line(ctx, s * (w / 2 - 14), -h / 2 + 16, s * (w / 2 - 14), -h / 2 + 46, INK, 3);
    }
    const sq = o.active ? Math.sin(t * 2.2) * 2 : 0;
    const by = -h / 2 + 46 + sq;
    line(ctx, -w / 2 + 8, by, w / 2 - 8, by, INK, 6);
    line(ctx, -w / 2 + 8, by, w / 2 - 8, by, P.metal, 4);
    plateStack(ctx, -w / 2 + 24, by, 10);
    plateStack(ctx, w / 2 - 24, by, 10);
  },
  crossover(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 4, -h / 2 + 6, w - 8, h - 14, 6, '#d6c7b4');
    box(ctx, -w / 2 + 4, -h / 2 + 8, w - 8, 10, 4, P.metalDark);
    for (const s of [-1, 1]) box(ctx, s * (w / 2 - 20) - 10, -h / 2 + 6, 20, 22, 5, P.metalDark);
    const k = o.active ? (1 - Math.cos(t * 2.4)) / 2 : 0;
    for (const s of [-1, 1]) {
      const hx = s * (w / 2 - 30 - k * 26);
      line(ctx, s * (w / 2 - 20), -h / 2 + 18, hx, 6, INK, 1.5);
      circle(ctx, hx, 6, 4, P.rubber, INK, 1.5);
    }
  },
  geladeira(ctx, w, h) {
    box(ctx, -w / 2 + 6, -h / 2 + 5, w - 12, h - 10, 6, P.white);
    box(ctx, -w / 2 + 6, -h / 2 + 5, w - 12, 10, 4, P.blue);
    box(ctx, -w / 2 + 9, h / 2 - 12, w - 18, 5, 2, '#cfeaf7', INK, 1);
    [P.orange, P.blue, P.green, P.pink].forEach((c, i) => circle(ctx, -12 + i * 8, 0, 3.2, c, INK, 1));
  },
  caixa_som(ctx, w, h, t, o) {
    box(ctx, -w / 2 + 9, -h / 2 + 8, w - 18, h - 16, 5, P.rubber);
    const kick = o.on ? Math.max(0, 1 - ((t * 2.2) % 1) * 4) : 0;
    circle(ctx, 0, 2, 9 + kick * 1.5, '#2e2a3d', P.metal, 2);
    circle(ctx, 0, 2, 3, P.metalDark, null);
    circle(ctx, 0, -11, 3, P.metal, null);
  },
  ring_light(ctx, w, h, t) {
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3 + 0.3;
      line(ctx, 0, 0, Math.sin(a) * 14, Math.cos(a) * 14, P.rubber, 3);
    }
    ctx.beginPath();
    ctx.arc(0, -2, 13, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#fffdf8';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    box(ctx, -3, -7, 6, 10, 1.5, INK, null);
    if (Math.floor(t * 1.6) % 2 === 0) circle(ctx, 2, -5, 1.4, P.pad, null);
  },
  recepcao(ctx, w, h) {
    box(ctx, -w / 2 + 4, -h / 2 + 8, w - 8, h - 14, 5, '#c9a27a');
    box(ctx, -w / 2 + 4, -h / 2 + 6, w - 8, 9, 4, P.white);
    box(ctx, 8, -h / 2 + 2, 18, 12, 2, INK, null);
    box(ctx, 10, -h / 2 + 4, 14, 8, 1, P.blue, null);
    circle(ctx, -18, -h / 2 + 10, 3.5, P.metal, INK, 1);
    circle(ctx, -w / 2 + 16, -h / 2 + 8, 5, P.green, INK, 1);
  },
  trofeus(ctx, w, h) {
    box(ctx, -w / 2 + 5, -h / 2 + 6, w - 10, 18, 3, '#c9a27a');
    cupTop(ctx, -10, -h / 2 + 15, 5, '#c9cbd6');
    cupTop(ctx, 1, -h / 2 + 15, 7, P.yellow);
    cupTop(ctx, 12, -h / 2 + 15, 4.5, '#d9a066');
  },
});

export function drawEquipmentShape(ctx, type, w, h, t, opts) {
  (DRAW[type] ?? DRAW.halteres)(ctx, w, h, t, opts);
}
