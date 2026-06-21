// Step 1 of Shopify OAuth: redirect the merchant to Shopify's consent screen.
// A "Connect Shopify" button in the app sends the browser here.
import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const store = process.env.SHOPIFY_STORE;
  const apiKey = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
  if (!store || !apiKey) {
    return res.status(500).send('Shopify OAuth not configured — set SHOPIFY_STORE and SHOPIFY_API_KEY.');
  }

  const scopes = process.env.SHOPIFY_SCOPES || 'write_products,read_products';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `https://${host}/api/shopify-callback`;

  // CSRF nonce, validated in the callback.
  const state = crypto.randomBytes(16).toString('hex');
  try { await redis.set('shopify_oauth_state', state, { ex: 600 }); } catch { /* redis unavailable */ }

  const authUrl = `https://${store}/admin/oauth/authorize?` + new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  }).toString();

  res.writeHead(302, { Location: authUrl });
  res.end();
}
