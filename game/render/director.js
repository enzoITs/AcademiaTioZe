// Estado visual compartilhado pelos renderizadores (3D e o 2D de reserva).
// Lê o mesmo estado que o React (store) e nunca o altera: só decide onde
// cada boneco, o gato, as partículas e os textos flutuantes estão.
// Coordenadas no plano do chão, em pixels de grade (CONFIG.grid.tileSize por célula).
import { CONFIG } from '../config.js';
import { COLS, DOOR, footprintSize, footprintCells, zoneById } from '../grid/grid.js';
import { nearestWalkable, pathFromDoor } from '../pathfinding/floodFill.js';
import { wheyMood } from '../systems/characters.js';
import { repairQueue } from '../systems/staff.js';
import { buildTargets, walkPath } from './scene.js';
import { PALETTE as P } from './draw/primitives.js';

const T = CONFIG.grid.tileSize;

export class SceneDirector {
  constructor(game) {
    this.game = game;
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
  }

  /** Avança o estado visual; devolve dt em segundos. */
  step(now) {
    const dt = Math.min(0.1, Math.max(0, now / 1000 - this.time));
    this.time = now / 1000;
    this.consumeFx(now);
    this.syncScene();
    this.updateSprites(dt, now);
    return dt;
  }

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
      if (e.kind === 'shift') this.shiftScene(e.dx * T, e.dy * T);
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
      if (e.kind === 'era') {
        // Endereço novo: todo mundo entra de novo pela porta nova e a câmera reenquadra.
        this.sprites.clear();
        this.staffSprites.clear();
        this.bubbles = [];
        this.whey.x = (DOOR.x + 1.5) * T;
        this.whey.y = (DOOR.y + 0.6) * T;
        this.refitCamera = true;
        for (const id of state.unlockedZones) {
          const z = zoneById(id);
          if (!z) continue;
          for (let i = 0; i < 70; i++) {
            this.particles.push({
              x: (z.x + Math.random() * z.w) * T, y: (z.y + Math.random() * z.h) * T, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 90,
              t0: now, life: 1.2 + Math.random() * 0.8, color: [P.yellow, P.pink, P.blue, P.mint, P.orange][i % 5], kind: 'confetti',
            });
          }
        }
      }
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

  /**
   * A planta andou (terreno novo à esquerda): tudo que está na tela anda junto,
   * para ninguém "teleportar". O renderizador lê `cameraShift` e move a câmera.
   */
  shiftScene(px, py) {
    const move = (p) => { if (p) { p.x += px; p.y += py; } };
    for (const sp of [...this.sprites.values(), ...this.staffSprites.values()]) {
      move(sp);
      move(sp.goal);
      sp.path?.forEach(move);
    }
    move(this.whey);
    move(this.wheyGoal);
    this.particles.forEach(move);
    this.floaters.forEach(move);
    const prev = this.cameraShift ?? { x: 0, y: 0 };
    this.cameraShift = { x: prev.x + px / T, y: prev.y + py / T };
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

  /**
   * Equipe: faxineiro(a) vai até uma sujeira (a mais antiga primeiro);
   * técnico(a) vai até a frente do aparelho que está na fila de conserto.
   */
  updateStaff(dt) {
    const { state, rt } = this.game;
    const flood = rt.academy.access.flood;
    const { usageCells } = rt.academy.access;
    const onShift = state.staff.filter((m) => m.shifts[state.time.block]);
    const present = new Set(onShift.map((m) => m.id));
    const rest = nearestWalkable(flood, [DOOR], onShift.length + 3).slice(2);
    const outside = { x: (DOOR.x + 0.5) * T, y: (DOOR.y + 1.4) * T };
    const jobs = onShift.some((m) => m.role === 'tecnico') ? repairQueue(state) : [];
    let cleaners = 0;
    let techs = 0;
    onShift.forEach((member, i) => {
      let sp = this.staffSprites.get(member.id);
      if (!sp || sp.leaving) {
        sp = { x: outside.x, y: outside.y, path: [], goal: null, alpha: 0, leaving: false, seed: (member.id * 7) % 13 };
        this.staffSprites.set(member.id, sp);
      }
      sp.member = member;
      sp.role = member.role;
      const restCell = rest[i % Math.max(1, rest.length)] ?? { x: DOOR.x + 1, y: DOOR.y };
      let goalCell = restCell;
      let goal = { x: (restCell.x + 0.5) * T, y: (restCell.y + 0.7) * T };
      let working = false;
      sp.itemId = null;
      if (member.role === 'tecnico') {
        const item = jobs[techs++] ?? null;
        const cell = item && ((usageCells.get(item.id) ?? [])[0] ?? nearestWalkable(flood, [{ x: item.x, y: item.y }], 1)[0]);
        if (cell) {
          goalCell = cell;
          goal = { x: (cell.x + 0.5) * T, y: (cell.y + 0.5) * T };
          working = true;
          sp.itemId = item.id;
        }
      } else {
        const dirt = state.dirt[cleaners++] ?? null;
        if (dirt) {
          goalCell = { x: Math.floor(dirt.x), y: Math.floor(dirt.y) };
          goal = { x: dirt.x * T - 6, y: dirt.y * T + 6 };
          working = true;
        }
      }
      if (!sp.goal || Math.hypot(goal.x - sp.goal.x, goal.y - sp.goal.y) > 2) {
        sp.goal = goal;
        sp.path = this.treePath(flood, sp, goalCell, goal);
      }
      sp.mode = sp.path.length ? 'walk' : working ? (member.role === 'tecnico' ? 'fix' : 'clean') : 'idle';
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
}
