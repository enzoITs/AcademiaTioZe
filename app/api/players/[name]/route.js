import { profileByName } from '../../../../server/progress.js';
import { route, json, fail } from '../../../../server/http.js';

/** Perfil público: números atuais, posição no ranking e histórico mensal. Nunca o save inteiro. */
export const GET = route(async (request, { params }) => {
  const { name } = await params;
  const profile = await profileByName(decodeURIComponent(name));
  if (!profile) return fail('Jogador não encontrado.', 404);
  return json({ profile });
});
