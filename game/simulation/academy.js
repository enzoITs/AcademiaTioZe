// Avaliação instantânea da academia: o que existe, o que funciona,
// capacidade, necessidades atendidas, vibe e qualidade percebida.
// É uma função pura do estado; o resultado fica em cache como "derived".
import {
  CONFIG, PROFILES, PROFILE_IDS, DEMAND_CATEGORIES, getEquipmentDef, demandCategoryOf,
} from '../config.js';
import { computeAccess } from '../pathfinding/floodFill.js';
import { footprintCells } from '../grid/grid.js';
import { conditionState, effectiveCapacity, hasWear, cleanliness, itemVibe } from '../systems/maintenance.js';
import { clamp } from '../utils/format.js';

const SAT = CONFIG.satisfaction;
const VIBE = CONFIG.vibe;

/** Distância Chebyshev entre os retângulos de dois aparelhos (0 = encostados). */
function footprintGap(a, b) {
  const ca = footprintCells(a.type, a.x, a.y, a.rot);
  const cb = footprintCells(b.type, b.x, b.y, b.rot);
  let best = Infinity;
  for (const p of ca) for (const q of cb) best = Math.min(best, Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) - 1);
  return best;
}

export function needsScoreFor(profileId, metTypes, extraEssential = null) {
  const p = PROFILES[profileId];
  const essentials = extraEssential && !p.essentials.includes(extraEssential)
    ? [...p.essentials, extraEssential]
    : p.essentials;
  const desired = p.desired.filter((t) => !essentials.includes(t));
  let total = 0;
  let met = 0;
  const missingEssentials = [];
  const missingDesired = [];
  for (const t of essentials) {
    total += SAT.essentialWeight;
    if (metTypes.has(t)) met += SAT.essentialWeight;
    else missingEssentials.push(t);
  }
  for (const t of desired) {
    total += SAT.desiredWeight;
    if (metTypes.has(t)) met += SAT.desiredWeight;
    else missingDesired.push(t);
  }
  return { score: total ? (100 * met) / total : 100, total, missingEssentials, missingDesired };
}

function vibeFor(profileId, comfortItems, adjacency) {
  const mult = PROFILES[profileId].vibeMultipliers ?? {};
  const seen = {};
  let vibe = VIBE.base;
  for (const item of comfortItems) {
    const n = (seen[item.type] = (seen[item.type] ?? 0) + 1);
    vibe += itemVibe(item) * (mult[item.type] ?? 1) * VIBE.duplicateFalloff ** (n - 1);
  }
  return vibe + adjacency;
}

export function evaluateAcademy(state) {
  const access = computeAccess(state.unlockedZones, state.items);
  const capacity = Object.fromEntries(DEMAND_CATEGORIES.map((c) => [c, 0]));
  const metTypes = new Set();
  const comfortItems = [];
  const brokenItems = [];
  const unreachableItems = [];
  const itemInfo = new Map();

  for (const item of state.items) {
    const def = getEquipmentDef(item.type);
    const reachable = access.reachable.has(item.id);
    const st = hasWear(item) ? conditionState(item.condition) : 'ok';
    const works = reachable && st !== 'quebrado';
    const cap = works ? effectiveCapacity(item) : 0;
    const cat = demandCategoryOf(item.type);
    if (cat) capacity[cat] += cap;
    if (works) metTypes.add(item.type);
    if (works && def.vibe) comfortItems.push(item);
    if (st === 'quebrado') brokenItems.push(item);
    if (!reachable) unreachableItems.push(item);
    itemInfo.set(item.id, { reachable, state: st, works, capacity: cap, category: cat });
  }

  // Adjacência: bebedouro perto do cardio agrada; peso barulhento colado no cardio incomoda.
  const cardio = state.items.filter((i) => itemInfo.get(i.id).works && demandCategoryOf(i.type) === 'cardio');
  let waterBonus = 0;
  let noisePenalty = 0;
  for (const item of state.items) {
    if (!itemInfo.get(item.id).works) continue;
    const def = getEquipmentDef(item.type);
    for (const c of cardio) {
      const gap = footprintGap(item, c);
      if (item.type === 'bebedouro' && gap <= VIBE.waterNearCardioDistance) waterBonus += VIBE.waterNearCardioBonus;
      if (def.noisy && gap <= VIBE.noiseNearCardioDistance) noisePenalty += VIBE.noiseNearCardioPenalty;
    }
  }
  waterBonus = Math.min(waterBonus, VIBE.waterNearCardioMax);
  noisePenalty = Math.min(noisePenalty, VIBE.noiseNearCardioMax);

  const crowded = (state.lastPeakOccupancy ?? 0) > VIBE.crowdedThreshold;
  const adjacency = waterBonus - noisePenalty - (crowded ? VIBE.crowdedPenalty : 0);

  const vibeByProfile = {};
  const needsByProfile = {};
  for (const pid of PROFILE_IDS) {
    vibeByProfile[pid] = clamp(vibeFor(pid, comfortItems, adjacency), 0, 100);
    needsByProfile[pid] = needsScoreFor(pid, metTypes);
  }

  // Estado médio ponderado pelo uso (quebrado conta 0).
  const wearItems = state.items.filter((i) => hasWear(i) && itemInfo.get(i.id).reachable);
  let condSum = 0;
  let condWeight = 0;
  for (const item of wearItems) {
    const w = 1 + (item.usesRecent ?? 0);
    condSum += w * (conditionState(item.condition) === 'quebrado' ? 0 : item.condition);
    condWeight += w;
  }
  const equipmentCondition = condWeight ? condSum / condWeight : SAT.noConditionDataScore;
  const clean = cleanliness(state.dirt.length);
  const conditionScore = 0.5 * equipmentCondition + 0.5 * clean;

  // Qualidade percebida (base para o preço justo).
  const counts = countProfiles(state.students);
  const totalStudents = state.students.length;
  const weightOf = (pid) => (totalStudents ? counts[pid] / totalStudents : PROFILES[pid].spawnWeight);
  let needsAvg = 0;
  let vibeAvg = 0;
  for (const pid of PROFILE_IDS) {
    needsAvg += weightOf(pid) * needsByProfile[pid].score;
    vibeAvg += weightOf(pid) * vibeByProfile[pid];
  }
  const quality = (needsAvg + conditionScore + vibeAvg) / 3;
  const base = CONFIG.economy.eraBaseFee[String(state.era)];
  const perceived = base * (0.7 + (0.6 * quality) / 100);
  const [fairLow, fairHigh] = CONFIG.economy.fairRange;

  const peakCapacity = Object.values(capacity).reduce((a, b) => a + b, 0);

  return {
    access,
    itemInfo,
    capacity,
    peakCapacity,
    maxMembers: Math.floor(peakCapacity * CONFIG.enrollment.maxMembersPerPeakCapacity),
    metTypes,
    brokenItems,
    unreachableItems,
    vibeByProfile,
    needsByProfile,
    adjacency: { waterBonus, noisePenalty, crowded },
    equipmentCondition,
    cleanliness: clean,
    conditionScore,
    quality,
    perceivedValue: perceived,
    fairRange: [perceived * fairLow, perceived * fairHigh],
  };
}

export function countProfiles(students) {
  const counts = Object.fromEntries(PROFILE_IDS.map((p) => [p, 0]));
  for (const s of students) counts[s.profile] += 1;
  return counts;
}
