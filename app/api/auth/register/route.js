import { usernameProblem, passwordProblem } from '../../../../game/online/progress.js';
import { hashPassword, startSession } from '../../../../server/auth.js';
import { one } from '../../../../server/db.js';
import { route, json, fail, readJson, sameOrigin, allow, clientIp } from '../../../../server/http.js';

export const POST = route(async (request) => {
  if (!sameOrigin(request)) return fail('Origem não permitida.', 403);
  if (!allow(`register:${clientIp(request)}`, 6, 3600)) return fail('Muitas contas criadas daqui. Tente mais tarde.', 429);
  const { body, error } = await readJson(request, 2000);
  if (error) return fail(error);
  const name = String(body?.name ?? '').trim();
  const password = body?.password;
  const problem = usernameProblem(name) ?? passwordProblem(password);
  if (problem) return fail(problem);
  const taken = await one('SELECT 1 FROM users WHERE name_key = $1', [name.toLowerCase()]);
  if (taken) return fail('Esse apelido já está em uso.', 409);
  const user = await one(
    'INSERT INTO users (name, name_key, password_hash) VALUES ($1, $2, $3) ON CONFLICT (name_key) DO NOTHING RETURNING id, name',
    [name, name.toLowerCase(), await hashPassword(password)],
  );
  if (!user) return fail('Esse apelido já está em uso.', 409);
  await startSession(user.id);
  return json({ user: { name: user.name } }, 201);
});
