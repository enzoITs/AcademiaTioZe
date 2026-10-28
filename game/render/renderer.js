// Renderizador Canvas 2D. Lê o mesmo estado que o React (store) e nunca o
// altera: só mantém estado visual próprio (câmera, sprites, partículas).
import { CONFIG, getEquipmentDef } from '../config.js';
import {
  COLS, ROWS, DOOR, cellIndex, inBounds, footprintSize, frontCells, footprintCells, zoneAtCell, allZones, zoneById,
} from '../grid/grid.js';
import { nearestWalkable, pathFromDoor } from '../pathfinding/floodFill.js';
import { conditionState, hasWear, CONDITION_STATES } from '../systems/maintenance.js';
import { wheyMood } from '../systems/characters.js';
import { placementPreview } from '../engine/store.js';
import { buildTargets, walkPath } from './scene.js';
import { drawEquipmentShape } from './draw/equipment.js';
import { drawPerson, drawWhey, drawCleaner } from './draw/people.js';
import {
  PALETTE as P, INK, FONT_UI, FONT_TITLE, box, circle, ellipse, line, roundRect, dropShadow, speechBubble,
} from './draw/primitives.js';
import { formatMoney } from '../utils/format.js';

const T = CONFIG.grid.tileSize;
const ZONE_FLOOR = {
  garagem: ['#ece4d6', '#e4dac9'],
  quintal: ['#e3ecd9', '#d9e4cd'],
  puxadinho: ['#e9e3f1', '#dfd7ea'],
  varanda: ['#f3e3d3', '#ebd6c2'],
  galpao: ['#e1e3ea', '#d6d9e2'],
  terraco: ['#dcebef', '#cfe2e7'],
};
// Pisos dos terrenos gerados: alternam numa paleta pastel.
const PROC_FLOORS = [
  ['#efe6dc', '#e6dbcd'], ['#e2ecf3', '#d6e3ec'], ['#ece6f2', '#e1d9ea'],
  ['#e6efe0', '#dbe7d3'], ['#f3e8d8', '#ebdcc6'], ['#e4e8ec', '#d9dee4'],
];
const floorOf = (zone) => ZONE_FLOOR[zone.id] ?? PROC_FLOORS[(Number(zone.id.split('-')[1]) || 0) % PROC_FLOORS.length];
const BLOCK_TINT = ['rgba(255,214,150,0.07)', 'rgba(255,255,255,0)', 'rgba(70,80,160,0.12)'];
const MIN_ZOOM = 0.18;

/** Limites do mundo desenhado: a grade atual (que cresce) mais rua e margem. */
const world = () => ({ x: -T * 0.6, y: -T * 0.6, w: COLS * T + T * 1.2, h: ROWS * T + T * 2.2 });

export class GameRenderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.camera = { zoom: 1, x: 0, y: 0 };
    this.viewport = { w: 1, h: 1, dpr: 1 };
    this.sprites = new Map();
    this.lastStats = null;
    this.bubbles = [];
    this.particles = [];
    this.floaters = [];
    this.itemAnims = new Map();
    this.nextBubbleAt = 0;
    this.whey = { x: (DOOR.x + 1.5) * T, y: (DOOR.y + 0.6) * T };
    this.staffSprites = new Map();
    this.time = 0;
    this.userMovedCamera = false;
  }

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
    const W = world();
    const zoom = Math.min(w / W.w, h / W.h) * 0.98;
    this.camera.zoom = Math.max(MIN_ZOOM, Math.min(2.5, zoom));
    this.camera.x = W.x + W.w / 2 - w / 2 / this.camera.zoom;
    this.camera.y = W.y + W.h / 2 - h / 2 / this.camera.zoom;
    this.fittedSize = `${COLS}x${ROWS}`;
  }

  resetCamera() {
    this.userMovedCamera = false;
    this.fit();
  }

  clampCamera() {
    const { w, h } = this.viewport;
    const z = this.camera.zoom;
    const vw = w / z;
    const vh = h / z;
    const clampAxis = (pos, view, min, size) => (view >= size ? min + size / 2 - view / 2 : Math.min(Math.max(pos, min - view * 0.3), min + size - view * 0.7));
    const W = world();
    this.camera.x = clampAxis(this.camera.x, vw, W.x, W.w);
    this.camera.y = clampAxis(this.camera.y, vh, W.y, W.h);
  }

  /** O mundo cresceu (terreno novo): reenquadra se o jogador não mexeu na câmera. */
  followWorldGrowth() {
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

  // ------------------------------------------------------------ cena
  syncScene() {
    const { state, rt } = this.game;
    if (rt.blockStats === this.lastStats) return;
    this.lastStats = rt.blockStats;
    const flood = rt.academy.access.flood;
    const targets = buildTargets(state, rt);
    const students = new Map(state.students.map((s) => [s.id, s]));
    const alive = new Set();
    for (const tg of targets) {
      const student = students.get(tg.studentId);
      if (!student) continue;
      alive.add(tg.key);
      const existing = this.sprites.get(tg.key);
      if (existing && !existing.leaving) {
        existing.student = student;
        existing.target = tg;
        if (Math.hypot(existing.goal.x - tg.x, existing.goal.y - tg.y) > 2) {
          existing.path = [{ x: tg.x, y: tg.y }];
          existing.goal = { x: tg.x, y: tg.y };
        }
        continue;
      }
      const path = walkPath(flood, tg.cell, { x: tg.x, y: tg.y });
      this.sprites.set(tg.key, {
        key: tg.key, student, target: tg, x: path[0].x, y: path[0].y, path: path.slice(1), goal: { x: tg.x, y: tg.y },
        alpha: 0, leaving: false, seed: (tg.studentId * 13) % 17,
      });
    }
    for (const [key, sp] of this.sprites) {
      if (alive.has(key) || sp.leaving) continue;
      sp.leaving = true;
      const cell = { x: Math.floor(sp.x / T), y: Math.floor(sp.y / T) };
      const back = (pathFromDoor(flood, cell.x, cell.y) ?? []).reverse().map((c) => ({ x: (c.x + 0.5) * T, y: (c.y + 0.5) * T }));
      sp.path = [...back, { x: (DOOR.x + 0.5) * T, y: (DOOR.y + 1.4) * T }];
    }
    this.updateWheyTarget();
  }

  updateWheyTarget() {
    const { state, rt } = this.game;
    const mood = wheyMood(state, rt.academy, rt.blockStats);
    const flood = rt.academy.access.flood;
    let cell = null;
    if (mood.target) {
      const fp = footprintCells(mood.target.type, mood.target.x, mood.target.y, mood.target.rot);
      cell = nearestWalkable(flood, fp, 1)[0] ?? null;
    } else if (mood.mood === 'sleep') {
      let best = -1;
      for (let i = 0; i < flood.dist.length; i++) if (flood.dist[i] > best) { best = flood.dist[i]; cell = { x: i % COLS, y: Math.floor(i / COLS) }; }
    }
    if (!cell) cell = { x: DOOR.x + 1, y: DOOR.y - 1 };
    this.wheyMood = mood.mood;
    this.wheyGoal = { x: (cell.x + 0.5) * T, y: (cell.y + 0.75) * T };
  }

  consumeFx(now) {
    const { ui, state } = this.game;
    if (!ui.fx.length) return;
    for (const e of ui.fx) {
      if (e.kind === 'place' || e.kind === 'repair') this.itemAnims.set(e.itemId, { kind: e.kind, t0: now });
      if (e.kind === 'place') {
        const item = state.items.find((i) => i.id === e.itemId);
        if (item) this.burst(item, 10, ['#d9cfc0', '#efe8dc'], 'dust');
      }
      if (e.kind === 'repair') {
        const item = state.items.find((i) => i.id === e.itemId);
        if (item) this.burst(item, 12, [P.yellow, '#ffffff', P.mint], 'spark');
      }
      if (e.kind === 'money') this.floaters.push({ x: (e.x + 0.5) * T, y: e.y * T, text: e.text, t0: now, color: e.text.startsWith('+') ? P.greenDark : '#c94f55' });
      if (e.kind === 'clean') {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          this.particles.push({ x: e.x * T, y: e.y * T, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50 - 20, t0: now, life: 0.6, color: i % 2 ? '#bfe3f5' : '#ffffff', kind: 'spark' });
        }
        if (!e.quiet) this.floaters.push({ x: e.x * T, y: e.y * T - 6, text: 'Limpinho!', t0: now, color: P.blueDark });
      }
      if (e.kind === 'zone') {
        const z = zoneById(e.zoneId);
        if (!z) continue;
        for (let i = 0; i < 40; i++) {
          this.particles.push({
            x: (z.x + Math.random() * z.w) * T, y: (z.y + Math.random() * z.h) * T, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 80,
            t0: now, life: 1.4, color: [P.yellow, P.pink, P.blue, P.mint, P.orange][i % 5], kind: 'confetti',
          });
        }
      }
      if (e.kind === 'finally') this.celebrate(e, now);
      if (e.kind === 'newZone') {
        const z = zoneById(e.zoneId);
        if (z) {
          this.newZoneGlow = { zoneId: z.id, t0: now };
          this.floaters.push({ x: (z.x + z.w / 2) * T, y: (z.y + z.h / 2) * T - 40, text: 'Novo terreno à venda!', t0: now + 400, color: P.greenDark });
        }
      }
    }
    ui.fx.length = 0;
  }

  burst(item, n, colors, kind) {
    const { w, h } = footprintSize(item.type, item.rot);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: (item.x + w / 2) * T + Math.cos(a) * w * T * 0.45, y: (item.y + h / 2) * T + Math.sin(a) * h * T * 0.45,
        vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 - 10, t0: this.time * 1000, life: 0.7, color: colors[i % colors.length], kind,
      });
    }
  }

  celebrate(e, now) {
    let shown = 0;
    for (const sp of this.sprites.values()) {
      if (sp.leaving || shown >= 6) continue;
      this.bubbles = this.bubbles.filter((b) => b.key !== sp.key);
      this.bubbles.push({ key: sp.key, text: e.text, tone: 'happy', t0: now + shown * 120, dur: 2600 });
      shown += 1;
    }
    if (!shown) this.floaters.push({ x: (DOOR.x + 0.5) * T, y: DOOR.y * T, text: e.text, t0: now, color: P.greenDark });
  }

  /** Equipe de limpeza: cada pessoa do turno vai até uma sujeira (a mais antiga primeiro). */
  updateStaff(dt) {
    const { state, rt } = this.game;
    const flood = rt.academy.access.flood;
    const onShift = state.staff.filter((m) => m.shifts[state.time.block]);
    const present = new Set(onShift.map((m) => m.id));
    const rest = nearestWalkable(flood, [DOOR], onShift.length + 3).slice(2);
    const outside = { x: (DOOR.x + 0.5) * T, y: (DOOR.y + 1.4) * T };
    onShift.forEach((member, i) => {
      let sp = this.staffSprites.get(member.id);
      if (!sp || sp.leaving) {
        sp = { x: outside.x, y: outside.y, path: [], goal: null, alpha: 0, leaving: false, seed: (member.id * 7) % 13 };
        this.staffSprites.set(member.id, sp);
      }
      sp.member = member;
      const dirt = state.dirt[i] ?? null;
      const restCell = rest[i % Math.max(1, rest.length)] ?? { x: DOOR.x + 1, y: DOOR.y };
      const goalCell = dirt ? { x: Math.floor(dirt.x), y: Math.floor(dirt.y) } : restCell;
      const goal = dirt ? { x: dirt.x * T - 6, y: dirt.y * T + 6 } : { x: (restCell.x + 0.5) * T, y: (restCell.y + 0.7) * T };
      if (!sp.goal || Math.hypot(goal.x - sp.goal.x, goal.y - sp.goal.y) > 2) {
        sp.goal = goal;
        sp.path = this.treePath(flood, sp, goalCell, goal);
      }
      sp.mode = sp.path.length ? 'walk' : dirt ? 'clean' : 'idle';
    });
    for (const [id, sp] of this.staffSprites) {
      if (present.has(id) || sp.leaving) continue;
      sp.leaving = true;
      sp.path = [...this.treePath(flood, sp, DOOR, { x: (DOOR.x + 0.5) * T, y: (DOOR.y + 0.5) * T }), outside];
      sp.mode = 'walk';
    }
    for (const [id, sp] of this.staffSprites) {
      sp.alpha = Math.min(1, sp.alpha + dt * 3);
      this.stepAlongPath(sp, 2.6 * T * dt);
      if (sp.leaving && !sp.path.length) {
        sp.alpha -= dt * 4;
        if (sp.alpha <= 0) this.staffSprites.delete(id);
      }
    }
  }

  /** Caminho entre duas células pela árvore do flood fill (sobe até o ancestral comum e desce). */
  treePath(flood, from, toCell, finalPos) {
    const center = (c) => ({ x: (c.x + 0.5) * T, y: (c.y + 0.5) * T });
    const fromCell = { x: Math.floor(from.x / T), y: Math.floor(from.y / T) };
    const pa = pathFromDoor(flood, fromCell.x, fromCell.y);
    const pb = pathFromDoor(flood, toCell.x, toCell.y);
    if (!pb) return [finalPos];
    if (!pa) return [...pb.map(center), finalPos];
    let k = 0;
    while (k < pa.length && k < pb.length && pa[k].x === pb[k].x && pa[k].y === pb[k].y) k++;
    return [...pa.slice(k).reverse(), pa[k - 1], ...pb.slice(k)].map(center).concat(finalPos);
  }

  stepAlongPath(sp, distance) {
    let move = distance;
    while (move > 0 && sp.path.length) {
      const p = sp.path[0];
      const d = Math.hypot(p.x - sp.x, p.y - sp.y);
      if (d <= move) {
        sp.x = p.x;
        sp.y = p.y;
        sp.path.shift();
        move -= d;
      } else {
        sp.x += ((p.x - sp.x) / d) * move;
        sp.y += ((p.y - sp.y) / d) * move;
        move = 0;
      }
    }
  }

  updateSprites(dt, now) {
    const speed = 3.4 * T;
    this.updateStaff(dt);
    for (const [key, sp] of this.sprites) {
      sp.alpha = Math.min(1, sp.alpha + dt * 3);
      this.stepAlongPath(sp, speed * dt);
      if (sp.leaving && !sp.path.length) {
        sp.alpha -= dt * 4;
        if (sp.alpha <= 0) this.sprites.delete(key);
      }
    }

    // Balões: no máximo 3 de cada vez, só com reclamações reais.
    this.bubbles = this.bubbles.filter((b) => now - b.t0 < b.dur && this.sprites.has(b.key));
    if (now > this.nextBubbleAt && this.bubbles.length < 3) {
      this.nextBubbleAt = now + 1300 + Math.random() * 900;
      const candidates = [...this.sprites.values()].filter((sp) => !sp.leaving && !sp.path.length && sp.student.complaint && !this.bubbles.some((b) => b.key === sp.key));
      if (candidates.length) {
        const sp = candidates[Math.floor(Math.random() * candidates.length)];
        const c = sp.student.complaint;
        const tone = c.kind === 'happy' ? 'happy' : c.kind === 'missingDesired' || c.kind === 'vibe' ? 'neutral' : 'complaint';
        if (c.kind !== 'happy' || Math.random() < 0.5) this.bubbles.push({ key: sp.key, text: c.text, tone, t0: now, dur: 3200 });
      }
    }

    if (this.wheyGoal) {
      const d = Math.hypot(this.wheyGoal.x - this.whey.x, this.wheyGoal.y - this.whey.y);
      const step = 70 * dt;
      if (d > step) {
        this.whey.x += ((this.wheyGoal.x - this.whey.x) / d) * step;
        this.whey.y += ((this.wheyGoal.y - this.whey.y) / d) * step;
        this.wheyWalking = true;
      } else this.wheyWalking = false;
    }

    this.particles = this.particles.filter((p) => (now - p.t0) / 1000 < p.life);
    this.floaters = this.floaters.filter((f) => now - f.t0 < 1400);
  }

  // ------------------------------------------------------------ desenho
  render(now) {
    const { state, rt, ui } = this.game;
    if (!state || !rt) return;
    const dt = Math.min(0.1, Math.max(0, now / 1000 - this.time));
    this.time = now / 1000;
    const t = this.time;
    this.followWorldGrowth();
    this.consumeFx(now);
    this.syncScene();
    this.updateSprites(dt, now);

    const ctx = this.ctx;
    const { dpr, w, h } = this.viewport;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#cfe6c0';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * this.camera.zoom, 0, 0, dpr * this.camera.zoom, -this.camera.x * this.camera.zoom * dpr, -this.camera.y * this.camera.zoom * dpr);

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
          drawCleaner(ctx, sp.member.look, sp.mode, t, sp.seed);
          ctx.restore();
        },
      });
    }
    drawables.push({ y: this.whey.y, draw: () => this.drawWheyAt(ctx, t) });
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
    // arbustos decorativos
    // Só no quintal da frente (x 0–3, y 8–11), que nunca vira academia.
    [[0.3, 9.4], [2.6, 10.6], [0.5, 11.3], [3.1, 11.4]].forEach(([x, y], i) => {
      const s = 1 + Math.sin(t * 1.2 + i) * 0.02;
      ellipse(ctx, x * T + 3, y * T + 8, 16, 6, P.shadow);
      circle(ctx, x * T, y * T, 15 * s, '#9ccf8a', INK, 2);
      circle(ctx, x * T + 9, y * T - 6, 10 * s, '#b0dc9e', INK, 2);
    });
    // placa da academia
    ctx.save();
    ctx.translate((DOOR.x + 2.05) * T, (DOOR.y + 1.55) * T);
    box(ctx, -38, -14, 76, 24, 6, P.yellow);
    ctx.fillStyle = INK;
    ctx.font = `700 10px ${FONT_TITLE}`;
    ctx.textAlign = 'center';
    ctx.fillText('ACADEMIA', 0, -3);
    ctx.fillText('DO TIO ZÉ', 0, 8);
    ctx.restore();
  }

  drawFloor(ctx, state) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const z = zoneAtCell(x, y);
        if (!z || !state.unlockedZones.includes(z.id)) continue;
        const [a, b] = floorOf(z);
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
    for (const [lw, color] of [[11, INK], [7, '#c8b6dc']]) {
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
    drawEquipmentShape(ctx, item.type, w0 * T, h0 * T, t, { tier: item.tier, active, on: true });
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
    const tier = movingItem?.tier ?? ui.placing?.tier ?? 'usado';
    drawEquipmentShape(ctx, pv.type, def.size[0] * T, def.size[1] * T, t, { tier, active: false, on: true });
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
