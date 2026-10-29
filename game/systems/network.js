// Era 4: a Rede. O jogador só microgerencia a Matriz (a academia da grade).
// As filiais são semiautomáticas: membros × mensalidade − custos, com os
// membros dependendo da nota do gerente, do estilo escolhido e do bairro.
// Tudo roda no fim do dia, inclusive offline. Mesmo RNG da partida.
import { CONFIG, BLOCKS, PROFILES, getEquipmentDef, demandCategoryOf } from '../config.js';
import { withLayout, cellIndex } from '../grid/grid.js';
import { evaluateAcademy, needsScoreFor } from '../simulation/academy.js';
import { nearestWalkable } from '../pathfinding/floodFill.js';
import { applyWear, rollBreakdowns, cleanliness } from './maintenance.js';
import { nextRandom, pick, randInt } from '../utils/random.js';
import { transact } from '../economy/economy.js';
import { FIRST_NAMES, MANAGER_TRAITS } from '../content/lines.js';
import { clamp } from '../utils/format.js';

const N = CONFIG.network;
export const STYLES = N.styles;
export const STYLE_IDS = Object.keys(N.styles);
export const BRANCH_LEVELS = N.levels;
export const MAX_BRANCH_LEVEL = N.levels.length;
/** Mensalidade base da era: a filial compara o preço da Matriz com ela (a Era 5 cobra mais caro). */
const eraBaseFee = (state) => CONFIG.economy.eraBaseFee[String(state.era)] ?? CONFIG.economy.eraBaseFee['4'];

// Lugares fixos do mapa da cidade (em quarteirões). A Matriz fica no centro.
export const MAP_SPOTS = {
  matriz: { gx: 0, gy: 0 },
  historica: { gx: -2, gy: 1 },
  megafit: { gx: 2, gy: -1 },
};
const RESERVED = new Set(Object.values(MAP_SPOTS).map((p) => `${p.gx},${p.gy}`));

export function hasNetwork(state) {
  return state.era >= 4 && !!state.network;
}

export function createNetwork() {
  return { branches: [], lots: [], candidates: [], opened: 0, nextBranchId: 1, nextLotNum: 1, nextCandidateId: 1 };
}

// ---------------------------------------------------------------- mapa e lotes
/** Quarteirões em espiral a partir da Matriz (mais perto primeiro). */
function spiralSpots(limit) {
  const out = [];
  for (let r = 1; out.length < limit; r++) {
    const ring = [];
    for (let gx = -r; gx <= r; gx++) {
      for (let gy = -r; gy <= r; gy++) {
        if (Math.max(Math.abs(gx), Math.abs(gy)) !== r) continue;
        if (RESERVED.has(`${gx},${gy}`)) continue;
        ring.push({ gx, gy, d: Math.hypot(gx, gy * 1.3) });
      }
    }
    ring.sort((a, b) => a.d - b.d || a.gy - b.gy || a.gx - b.gx);
    out.push(...ring);
  }
  return out.slice(0, limit);
}

function takenSpots(net) {
  return new Set([...net.branches, ...net.lots].map((p) => `${p.gx},${p.gy}`));
}

/** Preço da próxima filial: cresce a cada filial aberta (nunca volta a baratear). */
export function nextBranchCost(state, demand = 1) {
  const net = state.network;
  const raw = N.branchCost * N.branchCostGrowth ** net.opened * demand;
  return Math.round(raw / N.costRoundTo) * N.costRoundTo;
}

export function lotCost(state, lot) {
  return nextBranchCost(state, districtOf(lot).demand);
}

export function districtOf(spot) {
  return N.districts[spot.district % N.districts.length];
}

export function districtName(spot) {
  const lap = Math.floor(spot.district / N.districts.length);
  const base = districtOf(spot).name;
  return lap ? `${base} ${lap + 1}` : base;
}

/** Sempre há `lotsForSale` lotes à venda: cada filial aberta faz surgir outro. */
export function ensureLots(state) {
  const net = state.network;
  const created = [];
  const want = N.lotsForSale;
  let guard = 0;
  while (net.lots.length < want && guard++ < 20) {
    const taken = takenSpots(net);
    const total = net.branches.length + net.lots.length + 1;
    const spots = spiralSpots(total + 12).filter((s) => !taken.has(`${s.gx},${s.gy}`));
    // Um pouco de sorte na ordem, mas sempre perto do centro.
    const spot = spots[Math.min(spots.length - 1, Math.floor(nextRandom(state.rng) * Math.min(3, spots.length)))];
    const n = net.nextLotNum++;
    const lot = { id: `lote-${n}`, gx: spot.gx, gy: spot.gy, district: n - 1 };
    net.lots.push(lot);
    created.push(lot);
  }
  return created;
}

// ---------------------------------------------------------------- gerentes
export function managerSalary(rating) {
  return N.manager.baseSalary + N.manager.salaryPerStar * rating;
}

function createCandidate(state) {
  const rng = state.rng;
  // Nota de 1 a 5, mais comum no meio.
  const rating = clamp(Math.round((randInt(rng, 1, 5) + randInt(rng, 1, 5)) / 2 + (nextRandom(rng) < 0.15 ? 1 : 0)), 1, 5);
  return {
    id: state.network.nextCandidateId++,
    name: pick(rng, FIRST_NAMES),
    rating,
    trait: pick(rng, MANAGER_TRAITS),
    salary: managerSalary(rating),
  };
}

/** Pool de candidatos a gerente: renova todo mês (e quando acaba). */
export function refreshCandidates(state, force = false) {
  const net = state.network;
  if (!force && net.candidates.length) return;
  net.candidates = Array.from({ length: N.manager.candidates }, () => createCandidate(state));
}

// ---------------------------------------------------------------- filiais
export function branchLevelDef(level) {
  return N.levels.find((l) => l.level === level) ?? N.levels[0];
}

/** Capacidade: na Era 5 sai dos aparelhos montados (cache em `cap`); antes, do estilo × nível. */
export function branchCapacity(branch) {
  if (branch.floors) return branch.cap ?? 0;
  return Math.round(STYLES[branch.style].capacity * branchLevelDef(branch.level).capacityMultiplier);
}

// ---------------------------------------------------------------- Era 5: filiais editáveis
const F = N.floors;
export const MAX_FLOORS = F.max;

/** A partir da Era 5 o jogador entra na filial e monta igual à Matriz. */
export function branchEditable(state) {
  return hasNetwork(state) && state.era >= 5;
}

/** Prédio da filial: o tamanho vem do nível da reforma. A porta fica na frente, à esquerda. */
export function branchBuilding(branch) {
  const [w, h] = branchLevelDef(branch.level).building ?? [10, 8];
  return { w, h, door: { x: 2, y: h - 1 } };
}

/** Escada 2×2 no canto do fundo à direita, igual em todos os andares (a frente aponta para a porta). */
export function stairsSpot(branch) {
  const { w } = branchBuilding(branch);
  return { x: w - 2, y: 0, rot: 0 };
}

/**
 * Planta de um andar da filial. No térreo a porta dá para a rua; nos andares de
 * cima a "porta" é a frente da escada: é dali que o corredor (flood fill) parte.
 */
export function branchFloorLayout(branch, floor = 0) {
  const { w, h, door } = branchBuilding(branch);
  const zone = {
    id: `filial-${branch.id}${floor ? `-f${floor}` : ''}`,
    label: floor ? `${branch.name} · ${floor}º andar` : branch.name,
    x: 0, y: 0, w, h, cost: 0, startsUnlocked: true, floor: STYLES[branch.style].look?.floor,
  };
  if (!floor) {
    return { id: `${zone.id}|${branch.level}`, era: 4, zones: [zone], door, cols: w, rows: h + 2, reserved: { x: door.x, y: h, w: 1 } };
  }
  const st = stairsSpot(branch);
  return {
    id: `${zone.id}|${branch.level}`, era: 4, zones: [zone], door: { x: st.x, y: st.y + 2 }, cols: w, rows: h,
    reserved: { x: 0, y: h, w: 0 }, upper: true, floor,
  };
}

/** Estado mínimo de um andar (mesmo formato da Matriz) para validar, avaliar e desenhar. */
export function floorState(home, branch, floor = 0) {
  const layout = branchFloorLayout(branch, floor);
  const f = branch.floors?.[floor] ?? { items: [], dirt: [] };
  return {
    isBranchView: true,
    branchId: branch.id,
    floorIndex: floor,
    era: home?.era ?? 5,
    customLayout: layout,
    unlockedZones: [layout.zones[0].id],
    extraZones: [],
    shift: { x: 0, y: 0 },
    items: f.items,
    dirt: f.dirt,
    students: [],
    reputation: home?.reputation ?? 3,
    fee: home?.fee ?? 0,
    time: home?.time ?? { day: 0, block: 0, blockProgress: 0 },
  };
}

const MEAN_STYLE_CAPACITY = Object.values(STYLES).reduce((a, st) => a + st.capacity, 0) / Object.keys(STYLES).length;

/** Quanto o estilo lota por aparelho, comparado com a média dos estilos. */
export function styleDensity(style) {
  return STYLES[style].capacity / MEAN_STYLE_CAPACITY;
}

/** Preço do próximo andar (null quando já tem todos). */
export function floorCost(branch) {
  const n = branch.floors?.length ?? 1;
  if (n >= F.max) return null;
  return Math.round((F.cost * F.growth ** (n - 1)) / N.costRoundTo) * N.costRoundTo;
}

/**
 * Recalcula a capacidade da filial pelos aparelhos de cada andar (só os que
 * funcionam e têm corredor) e o "cuidado": limpeza e o quanto os aparelhos
 * atendem o público do estilo.
 */
export function refreshBranchCapacity(home, branch) {
  if (!branch.floors) return branchCapacity(branch);
  const met = new Set();
  let dirt = 0;
  const caps = branch.floors.map((f, i) => {
    const st = floorState(home, branch, i);
    dirt += f.dirt.length;
    return withLayout(st, home, () => {
      const a = evaluateAcademy(st);
      for (const t of a.metTypes) met.add(t);
      return a.maxMembers;
    });
  });
  const mix = Object.entries(STYLES[branch.style].profiles ?? { iniciante: 1 });
  const weight = mix.reduce((s, [, w]) => s + w, 0) || 1;
  const needs = mix.reduce((s, [p, w]) => s + (PROFILES[p] ? needsScoreFor(p, met).score * w : 100 * w), 0) / weight;
  const clean = cleanliness(dirt / branch.floors.length);
  branch.care = Math.round((1 - F.careClean * (1 - clean / 100)) * (1 - F.careNeeds * (1 - needs / 100)) * 1000) / 1000;
  branch.floorCaps = caps;
  // O estilo continua pesando: Família e Express lotam mais por aparelho; Premium e Luta, menos.
  branch.cap = Math.round(caps.reduce((a, b) => a + b, 0) * F.capacityFactor * styleDensity(branch.style));
  return branch.cap;
}

/** Sujeira perto de um aparelho usado (mesma regra da Matriz). */
function spawnBranchDirt(branch, floor, academy, item, rng) {
  const C = CONFIG.cleaning;
  if (floor.dirt.length >= C.maxDirt) return;
  const origins = academy.access.usageCells.get(item.id) ?? [];
  if (!origins.length) return;
  const taken = new Set(floor.dirt.map((d) => cellIndex(Math.floor(d.x), Math.floor(d.y))));
  const options = nearestWalkable(academy.access.flood, origins, 5, taken);
  if (!options.length) return;
  const cell = options[Math.floor(nextRandom(rng) * options.length)];
  floor.dirt.push({
    id: branch.nextDirtId++,
    x: cell.x + 0.25 + nextRandom(rng) * 0.5,
    y: cell.y + 0.25 + nextRandom(rng) * 0.5,
    kind: nextRandom(rng) < 0.6 ? 'suor' : 'toalha',
  });
}

/**
 * Era 5: um dia de uso na filial, como na Matriz. Os membros gastam os
 * aparelhos, deixam sujeira e os cansados podem quebrar (nunca offline).
 * Devolve os aparelhos que quebraram.
 */
export function runBranchDay(home, branch, offline = false) {
  if (!branch.floors) return [];
  const caps = branch.floorCaps ?? [];
  const total = caps.reduce((a, b) => a + b, 0);
  const broken = [];
  branch.floors.forEach((floor, i) => {
    const st = floorState(home, branch, i);
    withLayout(st, home, () => {
      const academy = evaluateAcademy(st);
      const members = total > 0 ? branch.members * ((caps[i] ?? 0) / total) : 0;
      const occupancy = Math.min(1, members / Math.max(1, academy.maxMembers));
      floor.usesSinceDirt = floor.usesSinceDirt ?? 0;
      for (const item of floor.items) {
        const info = academy.itemInfo.get(item.id);
        if (!info?.works || !info.capacity) continue;
        const uses = info.capacity * occupancy * BLOCKS.length * F.dailyUseShare;
        applyWear(item, uses, { offline });
        floor.usesSinceDirt += uses;
        while (floor.usesSinceDirt >= CONFIG.cleaning.usesPerDirt) {
          floor.usesSinceDirt -= CONFIG.cleaning.usesPerDirt;
          spawnBranchDirt(branch, floor, academy, item, home.rng);
        }
      }
      if (offline) for (const item of floor.items) item.usesRecent = (item.usesRecent ?? 0) * 0.7;
      else broken.push(...rollBreakdowns({ items: floor.items }, home.rng).map((item) => ({ item, floor: i })));
    });
  });
  refreshBranchCapacity(home, branch);
  return broken;
}

/** Aparelhos do estilo. A reforma acrescenta mais unidades dos aparelhos de treino. */
export function branchKit(branch) {
  const kit = STYLES[branch.style].kit;
  const core = kit.filter((t) => demandCategoryOf(t));
  if (branch.level >= 3) return [...kit, ...core];
  if (branch.level === 2) return [...kit, ...core.slice(0, Math.ceil(core.length / 2))];
  return [...kit];
}

/** Melhor nível de qualidade do aparelho que o estilo pede (Premium usa profissional). */
export function kitTier(type, wanted) {
  const tiers = getEquipmentDef(type).tiers.map((t) => t.id);
  if (wanted && tiers.includes(wanted)) return wanted;
  if (wanted && tiers.includes('novo')) return 'novo';
  return tiers[0];
}

export function branchFee(state, branch) {
  return state.fee * STYLES[branch.style].feeMultiplier;
}

export function branchMonthlyCost(branch) {
  return STYLES[branch.style].monthlyCost * branchLevelDef(branch.level).costMultiplier + (branch.manager?.salary ?? 0);
}

/** Bônus de Comunidade da Matriz Histórica (a garagem do Tio Zé). */
export function historicBonus(state) {
  return hasNetwork(state) ? N.historicBonus : 0;
}

/**
 * Membros que a filial tende a ter, com cada fator legível na interface:
 * capacidade × gerente × reputação × preço × bairro × Matriz Histórica.
 */
export function branchTarget(state, branch) {
  const M = N.manager;
  const capacity = branchCapacity(branch);
  const manager = branch.manager ? M.factorBase + M.factorPerStar * branch.manager.rating : 0.25;
  const reputation = clamp(N.reputation.base + N.reputation.perStar * state.reputation, N.reputation.base, 1);
  const ratio = state.fee / eraBaseFee(state);
  const price = clamp(1 - N.feeSensitivity * (ratio - 1), 0.3, 1.15);
  const d = districtOf(branch);
  const district = d.demand * (d.likes === branch.style ? 1 + N.districtMatchBonus : 1);
  const historic = 1 + historicBonus(state);
  // Era 5: limpeza e aparelhos que o público do estilo pede também contam.
  const care = branch.floors ? branch.care ?? 1 : 1;
  const target = capacity * manager * reputation * price * district * historic * care;
  return {
    target: Math.min(capacity, target),
    factors: { capacity, manager, reputation, price, district, historic, care, match: d.likes === branch.style },
  };
}

/** Quanto do caminho até a meta a filial anda por dia (Express e Luta enchem mais rápido). */
export function branchApproach(branch) {
  return Math.min(0.5, N.dailyApproach * (STYLES[branch.style].growth ?? 1));
}

/** Resultado mensal estimado de uma filial com os membros de hoje. */
export function branchMonthly(state, branch) {
  const revenue = branch.members * branchFee(state, branch);
  const cost = branchMonthlyCost(branch);
  return { revenue, cost, result: revenue - cost };
}

export function networkMonthly(state) {
  if (!hasNetwork(state)) return { revenue: 0, cost: 0, result: 0, members: 0 };
  let revenue = 0;
  let cost = 0;
  let members = 0;
  for (const b of state.network.branches) {
    const m = branchMonthly(state, b);
    revenue += m.revenue;
    cost += m.cost;
    members += b.members;
  }
  return { revenue, cost, result: revenue - cost, members };
}

/** Motivo para não poder abrir filial no lote agora (ou null). */
export function openBlocker(state, lotId, style, candidateId) {
  if (!hasNetwork(state)) return 'As filiais chegam na Era 4 (Rede).';
  const lot = state.network.lots.find((l) => l.id === lotId);
  if (!lot) return 'Esse lote não está mais à venda.';
  if (!STYLES[style]) return 'Escolha um estilo para a filial.';
  if (!state.network.candidates.some((c) => c.id === candidateId)) return 'Escolha quem vai gerenciar a filial.';
  if (state.money < lotCost(state, lot)) return 'Saldo insuficiente para abrir a filial.';
  return null;
}

/** Abre a filial no lote. Muda o estado e devolve a filial (ou null). */
export function openBranch(state, lotId, style, candidateId) {
  if (openBlocker(state, lotId, style, candidateId)) return null;
  const net = state.network;
  const lot = net.lots.find((l) => l.id === lotId);
  const cost = lotCost(state, lot);
  const manager = net.candidates.find((c) => c.id === candidateId);
  const name = `Tio Zé ${districtName(lot)}`;
  transact(state, -cost, 'filiaisAbertura', `Abertura: ${name}`);
  net.lots = net.lots.filter((l) => l.id !== lotId);
  net.candidates = net.candidates.filter((c) => c.id !== candidateId);
  const branch = {
    id: net.nextBranchId++,
    name,
    gx: lot.gx,
    gy: lot.gy,
    district: lot.district,
    style,
    level: 1,
    manager,
    members: 0,
    invested: cost,
    openedDay: state.time.day,
  };
  branch.members = Math.round(branchTarget(state, branch).target * N.startMembersShare);
  net.branches.push(branch);
  net.opened += 1;
  refreshCandidates(state);
  ensureLots(state);
  return branch;
}

export function branchUpgradeCost(branch) {
  const next = branchLevelDef(branch.level + 1);
  if (branch.level >= MAX_BRANCH_LEVEL) return null;
  return Math.round((N.branchCost * next.upgradeRate) / N.costRoundTo) * N.costRoundTo;
}

export function upgradeBranch(state, branchId) {
  const b = state.network?.branches.find((x) => x.id === branchId);
  // Na Era 5 o terreno da filial não cresce mais: a reforma vira andar (buildFloor).
  if (b?.floors) return false;
  const cost = b && branchUpgradeCost(b);
  if (!b || cost == null || state.money < cost) return false;
  transact(state, -cost, 'filiaisAbertura', `Reforma: ${b.name} → ${branchLevelDef(b.level + 1).label}`);
  b.level += 1;
  b.invested += cost;
  return true;
}

export function changeBranchStyle(state, branchId, style) {
  const b = state.network?.branches.find((x) => x.id === branchId);
  if (!b || !STYLES[style] || b.style === style || state.money < N.styleChangeCost) return false;
  transact(state, -N.styleChangeCost, 'filiaisAbertura', `Novo estilo: ${b.name} (${STYLES[style].label})`);
  b.style = style;
  b.members = Math.round(b.members * (1 - N.styleChangeMemberLoss));
  return true;
}

export function swapManager(state, branchId, candidateId) {
  const net = state.network;
  const b = net?.branches.find((x) => x.id === branchId);
  const c = net?.candidates.find((x) => x.id === candidateId);
  if (!b || !c) return false;
  b.manager = c;
  net.candidates = net.candidates.filter((x) => x.id !== candidateId);
  refreshCandidates(state);
  return true;
}

export function branchSaleValue(branch) {
  return Math.round(branch.invested * N.sellRefundRate);
}

/** Fecha (vende) a filial: o lote volta a ficar à venda. */
export function sellBranch(state, branchId) {
  const net = state.network;
  const b = net?.branches.find((x) => x.id === branchId);
  if (!b) return 0;
  const value = branchSaleValue(b);
  transact(state, value, 'filiaisVenda', `Venda: ${b.name}`);
  net.branches = net.branches.filter((x) => x.id !== branchId);
  net.lots.push({ id: `lote-${net.nextLotNum++}`, gx: b.gx, gy: b.gy, district: b.district });
  return value;
}

/**
 * Fim do dia na rede: os membros andam em direção à meta e o caixa recebe a
 * mensalidade do dia menos os custos. Roda também offline.
 */
export function runNetworkDay(state, offline = false) {
  if (!hasNetwork(state) || !state.network.branches.length) return null;
  const days = CONFIG.time.daysPerMonth;
  let revenue = 0;
  let cost = 0;
  const broken = [];
  for (const b of state.network.branches) {
    if (b.floors) for (const x of runBranchDay(state, b, offline)) broken.push({ branch: b.name, branchId: b.id, ...x });
    const { target } = branchTarget(state, b);
    b.members = Math.max(0, b.members + (target - b.members) * branchApproach(b));
    revenue += (b.members * branchFee(state, b)) / days;
    cost += branchMonthlyCost(b) / days;
  }
  transact(state, revenue, 'filiais', 'Mensalidades das filiais');
  transact(state, -cost, 'filiaisCustos', 'Custos das filiais (gerentes e operação)');
  return { revenue, cost, broken };
}

/** Na chegada da Era 4: rede vazia, dois lotes à venda e candidatos a gerente. */
export function initNetwork(state) {
  state.network = state.network ?? createNetwork();
  ensureLots(state);
  refreshCandidates(state);
  return state.network;
}
