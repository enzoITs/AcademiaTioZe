import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory';
process.env.ADMIN_USERNAME = 'Chefe';
process.env.ADMIN_PASSWORD = 'senha-forte-do-admin';
delete process.env.DATABASE_URL;

const { CONFIG } = await import('../game/config.js');
const { createNewGame } = await import('../game/engine/state.js');
const { serialize } = await import('../game/engine/persistence.js');
const { syncLayout } = await import('../game/grid/grid.js');
const { createStudent } = await import('../game/simulation/students.js');
const { initNetwork, openBranch } = await import('../game/systems/network.js');
const { summarize, historyOf, usernameProblem, passwordProblem } = await import('../game/online/progress.js');
const { query, one, BAN_ACTIVE } = await import('../server/db.js');
const { storeSave, loadSave, ranking, profileByName, searchPlayers, SaveRejected, SaveRefused } = await import('../server/progress.js');
const { listUsers, userDetail, applyAction, AdminError } = await import('../server/admin.js');

/** Garagem nova num dia qualquer: possível de alcançar jogando (sem aparelhos de graça). */
function fresh({ seed = 1, day = 0, money = 1500 } = {}) {
  const s = createNewGame(seed);
  s.time.day = day;
  s.money = money;
  return s;
}

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

test('servidor: guarda, recusa trapaça, monta ranking e respeita a versão do save', async () => {
  const mk = async (name) => (await one(
    'INSERT INTO users (name, name_key, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [name, name.toLowerCase(), 'scrypt$00$00'],
  )).id;
  const ana = await mk('Ana');
  const beto = await mk('Beto');
  const caio = await mk('Caio');
  // Finge que o último save foi há uma hora (o relógio do servidor limita os dias de jogo).
  const hourAgo = (id) => query("UPDATE saves SET updated_at = now() - interval '1 hour' WHERE user_id = $1", [id]);

  await storeSave(ana, asSave(fresh({ seed: 1, day: 30, money: 3400 })));
  await storeSave(beto, asSave(fresh({ seed: 2, day: 30, money: 3000 })));
  await storeSave(caio, asSave(fresh({ seed: 3, day: 10, money: 2000 })));

  const byMoney = await ranking('money', 0, ana);
  assert.deepEqual(byMoney.list.map((p) => p.name), ['Ana', 'Beto', 'Caio']);
  assert.equal(byMoney.me.position, 1);

  // Caio edita o dinheiro pelo navegador: recusado, nada muda e fica registrado.
  await hourAgo(caio);
  const cheat = fresh({ seed: 3, day: 11, money: 50_000_000 });
  await assert.rejects(storeSave(caio, asSave(cheat), { rev: 0 }), (err) => err instanceof SaveRefused && err.code === 'cheat');
  assert.equal((await loadSave(caio)).save.money, 2000);
  const ev = await one("SELECT count(*)::int AS n FROM security_events WHERE user_id = $1 AND kind = 'rejected'", [caio]);
  assert.equal(ev.n, 1);
  assert.deepEqual((await ranking('money', 0, null)).list.map((p) => p.name), ['Ana', 'Beto', 'Caio']);

  // Progresso honesto continua sendo aceito.
  const ok = await storeSave(caio, asSave(fresh({ seed: 3, day: 12, money: 1900 })), { rev: 0 });
  assert.equal(ok.rev, 0);
  // Versão errada (o admin mexeu no save): o jogo precisa recarregar.
  await assert.rejects(storeSave(caio, asSave(fresh({ seed: 3, day: 13 })), { rev: 5 }), (err) => err.code === 'reload');
  // Progresso mais antigo do mesmo jogo (outra aba): não sobrescreve.
  await hourAgo(caio);
  await assert.rejects(storeSave(caio, asSave(fresh({ seed: 3, day: 5 })), { rev: 0 }), (err) => err.code === 'stale');

  // Perfil público: números e histórico, sem o save.
  const p = await profileByName('ANA');
  assert.equal(p.name, 'Ana');
  assert.equal(p.rank, 1);
  assert.equal(p.save, undefined);
  assert.equal(p.password_hash, undefined);
  assert.deepEqual((await searchPlayers('be')).map((x) => x.name), ['Beto']);
  assert.deepEqual(await searchPlayers("'; drop table users; --"), []);

  // Convidado que entra já avançado: guardado, mas fora do ranking até o admin liberar.
  const dani = await mk('Dani');
  const guest = await storeSave(dani, asSave(fresh({ seed: 9, day: 300, money: 1500 })));
  assert.equal(guest.review, true);
  assert.equal((await profileByName('dani')).inReview, true);
  assert.ok(!(await ranking('money', 0, null)).list.some((x) => x.name === 'Dani'));

  // Recomeçar do zero é aceito.
  await storeSave(ana, asSave(createNewGame(3)), { rev: 0 });
  assert.equal((await profileByName('ana')).day, 0);

  await assert.rejects(storeSave(beto, { nada: true }, { rev: 0 }), SaveRejected);
});

test('admin: multa, zerar, tirar do ranking e banir', async () => {
  const admin = await one("SELECT id, name, role FROM users WHERE name_key = 'chefe'");
  assert.equal(admin?.role, 'admin', 'conta criada pelas variáveis ADMIN_USERNAME/ADMIN_PASSWORD');
  const eva = (await one(
    "INSERT INTO users (name, name_key, password_hash) VALUES ('Eva', 'eva', 'x') RETURNING id",
  )).id;
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('t-eva', $1, now() + interval '1 day')", [eva]);
  await storeSave(eva, asSave(fresh({ seed: 11, day: 40, money: 3500 })));

  const list = await listUsers({ q: 'ev' });
  assert.deepEqual(list.list.map((u) => u.name), ['Eva']);

  // Multa: tira do saldo, muda a versão do save e deixa um aviso para o jogador.
  await applyAction(admin, 'eva', { action: 'fine', amount: 2000, message: 'editou o jogo' });
  const fined = await loadSave(eva);
  assert.equal(fined.save.money, 1500);
  assert.equal(fined.rev, 1);
  const note = await one('SELECT text FROM notices WHERE user_id = $1', [eva]);
  assert.match(note.text, /multa/);
  // Multa maior que o saldo para no zero.
  await applyAction(admin, 'eva', { action: 'fine', amount: 1e9 });
  assert.equal((await loadSave(eva)).save.money, 0);

  await applyAction(admin, 'eva', { action: 'hide', message: 'suspeita' });
  assert.ok(!(await ranking('money', 0, null)).list.some((x) => x.name === 'Eva'));
  await applyAction(admin, 'eva', { action: 'unhide' });
  assert.ok((await ranking('money', 0, null)).list.some((x) => x.name === 'Eva'));

  await applyAction(admin, 'eva', { action: 'reset', message: 'trapaça' });
  const reset = await loadSave(eva);
  assert.equal(reset.save.time.day, 0);
  assert.equal(reset.rev, 3);

  await applyAction(admin, 'eva', { action: 'ban', message: 'trapaça repetida', days: 7 });
  const banned = await one(`SELECT ${BAN_ACTIVE} AS banned FROM users u WHERE u.id = $1`, [eva]);
  assert.equal(banned.banned, true);
  assert.equal(await profileByName('eva'), null);
  assert.ok(!(await ranking('money', 0, null)).list.some((x) => x.name === 'Eva'));
  assert.equal((await listUsers({ filter: 'banned' })).list[0].name, 'Eva');
  await applyAction(admin, 'eva', { action: 'unban' });
  assert.ok(await profileByName('eva'));

  const detail = await userDetail('eva');
  assert.deepEqual(detail.actions.map((a) => a.action).sort(), ['ban', 'fine', 'fine', 'hide', 'reset', 'unban', 'unhide']);
  await assert.rejects(applyAction(admin, 'chefe', { action: 'ban', message: 'x' }), AdminError, 'admin não pune admin');
  await assert.rejects(applyAction(admin, 'eva', { action: 'warn' }), AdminError, 'advertência sem texto');
});

test('limites do modo online estão no JSON', () => {
  assert.ok(CONFIG.online.anticheat.incomeMargin >= 1);
  assert.ok(CONFIG.online.cloudSaveSeconds > CONFIG.online.minSecondsBetweenSaves);
});
