// Demanda × capacidade × fila, por bloco do dia e por categoria.
// Demanda = Σ(alunos do perfil × frequência × % do bloco × % da categoria)
// Fila%   = max(0, Demanda − Capacidade) / Demanda
import { CONFIG, BLOCKS, PROFILES, PROFILE_IDS, DEMAND_CATEGORIES } from '../config.js';
import { countProfiles } from './academy.js';
import { calendarOf } from '../utils/format.js';

const SEASON = CONFIG.seasonality;

export function demandMultipliers(day) {
  const cal = calendarOf(day);
  const mult = Object.fromEntries(DEMAND_CATEGORIES.map((c) => [c, 1]));
  // "Segunda é dia de peito": só a fatia de peito da demanda de Peso sobe ×1,5.
  if (cal.weekday === 0) {
    mult.peso *= 1 + (SEASON.mondayChestMultiplier - 1) * SEASON.chestShareOfWeightDemand;
  }
  return mult;
}

/** Fatia das visitas do perfil neste bloco (o Idoso prefere a manhã). */
export function blockShareOf(profile, blockIndex) {
  const block = BLOCKS[blockIndex];
  return profile.blockShare?.[block.id] ?? block.share;
}

export function computeDemand(profileCounts, blockIndex, day) {
  const mult = demandMultipliers(day);
  const demand = Object.fromEntries(DEMAND_CATEGORIES.map((c) => [c, 0]));
  const byProfile = {};
  for (const pid of PROFILE_IDS) {
    const p = PROFILES[pid];
    const share = blockShareOf(p, blockIndex);
    byProfile[pid] = {};
    for (const [cat, catShare] of Object.entries(p.categoryShare)) {
      const d = profileCounts[pid] * p.visitsPerDay * share * catShare * mult[cat];
      demand[cat] += d;
      byProfile[pid][cat] = d;
    }
  }
  return { demand, byProfile };
}

export function queueFraction(demand, capacity) {
  if (demand <= 0) return 0;
  return Math.max(0, demand - capacity) / demand;
}

/**
 * Estatística completa do bloco. Distribui atendidos e fila entre os aparelhos
 * de cada categoria, proporcionalmente à capacidade (para desgaste e sprites).
 */
export function computeBlockStats(state, academy, blockIndex, day) {
  const counts = countProfiles(state.students);
  const { demand } = computeDemand(counts, blockIndex, day);
  const stats = {
    blockIndex,
    day,
    demand,
    capacity: { ...academy.capacity },
    served: {},
    queuePeople: {},
    queuePct: {},
    perItem: {},
  };
  let servedTotal = 0;
  let peakCap = 0;
  for (const cat of DEMAND_CATEGORIES) {
    const cap = academy.capacity[cat];
    const d = demand[cat];
    const served = Math.min(d, cap);
    stats.served[cat] = served;
    stats.queuePeople[cat] = Math.max(0, d - cap);
    stats.queuePct[cat] = queueFraction(d, cap);
    servedTotal += served;
    peakCap += cap;

    const catItems = state.items.filter((i) => academy.itemInfo.get(i.id).category === cat && academy.itemInfo.get(i.id).capacity > 0);
    for (const item of catItems) {
      const part = academy.itemInfo.get(item.id).capacity / cap;
      stats.perItem[item.id] = {
        uses: served * part,
        queue: stats.queuePeople[cat] * part,
        occupancy: served * part / academy.itemInfo.get(item.id).capacity,
      };
    }
  }
  stats.occupancy = peakCap ? servedTotal / peakCap : 0;
  stats.totalVisitors = Object.values(demand).reduce((a, b) => a + b, 0);
  return stats;
}

/** Exposição à fila de cada perfil, ponderada pelos blocos e categorias. */
export function queueExposureForBlock(stats) {
  const out = {};
  for (const pid of PROFILE_IDS) {
    const share = blockShareOf(PROFILES[pid], stats.blockIndex);
    let exp = 0;
    for (const [cat, catShare] of Object.entries(PROFILES[pid].categoryShare)) {
      exp += catShare * stats.queuePct[cat];
    }
    out[pid] = share * exp;
  }
  return out;
}
