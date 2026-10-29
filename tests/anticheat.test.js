import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, EQUIPMENT } from '../game/config.js';
import { createNewGame } from '../game/engine/state.js';
import { parseSave, serialize } from '../game/engine/persistence.js';
import { createRuntime, advanceTime } from '../game/simulation/simulation.js';
import { transact } from '../game/economy/economy.js';
import { createStudent } from '../game/simulation/students.js';
import { performEraMove } from '../game/systems/eras.js';
import { openBranch } from '../game/systems/network.js';
import { validatePlacement } from '../game/grid/grid.js';
import { availableZones } from '../game/systems/expansion.js';
import { auditProgress, progressMetrics, auditFromScratch } from '../game/online/anticheat.js';
import { academy } from './helpers/academy.js';

const roundTrip = (s) => parseSave(serialize(s));
const maxSpeedSeconds = (days) => (days * CONFIG.time.secondsPerDay) / Math.max(...CONFIG.time.speeds);

/** Joga `chunks` vezes `days` dias, conferindo cada envio como o servidor faria (velocidade máxima). */
function playAndAudit(state, { chunks, days, each = null }) {
  let st = roundTrip(state);
  let prev = progressMetrics(st);
  let rt = createRuntime(st);
  const failures = [];
  for (let k = 0; k < chunks; k++) {
    each?.(st, k);
    advanceTime(st, rt, days);
    const next = roundTrip(st);
    const r = auditProgress(prev, next, { realSeconds: maxSpeedSeconds(days) });
    if (r.verdict !== 'ok') failures.push({ k, verdict: r.verdict, reasons: r.reasons });
    prev = r.metrics;
    st = next;
    rt = createRuntime(st);
  }
  return { failures, state: st, metrics: prev };
}

test('jogo honesto em velocidade máxima nunca é barrado (Eras 1 a 3, academia cheia)', () => {
  for (const era of [1, 2, 3]) {
    const s = academy({ era, maxItems: 40, money: 5000 });
    const { failures, metrics } = playAndAudit(s, { chunks: 30, days: 5 });
    assert.deepEqual(failures, [], `Era ${era}`);
    assert.ok(metrics.matriz > 50, `Era ${era} encheu de alunos (${metrics.matriz})`);
  }
});

test('jogo honesto com a Rede: mudança de era, filial aberta e mensalidade no máximo', () => {
  const s = academy({ era: 3, maxItems: 30, money: 200000, students: 60 });
  const { failures, metrics } = playAndAudit(s, {
    chunks: 30,
    days: 4,
    each: (st, k) => {
      if (k === 3) performEraMove(st);
      if (k === 5) openBranch(st, st.network.lots[0].id, 'premium', st.network.candidates[0].id);
      if (k === 6) st.fee = 280;
    },
  });
  assert.deepEqual(failures, []);
  assert.equal(metrics.era, 4);
  assert.ok(metrics.branchMembers > 0);
});

test('comprar, melhorar e vender aparelhos não conta como trapaça', () => {
  const s = roundTrip(academy({ maxItems: 4, money: 20000, students: 5 }));
  const prev = progressMetrics(s);
  const item = s.items[0];
  const next = EQUIPMENT[item.type].tiers.at(-1);
  transact(s, -(next.price - 0), 'equipamentos', 'upgrade');
  Object.assign(item, { tier: next.id, pricePaid: next.price });
  s.items = s.items.filter((i) => i.id !== s.items[1].id);
  transact(s, 100, 'vendas', 'venda');
  const r = auditProgress(prev, roundTrip(s), { realSeconds: 10 });
  assert.equal(r.verdict, 'ok', r.reasons.join('; '));
});

test('dinheiro editado no navegador é recusado', () => {
  const s = roundTrip(academy({ students: 20, money: 3000, day: 30 }));
  const prev = progressMetrics(s);
  s.money = 999_999_999;
  const r = auditProgress(prev, roundTrip(s), { realSeconds: 60 });
  assert.equal(r.verdict, 'reject');
  assert.match(r.reasons.join(), /patrimônio/);
});

test('aparelho "de graça", preço pago inflado e terreno sem pagar são recusados', () => {
  const base = roundTrip(academy({ maxItems: 3, money: 4000, students: 5 }));
  const prev = progressMetrics(base);

  const free = roundTrip(base);
  const tier = EQUIPMENT.esteira.tiers.at(-1);
  for (let x = 0, n = 0; x < 30 && n < 4; x++) {
    for (let y = 0; y < 30 && n < 4; y++) {
      const it = { id: 900 + n, type: 'esteira', tier: tier.id, x, y, rot: 0, condition: 100, purchasedDay: 0, pricePaid: 0 };
      if (validatePlacement(free, it).ok) {
        free.items.push(it);
        n += 1;
      }
    }
  }
  assert.ok(free.items.length > base.items.length);
  assert.equal(auditProgress(prev, roundTrip(free), { realSeconds: 10 }).verdict, 'reject');

  const inflated = roundTrip(base);
  inflated.items[0].pricePaid = 5_000_000;
  assert.equal(auditProgress(prev, roundTrip(inflated), { realSeconds: 10 }).verdict, 'reject');

  // Todas as ampliações da garagem sem pagar.
  const land = roundTrip(createNewGame(9));
  const landPrev = progressMetrics(land);
  let zones = availableZones(land);
  while (zones.length && land.unlockedZones.length < 6) {
    land.unlockedZones.push(...zones.map((z) => z.id));
    zones = availableZones(land).filter((z) => !z.procedural);
  }
  const r = auditProgress(landPrev, roundTrip(land), { realSeconds: 10 });
  assert.equal(r.verdict, 'reject', land.unlockedZones.join());
});

test('alunos acima da capacidade, dias rápidos demais e eras puladas são recusados', () => {
  const s = roundTrip(academy({ maxItems: 2, students: 2, day: 10 }));
  const prev = progressMetrics(s);

  const crowd = roundTrip(s);
  for (let i = 0; i < 400; i++) crowd.students.push(createStudent(crowd, crowd.rng));
  assert.match(auditProgress(prev, roundTrip(crowd), { realSeconds: 3600 }).reasons.join(), /alunos/);

  const fast = roundTrip(s);
  fast.time.day += 300;
  assert.match(auditProgress(prev, roundTrip(fast), { realSeconds: 20 }).reasons.join(), /dias de jogo/);

  const jump = roundTrip(s);
  jump.era = 3;
  jump.money = 1_000_000;
  assert.match(auditProgress(prev, roundTrip(jump), { realSeconds: 3600 }).reasons.join(), /pulou/);

  // Mudar de era sem pagar a mudança (Era 2 → 3 custa R$ 25 mil).
  const e2 = roundTrip(academy({ era: 2, maxItems: 4, students: 4, day: 100 }));
  const e2prev = progressMetrics(e2);
  e2.era = 3;
  assert.equal(auditProgress(e2prev, roundTrip(e2), { realSeconds: 3600 }).verdict, 'reject');
});

test('filial aberta sem pagar é recusada', () => {
  const s = roundTrip(academy({ era: 3, maxItems: 10, money: 100000, students: 30 }));
  performEraMove(s);
  const ready = roundTrip(s);
  const prev = progressMetrics(ready);
  const money = ready.money;
  openBranch(ready, ready.network.lots[0].id, 'zen', ready.network.candidates[0].id);
  ready.money = money;
  ready.network.branches[0].invested = 0;
  assert.equal(auditProgress(prev, roundTrip(ready), { realSeconds: 3600 }).verdict, 'reject');
});

test('progresso antigo do mesmo jogo é "stale"; jogo novo e convidado avançado vão para análise', () => {
  const s = roundTrip(academy({ students: 10, day: 50, money: 3000 }));
  const prev = progressMetrics(s);
  const old = roundTrip(s);
  old.time.day = 20;
  assert.equal(auditProgress(prev, roundTrip(old), { realSeconds: 10 }).verdict, 'stale');

  // Novo jogo (outra semente, dia 0): aceito na hora.
  assert.equal(auditProgress(prev, roundTrip(createNewGame(123)), { realSeconds: 10 }).verdict, 'ok');

  // Primeiro envio de um convidado já no dia 400: guardado, mas em análise.
  const guest = roundTrip(academy({ seed: 44, students: 10, day: 400, money: 9000 }));
  assert.equal(auditProgress(null, guest).verdict, 'review');
  const small = createNewGame(45);
  small.time.day = 20;
  assert.equal(auditProgress(null, roundTrip(small)).verdict, 'ok');
});

test('análise "do zero" aponta o perfil que já foi editado antes', () => {
  const honest = roundTrip(academy({ students: 20, day: 120, money: 8000 }));
  assert.deepEqual(auditFromScratch(honest), []);
  const edited = roundTrip(academy({ students: 20, day: 40, money: 50_000_000 }));
  assert.ok(auditFromScratch(edited).length > 0);
});

test('marcar aparelhos como "fixo" ou "presente" no save não burla a checagem', () => {
  const base = roundTrip(academy({ maxItems: 3, money: 4000, students: 5 }));
  const prev = progressMetrics(base);
  for (const flag of ['fixed', 'gift']) {
    const cheat = roundTrip(base);
    const tier = EQUIPMENT.esteira.tiers.at(-1);
    let n = 0;
    for (let x = 0; x < 30 && n < 4; x++) {
      for (let y = 0; y < 30 && n < 4; y++) {
        const it = { id: 900 + n, type: 'esteira', tier: tier.id, x, y, rot: 0, condition: 100, purchasedDay: 0, pricePaid: tier.price, [flag]: true };
        if (validatePlacement(cheat, it).ok) {
          cheat.items.push(it);
          n += 1;
        }
      }
    }
    const parsed = roundTrip(cheat);
    assert.ok(parsed.items.every((i) => !i.fixed && !i.gift), `${flag} removido pelo parseSave`);
    assert.equal(auditProgress(prev, parsed, { realSeconds: 10 }).verdict, 'reject', flag);
  }
});
