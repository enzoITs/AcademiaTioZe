import { currentAdmin } from '../../../../../server/auth.js';
import { userDetail, applyAction, AdminError } from '../../../../../server/admin.js';
import { route, json, fail, readJson, strictSameOrigin, allow } from '../../../../../server/http.js';

/** Detalhes de um jogador: números, alertas, punições e avisos. */
export const GET = route(async (request, { params }) => {
  if (!(await currentAdmin())) return fail('Não encontrado.', 404);
  const { name } = await params;
  const detail = await userDetail(decodeURIComponent(name));
  if (!detail) return fail('Jogador não encontrado.', 404);
  return json({ user: detail });
});

/** Ação do admin: { action: warn|fine|reset|hide|unhide|ban|unban|clear_alerts, message?, amount?, days? } */
export const POST = route(async (request, { params }) => {
  if (!strictSameOrigin(request)) return fail('Origem não permitida.', 403);
  const admin = await currentAdmin();
  if (!admin) return fail('Não encontrado.', 404);
  if (!allow(`admin:${admin.id}`, 60, 60)) return fail('Calma: ações demais em pouco tempo.', 429);
  const { body, error } = await readJson(request, 4000);
  if (error) return fail(error);
  const { name } = await params;
  try {
    const message = await applyAction(admin, decodeURIComponent(name), body);
    return json({ ok: true, message, user: await userDetail(decodeURIComponent(name)) });
  } catch (err) {
    if (err instanceof AdminError) return fail(err.message, err.status);
    throw err;
  }
});
