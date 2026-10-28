// Primitivas de desenho e paleta. Todos os desenhos do jogo usam estas
// cores e contornos para parecerem parte do mesmo kit.

export const INK = '#3d3550';
export const PALETTE = {
  ink: INK,
  inkSoft: 'rgba(61,53,80,0.55)',
  shadow: 'rgba(61,53,80,0.11)',
  white: '#fffdf8',
  cream: '#f7f1e6',
  metal: '#c9cbd6',
  metalDark: '#8f92a6',
  rubber: '#4a4560',
  pad: '#e8646a',
  padDark: '#c94f55',
  blue: '#8ec5e8',
  blueDark: '#5d9cc9',
  green: '#7cc98a',
  greenDark: '#4fa463',
  yellow: '#f2cd5c',
  orange: '#f29a5c',
  purple: '#b9a3e3',
  pink: '#f5b3c8',
  mint: '#a8e6cf',
  plate: '#59546e',
};

export const FONT_UI = '"Nunito", system-ui, sans-serif';
export const FONT_TITLE = '"Fredoka", "Nunito", system-ui, sans-serif';

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillStroke(ctx, fill, stroke = INK, lineWidth = 2) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function box(ctx, x, y, w, h, r, fill, stroke = INK, lw = 2) {
  roundRect(ctx, x, y, w, h, r);
  fillStroke(ctx, fill, stroke, lw);
}

export function circle(ctx, x, y, r, fill, stroke = INK, lw = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  fillStroke(ctx, fill, stroke, lw);
}

export function ellipse(ctx, x, y, rx, ry, fill, stroke = null, lw = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  fillStroke(ctx, fill, stroke, lw);
}

export function line(ctx, x1, y1, x2, y2, color = INK, lw = 2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Sombra suave projetada (deslocada para baixo-direita). */
export function dropShadow(ctx, x, y, w, h, r) {
  roundRect(ctx, x + 3, y + 5, w, h, r);
  ctx.fillStyle = PALETTE.shadow;
  ctx.fill();
}

export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else current = test;
  }
  if (current) lines.push(current);
  return lines;
}

/** Balão de fala com rabinho apontando para (x, y). */
export function speechBubble(ctx, x, y, text, { tone = 'neutral', alpha = 1, maxWidth = 150, scale = 1 } = {}) {
  const colors = {
    neutral: ['#fffdf8', INK],
    complaint: ['#fff1ee', '#c94f55'],
    happy: ['#effaf0', '#4fa463'],
    whey: ['#fff6e8', '#d9773a'],
  }[tone];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = `700 11px ${FONT_UI}`;
  const lines = wrapText(ctx, text, maxWidth);
  const lh = 14;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const h = lines.length * lh + 10;
  const bx = -w / 2;
  const by = -h - 10;
  roundRect(ctx, bx, by, w, h, 9);
  ctx.fillStyle = colors[0];
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5, by + h - 1);
  ctx.lineTo(0, -2);
  ctx.lineTo(6, by + h - 1);
  ctx.fillStyle = colors[0];
  ctx.fill();
  roundRect(ctx, bx, by, w, h, 9);
  ctx.strokeStyle = colors[1];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5, by + h);
  ctx.lineTo(0, -2);
  ctx.lineTo(6, by + h);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 0, by + 5 + i * lh));
  ctx.restore();
}
