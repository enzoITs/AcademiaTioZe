import { checkPassword, startSession } from '../../../../server/auth.js';
import { one } from '../../../../server/db.js';
import { route, json, fail, readJson, sameOrigin, allow, clientIp } from '../../../../server/http.js';

export const POST = route(async (request) => {
  if (!sameOrigin(request)) return fail('Origem não permitida.', 403);
  const { body, error } = await readJson(request, 2000);
  if (error) return fail(error);
  const name = String(body?.name ?? '').trim();
  const password = String(body?.password ?? '');
  if (!allow(`login:${clientIp(request)}`, 20, 600) || !allow(`login-user:${name.toLowerCase()}`, 10, 600)) {
    return fail('Muitas tentativas. Espere alguns minutos.', 429);
  }
  const user = await one('SELECT id, name, password_hash FROM users WHERE name_key = $1', [name.toLowerCase()]);
  if (!user || !(await checkPassword(password, user.password_hash))) return fail('Apelido ou senha incorretos.', 401);
  await startSession(user.id);
  return json({ user: { name: user.name } });
});
