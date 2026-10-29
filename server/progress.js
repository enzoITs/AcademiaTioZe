// Progresso na nuvem, perfis públicos e ranking.
// Todo save passa pela checagem anti-trapaça (game/online/anticheat.js) antes de ser guardado.
import { CONFIG } from '../game/config.js';
import { parseSave } from '../game/engine/persistence.js';
import { summarize, historyOf } from '../game/online/progress.js';
import { auditProgress, auditFromScratch, progressMetrics } from '../game/online/anticheat.js';
import { one, query, BAN_ACTIVE } from './db.js';

/** Save com formato inválido (recusado por parseSave). */
export class SaveRejected extends Error {}

/**
 * Save recusado pela checagem. `code`:
 *  - 'reload': o save da nuvem mudou (admin aplicou multa, zerou etc.): o jogo precisa recarregar;
 *  - 'stale': é um progresso mais antigo do que o da nuvem (outra aba ou computador);
 *  - 'cheat': números impossíveis. Fica registrado para o admin.
 */
export class SaveRefused extends Error {
  constructor(code, message, reasons = []) {
    super(message);
    this.code = code;
    this.reasons = reasons;
  }
}

/** Métricas guardadas com o save: base da próxima checagem e análise do painel do admin. */
export function fullMetrics(state, metrics = progressMetrics(state)) {
  return { ...metrics, scratch: auditFromScratch(state) };
}

/** Métricas de um save guardado antes da checagem existir. */
export function metricsOf(data) {
  try {
    return fullMetrics(parseSave(data));
  } catch {
    return null;
  }
}

export async function logEvent(userId, kind, detail, data = null) {
  await query(
    'INSERT INTO security_events (user_id, kind, detail, data) VALUES ($1, $2, $3, $4::jsonb)',
    [userId, kind, String(detail).slice(0, 1000), data ? JSON.stringify(data) : null],
  );
}

/** Guarda o save e os números públicos do perfil (sem checagem: o chamador já conferiu). */
export async function writeSave(userId, state, metrics, { bumpRev = false } = {}) {
  const next = summarize(state);
  await query(
    `INSERT INTO saves (user_id, data, saved_at, metrics, rev, updated_at) VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, saved_at = EXCLUDED.saved_at, metrics = EXCLUDED.metrics,
       rev = saves.rev + $5, updated_at = now()`,
    [userId, JSON.stringify(state), state.savedAt, JSON.stringify(metrics), bumpRev ? 1 : 0],
  );
  await query(
    `INSERT INTO profiles (user_id, money, students, matriz_students, branch_members, branches, reputation, era, day,
                           equipment, staff, history, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET
       money = EXCLUDED.money, students = EXCLUDED.students, matriz_students = EXCLUDED.matriz_students,
       branch_members = EXCLUDED.branch_members, branches = EXCLUDED.branches, reputation = EXCLUDED.reputation,
       era = EXCLUDED.era, day = EXCLUDED.day, equipment = EXCLUDED.equipment, staff = EXCLUDED.staff,
       history = EXCLUDED.history, updated_at = now()`,
    [userId, next.money, next.students, next.matrizStudents, next.branchMembers, next.branches, next.reputation,
      next.era, next.day, next.equipment, next.staff, JSON.stringify(historyOf(state))],
  );
  return (await one('SELECT rev FROM saves WHERE user_id = $1', [userId])).rev;
}

/**
 * Valida o save e guarda se passar na checagem.
 * `rev`: a versão do save da nuvem que o jogo tem (precisa bater com a do servidor).
 */
export async function storeSave(userId, raw, { rev = null } = {}) {
  const row = await one(
    `SELECT rev, metrics, CASE WHEN metrics IS NULL THEN data END AS data,
            extract(epoch FROM now() - updated_at)::float8 AS age
       FROM saves WHERE user_id = $1`,
    [userId],
  );
  if (row && rev !== row.rev) {
    throw new SaveRefused('reload', 'Seu progresso foi alterado no servidor. Carregando a versão da nuvem.');
  }
  const prev = row ? row.metrics ?? metricsOf(row.data) : null;

  let state;
  try {
    state = parseSave(raw);
  } catch (err) {
    throw new SaveRejected(err.message);
  }
  // Logo depois do parseSave (que acerta a planta da era): a checagem usa os terrenos do save.
  const audit = auditProgress(prev, state, { realSeconds: row ? row.age : null });

  if (audit.verdict === 'stale') {
    throw new SaveRefused('stale', 'Existe um progresso mais novo na nuvem (de outra aba ou computador). Carregando a versão da nuvem.', audit.reasons);
  }
  if (audit.verdict === 'reject') {
    await logEvent(userId, 'rejected', audit.reasons.join('; '), {
      from: prev ? { day: prev.day, money: prev.money, wealth: prev.wealth, students: prev.matriz } : null,
      sent: { day: audit.metrics.day, money: audit.metrics.money, wealth: audit.metrics.wealth, students: audit.metrics.matriz },
    });
    throw new SaveRefused('cheat', 'O servidor recusou este progresso: os números não batem com o jogo. Voltando ao último progresso válido.', audit.reasons);
  }

  const newRev = await writeSave(userId, state, fullMetrics(state, audit.metrics));
  if (audit.verdict === 'review') {
    await query(
      `UPDATE profiles SET hidden = true, hidden_reason = $2 WHERE user_id = $1 AND NOT hidden`,
      [userId, `Em análise: ${audit.reasons.join('; ')}`.slice(0, 300)],
    );
    await logEvent(userId, 'review', audit.reasons.join('; '), { day: audit.metrics.day, money: audit.metrics.money });
  }
  return { savedAt: state.savedAt, rev: newRev, review: audit.verdict === 'review' };
}

export async function loadSave(userId) {
  const row = await one('SELECT data, saved_at, rev FROM saves WHERE user_id = $1', [userId]);
  return row ? { save: row.data, savedAt: row.saved_at, rev: row.rev } : null;
}

const PUBLIC_COLUMNS = `u.name, u.created_at, p.money, p.students, p.matriz_students, p.branch_members, p.branches,
  p.reputation, p.era, p.day, p.equipment, p.staff, p.hidden, p.updated_at`;

/** Quem aparece no ranking: sem banimento e fora de análise. */
const LISTED = `NOT p.hidden AND NOT ${BAN_ACTIVE}`;

function publicProfile(row, withHistory = false) {
  if (!row) return null;
  const out = {
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    money: Number(row.money),
    students: row.students,
    matrizStudents: row.matriz_students,
    branchMembers: row.branch_members,
    branches: row.branches,
    reputation: Number(row.reputation),
    era: row.era,
    day: row.day,
    equipment: row.equipment,
    staff: row.staff,
  };
  if (row.hidden) out.inReview = true;
  if (withHistory) out.history = Array.isArray(row.history) ? row.history : [];
  return out;
}

export async function profileByName(name) {
  const row = await one(
    `SELECT ${PUBLIC_COLUMNS}, p.history FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.name_key = $1 AND NOT ${BAN_ACTIVE}`,
    [String(name).toLowerCase()],
  );
  if (!row) return null;
  const out = publicProfile(row, true);
  out.rank = await rankOf(row, 'money');
  out.rankStudents = await rankOf(row, 'students');
  return out;
}

const RANK_COLUMN = { money: 'money', students: 'students' };

async function rankOf(row, by) {
  if (row.hidden) return null;
  const col = RANK_COLUMN[by];
  const r = await one(
    `SELECT count(*)::int AS n FROM profiles p JOIN users u ON u.id = p.user_id WHERE ${LISTED} AND p.${col} > $1`,
    [row[col]],
  );
  return r.n + 1;
}

/** Ranking por dinheiro ou alunos, com a posição de quem está pedindo. */
export async function ranking(by, page, userId) {
  const col = RANK_COLUMN[by] ?? 'money';
  const size = CONFIG.online.rankingPageSize;
  const offset = Math.max(0, page) * size;
  const rows = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE ${LISTED} ORDER BY p.${col} DESC, p.updated_at ASC LIMIT $1 OFFSET $2`,
    [size + 1, offset],
  );
  const total = (await one(`SELECT count(*)::int AS n FROM profiles p JOIN users u ON u.id = p.user_id WHERE ${LISTED}`)).n;
  const list = rows.slice(0, size).map((r, i) => ({ ...publicProfile(r), position: offset + i + 1 }));
  let me = null;
  if (userId) {
    const row = await one(`SELECT ${PUBLIC_COLUMNS} FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`, [userId]);
    if (row) me = { ...publicProfile(row), position: await rankOf(row, col) };
  }
  return { by: col, page, pageSize: size, total, hasMore: rows.length > size, list, me };
}

export async function searchPlayers(q) {
  const term = String(q ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  if (!term) return [];
  const rows = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.name_key LIKE $1 AND NOT ${BAN_ACTIVE} ORDER BY (u.name_key = $2) DESC, p.money DESC LIMIT 20`,
    [`%${term}%`, term],
  );
  return rows.map((r) => publicProfile(r));
}
