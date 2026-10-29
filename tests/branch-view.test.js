import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../game/config.js';
import { createNewGame } from '../game/engine/state.js';
import { syncLayout, COLS, ROWS, DOOR, rectsOverlap } from '../game/grid/grid.js';
import { initNetwork, openBranch, STYLE_IDS } from '../game/systems/network.js';
import { branchScene, branchKit, forgetBranchScenes } from '../game/systems/branchScene.js';
import { cityPlan, THEMES } from '../game/render/cityLayout.js';
import {
  game, newGame, viewBranch, viewMatriz, inBranchView, clickCell, startPlacement, cycleBranchView, catalogEntries,
} from '../game/engine/store.js';
import { refreshDerived } from '../game/simulation/simulation.js';

function era4() {
  const s = createNewGame(21);
  s.era = 4;
  s.unlockedZones = ['predio'];
  syncLayout(s);
  s.money = 1e9;
  initNetwork(s);
  return s;
}

const addBranch = (s, style, level = 1, members = 80) => {
  if (!s.network.candidates.length) s.network.candidates = [{ id: 500 + s.network.opened, name: 'Bia', rating: 4, trait: '', salary: 2100 }];
  const b = openBranch(s, s.network.lots[0].id, style, s.network.candidates[0].id);
  b.level = level;
  b.members = members;
  return b;
};

test('mais opções: 8 estilos, 16 bairros e 4 lotes à venda', () => {
  assert.equal(STYLE_IDS.length, 8);
  for (const id of ['funcional', 'luta', 'zen', 'express']) assert.ok(STYLE_IDS.includes(id), id);
  assert.equal(CONFIG.network.districts.length, 16);
  for (const d of CONFIG.network.districts) assert.ok(THEMES[d.theme], `${d.name}: tema ${d.theme}`);
  const s = era4();
  assert.equal(s.network.lots.length, 4);
});

test('a visita monta cada estilo e nível com tudo alcançável e o gerente na recepção', () => {
  forgetBranchScenes();
  const s = era4();
  const home = { state: s };
  const before = { cols: COLS, rows: ROWS, door: { ...DOOR } };
  for (const style of STYLE_IDS) {
    for (const level of [1, 3]) {
      const b = addBranch(s, style, level);
      const scene = branchScene(home, b.id);
      const { state, rt } = scene;
      assert.equal(state.items.length, branchKit(b).length + 1, `${style} nv${level}: algum aparelho não coube`);
      assert.ok(state.items.some((i) => i.type === 'recepcao'), 'tem recepção');
      for (const i of state.items) assert.ok(rt.academy.access.reachable.has(i.id), `${style}: ${i.type} sem corredor`);
      assert.ok(state.managerSpot, `${style}: gerente sem lugar`);
      assert.equal(state.staff[0].role, 'gerente');
      assert.equal(state.students.length, 80, 'membros na tela');
      assert.ok(Object.values(rt.blockStats.perItem).some((x) => x.uses > 0), 'alguém treinando');
    }
  }
  assert.deepEqual({ cols: COLS, rows: ROWS, door: { ...DOOR } }, before, 'a grade da Matriz volta igual');
});

test('a cena acompanha a filial: membros, reforma e venda', () => {
  forgetBranchScenes();
  const s = era4();
  const home = { state: s };
  const b = addBranch(s, 'zen', 1, 30);
  const a = branchScene(home, b.id);
  assert.equal(a.state.students.length, 30);
  b.members = 55.6;
  assert.equal(branchScene(home, b.id).state.students.length, 56);
  const w1 = a.state.customLayout.zones[0].w;
  b.level = 2;
  const c = branchScene(home, b.id);
  assert.notEqual(c, a, 'reforma remonta a planta');
  assert.ok(c.state.customLayout.zones[0].w > w1, 'prédio maior');
  s.network.branches = [];
  assert.equal(branchScene(home, b.id), null);
});

test('visitando uma filial, o mapa não mexe na Matriz; a loja traz de volta', () => {
  newGame();
  const s = game.state;
  s.era = 4;
  s.unlockedZones = ['predio'];
  s.extraZones = [];
  s.shift = { x: 0, y: 0 };
  s.money = 1e7;
  s.pendingModals = [];
  initNetwork(s);
  refreshDerived(s, game.rt);
  const b1 = addBranch(s, 'luta');
  const b2 = addBranch(s, 'express');
  assert.equal(viewBranch(b1.id), true);
  assert.ok(inBranchView());
  assert.equal(game.ui.tab, 'network');
  clickCell({ x: 2, y: 2 });
  assert.equal(game.ui.selectedId, null, 'clique na filial não seleciona nada da Matriz');
  cycleBranchView(1);
  assert.equal(game.ui.view.branchId, b2.id);
  cycleBranchView(1);
  assert.equal(game.ui.view.branchId, b1.id, 'dá a volta');
  startPlacement('colchonete', 'usado');
  assert.equal(inBranchView(), false, 'comprar na loja volta para a Matriz');
  assert.equal(game.ui.mode, 'place');
  viewBranch(b2.id);
  viewMatriz();
  assert.equal(inBranchView(), false);
  assert.ok(!catalogEntries().some((e) => e.type === 'recepcao'), 'recepção não aparece na loja');
});

test('cidade: lotes não invadem a academia, as ruas nem uns aos outros', () => {
  for (const theme of Object.keys(THEMES)) {
    for (const [cols, rows] of [[16, 12], [20, 17], [10, 10]]) {
      const plan = cityPlan({ cols, rows, door: { x: 2, y: rows - 1 }, theme, seed: 7, landmarks: ['museu', 'megafit', 'armando'] });
      const academy = { x: -0.5, y: -0.5, w: cols + 1, h: rows + 3.5 };
      const rect = (l) => ({ x: l.x0, y: l.z0, w: l.x1 - l.x0, h: l.z1 - l.z0 });
      const lots = plan.lots.map(rect);
      for (const l of lots) {
        assert.ok(l.w > 0.5 && l.h > 0.5, 'lote com tamanho');
        assert.ok(!rectsOverlap(l, academy), `${theme}: lote dentro da academia`);
        for (const s of plan.streets) assert.ok(!rectsOverlap(l, rect(s)), `${theme}: lote na rua`);
      }
      for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) assert.ok(!rectsOverlap(lots[i], lots[j]), `${theme}: lotes sobrepostos`);
      if (plan.river) assert.ok(plan.bridges.length >= 2, 'rio com pontes');
    }
  }
  const a = cityPlan({ cols: 16, rows: 12, theme: 'centro', seed: 3, landmarks: ['megafit'] });
  const b = cityPlan({ cols: 16, rows: 12, theme: 'centro', seed: 3, landmarks: ['megafit'] });
  assert.deepEqual(a, b, 'mesma semente, mesma cidade');
  assert.ok(a.lots.some((l) => l.kind === 'megafit'), 'a MegaFit fica do outro lado da rua');
  const labels = a.lots.filter((l) => l.label && l.kind === 'shop').map((l) => l.label);
  assert.equal(new Set(labels).size, labels.length, 'letreiros sem repetir');
});
