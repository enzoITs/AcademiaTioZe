import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../game/config.js';
import {
  game, newGame, levelUpItem, requestSell, resolveConfirm, undo, refundFor, setFee, repair,
} from '../game/engine/store.js';
import { refreshDerived } from '../game/simulation/simulation.js';
import { syncLayout } from '../game/grid/grid.js';
import {
  repairCost, itemCapacity, levelUpCost, itemVibe, effectiveCapacity, MAX_LEVEL,
} from '../game/systems/maintenance.js';

function setup() {
  newGame();
  const s = game.state;
  s.extraZones = [];
  s.shift = { x: 0, y: 0 };
  syncLayout(s);
  s.money = 10000;
  s.items.push(
    { id: 1, type: 'esteira', tier: 'usado', x: 2, y: 1, rot: 0, condition: 50, purchasedDay: -5, pricePaid: 400 },
    { id: 2, type: 'planta', tier: 'usado', x: 6, y: 0, rot: 0, condition: 100, purchasedDay: -5, pricePaid: 60 },
  );
  s.nextItemId = 3;
  s.pendingModals = [];
  refreshDerived(s, game.rt);
  return s;
}

test('três níveis: capacidade sobe e o conserto fica mais caro', () => {
  const s = setup();
  const esteira = s.items[0];
  const caps = [itemCapacity(esteira)];
  const repairs = [repairCost(esteira)];
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    const cost = levelUpCost(esteira);
    const money = s.money;
    levelUpItem(1);
    assert.equal(esteira.level, lv);
    assert.equal(s.money, money - cost);
    caps.push(itemCapacity(esteira));
    repairs.push(repairCost(esteira));
  }
  assert.deepEqual(caps, [6, 8, 9]);
  assert.ok(repairs[0] < repairs[1] && repairs[1] < repairs[2], repairs.join(' < '));
  assert.equal(levelUpCost(esteira), null, 'nível 3 é o máximo');
  const money = s.money;
  levelUpItem(1);
  assert.equal(s.money, money, 'não passa do nível 3');
  assert.equal(game.rt.academy.capacity.cardio, effectiveCapacity(esteira));
  // conserto cobra o preço do nível
  const before = s.money;
  repair(1, 'repair');
  assert.equal(s.money, before - repairs[2]);
});

test('decoração melhora a vibe por nível e desfazer devolve o dinheiro', () => {
  const s = setup();
  const planta = s.items[1];
  const vibe1 = itemVibe(planta);
  const money = s.money;
  levelUpItem(2);
  assert.ok(itemVibe(planta) > vibe1);
  undo();
  assert.equal(planta.level, 1);
  assert.equal(s.money, money);
});

test('vender: melhorias entram no valor e dá para desfazer', () => {
  const s = setup();
  const base = refundFor(s.items[0]);
  levelUpItem(1);
  assert.ok(refundFor(s.items[0]) > base, 'aparelho melhorado vale mais');
  const refund = refundFor(s.items[0]);
  const money = s.money;
  requestSell(1);
  resolveConfirm(true);
  assert.equal(s.items.length, 1);
  assert.equal(s.money, money + refund);
  undo();
  assert.equal(s.items.length, 2);
  assert.equal(s.items.find((i) => i.id === 1).level, 2, 'volta com o nível');
});

test('teto da mensalidade sobe com a era', () => {
  const s = setup();
  const maxes = CONFIG.economy.feeSlider.maxByEra;
  setFee(500);
  assert.equal(s.fee, maxes['1']);
  for (const era of [2, 3, 4]) {
    s.era = era;
    setFee(500);
    assert.equal(s.fee, maxes[String(era)]);
    assert.ok(maxes[String(era)] > maxes[String(era - 1)]);
  }
  s.era = 1;
});
