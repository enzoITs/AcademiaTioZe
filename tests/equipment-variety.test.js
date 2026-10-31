import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, EQUIPMENT, PROFILES } from '../game/config.js';
import { isTypeLocked } from '../game/systems/suggestions.js';
import { EQUIPMENT_SHORT } from '../game/content/lines.js';
import { levelLook, levelColor, levelPalette } from '../game/render/levelLook.js';
import { hasEquipmentDrawing } from '../game/render/draw/equipment.js';
import { createRuntime, advanceTime } from '../game/simulation/simulation.js';
import { academy } from './helpers/academy.js';

const NEW_MACHINES = {
  3: ['maquina_gluteo', 'abdominal', 'polia', 'flexora', 'panturrilha'],
  4: ['voador', 'abdutora', 'desenvolvimento', 'hack_squat'],
  5: ['multiestacao', 'hip_thrust', 'graviton'],
};
const ALL_NEW = Object.values(NEW_MACHINES).flat();
const machinesUpTo = (era) => Object.keys(EQUIPMENT).filter(
  (t) => EQUIPMENT[t].category === 'maquinas' && (EQUIPMENT[t].minEra ?? 1) <= era,
).length;

test('máquinas novas chegam a partir da Era 3 e aumentam a cada era', () => {
  for (const [era, types] of Object.entries(NEW_MACHINES)) {
    for (const type of types) {
      const def = EQUIPMENT[type];
      assert.ok(def, type);
      assert.equal(def.category, 'maquinas', type);
      assert.equal(def.minEra, Number(era), type);
      assert.ok(def.tiers.every((t) => t.capacity > 0 && t.price > 0), type);
      assert.ok(EQUIPMENT_SHORT[type], `nome curto de ${type}`);
      assert.equal(isTypeLocked(type, 5, Number(era) - 1), true, `${type} travado antes da era`);
      assert.equal(isTypeLocked(type, 5, Number(era)), false, `${type} liberado na era`);
    }
  }
  assert.ok(machinesUpTo(2) < machinesUpTo(3));
  assert.ok(machinesUpTo(3) < machinesUpTo(4));
  assert.ok(machinesUpTo(4) < machinesUpTo(5));
});

test('máquinas novas só entram como desejo de perfis que chegam depois delas', () => {
  for (const p of Object.values(PROFILES)) {
    for (const t of [...p.essentials, ...p.desired]) {
      if (!ALL_NEW.includes(t)) continue;
      assert.ok(!p.essentials.includes(t), `${p.label} não pode exigir ${t}`);
      assert.ok((p.minEra ?? 1) >= EQUIPMENT[t].minEra, `${p.label} chega antes de ${t}`);
    }
  }
});

test('todo aparelho do catálogo tem desenho 2D e modelo 3D próprios', async () => {
  const { hasEquipmentModel } = await import('../game/render/three/models.js');
  for (const type of Object.keys(EQUIPMENT)) {
    assert.ok(hasEquipmentDrawing(type), `desenho 2D de ${type}`);
    assert.ok(hasEquipmentModel(type), `modelo 3D de ${type}`);
  }
});

test('máquinas novas têm lugar e pose para quem treina', async () => {
  const { USE_SPOT } = await import('../game/render/three/moreEquipment.js');
  for (const type of ALL_NEW) {
    assert.ok(USE_SPOT[type]?.pose?.startsWith('use-'), type);
  }
});

test('nível 1 é o visual padrão; níveis 2 e 3 trocam as cores', () => {
  assert.deepEqual(levelLook(1).remap, {});
  assert.equal(levelLook(0).level, 1);
  assert.equal(levelLook(9).level, 3);
  const pad = CONFIG && levelPalette(1).pad;
  assert.equal(levelColor(1, pad), pad);
  assert.notEqual(levelColor(2, pad), pad);
  assert.notEqual(levelColor(3, pad), pad);
  assert.notEqual(levelColor(2, pad), levelColor(3, pad));
  assert.notEqual(levelLook(1).accent, levelLook(3).accent);
});

test('modelo 3D muda de cor e ganha moldura conforme o nível', async () => {
  const { makeEquipment } = await import('../game/render/three/models.js');
  const colorsOf = (m) => {
    const out = new Set();
    for (const mesh of m.meshes) {
      const c = mesh.geometry.attributes.color.array;
      for (let i = 0; i < c.length; i += 3) out.add(`${c[i].toFixed(3)},${c[i + 1].toFixed(3)},${c[i + 2].toFixed(3)}`);
    }
    return out;
  };
  for (const type of ['supino', 'esteira', ...ALL_NEW]) {
    const [l1, l2, l3] = [1, 2, 3].map((lv) => makeEquipment(type, lv));
    const [c1, c2, c3] = [l1, l2, l3].map(colorsOf);
    assert.notDeepEqual([...c1].sort(), [...c2].sort(), `${type}: nível 2 igual ao 1`);
    assert.notDeepEqual([...c2].sort(), [...c3].sort(), `${type}: nível 3 igual ao 2`);
    const verts = (m) => m.meshes[0].geometry.attributes.position.count;
    assert.ok(verts(l2) > verts(l1), `${type}: nível 2 sem moldura`);
    assert.ok(verts(l3) > verts(l2), `${type}: nível 3 sem detalhes`);
  }
  // decoração e aparelhos sem vaga também montam em todos os níveis
  for (const type of Object.keys(EQUIPMENT).filter((t) => t !== 'poster')) {
    for (const lv of [1, 2, 3]) assert.ok(makeEquipment(type, lv).height > 0, `${type} nível ${lv}`);
  }
});

test('alunos treinam nas máquinas novas da Era 5', () => {
  const s = academy({ era: 5, maxItems: 40, students: 120, money: 50000 });
  const types = new Set(s.items.map((i) => i.type));
  const present = ALL_NEW.filter((t) => types.has(t));
  assert.ok(present.length >= 3, `poucas máquinas novas no teste: ${present.join(', ')}`);
  const rt = createRuntime(s);
  const used = new Set();
  for (let d = 0; d < 6; d++) {
    advanceTime(s, rt, 1);
    for (const [id, st] of Object.entries(rt.blockStats.perItem)) {
      if (st.uses > 0) used.add(s.items.find((i) => i.id === Number(id))?.type);
    }
  }
  assert.ok(present.some((t) => used.has(t)), 'ninguém usou as máquinas novas');
});

test('save não aceita aparelho de era futura nem id repetido na Matriz', async () => {
  const { serialize, parseSave } = await import('../game/engine/persistence.js');
  const s = academy({ era: 2, maxItems: 4 });
  const ok = s.items[0];
  s.items.push({ ...ok, id: 900, type: 'graviton', tier: 'novo', x: 0, y: 6, level: 3 });
  s.items.push({ ...s.items[1], x: s.items[1].x }); // mesmo id do segundo aparelho
  const res = parseSave(serialize(s));
  const loaded = res.state ?? res;
  assert.ok(!loaded.items.some((i) => i.type === 'graviton'), 'graviton na Era 2');
  const ids = loaded.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
});
