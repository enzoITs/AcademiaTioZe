import { endSession } from '../../../../server/auth.js';
import { route, json, fail, sameOrigin } from '../../../../server/http.js';

export const POST = route(async (request) => {
  if (!sameOrigin(request)) return fail('Origem não permitida.', 403);
  await endSession();
  return json({ ok: true });
});
