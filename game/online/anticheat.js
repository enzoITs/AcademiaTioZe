// Checagem anti-trapaça do modo online. Função pura: o servidor roda a cada save.
//
// A ideia: o navegador pode mandar qualquer número, então o servidor compara o
// save novo com o último save aceito e calcula o MÁXIMO que um jogador honesto
// conseguiria ter feito nesse intervalo:
//   - o relógio do jogo não anda mais rápido que a velocidade máxima × tempo real;
//   - alunos não passam da capacidade dos aparelhos nem entram mais rápido que o máximo de matrículas;
//   - o patrimônio (saldo + aparelhos e filiais pelo preço de catálogo) só cresce
//     com mensalidades — no máximo a mensalidade mais alta da era para todos os
//     alunos possíveis — e cai com o que precisa ser pago (mudança de era,
//     ampliações, contratações).
// Os limites são folgados de propósito: quem joga normal nunca chega perto deles.
import { CONFIG, BLOCKS, eraDef, getTierDef, getEquipmentDef, demandCategoryOf } from '../config.js';
import { feeLimits, monthlyRent } from '../economy/economy.js';
import { allZones } from '../grid/grid.js';
import { itemCapacity } from '../systems/maintenance.js';
import { totalMonthlySalaries } from '../systems/staff.js';
import { zoneCost } from '../systems/expansion.js';
import { STYLES, branchCapacity, branchUpgradeCost, networkMonthly, styleDensity } from '../systems/network.js';
import { formatMoney } from '../utils/format.js';

const C = CONFIG.online.anticheat;
const T = CONFIG.time;
const N = CONFIG.network;
const LV = CONFIG.levels;

const MAX_STYLE_FEE = Math.max(1, ...Object.values(STYLES).map((s) => s.feeMultiplier));
const MIN_DEMAND = Math.min(1, ...N.districts.map((d) => d.demand));
const MIN_BRANCH_COST = Math.floor((N.branchCost * MIN_DEMAND) / N.costRoundTo) * N.costRoundTo;
const DAYS_PER_SECOND = Math.max(...T.speeds) / T.secondsPerDay;

/** Dia com a fração do dia já jogada (manhã/tarde/noite). */
export function preciseDay(state) {
  return state.time.day + (state.time.block + state.time.blockProgress) / BLOCKS.length;
}

/** O mínimo que as melhorias de nível custariam (no nível de aparelho mais barato do tipo). */
function minLevelCost(item) {
  const cheapest = Math.min(...getEquipmentDef(item.type).tiers.map((t) => t.price));
  let total = 0;
  for (let lv = 2; lv <= (item.level ?? 1); lv++) {
    const def = LV.list.find((l) => l.level === lv);
    if (def) total += Math.max(def.minCost ?? 0, Math.round((cheapest * (def.costRate ?? 0)) / 10) * 10);
  }
  return total;
}

/**
 * Quanto o aparelho vale: nunca menos que o preço de catálogo (aparelho "de graça" conta como pago).
 * O que veio de presente com a filial (Era 5) não vale o preço, só as melhorias pagas.
 */
export function itemValue(item) {
  // "Fixo" vem do catálogo (escada e recepção da filial), nunca de um campo do save.
  if (CONFIG.equipment[item.type]?.fixed) return 0;
  const levels = Math.max(item.upgradeSpent ?? 0, minLevelCost(item));
  if (item.gift) return item.upgradeSpent ?? 0;
  const catalog = getTierDef(item.type, item.tier).price;
  return Math.max(item.pricePaid ?? 0, catalog) + levels;
}

/** Preço mínimo de catálogo dos andares construídos (o térreo vem com a filial). */
function floorsCatalog(branch) {
  const F = N.floors;
  let total = 0;
  for (let n = 1; n < (branch.floors?.length ?? 1); n++) total += Math.round((F.cost * F.growth ** (n - 1)) / N.costRoundTo) * N.costRoundTo;
  return total;
}

/**
 * Quanto a filial vale: nunca menos que a filial mais barata possível com as
 * reformas do nível e os andares; na Era 5 somam os aparelhos montados nela.
 */
export function branchValue(branch) {
  let floor = MIN_BRANCH_COST + floorsCatalog(branch);
  for (let lv = 1; lv < branch.level; lv++) floor += branchUpgradeCost({ ...branch, level: lv }) ?? 0;
  const items = (branch.floors ?? []).reduce((s, f) => s + f.items.reduce((t, i) => t + itemValue(i), 0), 0);
  return Math.max(branch.invested ?? 0, floor) + items;
}

/** Capacidade máxima da filial: na Era 5, pelos aparelhos (mesmo quebrados ou sem corredor). */
function branchCapacityBound(branch) {
  if (!branch.floors) return branchCapacity(branch);
  const peak = branch.floors.reduce((s, f) => s + f.items.reduce((t, i) => t + (demandCategoryOf(i.type) ? itemCapacity(i) : 0), 0), 0);
  return Math.ceil(peak * CONFIG.enrollment.maxMembersPerPeakCapacity * N.floors.capacityFactor * styleDensity(branch.style));
}

/** Matrículas por dia no melhor caso (5 estrelas, janeiro). */
function maxEnrollPerDay(era) {
  const E = CONFIG.enrollment;
  const eraFactor = Math.max(...Object.values(E.eraFactor), E.eraFactor[String(era)] ?? 1);
  return (E.base + 4 * E.perStarAboveOne) * eraFactor * CONFIG.seasonality.januaryEnrollmentMultiplier;
}

/** Números do save que a checagem precisa (guardados junto com o save no servidor). */
export function progressMetrics(state) {
  const branches = state.network?.branches ?? [];
  const items = state.items;
  // Capacidade ignorando quebra e caminho: limite de cima para os alunos.
  const peak = items.reduce((s, i) => s + (demandCategoryOf(i.type) ? itemCapacity(i) : 0), 0);
  const fixed = CONFIG.economy.fixedMonthlyCosts.reduce((s, c) => s + c.amount, 0);
  const monthlyCost = fixed + monthlyRent(state) + totalMonthlySalaries(state) + networkMonthly(state).cost;
  return {
    seed: state.seed,
    day: Math.round(preciseDay(state) * 1000) / 1000,
    era: state.era,
    money: Math.round(state.money),
    wealth: Math.round(
      state.money + items.reduce((s, i) => s + itemValue(i), 0) + branches.reduce((s, b) => s + branchValue(b), 0),
    ),
    matriz: state.students.length,
    capacity: Math.floor(peak * CONFIG.enrollment.maxMembersPerPeakCapacity),
    branchMembers: Math.round(branches.reduce((s, b) => s + b.members, 0)),
    branchCapacity: branches.reduce((s, b) => s + branchCapacityBound(b), 0),
    branchOver: branches.filter((b) => b.members > branchCapacityBound(b) + 1).length,
    unlockedZones: [...state.unlockedZones],
    nextStaffId: state.nextStaffId,
    dailyCost: Math.round(monthlyCost / T.daysPerMonth),
  };
}

/** Uma garagem nova: ponto de partida quando não há save anterior para comparar. */
export const BASELINE = Object.freeze({
  seed: null,
  day: 0,
  era: 1,
  money: CONFIG.economy.startingMoney,
  wealth: CONFIG.economy.startingMoney,
  matriz: 0,
  capacity: 0,
  branchMembers: 0,
  branchCapacity: 0,
  branchOver: 0,
  unlockedZones: CONFIG.grid.zones.filter((z) => z.startsUnlocked).map((z) => z.id),
  nextStaffId: 1,
  dailyCost: 0,
});

/** O que o jogador obrigatoriamente pagou entre `from` e o save novo. */
function requiredSpending(from, next, state) {
  let spent = 0;
  for (let e = from.era + 1; e <= next.era; e++) spent += eraDef(e)?.moveCost ?? 0;
  // Na mudança de era os terrenos são trocados pelos do endereço novo (de graça).
  if (from.era === next.era) {
    const had = new Set(from.unlockedZones);
    const zones = new Map(allZones(state).map((z) => [z.id, z]));
    for (const id of next.unlockedZones) {
      const z = zones.get(id);
      if (had.has(id) || !z) continue;
      spent += z.procedural ? zoneCost(Number(id.slice(5)), z.w * z.h) : z.cost ?? 0;
    }
  }
  for (const m of state.staff) {
    if (m.id >= from.nextStaffId) spent += CONFIG.staff.roles[m.role]?.hireCost ?? 0;
  }
  return spent;
}

const fmtDays = (d) => (Math.round(d * 10) / 10).toLocaleString('pt-BR');

/**
 * Confere o save novo (`state`, já validado por parseSave) contra as métricas do
 * último save aceito (`prev`, ou null no primeiro envio).
 * `realSeconds`: tempo real (relógio do servidor) desde o último save aceito.
 *
 * verdict:
 *  - 'ok'     → pode guardar;
 *  - 'stale'  → é um progresso mais antigo do mesmo jogo (outra aba/computador): não guarda;
 *  - 'reject' → números impossíveis: não guarda e registra;
 *  - 'review' → guarda, mas sem histórico para conferir (progresso de convidado ou
 *               importado já avançado): fica fora do ranking até o admin liberar.
 */
export function auditProgress(prev, state, { realSeconds = null } = {}) {
  const next = progressMetrics(state);
  const sameGame = !!prev && prev.seed === next.seed;
  if (sameGame && next.day < prev.day - 0.01) {
    return { verdict: 'stale', reasons: [`progresso mais antigo que o da nuvem (dia ${Math.floor(next.day) + 1} < ${Math.floor(prev.day) + 1})`], metrics: next, continuing: false };
  }
  const continuing = sameGame && next.era >= prev.era;
  const from = continuing ? prev : BASELINE;
  const reasons = [];
  const days = Math.max(0, next.day - from.day);
  // Dias que fecharam (a mensalidade cai no fim do dia).
  const dayEnds = Math.max(0, Math.floor(next.day) - Math.floor(from.day));

  if (continuing && realSeconds != null) {
    const maxDays = Math.max(0, realSeconds) * DAYS_PER_SECOND * C.speedSlack + C.daySlack;
    if (days > maxDays) reasons.push(`${fmtDays(days)} dias de jogo em ${Math.round(realSeconds)} s de tempo real (máximo ${fmtDays(maxDays)})`);
  }
  if (continuing && next.era - from.era > 1) reasons.push(`pulou da Era ${from.era} para a Era ${next.era}`);
  if (next.branchOver) reasons.push(`${next.branchOver} filial(is) com mais membros que a capacidade`);

  const enroll = maxEnrollPerDay(next.era) * C.enrollMargin;
  const capMax = Math.max(from.capacity, next.capacity);
  const reachable = Math.min(Math.max(from.matriz, capMax), from.matriz + (dayEnds + 1) * enroll);
  const studentLimit = Math.floor(reachable) + C.studentSlack;
  if (next.matriz > studentLimit) {
    reasons.push(`alunos foram de ${from.matriz} para ${next.matriz} em ${fmtDays(days)} dias (máximo ${studentLimit})`);
  }

  const feeMax = feeLimits(Math.max(from.era, next.era)).max;
  const matrizPeak = Math.max(next.matriz, from.matriz, Math.min(capMax, reachable));
  const branchPeak = Math.max(from.branchCapacity, next.branchCapacity);
  const perDay = (matrizPeak * feeMax + branchPeak * feeMax * MAX_STYLE_FEE) / T.daysPerMonth;
  // Custos do dia entram como folga: a Vovó Dalva perdoa dívidas que eles criam.
  const costs = Math.max(from.dailyCost, next.dailyCost);
  const allowed = dayEnds * (perDay * C.incomeMargin + costs) + C.moneySlack - requiredSpending(from, next, state);
  const gain = next.wealth - from.wealth;
  if (gain > allowed) {
    reasons.push(`patrimônio subiu ${formatMoney(gain)} em ${fmtDays(days)} dias; o máximo possível era ${formatMoney(Math.max(0, allowed))}`);
  }

  if (reasons.length) return { verdict: 'reject', reasons, metrics: next, continuing };
  if (!continuing && next.day > C.reviewDays) {
    return {
      verdict: 'review',
      reasons: [`progresso sem histórico na nuvem já no dia ${Math.floor(next.day) + 1}`],
      metrics: next,
      continuing,
    };
  }
  return { verdict: 'ok', reasons, metrics: next, continuing };
}

/** O progresso atual é possível partindo do zero? (análise do painel do admin, sem relógio) */
export function auditFromScratch(state) {
  const r = auditProgress(null, state);
  return r.verdict === 'reject' ? r.reasons : [];
}
