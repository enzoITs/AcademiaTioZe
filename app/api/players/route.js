import { searchPlayers } from '../../../server/progress.js';
import { route, json } from '../../../server/http.js';

/** /api/players?q=apelido */
export const GET = route(async (request) => {
  const q = new URL(request.url).searchParams.get('q');
  return json({ players: await searchPlayers(q) });
});
