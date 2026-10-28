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

/** Capacidade efetiva por bloco (cansado ×0,75; quebrado 0). */
export function effectiveCapacity(item) {
  const base = getTierDef(item.type, item.tier).capacity;
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
  const wearPerUse = CONFIG.tiers[item.tier].wearPerUse * W.scale;
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

export function repairCost(item) {
  return Math.max(ECON.repairMinCost, Math.round(itemPurchasePrice(item) * ECON.repairCostRate));
}

export function serviceCost(item) {
  return Math.max(ECON.repairMinCost, Math.round(itemPurchasePrice(item) * ECON.serviceCostRate));
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
