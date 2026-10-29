// Desgaste, conserto, revisão e limpeza.
import { CONFIG, getEquipmentDef, getTierDef } from '../config.js';
import { nextRandom } from '../utils/random.js';
import { clamp } from '../utils/format.js';

const W = CONFIG.wear;
const ECON = CONFIG.economy;

export const CONDITION_STATES = {
  ok: { label: 'Ok', color: '#7cc98a' },
  rangendo: { label: 'Rangendo', color: '#f2cd5c' },
  cansado: { label: 'Cansado', color: '#f29a5c' },
  quebrado: { label: 'Quebrado', color: '#e8646a' },
};

export function conditionState(condition) {
  if (condition >= W.states.ok) return 'ok';
  if (condition >= W.states.rangendo) return 'rangendo';
  if (condition >= W.states.cansado) return 'cansado';
  return 'quebrado';
}

export function hasWear(item) {
  return getTierDef(item.type, item.tier).capacity > 0;
}

// ---------------------------------------------------------------- níveis (1 a 3)
const LV = CONFIG.levels;
export const MAX_LEVEL = LV.max;

export function itemLevel(item) {
  return Math.min(LV.max, Math.max(1, Math.floor(item?.level ?? 1)));
}

export function levelDef(level) {
  return LV.list.find((l) => l.level === level) ?? LV.list[0];
}

/** Capacidade por bloco do aparelho no nível dado (sem desgaste). Cada nível soma pelo menos +1. */
export function capacityAtLevel(type, tier, level) {
  const base = getTierDef(type, tier).capacity;
  if (base <= 0 || level <= 1) return base;
  return base + Math.max(level - 1, Math.round(base * levelDef(level).capacityBonus));
}

export function itemCapacity(item) {
  return capacityAtLevel(item.type, item.tier, itemLevel(item));
}

/** Vibe de um item de conforto/decoração no nível dado. */
export function vibeAtLevel(type, level) {
  const vibe = getEquipmentDef(type).vibe ?? 0;
  return Math.round(vibe * (1 + levelDef(level).vibeBonus));
}

export function itemVibe(item) {
  return vibeAtLevel(item.type, itemLevel(item));
}

/** Preço para subir do nível atual para o próximo (null no nível máximo). */
export function levelUpCost(item) {
  const next = itemLevel(item) + 1;
  if (next > LV.max) return null;
  const def = levelDef(next);
  return Math.max(def.minCost, Math.round((itemPurchasePrice(item) * def.costRate) / 10) * 10);
}

/** Capacidade efetiva por bloco (cansado ×0,75; quebrado 0). */
export function effectiveCapacity(item) {
  const base = itemCapacity(item);
  const st = conditionState(item.condition);
  if (st === 'quebrado') return 0;
  if (st === 'cansado') return base * W.tiredCapacityMultiplier;
  return base;
}

export function conditionCeiling(item) {
  return CONFIG.tiers[item.tier]?.ceiling ?? 100;
}

export function applyWear(item, uses, { offline = false } = {}) {
  if (!hasWear(item) || uses <= 0) return;
  const wearPerUse = CONFIG.tiers[item.tier].wearPerUse * W.scale * levelDef(itemLevel(item)).wearMultiplier;
  let next = item.condition - uses * wearPerUse;
  // Offline: o aparelho para na Condição 20 e nunca quebra sozinho.
  if (offline) next = Math.max(next, Math.min(item.condition, CONFIG.time.offlineConditionFloor));
  item.condition = Math.max(0, next);
  item.usesRecent = (item.usesRecent ?? 0) + uses;
}

/** Aparelhos cansados têm 2% por dia de chance de quebrar (nunca offline). */
export function rollBreakdowns(state, rng) {
  const broken = [];
  for (const item of state.items) {
    if (!hasWear(item)) continue;
    if (conditionState(item.condition) === 'cansado' && nextRandom(rng) < W.tiredDailyBreakChance) {
      item.condition = W.brokenCondition;
      broken.push(item);
    }
    item.usesRecent = (item.usesRecent ?? 0) * 0.7;
  }
  return broken;
}

export function itemPurchasePrice(item) {
  return getTierDef(item.type, item.tier).price;
}

/** Multiplicador do conserto/revisão pelo nível: peça melhor custa mais caro. */
export function repairMultiplier(item) {
  return levelDef(itemLevel(item)).repairMultiplier;
}

export function repairCost(item) {
  return Math.max(ECON.repairMinCost, Math.round(itemPurchasePrice(item) * ECON.repairCostRate * repairMultiplier(item)));
}

export function serviceCost(item) {
  return Math.max(ECON.repairMinCost, Math.round(itemPurchasePrice(item) * ECON.serviceCostRate * repairMultiplier(item)));
}

export function canService(item) {
  return hasWear(item) && conditionState(item.condition) !== 'quebrado' && item.condition < conditionCeiling(item) - 1;
}

export function canRepair(item) {
  return hasWear(item) && item.condition < conditionCeiling(item) - 1;
}

export function repairItem(item) {
  item.condition = conditionCeiling(item);
}

export function serviceItem(item) {
  item.condition = clamp(item.condition + ECON.serviceBonus, 0, conditionCeiling(item));
}

export function cleanliness(dirtCount) {
  return Math.max(0, 100 - CONFIG.cleaning.cleanlinessPerDirt * dirtCount);
}

export function describeEquipment(type) {
  return getEquipmentDef(type).name;
}
