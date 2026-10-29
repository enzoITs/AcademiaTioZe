import { currentUser } from '../../../server/auth.js';
import { ranking } from '../../../server/progress.js';
import { route, json } from '../../../server/http.js';

/** /api/ranking?by=money|students&page=0 */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const by = url.searchParams.get('by') === 'students' ? 'students' : 'money';
  const page = Math.min(Math.max(0, Number.parseInt(url.searchParams.get('page') ?? '0', 10) || 0), 1000);
  const user = await currentUser();
  return json(await ranking(by, page, user?.id ?? null));
});
