import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewGame } from '../game/engine/state.js';
import { createRuntime, advanceTime } from '../game/simulation/simulation.js';
import {
  createStaffMember, staffSalary, hireBlocker, repairQueue, runStaffRepairs,
} from '../game/systems/staff.js';
import { EQUIPMENT } from '../game/config.js';
import { EQUIPMENT_SHORT } from '../game/content/lines.js';

const item = (id, type, x, y, condition) => ({
  id, type, tier: 'usado', x, y, rot: 0, condition, purchasedDay: 0, pricePaid: 0,
});

test('todo aparelho do catálogo tem nome curto para as falas', () => {
  for (const type of Object.keys(EQUIPMENT)) assert.ok(EQUIPMENT_SHORT[type], type);
});

test('técnico é caro e exige reputação', () => {
  const s = createNewGame(7);
  s.money = 5000;
  s.reputation = 1.5;
  assert.match(hireBlocker(s, 'tecnico'), /reputação/);
  s.reputation = 3;
  s.money = 100;
  assert.match(hireBlocker(s, 'tecnico'), /Saldo/);
  s.money = 5000;
  assert.equal(hireBlocker(s, 'tecnico'), null);
  assert.equal(hireBlocker(s, 'zelador'), null);
  const m = createStaffMember(s, s.rng, 'tecnico');
  assert.equal(staffSalary(m), 1800, 'três vezes o salário do faxineiro');
});

test('técnico conserta o quebrado primeiro e depois revisa o mais gasto', () => {
  const s = createNewGame(7);
  s.items.push(item(1, 'esteira', 3, 0, 50), item(2, 'supino', 5, 0, 8), item(3, 'colchonete', 0, 0, 90));
  assert.deepEqual(repairQueue(s).map((i) => i.id), [2, 1], 'quebrado na frente; o que está bem fica de fora');
  const m = createStaffMember(s, s.rng, 'tecnico');
  m.shifts = [true, true, true];
  s.staff.push(m);
  s.time.staffFixed = 0;
  const done = runStaffRepairs(s, 0.5);
  assert.equal(done.length, 1, 'metade do turno: 1 de 2 consertos');
  assert.equal(done[0].itemId, 2);
  assert.equal(s.items[1].condition, 85, 'usado volta ao teto');
  runStaffRepairs(s, 1);
  assert.equal(s.items[0].condition, 80, 'esteira ganhou revisão (+30)');
  assert.equal(runStaffRepairs(s, 1).length, 0, 'orçamento do turno acabou');
});

test('a simulação usa o técnico ao longo dos turnos', () => {
  const s = createNewGame(7);
  s.items.push(item(1, 'esteira', 3, 0, 8));
  const m = createStaffMember(s, s.rng, 'tecnico');
  s.staff.push(m);
  const rt = createRuntime(s);
  const events = advanceTime(s, rt, 1);
  assert.ok(events.some((e) => e.type === 'staffRepair'));
  assert.ok(s.items[0].condition > 60);
});
