import { checkPassword, startSession, banMessage, publicUser } from '../../../../server/auth.js';
import { one, BAN_ACTIVE } from '../../../../server/db.js';
import { route, json, fail, readJson, sameOrigin, allow, clientIp } from '../../../../server/http.js';

export const POST = route(async (request) => {
  if (!sameOrigin(request)) return fail('Origem não permitida.', 403);
  const { body, error } = await readJson(request, 2000);
  if (error) return fail(error);
  const name = String(body?.name ?? '').trim().slice(0, 40);
  const password = String(body?.password ?? '').slice(0, 200);
  if (!allow(`login:${clientIp(request)}`, 20, 600) || !allow(`login-user:${name.toLowerCase()}`, 10, 600)) {
    return fail('Muitas tentativas. Espere alguns minutos.', 429);
  }
  const user = await one(
    `SELECT u.id, u.name, u.role, u.password_hash, u.ban_reason, u.banned_until, ${BAN_ACTIVE} AS banned
       FROM users u WHERE u.name_key = $1`,
    [name.toLowerCase()],
  );
  if (!user || !(await checkPassword(password, user.password_hash))) return fail('Apelido ou senha incorretos.', 401);
  if (user.banned) return json({ error: banMessage(user), code: 'banned' }, 403);
  await startSession(user.id);
  return json({ user: publicUser(user) });
});
