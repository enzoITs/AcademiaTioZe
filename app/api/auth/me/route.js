import { sessionUser, endSession, banMessage, publicUser, takeNotices } from '../../../../server/auth.js';
import { route, json } from '../../../../server/http.js';

export const GET = route(async () => {
  const user = await sessionUser();
  if (!user) return json({ user: null });
  if (user.banned) {
    await endSession();
    return json({ user: null, banned: banMessage(user) });
  }
  return json({ user: publicUser(user), notices: await takeNotices(user.id) });
});
