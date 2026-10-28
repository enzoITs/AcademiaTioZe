// Flood fill (BFS) a partir da porta. Define quais aparelhos são alcançáveis
// e fornece caminhos baratos para os sprites decorativos (sem pathfinding por aluno).
import { getEquipmentDef } from '../config.js';
import {
  COLS, ROWS, DOOR, cellIndex, inBounds, buildUnlockedMask, buildOccupancy, frontCells,
} from '../grid/grid.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function floodFromDoor(unlockedZones, items) {
  const mask = buildUnlockedMask(unlockedZones);
  const occ = buildOccupancy(items);
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  const parent = new Int32Array(COLS * ROWS).fill(-1);
  const walkable = (x, y) => inBounds(x, y) && mask[cellIndex(x, y)] === 1 && occ[cellIndex(x, y)] === -1;

  const queue = [];
  if (walkable(DOOR.x, DOOR.y)) {
    dist[cellIndex(DOOR.x, DOOR.y)] = 0;
    queue.push(DOOR.x, DOOR.y);
  }
  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const y = queue[head + 1];
    const d = dist[cellIndex(x, y)];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(nx, ny) || dist[cellIndex(nx, ny)] !== -1) continue;
      dist[cellIndex(nx, ny)] = d + 1;
      parent[cellIndex(nx, ny)] = cellIndex(x, y);
      queue.push(nx, ny);
    }
  }
  return { dist, parent, mask, occ, walkable };
}

/**
 * Calcula acessibilidade de todos os aparelhos.
 * Retorna { flood, reachable: Set<id>, usageCells: Map<id, cell[]> }.
 */
export function computeAccess(unlockedZones, items) {
  const flood = floodFromDoor(unlockedZones, items);
  const reachable = new Set();
  const usageCells = new Map();
  for (const item of items) {
    const def = getEquipmentDef(item.type);
    if (!def.needsAccess) {
      reachable.add(item.id);
      usageCells.set(item.id, []);
      continue;
    }
    const cells = frontCells(item.type, item.x, item.y, item.rot).filter(
      (c) => inBounds(c.x, c.y) && flood.dist[cellIndex(c.x, c.y)] >= 0,
    );
    usageCells.set(item.id, cells);
    if (cells.length > 0) reachable.add(item.id);
  }
  return { flood, reachable, usageCells };
}

/** Caminho da porta até a célula (lista de {x,y}), usando os pais do BFS. */
export function pathFromDoor(flood, x, y) {
  if (!inBounds(x, y) || flood.dist[cellIndex(x, y)] < 0) return null;
  const path = [];
  let idx = cellIndex(x, y);
  while (idx !== -1) {
    path.push({ x: idx % COLS, y: Math.floor(idx / COLS) });
    idx = flood.parent[idx];
  }
  return path.reverse();
}

/** Células alcançáveis mais próximas de uma origem (para filas e sujeira). */
export function nearestWalkable(flood, origins, count, exclude = new Set()) {
  const seen = new Set();
  const result = [];
  const queue = [];
  for (const o of origins) {
    const k = cellIndex(o.x, o.y);
    if (!seen.has(k)) { seen.add(k); queue.push(o); }
  }
  for (let i = 0; i < queue.length && result.length < count; i++) {
    const c = queue[i];
    const k = cellIndex(c.x, c.y);
    if (flood.dist[k] >= 0 && !exclude.has(k)) result.push(c);
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      const nk = cellIndex(nx, ny);
      if (!inBounds(nx, ny) || seen.has(nk) || !flood.walkable(nx, ny)) continue;
      seen.add(nk);
      queue.push({ x: nx, y: ny });
    }
  }
  return result;
}
