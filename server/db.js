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
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Bancos criados antes: a checagem de saltos foi removida (os índices antigos caem junto com a coluna).
ALTER TABLE profiles DROP COLUMN IF EXISTS flagged, DROP COLUMN IF EXISTS flag_reason, DROP COLUMN IF EXISTS sellable;
CREATE INDEX IF NOT EXISTS profiles_money ON profiles(money DESC);
CREATE INDEX IF NOT EXISTS profiles_students ON profiles(students DESC);

-- Segurança: papel (player/admin), banimento, revisão do ranking e checagem anti-trapaça.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
-- rev: sobe quando o admin mexe no save (multa, zerar); o jogo recarrega da nuvem.
ALTER TABLE saves ADD COLUMN IF NOT EXISTS rev INTEGER NOT NULL DEFAULT 0;
-- metrics: números do último save aceito, base da checagem do próximo.
ALTER TABLE saves ADD COLUMN IF NOT EXISTS metrics JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_user ON security_events(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS admin_actions (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_actions_user ON admin_actions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notices_user ON notices(user_id) WHERE seen_at IS NULL;
`;

/**
 * Conta de administrador vinda das variáveis ADMIN_USERNAME e ADMIN_PASSWORD.
 * A variável manda: se a conta já existe, vira admin e a senha passa a ser a da variável.
 * Sem as variáveis, nenhuma conta é promovida (o site nunca cria admin sozinho).
 */
async function ensureAdmin(run) {
  const name = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !password) return;
  if (!/^[A-Za-z0-9_]{3,20}$/.test(name) || password.length < 10) {
    console.warn('[admin] ADMIN_USERNAME precisa ter 3 a 20 letras/números/_ e ADMIN_PASSWORD ao menos 10 caracteres. Admin não criado.');
    return;
  }
  const { hashPassword, checkPassword } = await import('./password.js');
  const key = name.toLowerCase();
  const rows = (await run('SELECT id, password_hash FROM users WHERE name_key = $1', [key])).rows;
  if (!rows.length) {
    await run(
      "INSERT INTO users (name, name_key, password_hash, role) VALUES ($1, $2, $3, 'admin') ON CONFLICT (name_key) DO NOTHING",
      [name, key, await hashPassword(password)],
    );
    return;
  }
  const same = await checkPassword(password, rows[0].password_hash);
  await run(
    "UPDATE users SET role = 'admin', banned_at = NULL, banned_until = NULL, ban_reason = NULL, password_hash = COALESCE($2, password_hash) WHERE id = $1",
    [rows[0].id, same ? null : await hashPassword(password)],
  );
  // Senha trocada na variável: derruba as sessões antigas.
  if (!same) await run('DELETE FROM sessions WHERE user_id = $1', [rows[0].id]);
}

/** SQL (tabela `users` com o apelido u): o banimento está valendo. Sem data de fim = para sempre. */
export const BAN_ACTIVE = '(u.banned_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until > now()))';

async function openPg() {
  const { default: pg } = await import('pg');
  const ssl = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 8 });
  await pool.query(SCHEMA);
  const run = (text, params) => pool.query(text, params);
  await ensureAdmin(run);
  return { kind: 'postgres', query: run };
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
  const run = (text, params) => lite.query(text, params);
  await ensureAdmin(run);
  return { kind: 'pglite', query: run };
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
