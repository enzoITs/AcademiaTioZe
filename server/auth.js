// Contas e sessões: senha com scrypt (node:crypto) e token aleatório em cookie httpOnly.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { CONFIG } from '../game/config.js';
import { one, query } from './db.js';

const scrypt = promisify(scryptCb);
const KEYLEN = 64;
export const SESSION_COOKIE = 'atz_session';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function checkPassword(password, stored) {
  const [kind, saltHex, hashHex] = String(stored).split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const got = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, got);
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Cria a sessão no banco e grava o cookie. */
export async function startSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const days = CONFIG.online.sessionDays;
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, days],
  );
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

/** Usuário da sessão atual, ou null. */
export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one(
    `SELECT u.id, u.name, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
}
