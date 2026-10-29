// Reforma da academia: cor do chão e das paredes, paga por tamanho.
// Vale só para a Matriz (as filiais têm a cara do próprio estilo).
import { CONFIG } from '../config.js';
import { COLS, ROWS, inBounds, zoneAtCell } from '../grid/grid.js';

export const DECOR_KINDS = ['floor', 'wall'];
const OPTIONS = { floor: CONFIG.decor.floors, wall: CONFIG.decor.walls };

export const decorOptions = (kind) => OPTIONS[kind] ?? [];
export const decorOption = (kind, id) => decorOptions(kind).find((o) => o.id === id) ?? null;

export function emptyDecor() {
  return { floor: 'original', wall: 'original' };
}

/** Decor de um save: ids desconhecidos voltam ao original. */
export function normalizeDecor(raw) {
  const out = emptyDecor();
  for (const kind of DECOR_KINDS) if (raw && decorOption(kind, raw[kind])) out[kind] = raw[kind];
  return out;
}

const isOwnCell = (state, x, y) => {
  if (!inBounds(x, y)) return false;
  const z = zoneAtCell(x, y);
  return !!z && state.unlockedZones.includes(z.id);
};

/** Tiles de chão e metros de parede da academia (a grade precisa estar sincronizada). */
export function decorArea(state) {
  let tiles = 0;
  let walls = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isOwnCell(state, x, y)) continue;
      tiles += 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isOwnCell(state, x + dx, y + dy)) walls += 1;
    }
  }
  return { tiles, walls };
}

/** Preço para pintar o chão ou as paredes inteiras com a opção `id`. */
export function decorPrice(state, kind, id, area = decorArea(state)) {
  const opt = decorOption(kind, id);
  if (!opt) return null;
  return Math.round(opt.cost * (kind === 'floor' ? area.tiles : area.walls));
}

/** Cores do chão escolhidas (null = cor original de cada área). */
export function decorFloorColors(state) {
  if (state?.isBranchView) return null;
  const id = state?.decor?.floor;
  return id ? decorOption('floor', id)?.colors ?? null : null;
}

/** Cor das paredes escolhida (null = cor da era). */
export function decorWallColor(state) {
  if (state?.isBranchView) return null;
  const id = state?.decor?.wall;
  return id ? decorOption('wall', id)?.color ?? null : null;
}
