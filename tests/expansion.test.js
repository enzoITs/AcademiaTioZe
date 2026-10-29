import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../game/config.js';
import { createNewGame } from '../game/engine/state.js';
import { allZones, rectsOverlap, syncLayout, COLS, ROWS, DOOR, validatePlacement, currentLayout } from '../game/grid/grid.js';
import { availableZones, ensureFrontier, zoneSide } from '../game/systems/expansion.js';
import { createRuntime } from '../game/simulation/simulation.js';
import { parseSave, serialize } from '../game/engine/persistence.js';


/** Compra sempre o terreno disponível mais barato, como um jogador faria. */
function buyCheapest(state) {
  const zone = availableZones(state).sort((a, b) => a.cost - b.cost)[0];
  state.unlockedZones.push(zone.id);
  return { zone, created: ensureFrontier(state, zone.id) };
}

test('áreas infinitas: sempre há terreno à venda e cada compra no limite cria outro', () => {
  const s = createNewGame(7);
  syncLayout(s);
  let generated = 0;
  for (let i = 0; i < 60; i++) {
    const { created } = buyCheapest(s);
    generated += created.length;
    assert.ok(availableZones(s).length >= 1, `compra ${i + 1}: nada à venda`);
  }
  assert.ok(generated >= 54, `gerou só ${generated} terrenos em 60 compras`);
  // Depois dos 5 terrenos desenhados, toda compra gera um novo.
  const before = s.extraZones.length;
  const { created } = buyCheapest(s);
  assert.equal(created.length, 1);
  assert.equal(s.extraZones.length, before + 1);
});

test('terrenos gerados: sem sobreposição, fora da entrada e encostados numa área comprada', () => {
  const s = createNewGame(11);
  syncLayout(s);
  for (let i = 0; i < 40; i++) buyCheapest(s);
  const zones = allZones(s);
  const R = currentLayout().reserved;
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) assert.ok(!rectsOverlap(zones[i], zones[j]), `${zones[i].id} × ${zones[j].id}`);
  }
  for (const z of s.extraZones) {
    assert.ok(z.x >= 0 && z.y >= 0, `${z.id} com coordenada negativa`);
    const inEntrance = z.x < R.x + R.w && z.x + z.w > R.x && z.y + z.h > R.y;
    assert.ok(!inEntrance, `${z.id} invade a faixa da porta até a rua`);
    const base = zones.find((o) => o.id === z.requires);
    const touches = (z.x === base.x + base.w || base.x === z.x + z.w) && z.y < base.y + base.h && base.y < z.y + z.h
      || (z.y === base.y + base.h || base.y === z.y + z.h) && z.x < base.x + base.w && base.x < z.x + z.w;
    assert.ok(touches, `${z.id} não encosta em ${base.id}`);
  }
  // a grade cresceu para caber tudo
  assert.ok(COLS >= Math.max(...zones.map((z) => z.x + z.w)));
  assert.ok(ROWS >= Math.max(...zones.map((z) => z.y + z.h)));
  // preços sobem conforme o bairro cresce (por tile)
  const perTile = s.extraZones.map((z) => z.cost / (z.w * z.h));
  assert.ok(perTile[perTile.length - 1] > perTile[0]);
});

test('aparelho no terreno mais distante é alcançável pela porta', () => {
  const s = createNewGame(5);
  syncLayout(s);
  for (let i = 0; i < 25; i++) buyCheapest(s);
  const far = [...s.extraZones].filter((z) => s.unlockedZones.includes(z.id))
    .sort((a, b) => Math.hypot(b.x - DOOR.x, b.y - DOOR.y) - Math.hypot(a.x - DOOR.x, a.y - DOOR.y))[0];
  const item = { id: 1, type: 'colchonete', tier: 'usado', x: far.x + 1, y: far.y + 1, rot: 0, condition: 80, purchasedDay: 0, pricePaid: 0 };
  assert.ok(validatePlacement(s, item).ok);
  s.items.push(item);
  const rt = createRuntime(s);
  assert.ok(rt.academy.access.reachable.has(1), `colchonete em ${far.id} sem acesso`);
});

test('save guarda os terrenos gerados e recusa terrenos inválidos', () => {
  const s = createNewGame(3);
  syncLayout(s);
  for (let i = 0; i < 12; i++) buyCheapest(s);
  const owned = s.extraZones.find((z) => s.unlockedZones.includes(z.id));
  s.items.push({ id: 1, type: 'colchonete', tier: 'usado', x: owned.x, y: owned.y, rot: 0, condition: 80, purchasedDay: 0, pricePaid: 0 });
  const data = JSON.parse(serialize(s));
  data.extraZones.push(
    { id: 'area-999', label: 'Sobreposta', x: 0, y: 0, w: 4, h: 4, cost: 1 },
    { id: 'hack', label: 'x', x: 50, y: 50, w: 4, h: 4, cost: 1 },
    { id: 'area-998', label: 'Gigante', x: 100, y: 100, w: 300, h: 4, cost: 1 },
  );
  const loaded = parseSave(JSON.stringify(data));
  assert.equal(loaded.extraZones.length, s.extraZones.length);
  assert.deepEqual(loaded.unlockedZones, s.unlockedZones);
  assert.equal(loaded.items.length, 1, 'aparelho no terreno gerado sobrevive ao carregar');
  assert.equal(loaded.nextZoneNum, s.nextZoneNum);
});

test('dois lados: sempre há terreno à venda à esquerda e à direita', () => {
  const s = createNewGame(9);
  syncLayout(s);
  ensureFrontier(s);
  const sides = () => new Set(availableZones(s).map((z) => zoneSide(s, z)));
  assert.deepEqual([...sides()].sort(), ['left', 'right']);
  let leftBuys = 0;
  for (let i = 0; i < 30; i++) {
    buyCheapest(s);
    assert.deepEqual([...sides()].sort(), ['left', 'right'], `compra ${i + 1}`);
  }
  for (const z of allZones(s)) if (s.unlockedZones.includes(z.id) && zoneSide(s, z) === 'left') leftBuys += 1;
  assert.ok(leftBuys >= 3, `só ${leftBuys} terrenos comprados à esquerda`);
  assert.ok(s.shift.x > 0, 'a planta andou para a direita');
});

test('terreno à esquerda empurra aparelhos, sujeira e porta juntos', () => {
  const s = createNewGame(4);
  syncLayout(s);
  const doorBefore = { ...DOOR };
  s.items.push({ id: 1, type: 'colchonete', tier: 'usado', x: 3, y: 2, rot: 0, condition: 80, purchasedDay: 0, pricePaid: 0 });
  s.dirt.push({ id: 1, x: 2.5, y: 5.5, kind: 'suor' });
  ensureFrontier(s);
  const dx = s.shift.x;
  assert.ok(dx > 0, 'nasceu um terreno à esquerda');
  assert.equal(DOOR.x, doorBefore.x + dx);
  assert.equal(s.items[0].x, 3 + dx);
  assert.equal(s.dirt[0].x, 2.5 + dx);
  assert.ok(validatePlacement({ ...s, items: [] }, s.items[0]).ok, 'aparelho continua dentro da garagem');
  assert.ok(allZones(s).every((z) => z.x >= 0));
  // o save guarda o deslocamento
  const loaded = parseSave(serialize(s));
  assert.deepEqual(loaded.shift, s.shift);
  assert.equal(loaded.items.length, 1);
  syncLayout(loaded);
  assert.equal(DOOR.x, doorBefore.x + dx);
});
