// Progresso na nuvem, perfis públicos e ranking.
import { CONFIG } from '../game/config.js';
import { parseSave } from '../game/engine/persistence.js';
import { summarize, historyOf, implausible } from '../game/online/progress.js';
import { one, query } from './db.js';

/**
 * Valida e guarda o save da conta. O progresso é sempre guardado (ninguém perde o que jogou);
 * se a checagem achar um salto impossível, o perfil sai do ranking (`flagged`).
 * `baseline`: o jogador começou de novo ou trocou pelo progresso do navegador,
 * então compara com uma garagem nova em vez do save anterior.
 */
export class SaveRejected extends Error {}

export async function storeSave(userId, raw, { baseline = false } = {}) {
  let state;
  try {
    state = parseSave(raw);
  } catch (err) {
    throw new SaveRejected(err.message);
  }
  const next = summarize(state);
  const prev = await one(
    `SELECT p.day, p.money, p.students, p.era, p.sellable, p.flagged,
            extract(epoch FROM now() - p.updated_at)::float8 AS age
       FROM profiles p WHERE p.user_id = $1`,
    [userId],
  );
  const reasons = baseline || !prev ? implausible(null, next) : implausible(prev, next, prev.age);
  // Uma vez fora do ranking, só volta quando liberado no banco.
  const flagged = (prev?.flagged ?? false) || reasons.length > 0;
  const reason = reasons.length ? reasons.join('; ').slice(0, 500) : null;

  await query(
    `INSERT INTO saves (user_id, data, saved_at, updated_at) VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, saved_at = EXCLUDED.saved_at, updated_at = now()`,
    [userId, JSON.stringify(state), state.savedAt],
  );
  await query(
    `INSERT INTO profiles (user_id, money, students, matriz_students, branch_members, branches, reputation, era, day,
                           equipment, staff, sellable, history, flagged, flag_reason, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15, now())
     ON CONFLICT (user_id) DO UPDATE SET
       money = EXCLUDED.money, students = EXCLUDED.students, matriz_students = EXCLUDED.matriz_students,
       branch_members = EXCLUDED.branch_members, branches = EXCLUDED.branches, reputation = EXCLUDED.reputation,
       era = EXCLUDED.era, day = EXCLUDED.day, equipment = EXCLUDED.equipment, staff = EXCLUDED.staff,
       sellable = EXCLUDED.sellable, history = EXCLUDED.history, flagged = EXCLUDED.flagged,
       flag_reason = COALESCE(EXCLUDED.flag_reason, profiles.flag_reason), updated_at = now()`,
    [userId, next.money, next.students, next.matrizStudents, next.branchMembers, next.branches, next.reputation,
      next.era, next.day, next.equipment, next.staff, next.sellable, JSON.stringify(historyOf(state)), flagged, reason],
  );
  return { savedAt: state.savedAt, flagged, newlyFlagged: flagged && !(prev?.flagged ?? false) };
}

export async function loadSave(userId) {
  const row = await one('SELECT data, saved_at FROM saves WHERE user_id = $1', [userId]);
  return row ? { save: row.data, savedAt: row.saved_at } : null;
}

const PUBLIC_COLUMNS = `u.name, u.created_at, p.money, p.students, p.matriz_students, p.branch_members, p.branches,
  p.reputation, p.era, p.day, p.equipment, p.staff, p.flagged, p.updated_at`;

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
    flagged: row.flagged,
  };
  if (withHistory) out.history = Array.isArray(row.history) ? row.history : [];
  return out;
}

export async function profileByName(name) {
  const row = await one(
    `SELECT ${PUBLIC_COLUMNS}, p.history FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.name_key = $1`,
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
  if (row.flagged) return null;
  const col = RANK_COLUMN[by];
  const r = await one(`SELECT count(*)::int AS n FROM profiles WHERE NOT flagged AND ${col} > $1`, [row[col]]);
  return r.n + 1;
}

/** Ranking por dinheiro ou alunos, com a posição de quem está pedindo. */
export async function ranking(by, page, userId) {
  const col = RANK_COLUMN[by] ?? 'money';
  const size = CONFIG.online.rankingPageSize;
  const offset = Math.max(0, page) * size;
  const rows = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE NOT p.flagged ORDER BY p.${col} DESC, p.updated_at ASC LIMIT $1 OFFSET $2`,
    [size + 1, offset],
  );
  const total = (await one('SELECT count(*)::int AS n FROM profiles WHERE NOT flagged')).n;
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
      WHERE u.name_key LIKE $1 ORDER BY (u.name_key = $2) DESC, p.money DESC LIMIT 20`,
    [`%${term}%`, term],
  );
  return rows.map((r) => publicProfile(r));
}
