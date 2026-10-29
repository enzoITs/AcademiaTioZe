import { currentUser } from '../../../../server/auth.js';
import { route, json } from '../../../../server/http.js';

export const GET = route(async () => {
  const user = await currentUser();
  return json({ user: user ? { name: user.name } : null });
});
