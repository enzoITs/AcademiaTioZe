// Caixa de sugestões: separa "falta aparelho" de "falta capacidade",
// agrupando pedidos reais dos alunos com o ganho estimado.
import { CONFIG, PROFILES, EQUIPMENT, DEMAND_CATEGORIES, demandCategoryOf } from '../config.js';
import { needsScoreFor } from '../simulation/academy.js';
import { computeBlockStats } from '../simulation/demand.js';

const SAT = CONFIG.satisfaction;
const PEAK_BLOCK = CONFIG.time.blocks.reduce((best, b, i, arr) => (b.share > arr[best].share ? i : best), 0);

export function isTypeLocked(type, reputation) {
  return (EQUIPMENT[type].minRep ?? 0) > reputation;
}

export function buildSuggestions(state, academy) {
  const missing = new Map();
  for (const s of state.students) {
    const mania = CONFIG.manias[s.mania] ?? {};
    const needs = needsScoreFor(s.profile, academy.metTypes, mania.extraEssential ?? null);
    const add = (type, essential) => {
      const entry = missing.get(type) ?? { kind: 'missing', type, count: 0, essentialCount: 0, profiles: new Set(), gainSum: 0 };
      const w = essential ? SAT.essentialWeight : SAT.desiredWeight;
      // Ganho no alvo de satisfação do aluno se o item existir.
      entry.gainSum += SAT.weights.needs * (100 * w) / needs.total + (essential ? SAT.missingEssentialPenalty : 0);
      entry.count += 1;
      if (essential) entry.essentialCount += 1;
      entry.profiles.add(s.profile);
      missing.set(type, entry);
    };
    needs.missingEssentials.forEach((t) => add(t, true));
    needs.missingDesired.forEach((t) => add(t, false));
  }

  const list = [...missing.values()].map((e) => ({
    ...e,
    profiles: [...e.profiles],
    gain: e.gainSum / e.count,
    locked: isTypeLocked(e.type, state.reputation),
    price: EQUIPMENT[e.type].tiers[0].price,
  }));
  list.sort((a, b) => b.essentialCount * 3 + b.count - (a.essentialCount * 3 + a.count));

  // Capacidade: o aparelho existe, mas o pico da noite tem fila.
  const peak = computeBlockStats(state, academy, PEAK_BLOCK, state.time.day);
  const capacity = [];
  for (const cat of DEMAND_CATEGORIES) {
    if (peak.queuePeople[cat] < 0.5 || academy.capacity[cat] <= 0) continue;
    const owned = [...new Set(state.items.filter((i) => demandCategoryOf(i.type) === cat).map((i) => i.type))];
    capacity.push({
      kind: 'capacity',
      category: cat,
      waiting: peak.queuePeople[cat],
      queuePct: peak.queuePct[cat],
      types: owned,
    });
  }

  const repairs = academy.brokenItems.map((i) => ({ kind: 'repair', itemId: i.id, type: i.type }));
  const access = academy.unreachableItems.map((i) => ({ kind: 'access', itemId: i.id, type: i.type }));

  return { missing: list, capacity, repairs, access, peak };
}

/** Itens com selo "Muito pedido" na loja. */
export function mostRequestedTypes(suggestions) {
  const set = new Set();
  suggestions.missing.filter((m) => m.count >= 2).slice(0, 3).forEach((m) => set.add(m.type));
  for (const c of suggestions.capacity) c.types.forEach((t) => set.add(t));
  return set;
}

export function flatSuggestions(suggestions) {
  return [...suggestions.repairs, ...suggestions.access, ...suggestions.missing, ...suggestions.capacity];
}

export { PROFILES };
