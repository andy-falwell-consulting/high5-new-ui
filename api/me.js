import { getGoogleSession } from './_googleSession.js';

export default async function handler(req, res) {
  const session = await getGoogleSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  return res.json({
    userId: session.userId,
    email: session.email,
    name: session.name,
    picture: session.picture,
  });
}
