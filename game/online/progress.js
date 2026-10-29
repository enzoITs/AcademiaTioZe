// Regras do modo online que não dependem de servidor nem de navegador:
// apelido, números do perfil tirados do save e a checagem contra saltos impossíveis.
import { CONFIG } from '../config.js';
import { feeLimits } from '../economy/economy.js';
import { STYLES } from '../systems/network.js';

const ONLINE = CONFIG.online;
const P = ONLINE.plausibility;

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

const MAX_FEE_MULTIPLIER = Math.max(1, ...Object.values(STYLES).map((s) => s.feeMultiplier));

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
    // Quanto daria para recuperar vendendo tudo (limite do "dinheiro que apareceu do nada").
    sellable: Math.round(
      state.items.reduce((s, i) => s + (i.pricePaid ?? 0) + (i.upgradeSpent ?? 0), 0)
      + branches.reduce((s, b) => s + (b.invested ?? 0), 0),
    ),
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

/** Como uma conta começa: garagem nova, dia 0. */
export const BASELINE = {
  day: 0, money: CONFIG.economy.startingMoney, students: 0, era: 1, sellable: 0,
};

/**
 * Confere se `next` é alcançável a partir de `prev` jogando normalmente.
 * `realSeconds` é o tempo real desde o save anterior (null quando não se sabe:
 * primeiro envio, ou o jogador trocou pelo progresso do navegador).
 * Retorna a lista de motivos; vazia quando está tudo certo.
 */
export function implausible(prev, next, realSeconds = null) {
  const from = prev ?? BASELINE;
  const reasons = [];
  const days = next.day - from.day;
  if (days < 0) reasons.push(`o dia de jogo voltou (${from.day} → ${next.day})`);
  if (realSeconds != null) {
    const maxSpeed = Math.max(...CONFIG.time.speeds);
    const maxDays = (Math.max(0, realSeconds) * maxSpeed * P.speedSlack) / CONFIG.time.secondsPerDay + P.daySlack;
    if (days > maxDays) reasons.push(`${days} dias de jogo em ${Math.round(realSeconds)} s de tempo real`);
  }
  if (next.era - from.era > 1) reasons.push(`pulou da Era ${from.era} para a ${next.era}`);
  const span = Math.max(1, days);
  const students = Math.max(from.students, next.students);
  const studentCap = from.students + span * P.studentGainPerDay + P.studentSlack;
  if (next.students > studentCap) reasons.push(`alunos subiram de ${from.students} para ${next.students} em ${days} dias`);
  const perDay = (feeLimits(Math.max(next.era, from.era)).max * MAX_FEE_MULTIPLIER * students) / CONFIG.time.daysPerMonth;
  const moneyCap = Math.max(0, from.money) + span * perDay * P.moneyMargin + from.sellable * P.refundShare + P.moneySlack;
  if (next.money > moneyCap) reasons.push(`saldo subiu de ${Math.round(from.money)} para ${next.money} em ${days} dias`);
  return reasons;
}
