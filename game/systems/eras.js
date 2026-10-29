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

/** Próxima era (ou null quando não há outra implementada). */
export function nextEra(state) {
  return state.era < MAX_ERA ? state.era + 1 : null;
}

/** Metas para chegar na próxima era, com o valor atual de cada uma. */
export function eraGoals(state) {
  const era = nextEra(state);
  if (!era) return [];
  const goal = eraDef(era).goals;
  const types = new Set(state.items.map((i) => i.type)).size;
  return [
    { key: 'students', label: 'Alunos ativos', value: state.students.length, goal: goal.students },
    { key: 'reputation', label: 'Reputação', value: Number(state.reputation.toFixed(1)), goal: goal.reputation },
    { key: 'equipmentTypes', label: 'Tipos de aparelho', value: types, goal: goal.equipmentTypes },
    { key: 'expansions', label: 'Ampliações', value: state.unlockedZones.length - 1, goal: goal.expansions },
  ].map((g) => ({ ...g, done: g.value >= g.goal }));
}

/** Pode se mudar agora? Retorna { ok, reason }. */
export function canMoveEra(state) {
  const era = nextEra(state);
  if (!era) return { ok: false, reason: 'A próxima era ainda não existe neste protótipo.' };
  const missing = eraGoals(state).filter((g) => !g.done);
  if (missing.length) return { ok: false, reason: `Falta: ${missing.map((g) => g.label.toLowerCase()).join(', ')}.` };
  const cost = eraDef(era).moveCost ?? 0;
  if (state.money < cost) return { ok: false, reason: 'Saldo insuficiente para a caução do novo ponto.' };
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
  if (cost) transact(state, -cost, 'mudanca', `Caução e caminhão: ${def.label}`);

  // Novo endereço: os terrenos da garagem ficam para trás (viram o Museu do Tio Zé).
  const oldItems = state.items;
  state.era = era;
  state.unlockedZones = eraLayout(era).zones.filter((z) => z.startsUnlocked).map((z) => z.id);
  state.extraZones = [];
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

  addMessage(state, 'tioze', `Sobrinho(a), ${def.label.toLowerCase()} com letreiro e tudo! A garagem vira o Museu do Tio Zé: deixei lá o caderno e as fotos. Agora tem aluguel, então cuida do caixa.`);
  addMessage(state, 'armando', 'Mudou?! Finalmente vou dormir em paz. ...Peraí, esse ponto não é aqui na esquina?');
  addMessage(state, 'valeria', `Ponto próprio de bairro? Agora sim é concorrência. Bem-vindo(a) ao clube, vizinho(a)!`);
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
  const temp = {
    ...state,
    era,
    unlockedZones: layout.zones.filter((z) => z.startsUnlocked).map((z) => z.id),
    extraZones: [],
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
