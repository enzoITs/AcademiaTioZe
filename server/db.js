// Conexão com o banco. Só roda no servidor (rotas em app/api).
// - Com DATABASE_URL (Railway): Postgres de verdade via `pg`.
// - Sem DATABASE_URL, fora de produção: PGlite (Postgres embutido) em .data/pglite,
//   para rodar `npm run dev` sem instalar nada.
// As tabelas são criadas na primeira conexão (CREATE TABLE IF NOT EXISTS).

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  saved_at DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  money DOUBLE PRECISION NOT NULL DEFAULT 0,
  students INTEGER NOT NULL DEFAULT 0,
  matriz_students INTEGER NOT NULL DEFAULT 0,
  branch_members INTEGER NOT NULL DEFAULT 0,
  branches INTEGER NOT NULL DEFAULT 0,
  reputation DOUBLE PRECISION NOT NULL DEFAULT 0,
  era INTEGER NOT NULL DEFAULT 1,
  day INTEGER NOT NULL DEFAULT 0,
  equipment INTEGER NOT NULL DEFAULT 0,
  staff INTEGER NOT NULL DEFAULT 0,
  sellable DOUBLE PRECISION NOT NULL DEFAULT 0,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_money ON profiles(money DESC) WHERE NOT flagged;
CREATE INDEX IF NOT EXISTS profiles_students ON profiles(students DESC) WHERE NOT flagged;
`;

async function openPg() {
  const { default: pg } = await import('pg');
  const ssl = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 8 });
  await pool.query(SCHEMA);
  return { kind: 'postgres', query: (text, params) => pool.query(text, params) };
}

async function openLite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  if (dir !== 'memory') {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
  }
  const lite = dir === 'memory' ? new PGlite() : new PGlite(dir);
  await lite.exec(SCHEMA);
  return { kind: 'pglite', query: (text, params) => lite.query(text, params) };
}

async function open() {
  if (process.env.DATABASE_URL) return openPg();
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL não configurada.');
  return openLite();
}

// Guardado no globalThis: o recarregamento do `next dev` não abre o banco duas vezes.
const KEY = Symbol.for('academia-tio-ze.db');

export function db() {
  if (!globalThis[KEY]) {
    globalThis[KEY] = open().catch((err) => {
      globalThis[KEY] = null;
      throw err;
    });
  }
  return globalThis[KEY];
}

export async function query(text, params = []) {
  const conn = await db();
  return (await conn.query(text, params)).rows;
}

export async function one(text, params = []) {
  return (await query(text, params))[0] ?? null;
}
