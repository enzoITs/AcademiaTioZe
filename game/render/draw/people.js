// Personagens modulares: corpo + cabeça + cabelo + roupa + acessório.
// Cada perfil tem 2 elementos de assinatura (cor da roupa + acessório);
// idade, tom de pele, cabelo e formato do corpo variam livremente.
import { PALETTE as P, INK, box, circle, ellipse, line } from './primitives.js';
import { PROFILES } from '../../config.js';

const PANTS = ['#4a4560', '#5d6b8a', '#6e5a7a'];

function drawHair(ctx, look, r) {
  const c = look.hair;
  switch (look.hairStyle) {
    case 'bald':
      ellipse(ctx, -r * 0.45, -r * 0.55, r * 0.25, r * 0.12, 'rgba(255,255,255,0.45)');
      break;
    case 'long':
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 1.05, Math.PI, 0);
      ctx.lineTo(r * 1.05, r * 0.8);
      ctx.lineTo(r * 0.6, r * 0.8);
      ctx.lineTo(r * 0.6, -r * 0.2);
      ctx.lineTo(-r * 0.6, -r * 0.2);
      ctx.lineTo(-r * 0.6, r * 0.8);
      ctx.lineTo(-r * 1.05, r * 0.8);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case 'bun':
      circle(ctx, 0, -r * 1.05, r * 0.42, c, INK, 1.5);
      ctx.beginPath();
      ctx.arc(0, -r * 0.05, r * 1.02, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.stroke();
      break;
    case 'curly':
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        circle(ctx, Math.cos(a) * r * 0.85, -r * 0.1 + Math.sin(a) * r * 0.85, r * 0.38, c, INK, 1.2);
      }
      break;
    case 'ponytail':
      ellipse(ctx, r * 0.95, -r * 0.2, r * 0.3, r * 0.55, c, INK, 1.5);
    // falls through
    default:
      ctx.beginPath();
      ctx.arc(0, -r * 0.05, r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
      ctx.quadraticCurveTo(r * 0.3, -r * 0.55, -r * 0.98, -r * 0.2);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
  }
}

function drawFace(ctx, r, mood, blink) {
  ctx.fillStyle = INK;
  const ey = r * 0.12;
  if (blink) {
    line(ctx, -r * 0.42, ey, -r * 0.2, ey, INK, 1.5);
    line(ctx, r * 0.2, ey, r * 0.42, ey, INK, 1.5);
  } else {
    ellipse(ctx, -r * 0.32, ey, r * 0.11, r * 0.15, INK);
    ellipse(ctx, r * 0.32, ey, r * 0.11, r * 0.15, INK);
  }
  ellipse(ctx, -r * 0.55, r * 0.42, r * 0.14, r * 0.08, 'rgba(242,154,142,0.6)');
  ellipse(ctx, r * 0.55, r * 0.42, r * 0.14, r * 0.08, 'rgba(242,154,142,0.6)');
  ctx.beginPath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  const my = r * 0.5;
  if (mood === 'happy') ctx.arc(0, my - r * 0.1, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood === 'sad') ctx.arc(0, my + r * 0.18, r * 0.2, 1.15 * Math.PI, 1.85 * Math.PI);
  else {
    ctx.moveTo(-r * 0.15, my);
    ctx.lineTo(r * 0.15, my);
  }
  ctx.stroke();
}

function drawAccessory(ctx, kind, r, bodyW, bodyTop, accent) {
  if (kind === 'visor') {
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 1.12, r * 0.35, 0, Math.PI, 0);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    box(ctx, -r * 1.15, -r * 0.62, r * 2.3, r * 0.22, 2, accent, INK, 1.2);
    // fone
    circle(ctx, -r * 1.02, r * 0.05, r * 0.24, INK, null);
    circle(ctx, r * 1.02, r * 0.05, r * 0.24, INK, null);
  }
  if (kind === 'wristband') {
    // pote de whey na mão
    box(ctx, bodyW / 2 + 1, bodyTop + 6, 7, 9, 2, '#fffdf8', INK, 1.2);
    box(ctx, bodyW / 2 + 1, bodyTop + 5, 7, 3, 1, P.pad, INK, 1);
  }
  if (kind === 'bottle') {
    box(ctx, -bodyW / 2 - 7, bodyTop + 4, 6, 11, 2, '#dff2ff', INK, 1.2);
    box(ctx, -bodyW / 2 - 6, bodyTop + 9, 4, 3, 1, P.yellow, null);
  }
}

/**
 * Desenha um aluno com os pés em (0, 0).
 * state: walk | use-run | use-lift | use-stretch | wait | idle
 */
export function drawPerson(ctx, look, profileId, state, t, seed = 0, mood = 'neutral') {
  const profile = PROFILES[profileId];
  const sig = profile.signature;
  const k = look.height;
  const bodyW = 13 * look.body;
  const bodyH = 12 * k;
  const r = 8.5;
  const phase = t * 6 + seed;

  let bob = 0;
  let squash = 1;
  let armUp = 0;
  if (state === 'walk') bob = -Math.abs(Math.sin(phase * 1.2)) * 3;
  if (state === 'use-run') bob = -Math.abs(Math.sin(phase * 2)) * 3.5;
  if (state === 'use-lift') { armUp = (Math.sin(phase * 0.6) + 1) / 2; squash = 1 - armUp * 0.06; }
  if (state === 'use-stretch') squash = 0.9 + Math.sin(phase * 0.5) * 0.06;
  if (state === 'wait') bob = Math.sin(phase * 0.5) * 0.8;
  if (profileId === 'corredor' && state === 'wait') bob = -Math.abs(Math.sin(phase * 1.6)) * 2; // trota no lugar

  ellipse(ctx, 0, 0, 9 * look.body, 3.5, P.shadow);
  ctx.save();
  ctx.translate(0, bob);
  ctx.scale(1, squash);

  // pernas e tênis (corredor: tênis neon; iniciante: tênis branquinho)
  const legSwing = state === 'walk' || state === 'use-run' ? Math.sin(phase * 1.2) * 2.5 : 0;
  const shoe = profileId === 'corredor' ? sig.accent : profileId === 'iniciante' ? '#ffffff' : P.rubber;
  box(ctx, -bodyW / 2 + 1, -7, 5, 7 + legSwing * 0.3, 2, PANTS[look.shade], INK, 1.2);
  box(ctx, bodyW / 2 - 6, -7, 5, 7 - legSwing * 0.3, 2, PANTS[look.shade], INK, 1.2);
  box(ctx, -bodyW / 2, -2 + legSwing * 0.3, 7, 3.5, 1.5, shoe, INK, 1);
  box(ctx, bodyW / 2 - 7, -2 - legSwing * 0.3, 7, 3.5, 1.5, shoe, INK, 1);

  const bodyTop = -7 - bodyH;
  // braços
  const armY = bodyTop + 3 - armUp * 7;
  circle(ctx, -bodyW / 2 - 2, armY + 6, 3, look.skin, INK, 1.2);
  circle(ctx, bodyW / 2 + 2, armY + 6, 3, look.skin, INK, 1.2);

  // tronco: iniciante camiseta larga; marombeiro regata; corredor camiseta justa
  const extra = profileId === 'iniciante' ? 3 : 0;
  box(ctx, -bodyW / 2 - extra / 2, bodyTop, bodyW + extra, bodyH, 5, sig.shirt, INK, 1.5);
  if (profileId === 'marombeiro') {
    circle(ctx, -bodyW / 2 + 1, bodyTop + 2, 2.6, look.skin, null);
    circle(ctx, bodyW / 2 - 1, bodyTop + 2, 2.6, look.skin, null);
    // munhequeiras
    box(ctx, -bodyW / 2 - 5, armY + 6, 6, 3, 1, sig.accent, null);
    box(ctx, bodyW / 2 - 1, armY + 6, 6, 3, 1, sig.accent, null);
  }
  if (profileId === 'corredor') line(ctx, -bodyW / 2 + 2, bodyTop + 5, bodyW / 2 - 2, bodyTop + 5, sig.accent, 2);

  // cabeça grande
  const headY = bodyTop - r + 1;
  ctx.save();
  ctx.translate(0, headY);
  if (look.hairStyle === 'long') drawHair(ctx, look, r);
  circle(ctx, 0, 0, r, look.skin, INK, 1.5);
  if (look.hairStyle !== 'long') drawHair(ctx, look, r);
  const blink = Math.sin(t * 1.3 + seed * 7) > 0.97;
  drawFace(ctx, r, mood, blink);
  if (look.age === 'senior') {
    circle(ctx, -r * 0.32, r * 0.12, r * 0.24, null, INK, 1);
    circle(ctx, r * 0.32, r * 0.12, r * 0.24, null, INK, 1);
  }
  drawAccessory(ctx, sig.accessory, r, bodyW, bodyTop - headY, sig.accent);
  ctx.restore();

  ctx.restore();
}

/**
 * Faxineiro(a): macacão azul, boné amarelo e esfregão. Pés em (0, 0).
 * mode: walk | clean | idle
 */
export function drawCleaner(ctx, look, mode, t, seed = 0, role = 'zelador') {
  const tech = role === 'tecnico';
  const overall = tech ? '#e07b3c' : '#5d9cc9';
  const capColor = tech ? P.pad : P.yellow;
  const brimColor = tech ? P.padDark : '#e5b53a';
  const k = look.height;
  const bodyW = 13 * look.body;
  const bodyH = 12 * k;
  const r = 8.5;
  const phase = t * 6 + seed;
  const bob = mode === 'walk' ? -Math.abs(Math.sin(phase * 1.2)) * 3 : 0;
  const sweep = mode === 'clean' ? Math.sin(phase * 1.4) * 7 : 0;
  const tap = mode === 'fix' ? Math.sin(phase * 2.4) * 4 : 0;

  ellipse(ctx, 0, 0, 9 * look.body, 3.5, P.shadow);
  if (tech) {
    // caixa de ferramentas no chão e chave inglesa na mão
    if (mode !== 'walk') {
      box(ctx, -bodyW / 2 - 15, -7, 12, 7, 2, P.pad, INK, 1.2);
      line(ctx, -bodyW / 2 - 12, -8, -bodyW / 2 - 6, -8, P.metalDark, 2);
    }
    line(ctx, bodyW / 2 + 2, -14 + bob + tap, bodyW / 2 + 9, -20 + bob + tap, P.metalDark, 3);
    line(ctx, bodyW / 2 + 2, -14 + bob + tap, bodyW / 2 + 9, -20 + bob + tap, P.metal, 1.5);
  } else {
    // esfregão (atrás do corpo, no lado direito)
    const mopX = bodyW / 2 + 7 + sweep;
    line(ctx, bodyW / 2 + 2, -18 + bob, mopX, 2, '#a07f5c', 2.5);
    ellipse(ctx, mopX, 2, 7, 3, '#e9e2f0', INK, 1.3);
  }

  ctx.save();
  ctx.translate(0, bob);
  const legSwing = mode === 'walk' ? Math.sin(phase * 1.2) * 2.5 : 0;
  box(ctx, -bodyW / 2 + 1, -7, 5, 7 + legSwing * 0.3, 2, overall, INK, 1.2);
  box(ctx, bodyW / 2 - 6, -7, 5, 7 - legSwing * 0.3, 2, overall, INK, 1.2);
  box(ctx, -bodyW / 2, -2 + legSwing * 0.3, 7, 3.5, 1.5, '#3d3550', INK, 1);
  box(ctx, bodyW / 2 - 7, -2 - legSwing * 0.3, 7, 3.5, 1.5, '#3d3550', INK, 1);

  const bodyTop = -7 - bodyH;
  circle(ctx, -bodyW / 2 - 2, bodyTop + 9, 3, look.skin, INK, 1.2);
  circle(ctx, bodyW / 2 + 2, bodyTop + 6 + sweep * 0.15, 3, look.skin, INK, 1.2);
  box(ctx, -bodyW / 2, bodyTop, bodyW, bodyH, 5, '#fffdf8', INK, 1.5);
  box(ctx, -bodyW / 2 + 1.5, bodyTop + 4, bodyW - 3, bodyH - 4, 3, overall, null);
  line(ctx, -bodyW / 2 + 3, bodyTop + 1, -bodyW / 2 + 3, bodyTop + 5, overall, 2);
  line(ctx, bodyW / 2 - 3, bodyTop + 1, bodyW / 2 - 3, bodyTop + 5, overall, 2);
  box(ctx, -3, bodyTop + 6, 6, 4, 1, tech ? P.white : P.yellow, INK, 1);

  const headY = bodyTop - r + 1;
  ctx.save();
  ctx.translate(0, headY);
  if (look.hairStyle === 'long') drawHair(ctx, look, r);
  circle(ctx, 0, 0, r, look.skin, INK, 1.5);
  drawFace(ctx, r, 'happy', Math.sin(t * 1.3 + seed * 7) > 0.97);
  // boné amarelo com aba
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r * 1.02, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fillStyle = capColor;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  box(ctx, -r * 0.2, -r * 0.62, r * 1.3, r * 0.28, 2, brimColor, INK, 1.2);
  ctx.restore();
  ctx.restore();
}

/** Whey, o gato laranja. mood: sleep | alert | worried */
export function drawWhey(ctx, mood, t) {
  const orange = '#f29a5c';
  const stripe = '#d9773a';
  ellipse(ctx, 0, 2, 14, 4.5, P.shadow);
  if (mood === 'sleep') {
    const breathe = 1 + Math.sin(t * 2) * 0.04;
    ctx.save();
    ctx.scale(breathe, 1 / breathe);
    ellipse(ctx, 0, -6, 14, 8, orange, INK, 1.5);
    ctx.beginPath();
    ctx.moveTo(10, -2);
    ctx.quadraticCurveTo(18, -8, 6, -12);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = orange;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    circle(ctx, -9, -8, 6.5, orange, INK, 1.5);
    line(ctx, -12, -8, -9.5, -7.5, INK, 1.2);
    line(ctx, -7.5, -7.5, -5, -8, INK, 1.2);
    [-2, 3, 8].forEach((x) => line(ctx, x, -13, x + 1, -9, stripe, 1.5));
    ctx.restore();
    ctx.fillStyle = 'rgba(61,53,80,0.7)';
    ctx.font = '700 9px "Fredoka", sans-serif';
    const z = (t * 0.8) % 1;
    ctx.globalAlpha = 1 - z;
    ctx.fillText('z', -12 + z * 6, -18 - z * 10);
    ctx.globalAlpha = 1;
    return;
  }
  const tail = Math.sin(t * (mood === 'alert' ? 6 : 3)) * 0.5;
  ctx.save();
  ctx.translate(8, -4);
  ctx.rotate(tail);
  line(ctx, 0, 0, 8, -10, INK, 4.5);
  line(ctx, 0, 0, 8, -10, orange, 2.5);
  ctx.restore();
  ellipse(ctx, 0, -7, 9, 9, orange, INK, 1.5);
  [-3, 1, 5].forEach((x) => line(ctx, x, -14, x, -10, stripe, 1.5));
  circle(ctx, 0, -19, 7.5, orange, INK, 1.5);
  ctx.beginPath();
  ctx.moveTo(-6.5, -22);
  ctx.lineTo(-5, -29);
  ctx.lineTo(-1.5, -25);
  ctx.moveTo(6.5, -22);
  ctx.lineTo(5, -29);
  ctx.lineTo(1.5, -25);
  ctx.fillStyle = orange;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const eyeR = mood === 'alert' ? 2.2 : 1.6;
  circle(ctx, -2.8, -19.5, eyeR, INK, null);
  circle(ctx, 2.8, -19.5, eyeR, INK, null);
  ellipse(ctx, 0, -16.5, 1.2, 0.8, P.pad);
  if (mood === 'alert') {
    ctx.fillStyle = '#e8646a';
    ctx.font = '800 14px "Fredoka", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -34 + Math.sin(t * 8) * 1.5);
  }
}
