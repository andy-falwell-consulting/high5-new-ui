import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
  if (!code || !state) return res.status(400).send('Missing code or state.');

  // Validate CSRF state and retrieve the redirect URI stored by /api/google-auth
  const stateKey = `oauth_state:${state}`;
  const redirectUri = await redis.get(stateKey).catch(() => null);
  if (!redirectUri) return res.status(400).send('Invalid or expired state. Try signing in again.');
  await redis.del(stateKey).catch(() => {});

  // Exchange code for tokens
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResp.json();
  if (!tokenResp.ok) {
    console.error('Google token exchange failed:', tokens);
    return res.status(500).send('Token exchange failed. Check server logs.');
  }

  // Get user profile
  const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = await userResp.json();

  // Create session
  const sessionId = crypto.randomBytes(32).toString('hex');
  const session = {
    userId: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  };

  await redis.set(`session:${sessionId}`, session, { ex: 30 * 24 * 60 * 60 });

  res.setHeader('Set-Cookie', [
    `h5_session=${sessionId}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=2592000',   // 30 days
  ].join('; '));

  res.redirect('/');
}
