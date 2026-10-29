// Grade lógica da academia: zonas, ocupação, rotação e validação de posicionamento.
// Tudo em células, independente da resolução da tela.
import { CONFIG, getEquipmentDef } from '../config.js';

// A grade cresce junto com os terrenos (áreas infinitas). COLS, ROWS e DOOR são
// "live bindings": quem importa sempre enxerga o tamanho e a porta atuais
// (a porta muda de lugar quando a academia se muda de era).
let COLS = CONFIG.grid.cols;
let ROWS = CONFIG.grid.rows;
let DOOR = CONFIG.grid.door;
export { COLS, ROWS, DOOR };

export const cellIndex = (x, y) => y * COLS + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

// ---------------------------------------------------------------- terrenos
/**
 * Planta de cada era: terrenos desenhados, porta, tamanho mínimo e a faixa
 * reservada da porta até a rua. A Era 1 usa `grid`; as outras, `eras[n]`.
 */
export function eraLayout(era = 1) {
  const e = CONFIG.eras?.[String(era)];
  // Era sem mudança de endereço (a Rede) reaproveita a planta da era anterior.
  if (e?.layoutFrom) return { ...eraLayout(e.layoutFrom), era };
  if (e?.zones) return { era, zones: e.zones, door: e.door, cols: e.cols, rows: e.rows, reserved: e.reserved };
  const g = CONFIG.grid;
  return { era: 1, zones: g.zones, door: g.door, cols: g.cols, rows: g.rows, reserved: g.procedural.reserved };
}

/**
 * Deslocamento da planta. Terrenos podem nascer à esquerda da academia: em vez
 * de usar coordenadas negativas, tudo anda para a direita e a planta da era
 * (terrenos desenhados, porta e faixa da entrada) é lida com esse deslocamento.
 */
export function layoutShift(state) {
  return state?.shift ?? { x: 0, y: 0 };
}

const shiftedCache = new Map();
export function shiftedLayout(era = 1, shift = { x: 0, y: 0 }) {
  const key = `${era}|${shift.x},${shift.y}`;
  let out = shiftedCache.get(key);
  if (!out) {
    const L = eraLayout(era);
    const { x: dx, y: dy } = shift;
    out = dx || dy
      ? {
        ...L,
        zones: L.zones.map((z) => ({ ...z, x: z.x + dx, y: z.y + dy })),
        door: { x: L.door.x + dx, y: L.door.y + dy },
        reserved: { ...L.reserved, x: L.reserved.x + dx, y: L.reserved.y + dy },
        cols: L.cols + dx,
        rows: L.rows + dy,
      }
      : L;
    shiftedCache.set(key, out);
  }
  return out;
}

const allEraZones = Object.keys(CONFIG.eras ?? {}).flatMap((k) => eraLayout(Number(k)).zones);
const zoneCatalog = new Map([...CONFIG.grid.zones, ...allEraZones].map((z) => [z.id, z]));
let layout = eraLayout(1);
let layoutZones = layout.zones;
let layoutKey = '';
let layoutOwner = null; // partida (ou cena de filial) cuja grade está valendo agora
let cellZone = new Int32Array(0);

/** Planta em uso (a da era da partida carregada). */
export function currentLayout() {
  return layout;
}

/**
 * Planta de uma partida. A cena de uma filial (Era 4) traz a própria planta em
 * `customLayout`; a Matriz usa a planta da era, com o deslocamento.
 */
export function layoutOf(state) {
  return state?.customLayout ?? shiftedLayout(state?.era ?? 1, layoutShift(state));
}

/** Terrenos desenhados da era da partida. */
export function baseZones(state) {
  return layoutOf(state).zones;
}

/** Terrenos da partida: os desenhados da era + os gerados (infinitos). */
export function allZones(state) {
  const base = baseZones(state);
  return state?.extraZones?.length ? [...base, ...state.extraZones] : base;
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
 * Ajusta a grade aos terrenos da partida (tamanho, porta e índice célula →
 * terreno). Barato quando nada mudou; chamado sempre que os derivados são recalculados.
 */
export function syncLayout(state) {
  const zones = allZones(state);
  const era = state?.era ?? 1;
  const shift = layoutShift(state);
  const own = state?.customLayout ? `custom:${state.customLayout.id}` : era;
  const key = `${own}@${shift.x},${shift.y}#${zones.map((z) => `${z.id}@${z.x},${z.y},${z.w},${z.h}`).join('|')}`;
  layoutOwner = state ?? null;
  if (key === layoutKey) return false;
  layoutKey = key;
  layout = layoutOf(state);
  DOOR = layout.door;
  for (const z of zones) zoneCatalog.set(z.id, z);
  layoutZones = zones;
  COLS = Math.max(layout.cols, ...zones.map((z) => z.x + z.w));
  ROWS = Math.max(layout.rows, ...zones.map((z) => z.y + z.h));
  rebuildCellZone();
  return true;
}

/**
 * Roda `fn` com a grade de outra cena (a de uma filial) e depois devolve a
 * grade da partida (`home`). COLS, ROWS e DOOR são globais, então quem desenha
 * uma filial precisa passar por aqui.
 */
export function withLayout(view, home, fn) {
  if (!view || view === home) return fn();
  // Volta para a grade que estava valendo (pode ser outra cena, em chamadas aninhadas).
  const prev = layoutOwner ?? home;
  syncLayout(view);
  try {
    return fn();
  } finally {
    if (prev) syncLayout(prev);
  }
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
