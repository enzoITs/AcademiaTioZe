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
  assert.equal(s.items[0].rot, 1, 'gira pelo centro e escorrega para longe do supino');
  assert.deepEqual([s.items[0].x, s.items[0].y], [3, 1], 'encaixe livre mais próximo');
  rotate();
  assert.equal(s.items[0].rot, 2);
  assert.deepEqual([s.items[0].x, s.items[0].y], [3, 1], 'empate fica no canto atual');
  cancelMode();
});

test('girar no lugar não deixa o aparelho fugir para longe', () => {
  const s = setup();
  // Esteira encurralada entre paredes e outros aparelhos: nenhum giro cabe.
  s.items.push(
    { id: 3, type: 'supino', tier: 'usado', x: 0, y: 3, rot: 0, condition: 70, purchasedDay: 0, pricePaid: 300 },
  );
  game.ui.selectedId = 1;
  const before = { ...s.items[0] };
  rotate();
  const after = s.items[0];
  assert.ok(Math.abs(after.x - before.x) <= 2 && Math.abs(after.y - before.y) <= 2);
  cancelMode();
});
