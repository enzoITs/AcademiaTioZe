// Progresso na nuvem, perfis públicos e ranking.
import { CONFIG } from '../game/config.js';
import { parseSave } from '../game/engine/persistence.js';
import { summarize, historyOf } from '../game/online/progress.js';
import { one, query } from './db.js';

/** Save com formato inválido (recusado por parseSave). */
export class SaveRejected extends Error {}

/** Valida o formato do save e guarda junto com os números públicos do perfil. */
export async function storeSave(userId, raw) {
  let state;
  try {
    state = parseSave(raw);
  } catch (err) {
    throw new SaveRejected(err.message);
  }
  const next = summarize(state);
  await query(
    `INSERT INTO saves (user_id, data, saved_at, updated_at) VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, saved_at = EXCLUDED.saved_at, updated_at = now()`,
    [userId, JSON.stringify(state), state.savedAt],
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
  return { savedAt: state.savedAt };
}

export async function loadSave(userId) {
  const row = await one('SELECT data, saved_at FROM saves WHERE user_id = $1', [userId]);
  return row ? { save: row.data, savedAt: row.saved_at } : null;
}

const PUBLIC_COLUMNS = `u.name, u.created_at, p.money, p.students, p.matriz_students, p.branch_members, p.branches,
  p.reputation, p.era, p.day, p.equipment, p.staff, p.updated_at`;

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
  const col = RANK_COLUMN[by];
  const r = await one(`SELECT count(*)::int AS n FROM profiles WHERE ${col} > $1`, [row[col]]);
  return r.n + 1;
}

/** Ranking por dinheiro ou alunos, com a posição de quem está pedindo. */
export async function ranking(by, page, userId) {
  const col = RANK_COLUMN[by] ?? 'money';
  const size = CONFIG.online.rankingPageSize;
  const offset = Math.max(0, page) * size;
  const rows = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM profiles p JOIN users u ON u.id = p.user_id
      ORDER BY p.${col} DESC, p.updated_at ASC LIMIT $1 OFFSET $2`,
    [size + 1, offset],
  );
  const total = (await one('SELECT count(*)::int AS n FROM profiles')).n;
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
