import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, MAX_ERA } from '../game/config.js';
import { createNewGame } from '../game/engine/state.js';
import { createStudent } from '../game/simulation/students.js';
import { createRuntime, advanceTime } from '../game/simulation/simulation.js';
import { syncLayout, validatePlacement, COLS, ROWS } from '../game/grid/grid.js';
import { eraGoals, canMoveEra, performEraMove, nextEra } from '../game/systems/eras.js';
import {
  openBranch, branchTarget, lotCost, upgradeBranch, sellBranch, changeBranchStyle, swapManager,
  networkMonthly, STYLES, hasNetwork,
} from '../game/systems/network.js';
import { parseSave, serialize } from '../game/engine/persistence.js';

/** Prédio da Era 3 com alguns aparelhos. */
function era3() {
  const s = createNewGame(77);
  s.era = 3;
  s.unlockedZones = ['predio', 'ala_aulas'];
  syncLayout(s);
  s.money = 120000;
  s.reputation = 4.4;
  s.fee = 110;
  const want = [['esteira', 1, 1], ['bicicleta', 3, 1], ['supino', 6, 1], ['colchonete', 10, 2]];
  let id = 1;
  for (const [type, x, y] of want) {
    const it = { id, type, tier: 'usado', x, y, rot: 0, condition: 80, purchasedDay: 0, pricePaid: 300 };
    assert.ok(validatePlacement(s, it).ok, type);
    s.items.push(it);
    id += 1;
  }
  s.nextItemId = id;
  for (let i = 0; i < 40; i++) s.students.push(createStudent(s, s.rng));
  return s;
}

test('Era 4 existe e tem metas próprias', () => {
  assert.ok(MAX_ERA >= 4);
  const s = era3();
  assert.equal(nextEra(s), 4);
  const keys = eraGoals(s).map((g) => g.key);
  assert.ok(keys.includes('influencer') && keys.includes('students'));
  assert.equal(canMoveEra(s).ok, false, 'metas pendentes travam');
});

test('passagem para a Rede: sem mudança de lugar, rede criada e cerimônia', () => {
  const s = era3();
  const before = s.items.map((i) => ({ id: i.id, x: i.x, y: i.y }));
  const cols = COLS;
  const money = s.money;
  const summary = performEraMove(s);
  assert.equal(s.era, 4);
  assert.equal(summary.leftovers, 0);
  assert.deepEqual(s.items.map((i) => ({ id: i.id, x: i.x, y: i.y })), before, 'aparelhos ficam onde estão');
  assert.deepEqual(s.unlockedZones, ['predio', 'ala_aulas'], 'terrenos continuam');
  assert.equal(COLS, cols);
  assert.equal(s.money, money - CONFIG.eras['4'].moveCost);
  assert.equal(s.closedDay, null, 'sem dia de portas fechadas');
  assert.ok(hasNetwork(s));
  assert.equal(s.network.lots.length, CONFIG.network.lotsForSale);
  assert.equal(s.network.candidates.length, CONFIG.network.manager.candidates);
  assert.deepEqual(s.pendingModals.at(-1), { kind: 'era', era: 4 });
  assert.equal(nextEra(s), 5, 'depois da Rede vem o Centro Esportivo');
});

test('filial: abre num lote, nasce outro lote e rende por dia (também offline)', () => {
  const s = era3();
  performEraMove(s);
  const rt = createRuntime(s);
  const lot = s.network.lots[0];
  const cost = lotCost(s, lot);
  const cand = [...s.network.candidates].sort((a, b) => b.rating - a.rating)[0];
  const money = s.money;
  const b = openBranch(s, lot.id, 'familia', cand.id);
  assert.ok(b);
  assert.equal(s.money, money - cost);
  assert.equal(s.network.lots.length, CONFIG.network.lotsForSale, 'cada compra faz surgir outro lote');
  assert.ok(!s.network.lots.some((l) => l.id === lot.id));
  assert.equal(s.network.candidates.length, CONFIG.network.manager.candidates - 1, 'quem foi contratado sai do pool até o mês virar');
  assert.ok(lotCost(s, s.network.lots[0]) > cost / 1.3, 'a próxima filial fica mais cara');

  const { target } = branchTarget(s, b);
  assert.ok(target > 0 && target <= 120);
  const start = b.members;
  advanceTime(s, rt, 20, { offline: true });
  assert.ok(b.members > start, 'membros crescem até a meta');
  assert.ok(Math.abs(b.members - target) < Math.abs(start - target));
  assert.ok(s.ledger.totals.filiais > 0 || s.reports.some((r) => r.totals.filiais > 0), 'mensalidades das filiais no caixa');
  assert.ok(networkMonthly(s).members > 0);
});

test('mensalidade alta e gerente fraco derrubam a meta; bairro certo ajuda', () => {
  const s = era3();
  performEraMove(s);
  const lot = s.network.lots[0];
  const b = openBranch(s, lot.id, 'premium', s.network.candidates[0].id);
  const good = branchTarget(s, b).target;
  s.fee = 200;
  assert.ok(branchTarget(s, b).target < good, 'preço acima da base afasta');
  s.fee = 110;
  b.manager = { ...b.manager, rating: 1 };
  const weak = branchTarget(s, b).target;
  b.manager = { ...b.manager, rating: 5 };
  assert.ok(branchTarget(s, b).target > weak, 'gerente 5★ enche mais');
  const district = CONFIG.network.districts[b.district % CONFIG.network.districts.length];
  const liked = district.likes;
  const other = Object.keys(STYLES).find((st) => st !== liked);
  b.style = liked;
  const match = branchTarget(s, b);
  assert.equal(match.factors.match, true);
  b.style = other;
  assert.equal(branchTarget(s, b).factors.match, false);
});

test('reforma, troca de estilo, troca de gerente e venda', () => {
  const s = era3();
  performEraMove(s);
  const b = openBranch(s, s.network.lots[0].id, 'hardcore', s.network.candidates[0].id);
  const cap1 = branchTarget(s, b).factors.capacity;
  assert.ok(upgradeBranch(s, b.id));
  assert.ok(upgradeBranch(s, b.id));
  assert.equal(b.level, 3);
  assert.equal(upgradeBranch(s, b.id), false, 'nível 3 é o máximo');
  assert.equal(branchTarget(s, b).factors.capacity, cap1 * 2);
  b.members = 100;
  assert.ok(changeBranchStyle(s, b.id, 'acolhedora'));
  assert.equal(b.members, 75);
  const cand = s.network.candidates[1];
  assert.ok(swapManager(s, b.id, cand.id));
  assert.equal(b.manager.id, cand.id);
  const lots = s.network.lots.length;
  const money = s.money;
  const value = sellBranch(s, b.id);
  assert.equal(s.money, money + value);
  assert.equal(s.network.branches.length, 0);
  assert.equal(s.network.lots.length, lots + 1, 'lote volta à venda');
});

test('save guarda a rede e recusa filiais inválidas', () => {
  const s = era3();
  performEraMove(s);
  openBranch(s, s.network.lots[0].id, 'familia', s.network.candidates[0].id);
  const data = JSON.parse(serialize(s));
  data.network.branches.push({ id: 99, style: 'spa', gx: 9, gy: 9 }, { ...data.network.branches[0], id: 100 });
  const loaded = parseSave(JSON.stringify(data));
  assert.equal(loaded.era, 4);
  assert.equal(loaded.network.branches.length, 1, 'estilo desconhecido e lugar repetido ficam de fora');
  assert.deepEqual(loaded.network.branches[0], s.network.branches[0]);
  assert.equal(loaded.network.lots.length, s.network.lots.length);
  assert.equal(loaded.network.opened, 1);
  // Era 3 não tem rede
  const old = era3();
  old.network = { branches: [{ id: 1 }] };
  assert.equal(parseSave(serialize(old)).network, null);
  // ROWS continua o do prédio
  assert.ok(ROWS >= 17);
});
