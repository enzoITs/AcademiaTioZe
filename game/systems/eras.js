// Mudança de era. A academia sai da garagem e vai para um ponto alugado
// (Era 2), seguindo os cinco passos do documento: planta antes de pagar,
// mudança inteligente dos aparelhos, cerimônia, um dia fechado e bônus de
// novidade para todos os alunos.
import { CONFIG, MAX_ERA, eraDef, getEquipmentDef, getTierDef } from '../config.js';
import {
  COLS, ROWS, DOOR, syncLayout, validatePlacement, footprintSize, footprintCells, frontCells, eraLayout,
  buildUnlockedMask, buildOccupancy, isUnlocked, cellIndex, inBounds,
} from '../grid/grid.js';
import { computeAccess } from '../pathfinding/floodFill.js';
import { transact } from '../economy/economy.js';
import { grantNovelty } from '../simulation/students.js';
import { addMessage } from './characters.js';
import { ERA_MESSAGES } from '../content/lines.js';
import { initNetwork } from './network.js';
import { ensureBranchFloors } from './branchEdit.js';

// Como medir cada meta de passagem (as metas de cada era ficam no JSON).
const GOAL_METRICS = {
  students: { label: 'Alunos ativos', value: (s) => s.students.length },
  reputation: { label: 'Reputação', value: (s) => Number(s.reputation.toFixed(1)) },
  equipmentTypes: { label: 'Tipos de aparelho', value: (s) => new Set(s.items.map((i) => i.type)).size },
  expansions: { label: 'Ampliações', value: (s) => s.unlockedZones.length - 1 },
  staff: { label: 'Pessoas na equipe', value: (s) => s.staff.length },
  idoso: { label: 'Turma da manhã (idosos)', value: (s) => s.students.filter((st) => st.profile === 'idoso').length },
  influencer: { label: 'Influencers treinando', value: (s) => s.students.filter((st) => st.profile === 'influencer').length },
  branches: { label: 'Filiais abertas', value: (s) => s.network?.branches.length ?? 0 },
};

/** Próxima era (ou null quando não há outra implementada). */
export function nextEra(state) {
  return state.era < MAX_ERA ? state.era + 1 : null;
}

/** Metas para chegar na próxima era, com o valor atual de cada uma. */
export function eraGoals(state) {
  const era = nextEra(state);
  if (!era) return [];
  return Object.entries(eraDef(era).goals)
    .filter(([key]) => GOAL_METRICS[key])
    .map(([key, goal]) => {
      const value = GOAL_METRICS[key].value(state);
      return { key, label: GOAL_METRICS[key].label, value, goal, done: value >= goal };
    });
}

/** Pode se mudar agora? Retorna { ok, reason }. */
export function canMoveEra(state) {
  const era = nextEra(state);
  if (!era) return { ok: false, reason: 'A próxima era ainda não existe neste protótipo.' };
  const missing = eraGoals(state).filter((g) => !g.done);
  if (missing.length) return { ok: false, reason: `Falta: ${missing.map((g) => g.label.toLowerCase()).join(', ')}.` };
  const cost = eraDef(era).moveCost ?? 0;
  if (state.money < cost) return { ok: false, reason: `Saldo insuficiente: ${(eraDef(era).moveCostLabel ?? 'mudança').toLowerCase()} custa mais do que você tem.` };
  return { ok: true, reason: null };
}

const area = (item) => {
  const { w, h } = footprintSize(item.type, 0);
  return w * h;
};

/**
 * Mudança inteligente: reencaixa os aparelhos no espaço novo, um a um, na
 * primeira posição (de cima para baixo, da esquerda para a direita) que cabe e
 * mantém corredor até a frente de todos. Itens de parede vão primeiro, depois
 * os maiores. `fixed` são peças que já estão no lugar (a recepção da filial)
 * e continuam com acesso. Retorna { placed, leftovers } (placed inclui `fixed`).
 */
export function smartLayout(state, items, fixed = []) {
  const order = [...items].sort((a, b) => {
    const wa = getEquipmentDef(a.type).wallMounted ? 1 : 0;
    const wb = getEquipmentDef(b.type).wallMounted ? 1 : 0;
    return wb - wa || area(b) - area(a) || a.id - b.id;
  });
  const placed = [...fixed];
  const leftovers = [];
  const probe = { ...state, items: placed };
  // A grade só enche: ocupação e corredor atuais servem de filtro rápido antes do cálculo completo.
  const ctx = {
    mask: buildUnlockedMask(probe.unlockedZones),
    occ: buildOccupancy(placed),
    access: computeAccess(probe.unlockedZones, placed),
    byCell: new Map(),
    needCount: 0,
  };
  for (const p of placed) addFronts(ctx, p);
  // Tipo que não coube uma vez não cabe mais (o espaço livre só diminui).
  const failed = new Set();
  for (const item of order) {
    const spot = failed.has(item.type) ? null : findSpot(probe, placed, item, ctx);
    if (spot) {
      const p = { ...item, ...spot };
      placed.push(p);
      for (const c of footprintCells(p.type, p.x, p.y, p.rot)) ctx.occ[cellIndex(c.x, c.y)] = p.id;
      ctx.access = computeAccess(probe.unlockedZones, placed);
      addFronts(ctx, p);
    } else {
      failed.add(item.type);
      leftovers.push(item);
    }
  }
  return { placed, leftovers };
}

/** Filtro barato: as células estão livres e (se precisa) alguma frente já tem corredor hoje. */
function quickFits(ctx, def, type, x, y, rot) {
  const cells = footprintCells(type, x, y, rot);
  for (const c of cells) {
    if (!isUnlocked(ctx.mask, c.x, c.y) || (c.x === DOOR.x && c.y === DOOR.y)) return false;
    if (ctx.occ[cellIndex(c.x, c.y)] !== -1) return false;
  }
  if (!def.needsAccess) return true;
  const own = new Set(cells.map((c) => cellIndex(c.x, c.y)));
  // Colocar o aparelho só tira corredor: se nenhuma frente é alcançável agora, não vai ser depois.
  return frontCells(type, x, y, rot).some((c) => inBounds(c.x, c.y) && !own.has(cellIndex(c.x, c.y))
    && ctx.access.flood.dist[cellIndex(c.x, c.y)] >= 0);
}

/** Registra as frentes de um aparelho colocado no mapa célula → aparelhos do contexto. */
function addFronts(ctx, item) {
  const cells = frontsOf(item);
  if (!cells) return;
  const k = ctx.needCount++;
  for (const idx of cells) {
    const list = ctx.byCell.get(idx);
    if (list) list.push(k);
    else ctx.byCell.set(idx, [k]);
  }
}

/** Índices das células da frente de cada aparelho que precisa de corredor. */
function frontsOf(item) {
  if (!getEquipmentDef(item.type).needsAccess) return null;
  return frontCells(item.type, item.x, item.y, item.rot).filter((c) => inBounds(c.x, c.y)).map((c) => cellIndex(c.x, c.y));
}

/**
 * Colocar `cand` deixa todos com corredor? Busca a partir da porta com as
 * células do candidato bloqueadas e para assim que todo aparelho (e o
 * candidato) tem uma frente alcançável. Mesmo resultado de computeAccess, sem
 * alocar a grade inteira a cada tentativa.
 */
function keepsAccess(ctx, placed, cand) {
  const n = COLS * ROWS;
  if (ctx.seen?.length !== n) {
    ctx.seen = new Int32Array(n);
    ctx.block = new Int32Array(n);
    ctx.queue = new Int32Array(n);
    ctx.stamp = 0;
  }
  if (!ctx.done || ctx.done.length < ctx.needCount + 1) ctx.done = new Int32Array(ctx.needCount + 64);
  const stamp = ++ctx.stamp;
  const { mask, occ, seen, block, queue, done, byCell } = ctx;
  for (const c of footprintCells(cand.type, cand.x, cand.y, cand.rot)) block[cellIndex(c.x, c.y)] = stamp;
  // Quem já está colocado: mapa célula → aparelhos (montado aos poucos em ctx). O candidato fica à parte.
  const own = frontsOf(cand);
  let left = ctx.needCount + (own ? 1 : 0);
  if (!left) return true;
  let ownDone = !own;
  const start = cellIndex(DOOR.x, DOOR.y);
  if (!inBounds(DOOR.x, DOOR.y) || mask[start] !== 1 || occ[start] !== -1 || block[start] === stamp) return false;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = stamp;
  while (head < tail) {
    const idx = queue[head++];
    const hits = byCell.get(idx);
    if (hits) {
      for (let h = 0; h < hits.length; h++) {
        const k = hits[h];
        if (done[k] !== stamp) {
          done[k] = stamp;
          if (--left === 0) return true;
        }
      }
    }
    if (!ownDone && own.includes(idx)) {
      ownDone = true;
      if (--left === 0) return true;
    }
    const x = idx % COLS;
    // vizinhos: direita, esquerda, baixo, cima
    if (x + 1 < COLS) {
      const j = idx + 1;
      if (seen[j] !== stamp && mask[j] === 1 && occ[j] === -1 && block[j] !== stamp) { seen[j] = stamp; queue[tail++] = j; }
    }
    if (x > 0) {
      const j = idx - 1;
      if (seen[j] !== stamp && mask[j] === 1 && occ[j] === -1 && block[j] !== stamp) { seen[j] = stamp; queue[tail++] = j; }
    }
    if (idx + COLS < n) {
      const j = idx + COLS;
      if (seen[j] !== stamp && mask[j] === 1 && occ[j] === -1 && block[j] !== stamp) { seen[j] = stamp; queue[tail++] = j; }
    }
    if (idx - COLS >= 0) {
      const j = idx - COLS;
      if (seen[j] !== stamp && mask[j] === 1 && occ[j] === -1 && block[j] !== stamp) { seen[j] = stamp; queue[tail++] = j; }
    }
  }
  return false;
}

function findSpot(probe, placed, item, ctx) {
  const def = getEquipmentDef(item.type);
  const rots = [item.rot, ...[0, 1, 3, 2].filter((r) => r !== item.rot)];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      for (const rot of rots) {
        if (!quickFits(ctx, def, item.type, x, y, rot)) continue;
        const cand = { type: item.type, x, y, rot };
        // O filtro rápido já conferiu células e frente; a checagem completa só falta para itens de parede.
        if (def.wallMounted && !validatePlacement(probe, cand).ok) continue;
        if (keepsAccess(ctx, placed, cand)) return { x, y, rot };
      }
    }
  }
  return null;
}

// A prévia (tela da planta) e a mudança de verdade fazem o mesmo reencaixe: guarda o da prévia.
let relocation = null; // { key, spots: Map<id, {x,y,rot}> }

const relocationKey = (era, items) => `${era}|${items.map((i) => `${i.id}:${i.type}:${i.rot}`).join(',')}`;

function rememberRelocation(era, items, placed) {
  relocation = { key: relocationKey(era, items), spots: new Map(placed.map((p) => [p.id, { x: p.x, y: p.y, rot: p.rot }])) };
}

/** Reencaixe da prévia, se os aparelhos não mudaram desde então (senão, null). */
function cachedRelocation(era, items) {
  if (relocation?.key !== relocationKey(era, items)) return null;
  const placed = [];
  const leftovers = [];
  for (const item of items) {
    const spot = relocation.spots.get(item.id);
    if (spot) placed.push({ ...item, ...spot });
    else leftovers.push(item);
  }
  return { placed, leftovers };
}

/**
 * Executa a mudança para a próxima era. Muda o estado diretamente e devolve
 * um resumo para a interface: { era, moved, leftovers, refund, cost }.
 */
export function performEraMove(state) {
  const era = nextEra(state);
  const def = eraDef(era);
  const cost = def.moveCost ?? 0;
  if (cost) transact(state, -cost, 'mudanca', `${def.moveCostLabel ?? 'Mudança'}: ${def.label}`);

  // Era 3 → 4: não há mudança de lugar. O prédio vira a Matriz e a rede começa.
  if (def.relocate === false) {
    state.era = era;
    syncLayout(state);
    initNetwork(state);
    grantNovelty(state, '*', def.noveltyBonus ?? CONFIG.satisfaction.noveltyBonus, def.noveltyDays ?? CONFIG.satisfaction.noveltyDays);
    state.milestones[`era${era}`] = true;
    state.pendingModals.push({ kind: 'era', era });
    for (const [from, text] of ERA_MESSAGES[era] ?? []) addMessage(state, from, text);
    return { era, moved: state.items.length, leftovers: 0, refund: 0, cost };
  }

  // Novo endereço: os terrenos da era anterior ficam para trás.
  const oldItems = state.items;
  state.era = era;
  state.unlockedZones = eraLayout(era).zones.filter((z) => z.startsUnlocked).map((z) => z.id);
  state.extraZones = [];
  state.shift = { x: 0, y: 0 };
  state.items = [];
  syncLayout(state);

  // Os aparelhos vão junto: o usado continua usado e a condição se mantém.
  const { placed, leftovers } = cachedRelocation(era, oldItems) ?? smartLayout(state, oldItems);
  relocation = null;
  state.items = placed.sort((a, b) => a.id - b.id);
  let refund = 0;
  for (const item of leftovers) refund += item.pricePaid ?? getTierDef(item.type, item.tier).price;
  if (refund) transact(state, refund, 'reembolsos', 'Aparelhos que não couberam no caminhão');

  state.dirt = [];
  state.usesSinceDirt = 0;
  state.undo = [];
  // Um dia de portas fechadas, compensado pelo bônus de novidade.
  state.closedDay = state.time.day;
  grantNovelty(state, '*', def.noveltyBonus ?? CONFIG.satisfaction.noveltyBonus, def.noveltyDays ?? CONFIG.satisfaction.noveltyDays);
  state.milestones[`era${era}`] = true;
  state.pendingModals.push({ kind: 'era', era });

  for (const [from, text] of ERA_MESSAGES[era] ?? []) addMessage(state, from, text);
  // Era 5: o kit de cada filial vira o térreo de verdade, pronto para editar.
  ensureBranchFloors(state);
  if (leftovers.length) {
    addMessage(state, 'whey', `Miau. (${leftovers.length} aparelho(s) não couberam no novo ponto e foram vendidos pelo preço pago.)`);
  }
  return { era, moved: placed.length, leftovers: leftovers.length, refund, cost };
}

/**
 * Prévia da mudança inteligente para a tela de planta (passo 1), sem mexer
 * na partida: troca a grade por um instante, calcula e devolve a grade atual.
 */
export function previewEraMove(state) {
  const era = nextEra(state);
  if (!era) return null;
  const layout = eraLayout(era);
  // Sem mudança de lugar: nada a reencaixar.
  if (eraDef(era).relocate === false) {
    return { era, layout, placed: state.items, leftovers: [], cols: COLS, rows: ROWS, stays: true };
  }
  const temp = {
    ...state,
    era,
    unlockedZones: layout.zones.filter((z) => z.startsUnlocked).map((z) => z.id),
    extraZones: [],
    shift: { x: 0, y: 0 },
    items: [],
  };
  try {
    syncLayout(temp);
    const { placed, leftovers } = smartLayout(temp, state.items);
    rememberRelocation(era, state.items, placed);
    return { era, layout, placed, leftovers, cols: COLS, rows: ROWS };
  } finally {
    syncLayout(state);
  }
}
