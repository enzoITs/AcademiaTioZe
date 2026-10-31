// Renderizador Canvas 2D (reserva sem WebGL). Lê o mesmo estado que o React
// (store) e nunca o altera; o estado visual vem do SceneDirector.
import { CONFIG, getEquipmentDef } from '../config.js';
import {
  COLS, ROWS, DOOR, inBounds, footprintSize, frontCells, zoneAtCell, allZones, zoneById,
} from '../grid/grid.js';
import { conditionState, hasWear, CONDITION_STATES, itemLevel } from '../systems/maintenance.js';
import { placementPreview } from '../engine/store.js';
import { SceneDirector } from './director.js';
import { drawEquipmentShape } from './draw/equipment.js';
import { drawPerson, drawWhey, drawCleaner } from './draw/people.js';
import {
  PALETTE as P, INK, FONT_UI, FONT_TITLE, box, circle, ellipse, line, roundRect, dropShadow, speechBubble,
} from './draw/primitives.js';
import { formatMoney } from '../utils/format.js';
import { floorOf, BLOCK_TINT, lookOf } from './look.js';
import { cityPlan, matrizTheme, matrizLandmarks } from './cityLayout.js';
import { drawCity2D } from './draw/city2d.js';

const T = CONFIG.grid.tileSize;
const MIN_ZOOM = 0.18;

/** Limites do mundo desenhado: a grade atual (que cresce) mais rua e margem. */
const world = () => ({ x: -T * 0.6, y: -T * 0.6, w: COLS * T + T * 1.2, h: ROWS * T + T * 2.2 });

/** Renderizador Canvas 2D de reserva, usado só quando o navegador não tem WebGL. */
export class GameRenderer extends SceneDirector {
  constructor(canvas, game) {
    super(game);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { zoom: 1, x: 0, y: 0 };
    this.viewport = { w: 1, h: 1, dpr: 1 };
    this.userMovedCamera = false;
  }

  dispose() {}

  // ------------------------------------------------------------ câmera
  resize(w, h, dpr) {
    this.viewport = { w, h, dpr };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (!this.userMovedCamera) this.fit();
    else this.clampCamera();
  }

  fit() {
    const { w, h } = this.viewport;
    const W = this.inView(world);
    const zoom = Math.min(w / W.w, h / W.h) * 0.98;
    this.camera.zoom = Math.max(MIN_ZOOM, Math.min(2.5, zoom));
    this.camera.x = W.x + W.w / 2 - w / 2 / this.camera.zoom;
    this.camera.y = W.y + W.h / 2 - h / 2 / this.camera.zoom;
    this.fittedSize = `${COLS}x${ROWS}`;
  }

  resetCamera() {
    this.userMovedCamera = false;
    this.inView(() => this.fit());
  }

  clampCamera() {
    const { w, h } = this.viewport;
    const z = this.camera.zoom;
    const vw = w / z;
    const vh = h / z;
    const clampAxis = (pos, view, min, size) => (view >= size ? min + size / 2 - view / 2 : Math.min(Math.max(pos, min - view * 0.3), min + size - view * 0.7));
    const W = this.inView(world);
    this.camera.x = clampAxis(this.camera.x, vw, W.x, W.w);
    this.camera.y = clampAxis(this.camera.y, vh, W.y, W.h);
  }

  /** O mundo cresceu (terreno novo): reenquadra se o jogador não mexeu na câmera. */
  followWorldGrowth() {
    if (this.cameraShift) {
      this.camera.x += this.cameraShift.x * T;
      this.camera.y += this.cameraShift.y * T;
      this.cameraShift = null;
    }
    if (this.refitCamera) {
      this.refitCamera = false;
      this.userMovedCamera = false;
      this.fittedSize = null;
    }
    if (this.fittedSize === `${COLS}x${ROWS}`) return;
    if (!this.userMovedCamera) this.fit();
    else {
      this.fittedSize = `${COLS}x${ROWS}`;
      this.clampCamera();
    }
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = Math.max(MIN_ZOOM, Math.min(2.6, this.camera.zoom * factor));
    this.camera.x = before.x - sx / this.camera.zoom;
    this.camera.y = before.y - sy / this.camera.zoom;
    this.userMovedCamera = true;
    this.clampCamera();
  }

  pan(dx, dy) {
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y -= dy / this.camera.zoom;
    this.userMovedCamera = true;
    this.clampCamera();
  }

  screenToWorld(sx, sy) {
    return { x: sx / this.camera.zoom + this.camera.x, y: sy / this.camera.zoom + this.camera.y };
  }

  cellAt(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / T), y: Math.floor(w.y / T) };
  }

  /** O que está sob o cursor, em ordem de prioridade de clique. */
  hitTest(sx, sy) {
    // Na filial (Era 5) a grade é a do andar visitado.
    return this.inView(() => this.hitTestHere(sx, sy));
  }

  hitTestHere(sx, sy) {
    const { state } = this.game;
    const w = this.screenToWorld(sx, sy);
    for (const d of state.dirt) {
      if (Math.hypot(d.x * T - w.x, d.y * T - w.y) < T * 0.38) return { kind: 'dirt', id: d.id };
    }
    if (Math.hypot(this.whey.x - w.x, this.whey.y - 12 - w.y) < 18) return { kind: 'whey' };
    const cell = { x: Math.floor(w.x / T), y: Math.floor(w.y / T) };
    const zone = zoneAtCell(cell.x, cell.y);
    if (zone && !state.unlockedZones.includes(zone.id)) return { kind: 'zone', id: zone.id, cell };
    return { kind: 'cell', cell };
  }

  dirtAt(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return this.game.state.dirt.find((d) => Math.hypot(d.x * T - w.x, d.y * T - w.y) < T * 0.42) ?? null;
  }


  // ------------------------------------------------------------ desenho
  render(now) {
    if (!this.store.state || !this.store.rt) return;
    // Matriz ou filial visitada: a cena da filial desenha dentro da grade dela.
    this.renderScene(now, (n) => this.renderFrame(n));
  }

  onSourceChange() {
    this.userMovedCamera = false;
    this.refitCamera = true;
    this.cityKey = null;
  }

  /** Cidade em volta, com a mesma planta do 3D. */
  drawCity(ctx, state) {
    const opts = {
      cols: COLS, rows: ROWS, door: { x: DOOR.x, y: DOOR.y },
      theme: state.city?.theme ?? matrizTheme(state.era),
      seed: state.city?.seed ?? state.seed ?? 1,
      landmarks: state.isBranchView ? [] : matrizLandmarks(state.era),
      historic: state.era >= 4,
    };
    const key = JSON.stringify(opts);
    if (key !== this.cityKey) {
      this.cityKey = key;
      this.cityPlan = cityPlan(opts);
    }
    drawCity2D(ctx, this.cityPlan, T);
  }

  renderFrame(now) {
    const { state, rt, ui } = this.game;
    this.followWorldGrowth();
    this.step(now);
    const t = this.time;

    const ctx = this.ctx;
    const { dpr, w, h } = this.viewport;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#cfe6c0';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * this.camera.zoom, 0, 0, dpr * this.camera.zoom, -this.camera.x * this.camera.zoom * dpr, -this.camera.y * this.camera.zoom * dpr);

    this.drawCity(ctx, state);
    this.drawOutside(ctx, t);
    this.drawFloor(ctx, state);
    this.drawLockedZones(ctx, state, t);
    if (ui.editMode || ui.mode !== 'normal') this.drawGridLines(ctx, state);
    this.drawWalls(ctx, state, t);
    this.drawDirt(ctx, state, t);

    const preview = placementPreview();
    const drawables = [];
    for (const item of state.items) {
      if (ui.mode === 'move' && ui.moving?.id === item.id) continue;
      const { h: ih } = footprintSize(item.type, item.rot);
      drawables.push({ y: (item.y + ih) * T - 1, draw: () => this.drawItem(ctx, item, t, now) });
    }
    for (const sp of this.sprites.values()) drawables.push({ y: sp.y, draw: () => this.drawSprite(ctx, sp, t) });
    for (const sp of this.staffSprites.values()) {
      drawables.push({
        y: sp.y,
        draw: () => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, sp.alpha);
          ctx.translate(sp.x, sp.y);
          drawCleaner(ctx, sp.member.look, sp.mode, t, sp.seed, sp.member.role);
          ctx.restore();
        },
      });
    }
    if (!state.isBranchView) drawables.push({ y: this.whey.y, draw: () => this.drawWheyAt(ctx, t) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    if (ui.maintenanceView) this.drawMaintenanceOverlay(ctx, state, rt, t);
    this.drawSelection(ctx, state, ui, t);
    if (preview) this.drawPreview(ctx, preview, t);
    this.drawParticles(ctx, now);
    this.drawBubbles(ctx, now);

    // tinta do período do dia
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BLOCK_TINT[state.time.block];
    ctx.fillRect(0, 0, w, h);
  }

  drawOutside(ctx, t) {
    // rua e calçada
    const streetY = ROWS * T + T * 0.25;
    ctx.fillStyle = '#b9b4c4';
    const W = world();
    ctx.fillRect(W.x - T * 4, streetY, W.w + T * 8, T * 3);
    ctx.fillStyle = '#e6e1d8';
    ctx.fillRect(W.x - T * 4, streetY - T * 0.15, W.w + T * 8, T * 0.5);
    for (let x = -2; x < COLS + 3; x += 1.5) {
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(x * T, streetY + T * 1.15, T * 0.7, 4);
    }
    // caminho da porta até a calçada
    for (let y = DOOR.y + 1; y < ROWS; y++) {
      box(ctx, DOOR.x * T + 6, y * T + 4, T - 12, T - 8, 8, '#efe6d6', 'rgba(61,53,80,0.25)', 1.5);
    }
    // arbustos decorativos no jardim da frente, ao lado do caminho da porta
    [[-0.7, 2.4], [1.6, 3.6], [-0.5, 4.3], [2.1, 4.4]].forEach(([ox, oy], i) => {
      const x = DOOR.x + ox;
      const y = DOOR.y + oy;
      if (y >= ROWS + 0.2 || zoneAtCell(Math.floor(x), Math.floor(y))) return;
      const s = 1 + Math.sin(t * 1.2 + i) * 0.02;
      ellipse(ctx, x * T + 3, y * T + 8, 16, 6, P.shadow);
      circle(ctx, x * T, y * T, 15 * s, '#9ccf8a', INK, 2);
      circle(ctx, x * T + 9, y * T - 6, 10 * s, '#b0dc9e', INK, 2);
    });
    // placa da academia
    ctx.save();
    const sign = lookOf(this.game.state).sign;
    ctx.translate((DOOR.x + 1.25) * T + sign.w / 2, (DOOR.y + 1.55) * T);
    box(ctx, -sign.w / 2, -14, sign.w, 24, 6, sign.fill);
    ctx.fillStyle = sign.ink;
    ctx.font = `700 10px ${FONT_TITLE}`;
    ctx.textAlign = 'center';
    ctx.fillText(sign.lines[0], 0, -3);
    if (sign.sub) {
      ctx.fillStyle = sign.sub;
      ctx.font = `700 7px ${FONT_TITLE}`;
    }
    ctx.fillText(sign.lines[1], 0, 8);
    ctx.restore();
  }

  drawFloor(ctx, state) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const z = zoneAtCell(x, y);
        if (!z || !state.unlockedZones.includes(z.id)) continue;
        const [a, b] = floorOf(z, state);
        ctx.fillStyle = (x + y) % 2 ? a : b;
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
    // tapete de entrada na porta
    box(ctx, DOOR.x * T + 6, DOOR.y * T + 10, T - 12, T - 16, 6, '#c9a27a', 'rgba(61,53,80,0.4)', 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) line(ctx, DOOR.x * T + 12 + i * 7, DOOR.y * T + 14, DOOR.x * T + 12 + i * 7, DOOR.y * T + T - 10, 'rgba(255,255,255,0.35)', 1);
  }

  drawLockedZones(ctx, state, t) {
    for (const z of allZones(state)) {
      if (state.unlockedZones.includes(z.id)) continue;
      const x = z.x * T;
      const y = z.y * T;
      const w = z.w * T;
      const h = z.h * T;
      ctx.fillStyle = '#c3dfb2';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < z.w * z.h; i += 3) ctx.fillRect(x + ((i * 37) % w), y + ((i * 53) % h), 3, 3);
      // cerca
      ctx.setLineDash([6, 6]);
      roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 10);
      ctx.strokeStyle = '#a07f5c';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
      // Brilho pulsante nos primeiros segundos de um terreno recém-surgido.
      const glow = this.newZoneGlow;
      const k = glow && glow.zoneId === z.id ? (this.time * 1000 - glow.t0) / 3000 : 1;
      if (k < 1) {
        roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 12);
        ctx.strokeStyle = `rgba(242,205,92,${(1 - k) * (0.6 + 0.4 * Math.sin(this.time * 10))})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      for (let px = x + 8; px < x + w - 4; px += 24) {
        box(ctx, px - 2, y + 1, 5, 9, 2, '#c9a27a', INK, 1);
        box(ctx, px - 2, y + h - 10, 5, 9, 2, '#c9a27a', INK, 1);
      }
      // placa de venda
      const available = !z.requires || state.unlockedZones.includes(z.requires);
      const cx = x + w / 2;
      const cy = y + h / 2;
      const bounce = available ? Math.sin(t * 2) * 2 : 0;
      ctx.save();
      ctx.translate(cx, cy + bounce);
      // A placa cresce com o texto, sem passar da largura do terreno.
      const title = `${z.label} ${z.w}×${z.h}`;
      const sub = available ? formatMoney(z.cost) : `Requer ${zoneById(z.requires)?.label ?? 'a área ao lado'}`;
      const titleFont = `700 12px ${FONT_TITLE}`;
      const subFont = available ? `800 13px ${FONT_UI}` : `800 11px ${FONT_UI}`;
      ctx.font = titleFont;
      const tw = ctx.measureText(title).width;
      ctx.font = subFont;
      const sw = ctx.measureText(sub).width;
      const maxW = w - 16;
      const natural = Math.max(tw, sw) + 24;
      const signW = Math.max(116, Math.min(natural, maxW));
      const shrink = Math.min(1, (signW - 24) / Math.max(tw, sw));
      line(ctx, 0, 10, 0, 34, '#a07f5c', 4);
      box(ctx, -signW / 2, -26, signW, 44, 8, available ? '#fffdf8' : '#ece8ef');
      ctx.textAlign = 'center';
      ctx.save();
      ctx.scale(shrink, shrink);
      ctx.fillStyle = INK;
      ctx.font = titleFont;
      ctx.fillText(title, 0, -9 / shrink);
      ctx.font = subFont;
      ctx.fillStyle = available ? P.greenDark : P.metalDark;
      ctx.fillText(sub, 0, 9 / shrink);
      ctx.restore();
      ctx.restore();
    }
  }

  drawGridLines(ctx, state) {
    ctx.strokeStyle = 'rgba(61,53,80,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const z = zoneAtCell(x, y);
        if (!z || !state.unlockedZones.includes(z.id)) continue;
        ctx.rect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
      }
    }
    ctx.stroke();
  }

  drawWalls(ctx, state, t) {
    const unlocked = (x, y) => {
      if (!inBounds(x, y)) return false;
      const z = zoneAtCell(x, y);
      return !!z && state.unlockedZones.includes(z.id);
    };
    const segs = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!unlocked(x, y)) continue;
        if (!unlocked(x, y - 1)) segs.push([x * T, y * T, (x + 1) * T, y * T]);
        if (!unlocked(x - 1, y)) segs.push([x * T, y * T, x * T, (y + 1) * T]);
        if (!unlocked(x + 1, y)) segs.push([(x + 1) * T, y * T, (x + 1) * T, (y + 1) * T]);
        if (!unlocked(x, y + 1) && !(x === DOOR.x && y === DOOR.y)) segs.push([x * T, (y + 1) * T, (x + 1) * T, (y + 1) * T]);
      }
    }
    ctx.lineCap = 'square';
    for (const [lw, color] of [[11, INK], [7, lookOf(state).wall]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of segs) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // portão de enrolar aberto + lâmpada pendurada
    const dx = DOOR.x * T;
    const dy = (DOOR.y + 1) * T;
    box(ctx, dx - 4, dy - 6, T + 8, 9, 3, '#9aa0b5');
    for (let i = 1; i < 4; i++) line(ctx, dx - 2, dy - 6 + i * 2, dx + T + 2, dy - 6 + i * 2, 'rgba(61,53,80,0.35)', 1);
    const swing = Math.sin(t * 1.4) * 2;
    line(ctx, dx + T / 2, dy - 6, dx + T / 2 + swing, dy + 6, INK, 1.5);
    const night = state.time.block === 2;
    if (night) {
      const g = ctx.createRadialGradient(dx + T / 2 + swing, dy + 10, 2, dx + T / 2 + swing, dy + 10, T * 1.4);
      g.addColorStop(0, 'rgba(255,230,140,0.55)');
      g.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(dx - T, dy - T, T * 3, T * 3);
    }
    circle(ctx, dx + T / 2 + swing, dy + 9, 4.5, night ? '#fff3b0' : '#fffdf8', INK, 1.5);
  }

  drawDirt(ctx, state, t) {
    for (const d of state.dirt) {
      const x = d.x * T;
      const y = d.y * T;
      if (d.kind === 'suor') {
        ellipse(ctx, x, y, 10, 6, 'rgba(160,200,215,0.75)', 'rgba(61,53,80,0.45)', 1.2);
        ellipse(ctx, x + 6, y - 3, 3.5, 2.5, 'rgba(160,200,215,0.75)', 'rgba(61,53,80,0.45)', 1);
        ellipse(ctx, x - 3, y - 2, 3, 1.5, 'rgba(255,255,255,0.7)');
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(0.4 + (d.id % 3) * 0.5);
        box(ctx, -9, -5, 18, 10, 3, '#fffdf8', INK, 1.5);
        line(ctx, -9, 2, 9, 2, P.blue, 2);
        ctx.restore();
      }
      if (this.game.ui.maintenanceView) {
        const pulse = 12 + Math.sin(t * 5 + d.id) * 3;
        circle(ctx, x, y, pulse, null, '#d9773a', 2);
      }
    }
  }

  drawItem(ctx, item, t, now) {
    const { rt } = this.game;
    const def = getEquipmentDef(item.type);
    const info = rt.academy.itemInfo.get(item.id);
    const { w, h } = footprintSize(item.type, item.rot);
    const [w0, h0] = def.size;
    const cx = (item.x + w / 2) * T;
    const cy = (item.y + h / 2) * T;
    const st = info?.state ?? 'ok';
    const active = !!rt.blockStats.perItem[item.id]?.uses && st !== 'quebrado';

    let scale = 1;
    const anim = this.itemAnims.get(item.id);
    if (anim) {
      const k = (now - anim.t0) / 1000;
      if (anim.kind === 'place' && k < 0.35) scale = 1 + Math.sin((k / 0.35) * Math.PI) * 0.12;
      else if (anim.kind === 'repair' && k < 2) scale = 1 + Math.sin(k * 18) * 0.02;
      else this.itemAnims.delete(item.id);
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    dropShadow(ctx, -w * T / 2 + 4, -h * T / 2 + 4, w * T - 8, h * T - 8, 10);
    ctx.save();
    ctx.rotate((item.rot * Math.PI) / 2);
    drawEquipmentShape(ctx, item.type, w0 * T, h0 * T, t, { level: itemLevel(item), active, on: true });
    ctx.restore();

    if (hasWear(item) && (st === 'cansado' || st === 'quebrado')) {
      roundRect(ctx, -w * T / 2 + 4, -h * T / 2 + 4, w * T - 8, h * T - 8, 8);
      ctx.fillStyle = st === 'quebrado' ? 'rgba(61,53,80,0.32)' : 'rgba(120,110,130,0.18)';
      ctx.fill();
    }
    if (st === 'quebrado') {
      line(ctx, -10, -12, 2, -2, INK, 2.5);
      line(ctx, 2, -2, -4, 6, INK, 2.5);
      line(ctx, -4, 6, 8, 14, INK, 2.5);
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        ellipse(ctx, Math.sin(k * 6 + i) * 6, -h * T / 2 - k * 22, 5 + k * 5, 4 + k * 4, `rgba(140,135,150,${0.5 * (1 - k)})`);
      }
    }
    // indicador de estado
    if (hasWear(item) && st !== 'ok') {
      const bx = w * T / 2 - 12;
      const by = -h * T / 2 + 10;
      circle(ctx, bx, by, 8, CONDITION_STATES[st].color, INK, 1.5);
      ctx.fillStyle = INK;
      ctx.font = `900 10px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st === 'quebrado' ? '×' : st === 'cansado' ? '!' : '~', bx, by + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
    if (info && !info.reachable) {
      roundRect(ctx, -w * T / 2 + 2, -h * T / 2 + 2, w * T - 4, h * T - 4, 9);
      ctx.strokeStyle = '#e8646a';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      circle(ctx, 0, 0, 11, '#e8646a', INK, 2);
      ctx.fillStyle = '#fff';
      ctx.font = `900 14px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 1);
      ctx.textBaseline = 'alphabetic';
    }
    if (anim?.kind === 'repair') {
      const k = (now - anim.t0) / 1000;
      if (k < 2) {
        ctx.save();
        ctx.translate(0, -h * T / 2 - 10);
        ctx.rotate(Math.sin(k * 14) * 0.6);
        line(ctx, -8, 8, 6, -6, INK, 5);
        line(ctx, -8, 8, 6, -6, P.metal, 3);
        circle(ctx, 7, -7, 5, P.metal, INK, 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawSprite(ctx, sp, t) {
    const moving = sp.path.length > 0;
    const state = moving ? 'walk' : sp.target.state;
    const mood = sp.student.S >= 65 ? 'happy' : sp.student.S < 45 ? 'sad' : 'neutral';
    ctx.save();
    ctx.globalAlpha = Math.max(0, sp.alpha);
    ctx.translate(sp.x, sp.y);
    drawPerson(ctx, sp.student.look, sp.student.profile, state, t, sp.seed, mood);
    ctx.restore();
  }

  drawWheyAt(ctx, t) {
    ctx.save();
    ctx.translate(this.whey.x, this.whey.y);
    drawWhey(ctx, this.wheyWalking ? 'worried' : this.wheyMood ?? 'sleep', t);
    ctx.restore();
  }

  drawMaintenanceOverlay(ctx, state, rt, t) {
    ctx.fillStyle = 'rgba(40,34,60,0.28)';
    ctx.fillRect(0, 0, COLS * T, ROWS * T);
    for (const item of state.items) {
      if (!hasWear(item)) continue;
      const { w, h } = footprintSize(item.type, item.rot);
      const st = conditionState(item.condition);
      roundRect(ctx, item.x * T + 3, item.y * T + 3, w * T - 6, h * T - 6, 8);
      ctx.fillStyle = `${CONDITION_STATES[st].color}aa`;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `800 13px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(item.condition)}%`, (item.x + w / 2) * T, (item.y + h / 2) * T + 4);
      ctx.font = `700 10px ${FONT_UI}`;
      ctx.fillText(CONDITION_STATES[st].label, (item.x + w / 2) * T, (item.y + h / 2) * T + 17);
    }
    for (const d of state.dirt) {
      circle(ctx, d.x * T, d.y * T, 13 + Math.sin(t * 5 + d.id) * 3, 'rgba(242,154,92,0.35)', '#d9773a', 2);
    }
  }

  drawSelection(ctx, state, ui, t) {
    if (!ui.selectedId || ui.mode !== 'normal') return;
    const item = state.items.find((i) => i.id === ui.selectedId);
    if (!item) return;
    const { w, h } = footprintSize(item.type, item.rot);
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -t * 20;
    roundRect(ctx, item.x * T + 1, item.y * T + 1, w * T - 2, h * T - 2, 10);
    ctx.strokeStyle = '#f2b13c';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
    if (getEquipmentDef(item.type).needsAccess) {
      for (const c of frontCells(item.type, item.x, item.y, item.rot)) {
        box(ctx, c.x * T + 6, c.y * T + 6, T - 12, T - 12, 8, 'rgba(142,197,232,0.25)', 'rgba(93,156,201,0.7)', 1.5);
      }
    }
  }

  drawPreview(ctx, pv, t) {
    const { ui, state } = this.game;
    const movingItem = ui.mode === 'move' ? state.items.find((i) => i.id === ui.moving?.id) : null;
    if (movingItem && ui.moving.origin) {
      // Contorno de onde o aparelho saiu.
      const o = ui.moving.origin;
      const { w: ow, h: oh } = footprintSize(movingItem.type, o.rot);
      ctx.setLineDash([6, 5]);
      roundRect(ctx, o.x * T + 4, o.y * T + 4, ow * T - 8, oh * T - 8, 10);
      ctx.fillStyle = 'rgba(61,53,80,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(61,53,80,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const color = !pv.ok ? 'rgba(232,100,106,0.45)' : pv.warning ? 'rgba(242,177,60,0.45)' : 'rgba(124,201,138,0.45)';
    const stroke = !pv.ok ? '#c94f55' : pv.warning ? '#d9913a' : '#4fa463';
    for (const c of pv.cells) box(ctx, c.x * T + 2, c.y * T + 2, T - 4, T - 4, 6, color, stroke, 1.5);
    for (const c of pv.front) {
      ctx.setLineDash([4, 4]);
      box(ctx, c.x * T + 7, c.y * T + 7, T - 14, T - 14, 8, 'rgba(142,197,232,0.22)', '#5d9cc9', 1.5);
      ctx.setLineDash([]);
    }
    const def = getEquipmentDef(pv.type);
    const { w, h } = footprintSize(pv.type, pv.rot);
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.translate((pv.x + w / 2) * T, (pv.y + h / 2) * T - 3 + Math.sin(t * 4) * 1.5);
    ctx.rotate((pv.rot * Math.PI) / 2);
    const level = movingItem ? itemLevel(movingItem) : 1;
    drawEquipmentShape(ctx, pv.type, def.size[0] * T, def.size[1] * T, t, { level, active: false, on: true });
    ctx.restore();
  }

  drawParticles(ctx, now) {
    for (const p of this.particles) {
      const k = (now - p.t0) / 1000;
      const x = p.x + p.vx * k;
      const y = p.y + p.vy * k + (p.kind === 'confetti' ? 60 * k * k : 0);
      const a = 1 - k / p.life;
      ctx.globalAlpha = Math.max(0, a);
      if (p.kind === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, 5, 3);
      } else if (p.kind === 'dust') ellipse(ctx, x, y, 6 * (1 + k), 4 * (1 + k), p.color);
      else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(k * 6);
        ctx.fillStyle = p.color;
        ctx.fillRect(-3, -1, 6, 2);
        ctx.fillRect(-1, -3, 2, 6);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      const k = (now - f.t0) / 1400;
      ctx.globalAlpha = 1 - k;
      ctx.font = `900 13px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fffdf8';
      ctx.strokeText(f.text, f.x, f.y - k * 30);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - k * 30);
    }
    ctx.globalAlpha = 1;
  }

  drawBubbles(ctx, now) {
    for (const b of this.bubbles) {
      const sp = this.sprites.get(b.key);
      if (!sp || now < b.t0) continue;
      const k = (now - b.t0) / b.dur;
      const alpha = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
      const pop = k < 0.08 ? 0.7 + (k / 0.08) * 0.3 : 1;
      speechBubble(ctx, sp.x, sp.y - 36, b.text, { tone: b.tone, alpha, scale: pop / Math.max(0.8, this.camera.zoom * 0.9) });
    }
    const wb = this.game.ui.wheyBubble;
    if (wb && now < wb.until) speechBubble(ctx, this.whey.x, this.whey.y - 30, wb.text, { tone: 'whey', maxWidth: 190 });
  }
}
