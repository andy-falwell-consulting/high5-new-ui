// Step 2 of Shopify OAuth: Shopify redirects back here with a code. Verify it's
// genuinely from Shopify (HMAC + state + shop), exchange the code for a long-lived
// offline access token, and store it in Redis so /api/shopify uses it.
import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const store = process.env.SHOPIFY_STORE;
  const apiKey = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
  const apiSecret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const appUrl = `https://${host}`;
  const fail = reason => { res.writeHead(302, { Location: `${appUrl}/?shopify=error&reason=${encodeURIComponent(reason)}` }); res.end(); };

  if (!store || !apiKey || !apiSecret) return fail('not_configured');

  const params = new URL(req.url, appUrl).searchParams;
  const code = params.get('code');
  const shop = params.get('shop');
  const state = params.get('state');
  const hmac = params.get('hmac');

  // 1. Must be our store.
  if (shop !== store) return fail('wrong_shop');

  // 2. CSRF state must match what we issued.
  let saved = null;
  try { saved = await redis.get('shopify_oauth_state'); } catch { /* ignore */ }
  if (!state || !saved || String(state) !== String(saved)) return fail('bad_state');

  // 3. HMAC over all params except hmac/signature, sorted, signed with the secret.
  const message = [...params.entries()]
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const digest = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  const valid = hmac && digest.length === hmac.length &&
    crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  if (!valid) return fail('bad_hmac');

  // 4. Exchange the authorization code for an access token.
  try {
    const r = await fetch(`https://${store}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) return fail('exchange_failed');

    await redis.set('shopify_token', data.access_token);
    try { await redis.del('shopify_oauth_state'); } catch { /* ignore */ }

    res.writeHead(302, { Location: `${appUrl}/?shopify=connected` });
    res.end();
  } catch {
    return fail('exchange_error');
  }
}
