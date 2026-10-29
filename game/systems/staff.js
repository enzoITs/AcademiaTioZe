// Equipe. Cada pessoa cobre turnos (manhã, tarde, noite) e trabalha ao longo
// do bloco: o faxineiro(a) limpa até `cleanPerBlock` sujeiras; o técnico(a)
// conserta ou revisa até `fixPerBlock` aparelhos.
// Salário mensal: base × (1 + taxa × turnos extras), cobrado por dia.
import { CONFIG, BLOCKS, eraDef } from '../config.js';
import {
  hasWear, conditionState, repairItem, serviceItem, conditionCeiling,
} from './maintenance.js';
import { pick } from '../utils/random.js';
import { createLook } from '../simulation/students.js';
import { FIRST_NAMES, STAFF_TRAITS } from '../content/lines.js';

const STAFF = CONFIG.staff;
const PEAK_BLOCK = BLOCKS.reduce((best, b, i) => (b.share > BLOCKS[best].share ? i : best), 0);

export function roleDef(role) {
  return STAFF.roles[role];
}

export function shiftCount(member) {
  return member.shifts.filter(Boolean).length;
}

export function staffSalary(member) {
  const role = roleDef(member.role);
  const n = shiftCount(member);
  return n ? role.monthlySalary * (1 + role.extraShiftRate * (n - 1)) : 0;
}

export function totalMonthlySalaries(state) {
  return state.staff.reduce((sum, m) => sum + staffSalary(m), 0);
}

export function cleanersOnBlock(state, blockIndex) {
  return state.staff.filter((m) => m.role === 'zelador' && m.shifts[blockIndex]);
}

export function techniciansOnBlock(state, blockIndex) {
  return state.staff.filter((m) => m.role === 'tecnico' && m.shifts[blockIndex]);
}

/** Consertos/revisões por bloco do dia (para a interface). */
export function repairCapacityByBlock(state) {
  return BLOCKS.map((_, i) => techniciansOnBlock(state, i).length * roleDef('tecnico').fixPerBlock);
}

/** Fila de trabalho do técnico: quebrados primeiro, depois os mais gastos abaixo do limite. */
export function repairQueue(state) {
  const limit = roleDef('tecnico').workCondition;
  const score = (i) => (conditionState(i.condition) === 'quebrado' ? -1000 : 0) + i.condition;
  return state.items
    .filter((i) => hasWear(i) && i.condition < Math.min(limit, conditionCeiling(i) - 1))
    .sort((a, b) => score(a) - score(b));
}

export function nextRepairJob(state) {
  return repairQueue(state)[0] ?? null;
}

/** Motivo para não poder contratar este cargo agora (ou null). */
export function hireBlocker(state, role) {
  const def = roleDef(role);
  if (!canHire(state)) return `A academia comporta no máximo ${maxStaff(state)} pessoas na equipe nesta era.`;
  if ((def.minRep ?? 0) > state.reputation + 1e-9) return `Precisa de ${String(def.minRep).replace('.', ',')}★ de reputação.`;
  if ((def.hireCost ?? 0) > 0 && state.money < def.hireCost) return 'Saldo insuficiente para a contratação.';
  return null;
}

/** Capacidade de limpeza por bloco do dia (para a interface). */
export function cleaningCapacityByBlock(state) {
  return BLOCKS.map((_, i) => cleanersOnBlock(state, i).length * roleDef('zelador').cleanPerBlock);
}

/** Limite da equipe: cresce com a era (3 na garagem, 6 no ponto de bairro). */
export function maxStaff(state) {
  return eraDef(state.era).maxStaff ?? STAFF.maxStaff;
}

export function canHire(state) {
  return state.staff.length < maxStaff(state);
}

/** Novo(a) faxineiro(a): começa cobrindo o pico (noite). */
export function createStaffMember(state, rng, role = 'zelador') {
  return {
    id: state.nextStaffId++,
    role,
    name: pick(rng, FIRST_NAMES),
    trait: pick(rng, STAFF_TRAITS),
    look: createLook(rng),
    shifts: BLOCKS.map((_, i) => i === PEAK_BLOCK),
    hiredDay: state.time.day,
  };
}

/**
 * Limpeza progressiva dentro do bloco: até `progress` (0–1) do bloco, a equipe
 * já deve ter limpado floor(progress × capacidade). Remove as sujeiras mais antigas.
 * Retorna as sujeiras removidas.
 */
export function runStaffCleaning(state, progress) {
  const cleaners = cleanersOnBlock(state, state.time.block).length;
  if (!cleaners || !state.dirt.length) return [];
  const budget = cleaners * roleDef('zelador').cleanPerBlock;
  const target = Math.floor(Math.min(1, progress) * budget + 1e-9);
  const removed = [];
  while (state.time.staffCleaned < target && state.dirt.length) {
    removed.push(state.dirt.shift());
    state.time.staffCleaned += 1;
  }
  state.stats.cleanedByStaff = (state.stats.cleanedByStaff ?? 0) + removed.length;
  return removed;
}

/**
 * Consertos progressivos dentro do bloco, como a limpeza: até `progress` (0–1)
 * do bloco, a equipe técnica já atendeu floor(progress × capacidade) aparelhos.
 * Quebrado volta ao teto; gasto ganha uma revisão. Retorna os atendidos.
 */
export function runStaffRepairs(state, progress) {
  const techs = techniciansOnBlock(state, state.time.block).length;
  if (!techs) return [];
  const budget = techs * roleDef('tecnico').fixPerBlock;
  const target = Math.floor(Math.min(1, progress) * budget + 1e-9);
  const fixed = [];
  state.time.staffFixed ??= 0;
  while (state.time.staffFixed < target) {
    const item = nextRepairJob(state);
    if (!item) break;
    const broken = conditionState(item.condition) === 'quebrado';
    if (broken) repairItem(item);
    else serviceItem(item);
    state.time.staffFixed += 1;
    fixed.push({ itemId: item.id, x: item.x, y: item.y, type: item.type, broken });
  }
  state.stats.repairedByStaff = (state.stats.repairedByStaff ?? 0) + fixed.length;
  return fixed;
}

export { PEAK_BLOCK };
