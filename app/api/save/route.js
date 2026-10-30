import { CONFIG } from '../../../game/config.js';
import { sessionUser, banMessage, takeNotices } from '../../../server/auth.js';
import { storeSave, loadSave, SaveRejected, SaveRefused } from '../../../server/progress.js';
import { route, json, fail, readJson, sameOrigin, allow } from '../../../server/http.js';

/** Dono da sessão, ou a resposta de erro (sem sessão / banido). */
async function player() {
  const user = await sessionUser();
  if (!user) return { error: fail('Entre na sua conta.', 401) };
  if (user.banned) return { error: json({ error: banMessage(user), code: 'banned' }, 403) };
  return { user };
}

/** Progresso salvo da conta (ou save: null se ainda não tem), com a versão `rev`. */
export const GET = route(async () => {
  const { user, error } = await player();
  if (error) return error;
  const row = await loadSave(user.id);
  return json({ save: row?.save ?? null, savedAt: row?.savedAt ?? null, rev: row?.rev ?? 0 });
});

/** Envia o progresso: { save, rev }. Passa pela checagem anti-trapaça antes de guardar. */
export const PUT = route(async (request) => {
  if (!sameOrigin(request)) return fail('Origem não permitida.', 403);
  const { user, error } = await player();
  if (error) return error;
  if (!allow(`save:${user.id}`, 1, CONFIG.online.minSecondsBetweenSaves)) return fail('Salvando rápido demais.', 429);
  const { body, error: bodyError } = await readJson(request, CONFIG.online.maxSaveBytes, { maxInflated: CONFIG.online.maxSaveJsonBytes });
  if (bodyError) return fail(bodyError, 413);
  if (!body?.save || typeof body.save !== 'object') return fail('Save ausente.');
  const rev = Number.isInteger(body.rev) ? body.rev : null;
  try {
    const result = await storeSave(user.id, body.save, { rev });
    return json({ ...result, notices: await takeNotices(user.id) });
  } catch (err) {
    if (err instanceof SaveRejected) return json({ error: `Save recusado: ${err.message}`, code: 'invalid' }, 422);
    if (err instanceof SaveRefused) {
      const status = err.code === 'cheat' ? 422 : 409;
      return json({ error: err.message, code: err.code, reasons: err.reasons, notices: await takeNotices(user.id) }, status);
    }
    throw err;
  }
});
