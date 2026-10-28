// Equipe de limpeza. Cada faxineiro(a) cobre turnos (manhã, tarde, noite)
// e limpa até `cleanPerBlock` sujeiras por turno coberto, ao longo do bloco.
// Salário mensal: base × (1 + 0,7 × turnos extras), cobrado por dia.
import { CONFIG, BLOCKS } from '../config.js';
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

/** Capacidade de limpeza por bloco do dia (para a interface). */
export function cleaningCapacityByBlock(state) {
  return BLOCKS.map((_, i) => cleanersOnBlock(state, i).length * roleDef('zelador').cleanPerBlock);
}

export function canHire(state) {
  return state.staff.length < STAFF.maxStaff;
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

export { PEAK_BLOCK };
