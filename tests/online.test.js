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
const { summarize, historyOf, implausible, usernameProblem, passwordProblem, BASELINE } = await import('../game/online/progress.js');
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
  assert.ok(p.sellable >= b.invested);
  const h = historyOf(s);
  assert.deepEqual(h.map((x) => x.month), [0, 1], 'mais antigo primeiro');
});

test('checagem: progresso normal passa, saltos impossíveis não', () => {
  const prev = { day: 30, money: 4000, students: 20, era: 1, sellable: 2000 };
  assert.deepEqual(implausible(prev, { ...prev, day: 45, money: 6000, students: 28 }, 120), []);
  // 300 dias em 1 minuto: nem no ×4 dá.
  assert.ok(implausible(prev, { ...prev, day: 330 }, 60).length);
  assert.ok(implausible(prev, { ...prev, day: 20 }, 60).some((r) => r.includes('voltou')));
  assert.ok(implausible(prev, { ...prev, day: 31, money: 10_000_000 }, 60).some((r) => r.includes('saldo')));
  assert.ok(implausible(prev, { ...prev, day: 31, students: 900 }, 60).some((r) => r.includes('alunos')));
  assert.ok(implausible(prev, { ...prev, day: 31, era: 3 }, 60).some((r) => r.includes('Era')));
  // Vender tudo devolve dinheiro: não é trapaça.
  assert.deepEqual(implausible(prev, { ...prev, day: 31, money: 4000 + 2000 }, 60), []);
  // Sem tempo real (primeiro envio): compara com a garagem nova.
  assert.deepEqual(implausible(null, { ...BASELINE, day: 60, money: 9000, students: 30 }), []);
  assert.ok(implausible(null, { ...BASELINE, day: 2, money: 900000, students: 3 }).length);
});

test('servidor: guarda, monta ranking e tira do ranking quem trapaceia', async () => {
  const mk = async (name) => (await one(
    'INSERT INTO users (name, name_key, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [name, name.toLowerCase(), 'scrypt$00$00'],
  )).id;
  const ana = await mk('Ana');
  const beto = await mk('Beto');
  const caio = await mk('Caio');

  await storeSave(ana, asSave(playedGame({ money: 12000, students: 25, day: 50 })));
  await storeSave(beto, asSave(playedGame({ money: 8000, students: 40, day: 50 })));
  const honest = await storeSave(caio, asSave(playedGame({ money: 3000, students: 10, day: 20 })));
  assert.equal(honest.flagged, false);

  const byMoney = await ranking('money', 0, ana);
  assert.deepEqual(byMoney.list.map((p) => p.name), ['Ana', 'Beto', 'Caio']);
  assert.equal(byMoney.me.position, 1);
  const byStudents = await ranking('students', 0, null);
  assert.deepEqual(byStudents.list.map((p) => p.name), ['Beto', 'Ana', 'Caio']);

  // Caio manda R$ 50 milhões um dia depois: guardado, mas sai do ranking.
  const cheat = await storeSave(caio, asSave(playedGame({ money: 50_000_000, students: 10, day: 21 })));
  assert.equal(cheat.flagged, true);
  assert.equal(cheat.newlyFlagged, true);
  assert.equal((await loadSave(caio)).save.money, 50_000_000, 'o progresso não se perde');
  assert.deepEqual((await ranking('money', 0, null)).list.map((p) => p.name), ['Ana', 'Beto']);
  const flaggedProfile = await profileByName('caio');
  assert.equal(flaggedProfile.flagged, true);
  assert.equal(flaggedProfile.rank, null);
  // Continua fora mesmo voltando a números normais.
  assert.equal((await storeSave(caio, asSave(playedGame({ money: 3000, students: 10, day: 22 })))).flagged, true);

  // Perfil público: números e histórico, sem o save.
  const p = await profileByName('ANA');
  assert.equal(p.name, 'Ana');
  assert.equal(p.money, 12000);
  assert.equal(p.rank, 1);
  assert.equal(p.rankStudents, 2);
  assert.equal(p.history.length, 2);
  assert.equal(p.save, undefined);
  assert.equal(p.password_hash, undefined);

  assert.deepEqual((await searchPlayers('be')).map((x) => x.name), ['Beto']);
  assert.deepEqual(await searchPlayers("'; drop table users; --"), []);

  // Recomeçar (baseline) com o dia zerado não é "dia voltou".
  const fresh = createNewGame(3);
  const restart = await storeSave(ana, asSave(fresh), { baseline: true });
  assert.equal(restart.flagged, false);

  await assert.rejects(storeSave(ana, { nada: true }), SaveRejected);
  const count = await one('SELECT count(*)::int AS n FROM saves');
  assert.equal(count.n, 3);
  await query('SELECT 1');
});

test('limites do modo online estão no JSON', () => {
  assert.ok(CONFIG.online.plausibility.moneyMargin >= 1);
  assert.ok(CONFIG.online.cloudSaveSeconds > CONFIG.online.minSecondsBetweenSaves);
});
