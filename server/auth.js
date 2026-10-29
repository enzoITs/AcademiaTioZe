// Contas e sessões: senha com scrypt e token aleatório em cookie httpOnly.
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { CONFIG } from '../game/config.js';
import { one, query, BAN_ACTIVE } from './db.js';

export { hashPassword, checkPassword } from './password.js';

export const SESSION_COOKIE = 'atz_session';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Cria a sessão no banco e grava o cookie. */
export async function startSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const days = CONFIG.online.sessionDays;
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, days],
  );
  // Aproveita para limpar sessões vencidas.
  await query('DELETE FROM sessions WHERE expires_at < now()');
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: days * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Dono da sessão atual (mesmo banido), ou null. */
export async function sessionUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return one(
    `SELECT u.id, u.name, u.role, u.created_at, u.ban_reason, u.banned_until, ${BAN_ACTIVE} AS banned
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
}

/** Usuário da sessão atual, ou null (banidos contam como deslogados). */
export async function currentUser() {
  const user = await sessionUser();
  return user && !user.banned ? user : null;
}

/** Usuário da sessão se for admin; senão null. */
export async function currentAdmin() {
  const user = await currentUser();
  return user?.role === 'admin' ? user : null;
}

/** O que o jogador vê sobre o próprio banimento. */
export function banInfo(row) {
  return { reason: row.ban_reason || 'Trapaça ou abuso das regras.', until: row.banned_until ?? null };
}

export function banMessage(row) {
  const { reason, until } = banInfo(row);
  const when = until ? `até ${new Date(until).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'permanentemente';
  return `Esta conta foi banida ${when}. Motivo: ${reason}`;
}

/** Dados da conta que o navegador recebe. */
export function publicUser(row) {
  return { name: row.name, role: row.role === 'admin' ? 'admin' : 'player' };
}

/** Avisos da administração ainda não vistos (e marca como vistos). */
export async function takeNotices(userId) {
  const rows = await query(
    `UPDATE notices SET seen_at = now() WHERE user_id = $1 AND seen_at IS NULL RETURNING text, created_at`,
    [userId],
  );
  return rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((r) => r.text);
}

/** Apelidos que ninguém pode criar (evita se passar pela administração). */
const RESERVED = ['admin', 'administrador', 'administrator', 'adm', 'moderador', 'moderator', 'mod', 'suporte', 'support', 'staff', 'sistema', 'system', 'root', 'tioze', 'tio_ze'];

export function reservedName(name) {
  const key = String(name).toLowerCase();
  const admin = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  return RESERVED.includes(key) || key.startsWith('admin') || (!!admin && key === admin);
}
