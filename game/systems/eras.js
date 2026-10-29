// Mudança de era. A academia sai da garagem e vai para um ponto alugado
// (Era 2), seguindo os cinco passos do documento: planta antes de pagar,
// mudança inteligente dos aparelhos, cerimônia, um dia fechado e bônus de
// novidade para todos os alunos.
import { CONFIG, MAX_ERA, eraDef, getEquipmentDef, getTierDef } from '../config.js';
import { COLS, ROWS, syncLayout, validatePlacement, footprintSize, eraLayout } from '../grid/grid.js';
import { computeAccess } from '../pathfinding/floodFill.js';
import { transact } from '../economy/economy.js';
import { grantNovelty } from '../simulation/students.js';
import { addMessage } from './characters.js';
import { ERA_MESSAGES } from '../content/lines.js';
import { initNetwork } from './network.js';

// Como medir cada meta de passagem (as metas de cada era ficam no JSON).
const GOAL_METRICS = {
  students: { label: 'Alunos ativos', value: (s) => s.students.length },
  reputation: { label: 'Reputação', value: (s) => Number(s.reputation.toFixed(1)) },
  equipmentTypes: { label: 'Tipos de aparelho', value: (s) => new Set(s.items.map((i) => i.type)).size },
  expansions: { label: 'Ampliações', value: (s) => s.unlockedZones.length - 1 },
  staff: { label: 'Pessoas na equipe', value: (s) => s.staff.length },
  idoso: { label: 'Turma da manhã (idosos)', value: (s) => s.students.filter((st) => st.profile === 'idoso').length },
  influencer: { label: 'Influencers treinando', value: (s) => s.students.filter((st) => st.profile === 'influencer').length },
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
 * os maiores. Retorna { placed, leftovers }.
 */
export function smartLayout(state, items) {
  const order = [...items].sort((a, b) => {
    const wa = getEquipmentDef(a.type).wallMounted ? 1 : 0;
    const wb = getEquipmentDef(b.type).wallMounted ? 1 : 0;
    return wb - wa || area(b) - area(a) || a.id - b.id;
  });
  const placed = [];
  const leftovers = [];
  const probe = { ...state, items: placed };
  for (const item of order) {
    const spot = findSpot(probe, placed, item);
    if (spot) placed.push({ ...item, ...spot });
    else leftovers.push(item);
  }
  return { placed, leftovers };
}

function findSpot(probe, placed, item) {
  const rots = [item.rot, ...[0, 1, 3, 2].filter((r) => r !== item.rot)];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      for (const rot of rots) {
        const cand = { type: item.type, x, y, rot };
        if (!validatePlacement(probe, cand).ok) continue;
        const access = computeAccess(probe.unlockedZones, [...placed, { ...cand, id: item.id }]);
        const allReachable = [...placed, item].every((i) => access.reachable.has(i.id));
        if (allReachable) return { x, y, rot };
      }
    }
  }
  return null;
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
  const { placed, leftovers } = smartLayout(state, oldItems);
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
    return { era, layout, placed, leftovers, cols: COLS, rows: ROWS };
  } finally {
    syncLayout(state);
  }
}
