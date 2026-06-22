// Shared Google session helper — imported by api/agent.js, api/me.js, api/google-logout.js.
// Files starting with _ are not treated as Vercel API routes.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export function parseSessionId(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)h5_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Returns the full session object (with sessionId) or null.
// Automatically refreshes the access token if it's within 5 min of expiry.
export async function getGoogleSession(req) {
  const sessionId = parseSessionId(req);
  if (!sessionId) return null;

  const session = await redis.get(`session:${sessionId}`).catch(() => null);
  if (!session) return null;

  // Refresh if expired or within 5 min of expiry
  if (Date.now() > (session.expiresAt || 0) - 5 * 60 * 1000) {
    try {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(JSON.stringify(data));
      session.accessToken = data.access_token;
      session.expiresAt = Date.now() + data.expires_in * 1000;
      // Persist rotated token; keep 30-day TTL alive
      await redis.set(`session:${sessionId}`, session, { ex: 30 * 24 * 60 * 60 });
    } catch {
      await redis.del(`session:${sessionId}`).catch(() => {});
      return null;
    }
  }

  return { ...session, sessionId };
}
