// Ampliações infinitas para os dois lados. Além dos terrenos desenhados no
// JSON, cada compra gera um terreno novo encostado no que foi comprado (do
// mesmo lado), e sempre há pelo menos um terreno à venda à esquerda e outro à
// direita da academia. Determinístico: usa o RNG da partida.
import { CONFIG } from '../config.js';
import { allZones, baseZones, rectsOverlap, syncLayout, currentLayout, DOOR } from '../grid/grid.js';
import { nextRandom } from '../utils/random.js';

const P = CONFIG.grid.procedural;
const TARGET_ASPECT = 1.5;
export const SIDES = ['left', 'right'];

/** A faixa de entrada (da porta até a rua) nunca vira terreno. */
function hitsReserved(r) {
  const R = currentLayout().reserved;
  return r.x < R.x + R.w && r.x + r.w > R.x && r.y + r.h > R.y;
}

export function availableZones(state) {
  const owned = new Set(state.unlockedZones);
  return allZones(state).filter((z) => !owned.has(z.id) && (!z.requires || owned.has(z.requires)));
}

/** Centro do prédio principal da era: divide a academia em lado esquerdo e direito. */
function axisX(state) {
  const main = baseZones(state).find((z) => z.startsUnlocked) ?? baseZones(state)[0];
  return main.x + main.w / 2;
}

/** Lado de um terreno em relação ao prédio principal. */
export function zoneSide(state, zone) {
  return zone.x + zone.w / 2 < axisX(state) ? 'left' : 'right';
}

/** Posições de um retângulo w×h encostado em cada lado de `base`, alinhado às pontas. */
function placementsAround(base, w, h) {
  const out = [];
  for (const y of new Set([base.y, base.y + base.h - h])) {
    out.push({ x: base.x + base.w, y, w, h });
    out.push({ x: base.x - w, y, w, h });
  }
  for (const x of new Set([base.x, base.x + base.w - w])) {
    out.push({ x, y: base.y + base.h, w, h });
    out.push({ x, y: base.y - h, w, h });
  }
  return out;
}

export function zoneCost(n, tiles) {
  const raw = P.pricePerTile * tiles * P.growth ** (n - 1);
  return Math.round(raw / P.roundTo) * P.roundTo;
}

function zoneName(n) {
  const names = P.names;
  const entry = names[(n - 1) % names.length];
  const lap = Math.floor((n - 1) / names.length);
  return { label: lap ? `${entry.label} ${lap + 1}` : entry.label, description: entry.description };
}

/**
 * Empurra a academia inteira `dx` colunas para a direita (e `dy` linhas para
 * baixo). Usado quando nasce um terreno à esquerda: as coordenadas continuam
 * sempre positivas. Mexe em tudo que guarda posição de grade.
 */
export function shiftWorld(state, dx, dy = 0) {
  if (!dx && !dy) return;
  const s = state.shift ?? { x: 0, y: 0 };
  state.shift = { x: s.x + dx, y: s.y + dy };
  for (const z of state.extraZones) { z.x += dx; z.y += dy; }
  for (const i of state.items) { i.x += dx; i.y += dy; }
  for (const d of state.dirt) { d.x += dx; d.y += dy; }
  for (const u of state.undo ?? []) {
    if (u.from) { u.from.x += dx; u.from.y += dy; }
    if (u.item) { u.item.x += dx; u.item.y += dy; }
  }
  syncLayout(state);
}

/**
 * Cria um terreno novo encostado numa área já comprada. Prefere `nearId`
 * (o que acabou de ser comprado) e a forma que deixa a academia mais compacta
 * e perto da porta. `side` restringe a 'left' ou 'right' do prédio principal.
 * Retorna o terreno ou null se não houver encaixe.
 */
export function generateZone(state, nearId = null, side = null) {
  const zones = allZones(state);
  const owned = zones.filter((z) => state.unlockedZones.includes(z.id));
  const door = DOOR;
  const axis = axisX(state);
  const box = {
    minX: Math.min(...zones.map((z) => z.x)),
    minY: Math.min(...zones.map((z) => z.y)),
    maxX: Math.max(...zones.map((z) => z.x + z.w)),
    maxY: Math.max(...zones.map((z) => z.y + z.h)),
  };
  // Até onde a academia pode avançar para a esquerda (coordenadas antes do deslocamento).
  const minX = -(P.maxCoordinate - box.maxX);
  let best = null;
  for (const base of owned) {
    for (const [w, h] of P.sizes) {
      for (const r of placementsAround(base, w, h)) {
        if (r.x < minX || r.y < 0 || r.x + r.w > P.maxCoordinate || r.y + r.h > P.maxCoordinate) continue;
        if (side && (r.x + w / 2 < axis ? 'left' : 'right') !== side) continue;
        if (hitsReserved(r) || zones.some((z) => rectsOverlap(z, r))) continue;
        const bw = Math.max(box.maxX, r.x + w) - Math.min(box.minX, r.x);
        const bh = Math.max(box.maxY, r.y + h) - Math.min(box.minY, r.y);
        // O bairro mira uma proporção de tela (~1,5:1): nem faixa comprida para
        // o lado, nem para baixo (o que afastaria a rua da porta).
        const aspectPenalty = 1 + 0.8 * Math.abs(Math.log(bw / bh / TARGET_ASPECT));
        const dist = Math.hypot(r.x + w / 2 - door.x, r.y + h / 2 - door.y);
        const score = bw * bh * aspectPenalty + dist * 2 - (base.id === nearId ? 40 : 0) + nextRandom(state.rng) * 25;
        if (!best || score < best.score) best = { r, base, score };
      }
    }
  }
  if (!best) return null;
  const n = state.nextZoneNum++;
  const { label, description } = zoneName(n);
  const zone = {
    id: `area-${n}`,
    label,
    description,
    ...best.r,
    cost: zoneCost(n, best.r.w * best.r.h),
    requires: best.base.id,
    procedural: true,
  };
  // Terreno à esquerda da coluna 0: a academia inteira anda para a direita.
  if (zone.x < 0) {
    const dx = -zone.x;
    shiftWorld(state, dx, 0);
    zone.x += dx;
  }
  state.extraZones.push(zone);
  syncLayout(state);
  return zone;
}

/**
 * Depois de uma compra: nasce um terreno ao lado do que foi comprado (do mesmo
 * lado), e sempre sobra um terreno à venda de cada lado da academia.
 */
export function ensureFrontier(state, purchasedId = null) {
  const created = [];
  if (purchasedId) {
    const bought = allZones(state).find((z) => z.id === purchasedId);
    const z = generateZone(state, purchasedId, bought ? zoneSide(state, bought) : null)
      ?? generateZone(state, purchasedId);
    if (z) created.push(z);
  }
  for (const side of SIDES) {
    if (availableZones(state).some((z) => zoneSide(state, z) === side)) continue;
    const z = generateZone(state, null, side);
    if (z) created.push(z);
  }
  for (let guard = 0; guard < 4 && availableZones(state).length < P.minAvailable; guard++) {
    const z = generateZone(state);
    if (!z) break;
    created.push(z);
  }
  return created;
}
