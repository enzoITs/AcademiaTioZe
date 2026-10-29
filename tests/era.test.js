import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewGame } from '../game/engine/state.js';
import { createStudent } from '../game/simulation/students.js';
import { createRuntime, advanceTime } from '../game/simulation/simulation.js';
import { syncLayout, validatePlacement, DOOR, COLS } from '../game/grid/grid.js';
import { computeAccess } from '../game/pathfinding/floodFill.js';
import { eraGoals, canMoveEra, performEraMove, previewEraMove } from '../game/systems/eras.js';
import { applyDailyEconomy } from '../game/economy/economy.js';
import { parseSave, serialize } from '../game/engine/persistence.js';
import { canHire } from '../game/systems/staff.js';

/** Garagem pronta para a mudança: metas batidas e aparelhos espalhados. */
function readyGarage() {
  const s = createNewGame(42);
  s.unlockedZones.push('quintal', 'puxadinho');
  syncLayout(s);
  s.money = 6000;
  s.reputation = 3.6;
  const want = [
    ['esteira', 0, 0], ['esteira', 1, 0], ['bicicleta', 2, 0], ['supino', 4, 0], ['halteres', 6, 0],
    ['colchonete', 5, 5], ['maquina_peito', 8, 0], ['rack_agachamento', 8, 4], ['bebedouro', 0, 4], ['espelho', 11, 0],
  ];
  let id = 1;
  for (const [type, x, y] of want) {
    const it = { id, type, tier: 'usado', x, y, rot: 0, condition: 55 + id, purchasedDay: 0, pricePaid: 100 };
    if (validatePlacement(s, it).ok) {
      s.items.push(it);
      id += 1;
    }
  }
  s.nextItemId = id;
  for (let i = 0; i < 60; i++) s.students.push(createStudent(s, s.rng));
  return s;
}

test('metas da Era 2 travam a mudança até serem batidas', () => {
  const s = createNewGame(1);
  assert.equal(canMoveEra(s).ok, false);
  assert.ok(eraGoals(s).every((g) => !g.done));
  const ready = readyGarage();
  assert.ok(eraGoals(ready).every((g) => g.done), JSON.stringify(eraGoals(ready)));
  assert.equal(canMoveEra(ready).ok, true);
  ready.money = 100;
  assert.match(canMoveEra(ready).reason, /Saldo/);
});

test('a prévia não mexe na grade da partida', () => {
  const s = readyGarage();
  const before = { cols: COLS, door: { ...DOOR } };
  const pv = previewEraMove(s);
  assert.equal(pv.era, 2);
  assert.equal(pv.placed.length + pv.leftovers.length, s.items.length);
  assert.equal(COLS, before.cols);
  assert.deepEqual({ ...DOOR }, before.door);
});

test('mudança para o ponto de bairro leva os aparelhos e cobra a caução', () => {
  const s = readyGarage();
  const items = s.items.map((i) => ({ id: i.id, tier: i.tier, condition: i.condition }));
  const money = s.money;
  const summary = performEraMove(s);
  assert.equal(s.era, 2);
  assert.deepEqual(s.unlockedZones, ['ponto']);
  assert.equal(summary.leftovers, 0);
  assert.equal(s.money, money - 1500);
  assert.deepEqual({ ...DOOR }, { x: 2, y: 11 }, 'porta nova');
  // usado continua usado, condição se mantém, e tudo cabe com corredor
  for (const old of items) {
    const it = s.items.find((i) => i.id === old.id);
    assert.equal(it.tier, old.tier);
    assert.equal(it.condition, old.condition);
    assert.ok(validatePlacement({ ...s, items: s.items.filter((o) => o.id !== it.id) }, it).ok, it.type);
  }
  const access = computeAccess(s.unlockedZones, s.items);
  assert.ok(s.items.every((i) => access.reachable.has(i.id)), 'todos alcançáveis');
  assert.equal(s.closedDay, s.time.day);
  assert.ok(s.students.every((st) => st.novelty?.bonus === 8 && st.novelty.days === 7));
  assert.deepEqual(s.pendingModals.at(-1), { kind: 'era', era: 2 });
});

test('dia fechado sem mensalidade; depois aluguel e mensalidade', () => {
  const s = readyGarage();
  performEraMove(s);
  s.ledger.totals = {};
  applyDailyEconomy(s);
  assert.equal(s.ledger.totals.mensalidades, undefined, 'fechado no dia da mudança');
  assert.equal(s.ledger.totals.aluguel, -50, 'R$ 1.500/mês ÷ 30');
  s.time.day += 1;
  applyDailyEconomy(s);
  assert.ok(s.ledger.totals.mensalidades > 0);
});

test('Idoso só aparece na Era 2; equipe cresce para 6', () => {
  const s = createNewGame(9);
  for (let i = 0; i < 200; i++) assert.notEqual(createStudent(s, s.rng).profile, 'idoso');
  s.era = 2;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const st = createStudent(s, s.rng);
    seen.add(st.profile);
    if (st.profile === 'idoso') assert.equal(st.look.age, 'senior');
  }
  assert.ok(seen.has('idoso'));
  s.staff = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
  assert.equal(canHire(s), true);
  syncLayout(createNewGame(1));
});

test('save da Era 2 volta igual e a simulação roda no ponto novo', () => {
  const s = readyGarage();
  performEraMove(s);
  const loaded = parseSave(serialize(s));
  assert.equal(loaded.era, 2);
  assert.equal(loaded.items.length, s.items.length);
  assert.deepEqual(loaded.unlockedZones, ['ponto']);
  const rt = createRuntime(loaded);
  advanceTime(loaded, rt, 2);
  assert.ok(loaded.students.length >= 60);
  syncLayout(createNewGame(1));
});

test('Era 3: compra do prédio leva tudo, libera ring light e Influencer', async () => {
  const { isTypeLocked } = await import('../game/systems/suggestions.js');
  const { createStaffMember } = await import('../game/systems/staff.js');
  const s = readyGarage();
  performEraMove(s);
  s.unlockedZones.push('sala_fundos', 'sobreloja');
  syncLayout(s);
  assert.equal(canMoveEra(s).ok, false, 'metas da Era 3 ainda não batidas');
  // mais tipos de aparelho espalhados pelo ponto
  const extra = ['remo', 'eliptico', 'kettlebell', 'saco_pancada', 'barra_fixa', 'planta', 'geladeira', 'caixa_som'];
  let id = s.nextItemId;
  for (const type of extra) {
    let done = false;
    for (let y = 0; y < 12 && !done; y++) {
      for (let x = 0; x < 22 && !done; x++) {
        const it = { id, type, tier: 'usado', x, y, rot: 0, condition: 90, purchasedDay: 0, pricePaid: 100 };
        if (validatePlacement(s, it).ok) {
          s.items.push(it);
          id += 1;
          done = true;
        }
      }
    }
  }
  s.nextItemId = id;
  while (s.students.length < 150) s.students.push(createStudent(s, s.rng, s.students.length % 5 === 0 ? 'idoso' : null));
  for (let i = 0; i < 3; i++) s.staff.push(createStaffMember(s, s.rng));
  s.reputation = 4.2;
  s.money = 40000;
  assert.ok(isTypeLocked('ring_light', 5, 2), 'ring light só na Era 3');
  const goals = eraGoals(s);
  assert.ok(goals.every((g) => g.done), JSON.stringify(goals));
  const count = s.items.length;
  const summary = performEraMove(s);
  assert.equal(s.era, 3);
  assert.deepEqual(s.unlockedZones, ['predio']);
  assert.equal(summary.moved, count);
  assert.equal(s.money, 40000 - 25000);
  assert.deepEqual({ ...DOOR }, { x: 3, y: 15 });
  const access = computeAccess(s.unlockedZones, s.items);
  assert.ok(s.items.every((i) => access.reachable.has(i.id)));
  assert.equal(isTypeLocked('ring_light', 5, 3), false);
  s.ledger.totals = {};
  s.time.day += 1;
  applyDailyEconomy(s);
  assert.ok(Math.abs(s.ledger.totals.aluguel + 800 / 30) < 0.02, 'IPTU e manutenção');
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(createStudent(s, s.rng).profile);
  assert.ok(seen.has('influencer'));
  syncLayout(createNewGame(1));
});
