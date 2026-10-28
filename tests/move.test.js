import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  game, newGame, startMove, setHover, dropDrag, clickCell, nudgeSelected, undo, rotate, cancelMode, placementPreview,
} from '../game/engine/store.js';
import { refreshDerived } from '../game/simulation/simulation.js';

function setup() {
  newGame();
  const s = game.state;
  s.items.push(
    { id: 1, type: 'esteira', tier: 'usado', x: 2, y: 1, rot: 0, condition: 70, purchasedDay: 0, pricePaid: 400 },
    { id: 2, type: 'supino', tier: 'usado', x: 5, y: 1, rot: 0, condition: 70, purchasedDay: 0, pricePaid: 300 },
  );
  s.nextItemId = 3;
  refreshDerived(s, game.rt);
  return s;
}

test('arrastar: mantém o ponto agarrado e move de graça', () => {
  const s = setup();
  const money = s.money;
  startMove(1, { x: 2, y: 2 }); // agarrou a metade de baixo da esteira
  setHover({ x: 3, y: 5 });
  const pv = placementPreview();
  assert.deepEqual([pv.x, pv.y], [3, 4], 'topo fica uma célula acima do cursor');
  dropDrag({ x: 3, y: 5 });
  const item = s.items.find((i) => i.id === 1);
  assert.deepEqual([item.x, item.y], [3, 4]);
  assert.equal(s.money, money, 'mover não custa nada');
  assert.equal(game.ui.mode, 'normal');
  assert.equal(game.ui.selectedId, 1);
});

test('soltar em lugar inválido devolve o aparelho para a origem', () => {
  const s = setup();
  startMove(1, { x: 2, y: 1 });
  dropDrag({ x: 5, y: 2 }); // em cima do supino
  const item = s.items.find((i) => i.id === 1);
  assert.deepEqual([item.x, item.y], [2, 1]);
  assert.equal(game.ui.mode, 'normal');
  assert.equal(s.undo.length, 0, 'nada para desfazer');
});

test('mover pelo botão começa no mesmo lugar e desfazer volta', () => {
  const s = setup();
  startMove(2);
  const pv = placementPreview();
  assert.deepEqual([pv.x, pv.y], [5, 1], 'sem pulo ao começar');
  clickCell({ x: 1, y: 5 }); // centro do supino 2×3 vai para (1,5): topo-esquerdo (1,4)
  const item = s.items.find((i) => i.id === 2);
  assert.deepEqual([item.x, item.y], [1, 4]);
  undo();
  assert.deepEqual([item.x, item.y], [5, 1]);
});

test('setas empurram o selecionado e respeitam colisão; girar funciona sem modo edição', () => {
  const s = setup();
  game.ui.selectedId = 1;
  game.ui.editMode = false;
  assert.equal(nudgeSelected(1, 0), true);
  assert.equal(s.items[0].x, 3);
  assert.equal(nudgeSelected(1, 0), true);
  assert.equal(nudgeSelected(1, 0), false, 'bateria no supino');
  assert.equal(s.items[0].x, 4);
  rotate();
  assert.equal(s.items[0].rot, 0, 'girada encostaria no supino: bloqueado');
  nudgeSelected(-1, 0);
  rotate();
  assert.equal(s.items[0].rot, 1);
  cancelMode();
});
