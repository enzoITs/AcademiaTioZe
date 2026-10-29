import { currentAdmin } from '../../../../server/auth.js';
import { listUsers } from '../../../../server/admin.js';
import { route, json, fail } from '../../../../server/http.js';

/** /api/admin/users?q=&filter=all|suspect|review|banned|admin&sort=recent|money|students|alerts|name|created&page=0 */
export const GET = route(async (request) => {
  // Para quem não é admin, a rota "não existe".
  if (!(await currentAdmin())) return fail('Não encontrado.', 404);
  const url = new URL(request.url);
  const page = Math.min(Math.max(0, Number.parseInt(url.searchParams.get('page') ?? '0', 10) || 0), 1000);
  return json(await listUsers({
    q: url.searchParams.get('q') ?? '',
    filter: url.searchParams.get('filter') ?? 'all',
    sort: url.searchParams.get('sort') ?? 'recent',
    page,
  }));
});
