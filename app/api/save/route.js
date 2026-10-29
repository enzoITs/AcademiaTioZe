import { CONFIG } from '../../../game/config.js';
import { currentUser } from '../../../server/auth.js';
import { storeSave, loadSave, SaveRejected } from '../../../server/progress.js';
import { route, json, fail, readJson, sameOrigin, allow } from '../../../server/http.js';

/** Progresso salvo da conta (ou save: null se ainda não tem). */
export const GET = route(async () => {
  const user = await currentUser();
  if (!user) return fail('Entre na sua conta.', 401);
  const row = await loadSave(user.id);
  return json({ save: row?.save ?? null, savedAt: row?.savedAt ?? null });
});

/** Envia o progresso: { save }. */
export const PUT = route(async (request) => {
  if (!sameOrigin(request)) return fail('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return fail('Entre na sua conta.', 401);
  if (!allow(`save:${user.id}`, 1, CONFIG.online.minSecondsBetweenSaves)) return fail('Salvando rápido demais.', 429);
  const { body, error } = await readJson(request, CONFIG.online.maxSaveBytes);
  if (error) return fail(error, 413);
  if (!body?.save || typeof body.save !== 'object') return fail('Save ausente.');
  try {
    return json(await storeSave(user.id, body.save));
  } catch (err) {
    if (err instanceof SaveRejected) return fail(`Save recusado: ${err.message}`, 422);
    throw err;
  }
});
