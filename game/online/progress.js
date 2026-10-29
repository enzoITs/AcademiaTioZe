// Regras do modo online que não dependem de servidor nem de navegador:
// apelido e números do perfil tirados do save.
import { CONFIG } from '../config.js';

const ONLINE = CONFIG.online;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 100;

/** Mensagem de erro do apelido, ou null se estiver certo. */
export function usernameProblem(name) {
  if (typeof name !== 'string' || !USERNAME_RE.test(name)) return 'O apelido precisa ter de 3 a 20 letras, números ou _ (sem espaço nem acento).';
  return null;
}

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (pw.length > PASSWORD_MAX) return 'Senha longa demais.';
  return null;
}

/** Números públicos do perfil, tirados de um save já validado por parseSave. */
export function summarize(state) {
  const branches = state.network?.branches ?? [];
  const branchMembers = Math.round(branches.reduce((s, b) => s + b.members, 0));
  const matrizStudents = state.students.length;
  return {
    money: Math.round(state.money),
    students: matrizStudents + branchMembers,
    matrizStudents,
    branchMembers,
    branches: branches.length,
    reputation: Math.round(state.reputation * 100) / 100,
    era: state.era,
    day: Math.floor(state.time.day),
    equipment: state.items.filter((i) => i.type !== 'recepcao').length,
    staff: state.staff.length,
  };
}

/** Pontos mensais para o gráfico do perfil (mais antigo primeiro). */
export function historyOf(state) {
  return state.reports.slice(0, ONLINE.historyMonths).reverse().map((r) => ({
    month: r.monthIndex,
    label: String(r.label ?? '').slice(0, 30),
    money: Math.round(r.closing ?? 0),
    students: r.students ?? 0,
    reputation: r.reputation ?? 0,
  }));
}

