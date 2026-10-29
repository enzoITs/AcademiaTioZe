import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory';
delete process.env.DATABASE_URL;

const { CONFIG } = await import('../game/config.js');
const { createNewGame } = await import('../game/engine/state.js');
const { serialize } = await import('../game/engine/persistence.js');
const { syncLayout } = await import('../game/grid/grid.js');
const { createStudent } = await import('../game/simulation/students.js');
const { initNetwork, openBranch } = await import('../game/systems/network.js');
const { summarize, historyOf, usernameProblem, passwordProblem } = await import('../game/online/progress.js');
const { query, one } = await import('../server/db.js');
const { storeSave, loadSave, ranking, profileByName, searchPlayers, SaveRejected } = await import('../server/progress.js');

function playedGame({ day = 40, money = 9000, students = 30, era = 1 } = {}) {
  const s = createNewGame(7);
  s.era = era;
  if (era >= 2) s.unlockedZones = ['ponto'];
  syncLayout(s);
  s.time.day = day;
  s.money = money;
  for (let i = 0; i < students; i++) s.students.push(createStudent(s, s.rng));
  s.reports = [
    { monthIndex: 1, label: 'Abr · Ano 1', closing: money, students, reputation: 3 },
    { monthIndex: 0, label: 'Mar · Ano 1', closing: 2000, students: 10, reputation: 2.5 },
  ];
  return s;
}

const asSave = (s) => JSON.parse(serialize(s));

test('apelido e senha', () => {
  assert.equal(usernameProblem('tio_ze'), null);
  assert.ok(usernameProblem('ab'));
  assert.ok(usernameProblem('com espaço'));
  assert.ok(usernameProblem('joão'));
  assert.equal(passwordProblem('123456'), null);
  assert.ok(passwordProblem('123'));
});

test('resumo do perfil soma Matriz e filiais', () => {
  const s = playedGame({ era: 4, students: 50, money: 500000, day: 400 });
  s.unlockedZones = ['predio'];
  syncLayout(s);
  initNetwork(s);
  s.network.candidates = [{ id: 1, name: 'Bia', rating: 4, trait: '', salary: 2100 }];
  const b = openBranch(s, s.network.lots[0].id, 'zen', 1);
  b.members = 70.4;
  const p = summarize(s);
  assert.equal(p.matrizStudents, 50);
  assert.equal(p.branchMembers, 70);
  assert.equal(p.students, 120);
  assert.equal(p.branches, 1);
  const h = historyOf(s);
  assert.deepEqual(h.map((x) => x.month), [0, 1], 'mais antigo primeiro');
});

test('servidor: guarda, monta ranking e aceita qualquer salto de progresso', async () => {
  const mk = async (name) => (await one(
    'INSERT INTO users (name, name_key, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [name, name.toLowerCase(), 'scrypt$00$00'],
  )).id;
  const ana = await mk('Ana');
  const beto = await mk('Beto');
  const caio = await mk('Caio');

  await storeSave(ana, asSave(playedGame({ money: 12000, students: 25, day: 50 })));
  await storeSave(beto, asSave(playedGame({ money: 8000, students: 40, day: 50 })));
  await storeSave(caio, asSave(playedGame({ money: 3000, students: 10, day: 20 })));

  const byMoney = await ranking('money', 0, ana);
  assert.deepEqual(byMoney.list.map((p) => p.name), ['Ana', 'Beto', 'Caio']);
  assert.equal(byMoney.me.position, 1);
  const byStudents = await ranking('students', 0, null);
  assert.deepEqual(byStudents.list.map((p) => p.name), ['Beto', 'Ana', 'Caio']);

  // Caio manda R$ 50 milhões um dia depois: não há checagem de salto, vai para o topo.
  await storeSave(caio, asSave(playedGame({ money: 50_000_000, students: 10, day: 21 })));
  assert.equal((await loadSave(caio)).save.money, 50_000_000);
  assert.deepEqual((await ranking('money', 0, null)).list.map((p) => p.name), ['Caio', 'Ana', 'Beto']);
  assert.equal((await profileByName('caio')).rank, 1);

  // Perfil público: números e histórico, sem o save.
  const p = await profileByName('ANA');
  assert.equal(p.name, 'Ana');
  assert.equal(p.money, 12000);
  assert.equal(p.rank, 2);
  assert.equal(p.rankStudents, 2);
  assert.equal(p.flagged, undefined);
  assert.equal(p.history.length, 2);
  assert.equal(p.save, undefined);
  assert.equal(p.password_hash, undefined);

  assert.deepEqual((await searchPlayers('be')).map((x) => x.name), ['Beto']);
  assert.deepEqual(await searchPlayers("'; drop table users; --"), []);

  // Recomeçar com o dia zerado também é aceito.
  await storeSave(ana, asSave(createNewGame(3)));
  assert.equal((await profileByName('ana')).day, 0);

  await assert.rejects(storeSave(ana, { nada: true }), SaveRejected);
  const count = await one('SELECT count(*)::int AS n FROM saves');
  assert.equal(count.n, 3);
  await query('SELECT 1');
});

test('limites do modo online estão no JSON', () => {
  assert.equal(CONFIG.online.plausibility, undefined);
  assert.ok(CONFIG.online.cloudSaveSeconds > CONFIG.online.minSecondsBetweenSaves);
});
