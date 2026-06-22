import { Redis } from '@upstash/redis';
import { parseSessionId, getGoogleSession } from './_googleSession.js';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getGoogleSession(req);

  // Revoke the Google access token so the grant is fully invalidated
  if (session?.accessToken) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(session.accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {}); // fire-and-forget; don't block the response
  }

  const sessionId = parseSessionId(req);
  if (sessionId) await redis.del(`session:${sessionId}`).catch(() => {});

  res.setHeader('Set-Cookie', 'h5_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
}
