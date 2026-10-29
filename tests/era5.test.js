import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, MAX_ERA, eraDef } from '../game/config.js';
import { parseSave, serialize } from '../game/engine/persistence.js';
import { eraGoals, canMoveEra, performEraMove, nextEra, previewEraMove } from '../game/systems/eras.js';
import { hasNetwork, branchTarget } from '../game/systems/network.js';
import { allZones } from '../game/grid/grid.js';
import { era4WithBranches } from './helpers/academy.js';

test('Era 5 existe, com metas próprias (inclusive filiais) e planta nova', async () => {
  assert.equal(MAX_ERA, 5);
  const s = await era4WithBranches({ branches: 2 });
  assert.equal(nextEra(s), 5);
  const goals = eraGoals(s);
  const branches = goals.find((g) => g.key === 'branches');
  assert.ok(branches, 'meta de filiais');
  assert.equal(branches.value, 2);
  assert.equal(canMoveEra(s).ok, false);
  const preview = previewEraMove(s);
  assert.equal(preview.era, 5);
  assert.ok(preview.layout.zones.some((z) => z.id === 'parque_aquatico'));
});

test('mudança para o Centro Esportivo: paga, reencaixa os aparelhos e mantém a rede', async () => {
  const s = await era4WithBranches({ branches: 2 });
  const branchesBefore = s.network.branches.map((b) => ({ id: b.id, members: b.members }));
  const money = s.money;
  const summary = performEraMove(s);
  assert.equal(s.era, 5);
  assert.equal(summary.cost, eraDef(5).moveCost);
  assert.ok(s.money <= money - eraDef(5).moveCost + summary.refund + 1);
  assert.ok(hasNetwork(s), 'a rede continua');
  assert.deepEqual(s.network.branches.map((b) => b.id), branchesBefore.map((b) => b.id));
  assert.deepEqual(s.unlockedZones, ['complexo']);
  assert.ok(allZones(s).some((z) => z.id === 'pista_coberta'));
  assert.ok(s.items.length > 0, 'aparelhos foram junto');
  assert.deepEqual(s.pendingModals.at(-1), { kind: 'era', era: 5 });
  assert.ok(s.messages.some((m) => m.from === 'duda'), 'a Duda Raio aparece no mural');
  assert.equal(nextEra(s), null, 'Era 5 é a última por enquanto');

  // Mensalidade da Era 5 comparada com a base da própria era: as filiais não esvaziam.
  s.fee = CONFIG.economy.eraBaseFee['5'];
  const b = s.network.branches[0];
  assert.ok(branchTarget(s, b).factors.price >= 0.99);

  const back = parseSave(serialize(s));
  assert.equal(back.era, 5);
  assert.equal(back.network.branches.length, 2);
});

test('Atleta e aparelhos do Centro Esportivo só chegam na Era 5', async () => {
  const { profilesForEra, EQUIPMENT, PROFILES } = await import('../game/config.js');
  const { isTypeLocked } = await import('../game/systems/suggestions.js');
  const { createStudent } = await import('../game/simulation/students.js');
  const { createRng } = await import('../game/utils/random.js');
  assert.ok(!profilesForEra(4).includes('atleta'));
  assert.ok(profilesForEra(5).includes('atleta'));
  const novos = ['piscina', 'pista_corrida', 'ringue', 'banheira_gelo', 'sauna'];
  for (const type of novos) {
    assert.equal(EQUIPMENT[type].minEra, 5, type);
    assert.ok(isTypeLocked(type, 5, 4), `${type} travado na Era 4`);
  }
  assert.ok(!isTypeLocked('pista_corrida', 5, 5));
  for (const t of PROFILES.atleta.essentials) assert.ok(EQUIPMENT[t], t);
  // Na Era 5 aparecem atletas entre os novos alunos.
  const s = { era: 5, nextStudentId: 1, time: { day: 0 } };
  const rng = createRng(3);
  const profiles = new Set(Array.from({ length: 200 }, () => createStudent(s, rng).profile));
  assert.ok(profiles.has('atleta'));
});

// ---------------------------------------------------------------- filiais editáveis
async function era5Game() {
  const s = await era4WithBranches({ branches: 2, money: 900000 });
  performEraMove(s);
  s.pendingModals = [];
  return s;
}

test('na Era 5 o kit de cada filial vira o térreo: escada, recepção e aparelhos de presente', async () => {
  const { refreshBranchCapacity, branchCapacity } = await import('../game/systems/network.js');
  const s = await era5Game();
  for (const b of s.network.branches) {
    assert.equal(b.floors.length, 1);
    const types = b.floors[0].items.map((i) => i.type);
    assert.ok(types.includes('escada_filial'), 'escada no térreo');
    assert.ok(types.includes('recepcao'), 'recepção no térreo');
    assert.ok(b.floors[0].items.filter((i) => i.gift).length > 5, 'kit marcado como presente');
    assert.ok(branchCapacity(b) > 20, `capacidade pelos aparelhos (${branchCapacity(b)})`);
    assert.equal(refreshBranchCapacity(s, b), b.cap);
  }
  const back = parseSave(serialize(s));
  const b0 = back.network.branches[0];
  assert.equal(b0.floors[0].items.length, s.network.branches[0].floors[0].items.length, 'save guarda os aparelhos da filial');
  assert.ok(b0.floors[0].items.some((i) => i.gift));
});

test('editar a filial pelo jogo: comprar no andar, construir andar, vender presente e desfazer no lugar certo', async () => {
  const store = await import('../game/engine/store.js');
  const { floorCost } = await import('../game/systems/network.js');
  const s = await era5Game();
  assert.ok(store.continueFromCloud(JSON.parse(serialize(s))));
  const { game } = store;
  const b = game.state.network.branches[0];
  store.viewBranch(b.id);
  assert.ok(store.editingBranch());

  // Compra no térreo: o dinheiro sai da Matriz e o aparelho vai para a filial.
  const money = game.state.money;
  const matrizItems = game.state.items.length;
  assert.ok(store.startPlacement('halteres', 'usado'));
  let placed = false;
  for (let y = 0; y < 10 && !placed; y++) {
    for (let x = 0; x < 14 && !placed; x++) {
      store.setHover({ x, y });
      const pv = store.placementPreview();
      if (pv?.ok && !pv.warning) {
        store.clickCell({ x, y });
        placed = true;
      }
    }
  }
  assert.ok(placed, 'achou lugar no térreo');
  assert.equal(game.state.items.length, matrizItems, 'a Matriz não ganhou o aparelho');
  assert.ok(b.floors[0].items.some((i) => i.type === 'halteres' && !i.gift && i.pricePaid > 0));
  assert.ok(game.state.money < money);

  // Andar novo: paga, nasce só com a escada e o jogo sobe para ele.
  const cost = floorCost(b);
  const before = game.state.money;
  assert.ok(store.buildFloorAction(b.id));
  assert.equal(b.floors.length, 2);
  assert.equal(game.state.money, before - cost);
  assert.equal(game.ui.view.floor, 1);
  assert.deepEqual(b.floors[1].items.map((i) => i.type), ['escada_filial']);

  // Vender um presente do térreo não devolve dinheiro.
  store.viewFloor(0);
  const gift = b.floors[0].items.find((i) => i.gift);
  const m0 = game.state.money;
  store.requestSell(gift.id);
  store.resolveConfirm(true);
  assert.equal(game.state.money, m0);
  assert.ok(!b.floors[0].items.some((i) => i.id === gift.id));

  // A escada e a recepção não se movem nem se vendem.
  const stairs = b.floors[0].items.find((i) => i.type === 'escada_filial');
  store.requestSell(stairs.id);
  assert.equal(game.ui.confirm, null);

  // Desfazer só vale no lugar onde a ação foi feita.
  store.viewMatriz();
  assert.equal(store.undo(), false);
  store.viewBranch(b.id);
  assert.ok(store.undo(), 'desfaz a venda no térreo');
  assert.ok(b.floors[0].items.some((i) => i.id === gift.id));
});

test('aparelhos das filiais desgastam, quebram e derrubam a capacidade; consertar devolve', async () => {
  const { runBranchDay, refreshBranchCapacity } = await import('../game/systems/network.js');
  const s = await era5Game();
  const b = s.network.branches[0];
  b.members = b.cap;
  const item = b.floors[0].items.find((i) => i.condition > 0 && !i.fixed && i.type !== 'espelho' && i.type !== 'planta' && i.type !== 'bebedouro' && i.type !== 'ventilador' && i.type !== 'poster');
  const c0 = item.condition;
  for (let d = 0; d < 5; d++) runBranchDay(s, b, true);
  assert.ok(item.condition < c0, 'desgastou');
  assert.ok(item.condition >= Math.min(c0, CONFIG.time.offlineConditionFloor), 'offline não passa do piso');
  const capBefore = refreshBranchCapacity(s, b);
  for (const it of b.floors[0].items) if (it.condition > 0 && CONFIG.equipment[it.type].tiers[0].capacity > 0) it.condition = CONFIG.wear.brokenCondition;
  assert.ok(refreshBranchCapacity(s, b) < capBefore, 'quebrado não conta na capacidade');
  assert.ok(b.floors.some((f) => f.dirt.length > 0), 'membros deixaram sujeira');
  assert.ok(b.care < 1, 'sujeira derruba o cuidado');
});

test('anti-trapaça na Era 5: montar e construir andar honestamente passa; aparelho ou andar de graça não', async () => {
  const { auditProgress, progressMetrics } = await import('../game/online/anticheat.js');
  const { buildFloor } = await import('../game/systems/branchEdit.js');
  const s = parseSave(serialize(await era5Game()));
  const prev = progressMetrics(s);

  const honest = parseSave(serialize(s));
  buildFloor(honest, honest.network.branches[0].id);
  const r = auditProgress(prev, parseSave(serialize(honest)), { realSeconds: 30 });
  assert.equal(r.verdict, 'ok', r.reasons.join('; '));

  const freeFloor = parseSave(serialize(s));
  const fb = freeFloor.network.branches[0];
  fb.floors.push({ items: [], dirt: [] });
  assert.equal(auditProgress(prev, parseSave(serialize(freeFloor)), { realSeconds: 30 }).verdict, 'reject');

  const freeItems = parseSave(serialize(s));
  const ib = freeItems.network.branches[0];
  for (const it of ib.floors[0].items) if (it.gift) it.gift = false;
  assert.equal(auditProgress(prev, parseSave(serialize(freeItems)), { realSeconds: 30 }).verdict, 'reject', 'presentes viraram comprados');
});

test('a mudança para a Era 5 (com filiais migradas) passa na checagem do servidor', async () => {
  const { auditProgress, progressMetrics } = await import('../game/online/anticheat.js');
  const s = parseSave(serialize(await era4WithBranches({ branches: 3, money: 900000 })));
  const prev = progressMetrics(s);
  performEraMove(s);
  const r = auditProgress(prev, parseSave(serialize(s)), { realSeconds: 30 });
  assert.equal(r.verdict, 'ok', r.reasons.join('; '));
});
