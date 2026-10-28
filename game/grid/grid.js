// Grade lógica da academia: zonas, ocupação, rotação e validação de posicionamento.
// Tudo em células, independente da resolução da tela.
import { CONFIG, getEquipmentDef } from '../config.js';

// A grade cresce junto com os terrenos (áreas infinitas). COLS e ROWS são
// "live bindings": quem importa sempre enxerga o tamanho atual.
let COLS = CONFIG.grid.cols;
let ROWS = CONFIG.grid.rows;
export { COLS, ROWS };

export const DOOR = CONFIG.grid.door;

export const cellIndex = (x, y) => y * COLS + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

// ---------------------------------------------------------------- terrenos
const zoneCatalog = new Map(CONFIG.grid.zones.map((z) => [z.id, z]));
let layoutZones = CONFIG.grid.zones;
let layoutKey = '';
let cellZone = new Int32Array(0);

/** Terrenos da partida: os desenhados no JSON + os gerados (infinitos). */
export function allZones(state) {
  return state?.extraZones?.length ? [...CONFIG.grid.zones, ...state.extraZones] : CONFIG.grid.zones;
}

export function zoneById(id) {
  return zoneCatalog.get(id) ?? null;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function rebuildCellZone() {
  cellZone = new Int32Array(COLS * ROWS).fill(-1);
  layoutZones.forEach((z, i) => {
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) cellZone[cellIndex(x, y)] = i;
  });
}
rebuildCellZone();

/**
 * Ajusta a grade aos terrenos da partida (tamanho e índice célula → terreno).
 * Barato quando nada mudou; chamado sempre que os derivados são recalculados.
 */
export function syncLayout(state) {
  const zones = allZones(state);
  const key = zones.map((z) => `${z.id}@${z.x},${z.y},${z.w},${z.h}`).join('|');
  if (key === layoutKey) return false;
  layoutKey = key;
  for (const z of zones) zoneCatalog.set(z.id, z);
  layoutZones = zones;
  COLS = Math.max(CONFIG.grid.cols, ...zones.map((z) => z.x + z.w));
  ROWS = Math.max(CONFIG.grid.rows, ...zones.map((z) => z.y + z.h));
  rebuildCellZone();
  return true;
}

export function zoneAtCell(x, y) {
  if (!inBounds(x, y)) return null;
  const i = cellZone[cellIndex(x, y)];
  return i >= 0 ? layoutZones[i] : null;
}

/** Rotação 0: frente para baixo; 1: esquerda; 2: cima; 3: direita. */
export function footprintSize(type, rot) {
  const [w, h] = getEquipmentDef(type).size;
  return rot % 2 === 0 ? { w, h } : { w: h, h: w };
}

export function footprintCells(type, x, y, rot) {
  const { w, h } = footprintSize(type, rot);
  const cells = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push({ x: x + dx, y: y + dy });
  return cells;
}

/** Células da área de uso (onde o aluno fica de pé), no lado da frente. */
export function frontCells(type, x, y, rot) {
  const { w, h } = footprintSize(type, rot);
  const cells = [];
  if (rot === 0) for (let dx = 0; dx < w; dx++) cells.push({ x: x + dx, y: y + h });
  if (rot === 2) for (let dx = 0; dx < w; dx++) cells.push({ x: x + dx, y: y - 1 });
  if (rot === 1) for (let dy = 0; dy < h; dy++) cells.push({ x: x - 1, y: y + dy });
  if (rot === 3) for (let dy = 0; dy < h; dy++) cells.push({ x: x + w, y: y + dy });
  return cells;
}

export function buildUnlockedMask(unlockedZones) {
  const mask = new Uint8Array(COLS * ROWS);
  for (const id of unlockedZones) {
    const zone = zoneCatalog.get(id);
    if (!zone) continue;
    for (let y = zone.y; y < zone.y + zone.h; y++)
      for (let x = zone.x; x < zone.x + zone.w; x++) if (inBounds(x, y)) mask[cellIndex(x, y)] = 1;
  }
  return mask;
}

export function isUnlocked(mask, x, y) {
  return inBounds(x, y) && mask[cellIndex(x, y)] === 1;
}

/** Mapa célula -> id do equipamento. */
export function buildOccupancy(items, ignoreId = null) {
  const occ = new Int32Array(COLS * ROWS).fill(-1);
  for (const item of items) {
    if (item.id === ignoreId) continue;
    for (const c of footprintCells(item.type, item.x, item.y, item.rot)) {
      if (inBounds(c.x, c.y)) occ[cellIndex(c.x, c.y)] = item.id;
    }
  }
  return occ;
}

function touchesWall(mask, cells) {
  return cells.some(({ x, y }) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isUnlocked(mask, x + dx, y + dy)),
  );
}

/**
 * Valida um posicionamento. Colisão, limites, porta e parede bloqueiam;
 * acesso (corredor) é verificado depois pelo flood fill e só gera aviso.
 */
export function validatePlacement(state, { type, x, y, rot }, ignoreId = null) {
  const def = getEquipmentDef(type);
  const mask = buildUnlockedMask(state.unlockedZones);
  const occ = buildOccupancy(state.items, ignoreId);
  const cells = footprintCells(type, x, y, rot);
  const front = def.needsAccess ? frontCells(type, x, y, rot) : [];

  let reason = null;
  for (const c of cells) {
    if (!isUnlocked(mask, c.x, c.y)) { reason = 'Fora da área construída'; break; }
    if (c.x === DOOR.x && c.y === DOOR.y) { reason = 'Não pode bloquear a porta'; break; }
    if (occ[cellIndex(c.x, c.y)] !== -1) { reason = 'Espaço ocupado'; break; }
  }
  if (!reason && def.wallMounted && !touchesWall(mask, cells)) reason = 'Precisa encostar na parede';
  if (!reason && def.needsAccess && !front.some((c) => isUnlocked(mask, c.x, c.y))) {
    reason = 'A frente (área de uso) fica fora da academia';
  }
  return { ok: !reason, reason, cells, front };
}
