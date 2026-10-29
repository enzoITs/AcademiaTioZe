import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../game/config.js';
import { game, newGame, applyDecor } from '../game/engine/store.js';
import { syncLayout, allZones } from '../game/grid/grid.js';
import { parseSave, serialize } from '../game/engine/persistence.js';
import { decorArea, decorPrice, decorOption } from '../game/systems/decor.js';
import { floorOf, lookOf, eraLook } from '../game/render/look.js';

function setup(money = 5000) {
  newGame();
  const s = game.state;
  s.extraZones = [];
  s.shift = { x: 0, y: 0 };
  syncLayout(s);
  s.money = money;
  s.pendingModals = [];
  return s;
}

test('reforma: o preço acompanha o tamanho da academia', () => {
  const s = setup();
  const garage = decorArea(s);
  assert.equal(garage.tiles, 64, 'garagem 8×8');
  assert.equal(garage.walls, 32, 'perímetro da garagem');
  assert.equal(decorPrice(s, 'floor', 'creme'), decorOption('floor', 'creme').cost * 64);
  assert.equal(decorPrice(s, 'wall', 'grafite'), decorOption('wall', 'grafite').cost * 32);
  s.unlockedZones.push('quintal');
  const bigger = decorArea(s);
  assert.ok(bigger.tiles > garage.tiles && bigger.walls > garage.walls);
  assert.ok(decorPrice(s, 'floor', 'creme') > decorOption('floor', 'creme').cost * 64);
  assert.equal(decorPrice(s, 'floor', 'nao-existe'), null);
});

test('reforma: paga, muda a cor do chão e das paredes e vai no save', () => {
  const s = setup();
  const price = decorPrice(s, 'floor', 'madeira');
  assert.equal(applyDecor('floor', 'madeira'), true);
  assert.equal(s.money, 5000 - price);
  assert.equal(s.ledger.totals.reforma, -price);
  const zone = allZones(s).find((z) => z.id === 'garagem');
  assert.deepEqual(floorOf(zone, s), decorOption('floor', 'madeira').colors);
  assert.equal(lookOf(s).wall, eraLook(1).wall, 'paredes continuam originais');

  assert.equal(applyDecor('wall', 'menta'), true);
  assert.equal(lookOf(s).wall, decorOption('wall', 'menta').color);
  // Pintar com a mesma cor não cobra de novo.
  const money = s.money;
  assert.equal(applyDecor('wall', 'menta'), false);
  assert.equal(s.money, money);

  const loaded = parseSave(serialize(s));
  assert.deepEqual(loaded.decor, { floor: 'madeira', wall: 'menta' });
  // Voltar ao original também é uma reforma (paga).
  assert.equal(applyDecor('floor', 'original'), true);
  assert.ok(s.money < money);
  assert.notDeepEqual(floorOf(zone, s), decorOption('floor', 'madeira').colors);
});

test('reforma: sem saldo não pinta; save antigo ou com cor inválida volta ao original', () => {
  const s = setup(10);
  assert.equal(applyDecor('floor', 'xadrez'), false);
  assert.equal(s.money, 10);
  assert.equal(s.decor.floor, 'original');

  const raw = JSON.parse(serialize(s));
  delete raw.decor;
  assert.deepEqual(parseSave(raw).decor, { floor: 'original', wall: 'original' });
  raw.decor = { floor: 'ouro', wall: 'grafite' };
  assert.deepEqual(parseSave(raw).decor, { floor: 'original', wall: 'grafite' });
});

test('reforma: filial visitada usa a cara do estilo, não a reforma da Matriz', () => {
  const branchState = { look: { wall: '#123456' }, decor: { floor: 'xadrez', wall: 'grafite' } };
  assert.equal(lookOf(branchState).wall, '#123456');
  assert.ok(CONFIG.decor.floors.every((f) => f.id === 'original' || f.colors?.length === 2));
  assert.ok(CONFIG.decor.walls.every((w) => w.id === 'original' || /^#[0-9a-f]{6}$/i.test(w.color)));
});
