// Economia. Regra de ouro: o dinheiro só muda via transact(), que registra
// categoria, rótulo e valor no livro do mês e no histórico.
import { CONFIG, eraDef } from '../config.js';
import { calendarOf } from '../utils/format.js';
import { totalMonthlySalaries } from '../systems/staff.js';

const ECON = CONFIG.economy;
const LOG_LIMIT = 120;

export const LEDGER_CATEGORIES = {
  mensalidades: { label: 'Mensalidades', kind: 'revenue' },
  extras: { label: 'Receitas extras', kind: 'revenue' },
  vendas: { label: 'Venda de aparelhos', kind: 'revenue' },
  reembolsos: { label: 'Reembolsos', kind: 'revenue' },
  vovo: { label: 'Ajuda da Vovó Dalva', kind: 'revenue' },
  filiais: { label: 'Mensalidades das filiais', kind: 'revenue' },
  filiaisVenda: { label: 'Venda de filiais', kind: 'revenue' },
  equipamentos: { label: 'Compra de aparelhos', kind: 'expense' },
  ampliacoes: { label: 'Ampliações', kind: 'expense' },
  mudanca: { label: 'Mudança de era', kind: 'expense' },
  aluguel: { label: 'Aluguel e prédio', kind: 'expense' },
  energia: { label: 'Energia', kind: 'expense' },
  agua: { label: 'Água e limpeza', kind: 'expense' },
  consertos: { label: 'Consertos e revisões', kind: 'expense' },
  salarios: { label: 'Salários da equipe', kind: 'expense' },
  juros: { label: 'Juros do saldo negativo', kind: 'expense' },
  filiaisCustos: { label: 'Custos das filiais', kind: 'expense' },
  filiaisAbertura: { label: 'Abertura e reforma de filiais', kind: 'expense' },
};

export function createLedger(day, money) {
  return { monthIndex: calendarOf(day).monthIndex, opening: money, totals: {}, log: [] };
}

export function transact(state, amount, category, label) {
  if (!LEDGER_CATEGORIES[category]) throw new Error(`Categoria financeira desconhecida: ${category}`);
  if (!Number.isFinite(amount) || amount === 0) return;
  const value = Math.round(amount * 100) / 100;
  state.money = Math.round((state.money + value) * 100) / 100;
  const L = state.ledger;
  L.totals[category] = (L.totals[category] ?? 0) + value;
  const last = L.log[0];
  // Lançamentos diários repetidos (mensalidade, energia) são agrupados por dia.
  if (last && last.day === state.time.day && last.category === category && last.label === label) {
    last.amount = Math.round((last.amount + value) * 100) / 100;
  } else {
    L.log.unshift({ day: state.time.day, category, label, amount: value });
    if (L.log.length > LOG_LIMIT) L.log.length = LOG_LIMIT;
  }
}

/** Faixa do slider da mensalidade: o teto sobe a cada era (R$ 90 na garagem). */
export function feeLimits(era = 1) {
  const F = ECON.feeSlider;
  return { min: F.min, max: F.maxByEra?.[String(era)] ?? F.max, step: F.step };
}

export function canAfford(state, price) {
  return state.money >= price;
}

/** Cobranças do dia: mensalidades proporcionais, custos fixos e juros. */
export function applyDailyEconomy(state) {
  const days = CONFIG.time.daysPerMonth;
  const students = state.students.length;
  // No dia da mudança de era a academia fica fechada: sem mensalidade.
  const closed = state.closedDay === state.time.day;
  if (students > 0 && !closed) transact(state, (students * state.fee) / days, 'mensalidades', 'Mensalidades do dia');
  for (const cost of ECON.fixedMonthlyCosts) {
    transact(state, -cost.amount / days, cost.id, cost.label);
  }
  const rent = monthlyRent(state);
  if (rent > 0) transact(state, -rent / days, 'aluguel', eraDef(state.era).rentLabel ?? 'Aluguel');
  const salaries = totalMonthlySalaries(state);
  if (salaries > 0) transact(state, -salaries / days, 'salarios', 'Salários da equipe');
  if (state.money < 0) {
    transact(state, state.money * ECON.dailyInterestOnDebt, 'juros', 'Juros leves');
  }
}

/** Abaixo de −R$ 500 a Vovó Dalva perdoa a dívida. Sem game over. */
export function checkVovo(state) {
  if (state.money >= ECON.negativeFloor) return null;
  const debt = -state.money;
  transact(state, debt, 'vovo', 'Vovó Dalva quitou a dívida');
  state.vovoCount += 1;
  return { debt };
}

export function monthSummary(ledger) {
  let revenue = 0;
  let expense = 0;
  for (const [cat, value] of Object.entries(ledger.totals)) {
    if (LEDGER_CATEGORIES[cat].kind === 'revenue') revenue += value;
    else expense += value;
  }
  return { revenue, expense, result: revenue + expense };
}

/** Fecha o mês: gera o relatório e abre um novo livro. */
export function closeMonth(state) {
  const L = state.ledger;
  const summary = monthSummary(L);
  const cal = calendarOf(state.time.day);
  const report = {
    monthIndex: L.monthIndex,
    label: `${cal.monthName} · Ano ${cal.year}`,
    opening: L.opening,
    totals: { ...L.totals },
    revenue: summary.revenue,
    expense: summary.expense,
    result: summary.result,
    closing: state.money,
    students: state.students.length,
    reputation: state.reputation,
  };
  state.reports.unshift(report);
  if (state.reports.length > 24) state.reports.length = 24;
  state.ledger = { monthIndex: L.monthIndex + 1, opening: state.money, totals: {}, log: L.log };
  return report;
}

/** Aluguel mensal da era (zero na garagem herdada). */
export function monthlyRent(state) {
  return eraDef(state.era).rent ?? ECON.rent ?? 0;
}

export function projectedMonthly(state) {
  const fixed = ECON.fixedMonthlyCosts.reduce((s, c) => s + c.amount, 0) + monthlyRent(state);
  const salaries = totalMonthlySalaries(state);
  const revenue = state.students.length * state.fee;
  return { revenue, fixed, salaries, result: revenue - fixed - salaries };
}
