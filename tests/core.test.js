import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../game/config.js';
import { createNewGame } from '../game/engine/state.js';
import { validatePlacement, footprintSize, frontCells } from '../game/grid/grid.js';
import { computeAccess } from '../game/pathfinding/floodFill.js';
import { queueFraction, computeDemand } from '../game/simulation/demand.js';
import { needsScoreFor, evaluateAcademy } from '../game/simulation/academy.js';
import { cancelProbability, createStudent } from '../game/simulation/students.js';
import { createRuntime, advanceTime, catchUpOffline } from '../game/simulation/simulation.js';
import { transact, LEDGER_CATEGORIES } from '../game/economy/economy.js';
import { conditionState, effectiveCapacity } from '../game/systems/maintenance.js';
import { parseSave, serialize } from '../game/engine/persistence.js';

const item = (id, type, x, y, rot = 0, extra = {}) => ({
  id, type, tier: 'usado', x, y, rot, condition: 80, purchasedDay: 0, pricePaid: 0, ...extra,
});

test('rotação troca as dimensões do aparelho', () => {
  assert.deepEqual(footprintSize('supino', 0), { w: 2, h: 3 });
  assert.deepEqual(footprintSize('supino', 1), { w: 3, h: 2 });
  assert.equal(frontCells('esteira', 3, 2, 0)[0].y, 4);
  assert.equal(frontCells('esteira', 3, 2, 3)[0].x, 5, 'girada fica 2×1; frente à direita');
});

test('posicionamento impede colisão, fora da área, porta e exige parede para espelho', () => {
  const s = createNewGame(1);
  s.items.push(item(1, 'supino', 2, 2));
  assert.equal(validatePlacement(s, { type: 'esteira', x: 3, y: 3, rot: 0 }).ok, false);
  assert.equal(validatePlacement(s, { type: 'esteira', x: 7, y: 7, rot: 0 }).ok, false, 'sai da garagem');
  assert.equal(validatePlacement(s, { type: 'ventilador', x: CONFIG.grid.door.x, y: CONFIG.grid.door.y, rot: 0 }).ok, false, 'porta');
  assert.equal(validatePlacement(s, { type: 'espelho', x: 4, y: 3, rot: 0 }).ok, false, 'longe da parede');
  assert.equal(validatePlacement(s, { type: 'espelho', x: 0, y: 1, rot: 0 }).ok, true);
  assert.equal(validatePlacement(s, { type: 'esteira', x: 8, y: 0, rot: 0 }).ok, false, 'quintal bloqueado');
  s.unlockedZones.push('quintal');
  assert.equal(validatePlacement(s, { type: 'esteira', x: 8, y: 0, rot: 0 }).ok, true);
});

test('flood fill: aparelho cercado fica inalcançável', () => {
  const s = createNewGame(1);
  // Esteira no canto superior esquerdo, frente em (0,2); bloqueamos a frente com halteres.
  s.items.push(item(1, 'esteira', 0, 0, 0));
  let access = computeAccess(s.unlockedZones, s.items);
  assert.ok(access.reachable.has(1));
  s.items.push(item(2, 'halteres', 0, 2, 0));
  access = computeAccess(s.unlockedZones, s.items);
  assert.ok(!access.reachable.has(1), 'frente bloqueada');
  assert.ok(access.reachable.has(2));
  const academy = evaluateAcademy(s);
  assert.equal(academy.capacity.cardio, 0, 'inalcançável não conta capacidade');
  assert.ok(!academy.metTypes.has('esteira'));
});

test('fila: exemplo do documento (8,5 pessoas, capacidade 5 => 41%)', () => {
  assert.equal(Math.round(queueFraction(8.5, 5) * 100), 41);
  assert.equal(queueFraction(3, 5), 0);
  assert.equal(queueFraction(0, 0), 0);
});

test('demanda respeita blocos e segunda de peito', () => {
  const counts = { iniciante: 0, marombeiro: 10, corredor: 0 };
  const tuesday = computeDemand(counts, 2, 1).demand.peso;
  const monday = computeDemand(counts, 2, 0).demand.peso;
  assert.ok(Math.abs(tuesday - 10 * 0.7 * 0.55 * 0.8) < 1e-9);
  assert.ok(monday > tuesday);
});

test('necessidades: exemplo do Iniciante (54 → 77)', () => {
  const none = needsScoreFor('iniciante', new Set(['colchonete', 'bicicleta', 'espelho', 'bebedouro', 'leg_press']));
  assert.equal(none.total, 13);
  assert.equal(Math.round(none.score), 54);
  assert.equal(none.missingEssentials.length, 2);
  const withTreadmill = needsScoreFor('iniciante', new Set(['esteira', 'colchonete', 'bicicleta', 'espelho', 'bebedouro', 'leg_press']));
  assert.equal(Math.round(withTreadmill.score), 77);
});

test('cancelamento: S=30 => ~1,3% ao dia', () => {
  assert.ok(Math.abs(cancelProbability(30) - 0.01333) < 0.001);
  assert.equal(cancelProbability(80), 0.001);
});

test('estados de condição e capacidade efetiva', () => {
  assert.equal(conditionState(60), 'ok');
  assert.equal(conditionState(45), 'rangendo');
  assert.equal(conditionState(20), 'cansado');
  assert.equal(conditionState(10), 'quebrado');
  assert.equal(effectiveCapacity(item(1, 'supino', 0, 0, 0, { condition: 30 })), 5 * 0.75);
  assert.equal(effectiveCapacity(item(1, 'supino', 0, 0, 0, { condition: 5 })), 0);
});

test('economia: saldo = inicial + soma das transações do livro', () => {
  const s = createNewGame(7);
  s.items.push(item(1, 'esteira', 3, 0), item(2, 'supino', 5, 0), item(3, 'colchonete', 0, 0));
  const rt = createRuntime(s);
  for (let i = 0; i < 25; i++) s.students.push(createStudent(s, s.rng));
  transact(s, -400, 'equipamentos', 'teste');
  advanceTime(s, rt, 45);
  const all = [s.ledger, ...s.reports.map((r) => ({ totals: r.totals }))];
  const sum = all.reduce((acc, l) => acc + Object.values(l.totals).reduce((a, b) => a + b, 0), 0);
  assert.ok(Math.abs(s.money - (CONFIG.economy.startingMoney + sum)) < 0.05, `${s.money} vs ${CONFIG.economy.startingMoney + sum}`);
  assert.equal(s.reports.length, 1, 'um mês fechado');
  for (const cat of Object.keys(s.ledger.totals)) assert.ok(LEDGER_CATEGORIES[cat]);
});

test('simulação: academia equipada atrai alunos e reputação responde', () => {
  const s = createNewGame(3);
  s.unlockedZones.push('quintal');
  s.items.push(
    item(1, 'esteira', 0, 0), item(2, 'esteira', 1, 0), item(3, 'supino', 3, 0), item(4, 'halteres', 5, 0),
    item(5, 'colchonete', 8, 0), item(6, 'maquina_peito', 10, 0), item(7, 'bebedouro', 6, 0),
    item(8, 'rack_agachamento', 8, 4),
  );
  const rt = createRuntime(s);
  advanceTime(s, rt, 20);
  assert.ok(s.students.length > 5, `alunos: ${s.students.length}`);
  assert.ok(s.reputation !== CONFIG.reputation.start);
  assert.ok(s.dirt.length > 0, 'uso gera sujeira');
  assert.ok(s.items[0].condition < 80, 'uso gera desgaste');
});

test('sem aparelhos não há vagas nem matrículas', () => {
  const s = createNewGame(3);
  const rt = createRuntime(s);
  advanceTime(s, rt, 5);
  assert.equal(s.students.length, 0);
});

test('Vovó Dalva quita a dívida abaixo de −R$ 500', () => {
  const s = createNewGame(3);
  const rt = createRuntime(s);
  transact(s, -2100, 'equipamentos', 'teste');
  advanceTime(s, rt, 1);
  assert.ok(s.money >= 0);
  assert.equal(s.vovoCount, 1);
  assert.ok(s.ledger.totals.vovo > 0, 'transação identificável');
});

test('offline: no máximo 3 dias e nada quebra', () => {
  const s = createNewGame(5);
  s.items.push(item(1, 'esteira', 3, 0, 0, { condition: 25 }));
  for (let i = 0; i < 20; i++) s.students.push(createStudent(s, s.rng));
  const rt = createRuntime(s);
  const summary = catchUpOffline(s, rt, 999999);
  assert.equal(s.time.day, 3);
  assert.ok(summary.capped);
  assert.ok(s.items[0].condition >= CONFIG.time.offlineConditionFloor - 1e-9);
});

test('ampliações: zonas cabem na grade, não se sobrepõem e pré-requisitos existem', () => {
  const zones = CONFIG.grid.zones;
  const seen = new Set();
  for (const z of zones) {
    assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= CONFIG.grid.cols && z.y + z.h <= CONFIG.grid.rows, `${z.id} fora da grade`);
    if (z.requires) assert.ok(zones.some((o) => o.id === z.requires), `${z.id} requer zona inexistente`);
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) {
      const k = `${x},${y}`;
      assert.ok(!seen.has(k), `sobreposição em ${k}`);
      seen.add(k);
    }
  }
  // a saída da porta (célula logo abaixo) continua sendo área externa
  const { x, y } = CONFIG.grid.door;
  assert.ok(!seen.has(`${x},${y + 1}`), 'zona cobrindo a saída da porta');
  assert.ok(zones.length >= 6);
});

test('ampliação nova fica acessível pela porta através das anteriores', () => {
  const s = createNewGame(2);
  s.unlockedZones.push('quintal', 'galpao');
  s.items.push(item(1, 'esteira', 13, 1));
  assert.ok(computeAccess(s.unlockedZones, s.items).reachable.has(1));
});

test('equipe: faxineiro limpa até 6 por turno coberto e recebe salário', async () => {
  const { createStaffMember, staffSalary } = await import('../game/systems/staff.js');
  const s = createNewGame(4);
  const rt = createRuntime(s);
  const m = createStaffMember(s, s.rng);
  assert.deepEqual(m.shifts, [false, false, true], 'começa no pico (noite)');
  assert.equal(staffSalary(m), 600);
  m.shifts = [true, false, true];
  assert.equal(staffSalary(m), 600 * 1.7, 'segundo turno +70%');
  m.shifts = [false, false, true];
  s.staff.push(m);
  for (let i = 0; i < 9; i++) s.dirt.push({ id: s.nextDirtId++, x: 3.5, y: 4.5, kind: 'suor' });
  advanceTime(s, rt, 1 / 3); // manhã: ninguém no turno
  assert.equal(s.dirt.length, 9);
  advanceTime(s, rt, 1 / 3); // tarde: ninguém
  assert.equal(s.dirt.length, 9);
  advanceTime(s, rt, 1 / 6); // metade da noite: 3 limpas
  assert.equal(s.dirt.length, 6);
  advanceTime(s, rt, 1 / 6); // fim da noite: 6 no total
  assert.equal(s.dirt.length, 3);
  assert.equal(s.stats.cleanedByStaff, 6);
  assert.ok(Math.abs(s.ledger.totals.salarios + 600 / 30) < 0.01, 'um dia de salário cobrado');
});

test('save: ida e volta preserva a partida; inválidos são recusados', () => {
  const s = createNewGame(9);
  s.items.push(item(1, 'esteira', 3, 0));
  s.money = 1234;
  s.unlockedZones.push('quintal', 'galpao');
  s.staff.push({ id: 1, role: 'zelador', name: 'Cida', trait: 'x', look: { skin: '#fff' }, shifts: [true, false, true], hiredDay: 0 });
  s.staff.push({ id: 2, role: 'astronauta', name: 'X', look: {}, shifts: [true] });
  const loaded = parseSave(serialize(s));
  assert.equal(loaded.money, 1234);
  assert.equal(loaded.items.length, 1);
  assert.deepEqual(loaded.unlockedZones, ['garagem', 'quintal', 'galpao']);
  assert.equal(loaded.staff.length, 1, 'função desconhecida descartada');
  assert.deepEqual(loaded.staff[0].shifts, [true, false, true]);
  assert.throws(() => parseSave('{not json'), /JSON/);
  assert.throws(() => parseSave('{"saveVersion": 99}'), /Versão/);
  const bad = JSON.parse(serialize(s));
  bad.items.push({ id: 2, type: 'nave_espacial', x: 0, y: 0 }, { id: 3, type: 'supino', x: 3, y: 0, rot: 0 });
  assert.equal(parseSave(JSON.stringify(bad)).items.length, 1, 'item desconhecido e colisão descartados');
});
