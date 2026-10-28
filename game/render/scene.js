// Cena decorativa. Os alunos na tela são renderizações dos números do bloco:
// se o cálculo diz 4 pessoas na fila do supino, aparecem 4 bonecos perto dele.
// Não há pathfinding individual: os caminhos vêm dos pais do flood fill.
import { CONFIG, PROFILES, getEquipmentDef, demandCategoryOf } from '../config.js';
import { DOOR, cellIndex, footprintSize } from '../grid/grid.js';
import { pathFromDoor, nearestWalkable } from '../pathfinding/floodFill.js';

const T = CONFIG.grid.tileSize;
const MAX_QUEUE_PER_ITEM = 10;
const MAX_ORPHAN_QUEUE = 8;

function cellCenter(c) {
  return { x: (c.x + 0.5) * T, y: (c.y + 0.5) * T };
}

function studentsFor(state, category) {
  return state.students.filter((s) => (PROFILES[s.profile].categoryShare[category] ?? 0) > 0);
}

/** Lista de alvos: { key, studentId, x, y, cell, state, itemId }. */
export function buildTargets(state, rt) {
  const stats = rt.blockStats;
  const { flood, usageCells } = rt.academy.access;
  const targets = [];
  const usedCells = new Set();
  const pools = {};
  const takeStudent = (cat, n) => {
    pools[cat] ??= { list: studentsFor(state, cat), i: 0 };
    const p = pools[cat];
    if (!p.list.length) return null;
    const s = p.list[(p.i + n * 7) % p.list.length];
    p.i += 1;
    return s;
  };

  for (const item of state.items) {
    const info = stats.perItem[item.id];
    if (!info) continue;
    const def = getEquipmentDef(item.type);
    const cat = demandCategoryOf(item.type);
    const front = usageCells.get(item.id) ?? [];
    if (!front.length) continue;
    const slots = def.visualSlots ?? 1;
    const users = info.uses > 0.05 ? Math.min(slots, Math.max(1, Math.round(info.occupancy * slots))) : 0;
    const { w, h } = footprintSize(item.type, item.rot);
    for (let i = 0; i < users; i++) {
      const s = takeStudent(cat, i);
      if (!s) break;
      let pos;
      let cell;
      if (def.anim === 'run') {
        pos = { x: (item.x + w / 2) * T, y: (item.y + h / 2) * T + T * 0.35 };
        cell = front[0];
      } else if (def.anim === 'stretch') {
        pos = { x: (item.x + (i + 0.5) * (w / slots)) * T, y: (item.y + h * 0.6) * T };
        cell = front[0];
      } else {
        cell = front[i % front.length];
        const c = cellCenter(cell);
        pos = { x: c.x + (i - (users - 1) / 2) * 12, y: c.y + 8 };
      }
      usedCells.add(cellIndex(cell.x, cell.y));
      targets.push({ key: `u${item.id}:${i}`, studentId: s.id, x: pos.x, y: pos.y, cell, state: `use-${def.anim}`, itemId: item.id });
    }
    const waiting = Math.min(MAX_QUEUE_PER_ITEM, Math.round(info.queue));
    if (waiting > 0) {
      const cells = nearestWalkable(flood, front, Math.ceil(waiting / 2) + 1, usedCells);
      for (let i = 0; i < waiting && cells.length; i++) {
        const s = takeStudent(cat, i + 3);
        if (!s) break;
        const cell = cells[Math.floor(i / 2) % cells.length];
        const c = cellCenter(cell);
        targets.push({
          key: `q${item.id}:${i}`, studentId: s.id, x: c.x + (i % 2 ? 10 : -10), y: c.y + (i % 2 ? 6 : -2), cell, state: 'wait', itemId: item.id,
        });
      }
    }
  }

  // Demanda sem nenhum aparelho da categoria: gente perdida perto da porta.
  for (const [cat, people] of Object.entries(stats.queuePeople)) {
    if (stats.capacity[cat] > 0 || people < 0.5) continue;
    const n = Math.min(MAX_ORPHAN_QUEUE, Math.round(people));
    const cells = nearestWalkable(flood, [DOOR], n + 2, usedCells).slice(1);
    for (let i = 0; i < n && cells.length; i++) {
      const s = takeStudent(cat, i + 11);
      if (!s) break;
      const cell = cells[i % cells.length];
      const c = cellCenter(cell);
      targets.push({ key: `o${cat}:${i}`, studentId: s.id, x: c.x + ((i * 7) % 11) - 5, y: c.y, cell, state: 'wait', itemId: null, lost: cat });
    }
  }
  return targets;
}

export function walkPath(flood, cell, finalPos) {
  const cells = pathFromDoor(flood, cell.x, cell.y) ?? [];
  const pts = [{ x: (DOOR.x + 0.5) * T, y: (DOOR.y + 1.4) * T }];
  for (const c of cells) pts.push(cellCenter(c));
  pts.push(finalPos);
  return pts;
}
