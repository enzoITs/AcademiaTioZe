// Laço da simulação. Independente de FPS: recebe frações de dia e processa
// blocos inteiros (manhã, tarde, noite) de forma determinística.
import { CONFIG, BLOCKS, DEMAND_CATEGORIES } from '../config.js';
import { evaluateAcademy } from './academy.js';
import { computeBlockStats, queueExposureForBlock } from './demand.js';
import {
  updateSatisfaction, processCancellations, updateReputation, processEnrollment, maybeReview,
} from './students.js';
import { applyWear, rollBreakdowns } from '../systems/maintenance.js';
import { applyDailyEconomy, checkVovo, closeMonth } from '../economy/economy.js';
import { checkMilestones, vovoMessage } from '../systems/characters.js';
import { nearestWalkable } from '../pathfinding/floodFill.js';
import { cellIndex, syncLayout } from '../grid/grid.js';
import { nextRandom } from '../utils/random.js';
import { runStaffCleaning, runStaffRepairs } from '../systems/staff.js';
import { runNetworkDay, refreshCandidates, hasNetwork } from '../systems/network.js';
import { emptyExposure, emptyCategoryQueue } from '../engine/state.js';

/** Dados derivados (não salvos): avaliação da academia e estatística do bloco atual. */
export function createRuntime(state) {
  const rt = { academy: null, blockStats: null };
  refreshDerived(state, rt);
  return rt;
}

export function refreshDerived(state, rt) {
  syncLayout(state);
  rt.academy = evaluateAcademy(state);
  rt.blockStats = computeBlockStats(state, rt.academy, state.time.block, state.time.day);
  return rt;
}

function spawnDirtNear(state, rt, item) {
  const C = CONFIG.cleaning;
  if (state.dirt.length >= C.maxDirt) return null;
  const origins = rt.academy.access.usageCells.get(item.id) ?? [];
  if (!origins.length) return null;
  const taken = new Set(state.dirt.map((d) => cellIndex(Math.floor(d.x), Math.floor(d.y))));
  const options = nearestWalkable(rt.academy.access.flood, origins, 5, taken);
  if (!options.length) return null;
  const cell = options[Math.floor(nextRandom(state.rng) * options.length)];
  const dirt = {
    id: state.nextDirtId++,
    x: cell.x + 0.25 + nextRandom(state.rng) * 0.5,
    y: cell.y + 0.25 + nextRandom(state.rng) * 0.5,
    kind: nextRandom(state.rng) < 0.6 ? 'suor' : 'toalha',
  };
  state.dirt.push(dirt);
  return dirt;
}

function runBlockEnd(state, rt, offline) {
  const stats = rt.blockStats;
  const byId = new Map(state.items.map((i) => [i.id, i]));
  const usesPerDirt = CONFIG.cleaning.usesPerDirt;
  for (const [id, info] of Object.entries(stats.perItem)) {
    const item = byId.get(Number(id));
    if (!item) continue;
    applyWear(item, info.uses, { offline });
    // A cada ~12 usos (na academia toda) aparece uma sujeirinha perto de onde alguém treinou.
    state.usesSinceDirt += info.uses;
    while (state.usesSinceDirt >= usesPerDirt) {
      state.usesSinceDirt -= usesPerDirt;
      spawnDirtNear(state, rt, item);
    }
  }
  const exposure = queueExposureForBlock(stats);
  for (const [p, v] of Object.entries(exposure)) state.dayExposure[p] += v;
  const share = BLOCKS[stats.blockIndex].share;
  for (const cat of DEMAND_CATEGORIES) state.dayCategoryQueue[cat] += share * stats.queuePct[cat];
  if (stats.blockIndex === BLOCKS.length - 1) state.lastPeakOccupancy = stats.occupancy;
}

function runDayEnd(state, rt, offline) {
  const events = [];
  const rng = state.rng;

  if (!offline) {
    const broken = rollBreakdowns(state, rng);
    for (const item of broken) events.push({ type: 'broken', itemId: item.id, itemType: item.type });
  } else {
    for (const item of state.items) item.usesRecent = (item.usesRecent ?? 0) * 0.7;
  }
  refreshDerived(state, rt);

  updateSatisfaction(state, rt.academy, rng);
  const leaving = processCancellations(state, rng);
  for (const l of leaving) {
    state.cancellations.unshift(l);
    state.stats.cancelled += 1;
    events.push({ type: 'cancel', entry: l });
  }
  if (state.cancellations.length > 40) state.cancellations.length = 40;

  updateReputation(state);
  refreshDerived(state, rt);
  const joined = processEnrollment(state, rt.academy, rng);
  state.stats.enrolled += joined.length;
  if (joined.length) events.push({ type: 'joined', count: joined.length });

  applyDailyEconomy(state);
  const network = runNetworkDay(state, offline);
  if (network) events.push({ type: 'network', ...network });
  const vovo = checkVovo(state);
  if (vovo) {
    vovoMessage(state, vovo.debt);
    events.push({ type: 'vovo', debt: vovo.debt });
  }

  const review = maybeReview(state, rng);
  if (review) {
    state.reviews.unshift(review);
    if (state.reviews.length > CONFIG.reviews.maxStored) state.reviews.length = CONFIG.reviews.maxStored;
    events.push({ type: 'review', review });
  }

  state.dayExposure = emptyExposure();
  state.dayCategoryQueue = emptyCategoryQueue();

  const daysPerMonth = CONFIG.time.daysPerMonth;
  if ((state.time.day + 1) % daysPerMonth === 0) {
    events.push({ type: 'month', report: closeMonth(state) });
    // Todo mês chega um novo pool de candidatos a gerente.
    if (hasNetwork(state)) refreshCandidates(state, true);
  }
  state.time.day += 1;
  state.undo = []; // desfazer e reembolso total valem só no mesmo dia
  checkMilestones(state, rt.academy);
  events.push({ type: 'day' });
  return events;
}

/** Avança `gameDays` dias de jogo (pode ser fracionário). */
export function advanceTime(state, rt, gameDays, { offline = false } = {}) {
  const events = [];
  let remaining = gameDays * BLOCKS.length;
  const staffCleanTo = (progress) => {
    const removed = runStaffCleaning(state, progress);
    if (removed.length) {
      refreshDerived(state, rt);
      events.push({ type: 'staffClean', dirt: removed });
    }
    const fixed = runStaffRepairs(state, progress);
    if (fixed.length) {
      refreshDerived(state, rt);
      events.push({ type: 'staffRepair', items: fixed });
    }
  };
  while (remaining > 1e-9) {
    const need = 1 - state.time.blockProgress;
    if (remaining < need) {
      state.time.blockProgress += remaining;
      staffCleanTo(state.time.blockProgress);
      break;
    }
    remaining -= need;
    staffCleanTo(1);
    state.time.blockProgress = 0;
    state.time.staffCleaned = 0;
    state.time.staffFixed = 0;
    runBlockEnd(state, rt, offline);
    state.time.block += 1;
    if (state.time.block >= BLOCKS.length) {
      state.time.block = 0;
      events.push(...runDayEnd(state, rt, offline));
    }
    refreshDerived(state, rt);
    events.push({ type: 'block' });
  }
  return events;
}

/** Progresso offline: no máximo 3 dias, sem quebrar aparelhos. */
export function catchUpOffline(state, rt, elapsedSeconds) {
  const T = CONFIG.time;
  const days = Math.min(T.offlineMaxDays, Math.max(0, elapsedSeconds) / T.secondsPerDay);
  if (days < 0.05) return null;
  const before = { money: state.money, students: state.students.length, day: state.time.day };
  const events = advanceTime(state, rt, days, { offline: true });
  const hitFloor = state.items.some((i) => i.condition <= T.offlineConditionFloor + 0.01 && i.condition > CONFIG.wear.brokenCondition);
  return {
    days,
    capped: elapsedSeconds / T.secondsPerDay > T.offlineMaxDays,
    moneyDelta: state.money - before.money,
    studentsDelta: state.students.length - before.students,
    cancels: events.filter((e) => e.type === 'cancel').length,
    joined: events.filter((e) => e.type === 'joined').reduce((s, e) => s + e.count, 0),
    rusted: hitFloor,
  };
}
