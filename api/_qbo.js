// Shared QuickBooks Online core — token + request helpers. Imported by
// api/qbo.js (HTTP actions) and api/qbo-invoice-sync.js (the mirror job).
// Files starting with _ are not Vercel routes.
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const REALM_ID = process.env.QBO_REALM_ID;
const CLIENT_ID = process.env.QBO_CLIENT_ID;
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
export const QBO_BASE = `https://quickbooks.api.intuit.com/v3/company/${REALM_ID}`;

export async function getAccessToken() {
  const cached = await redis.get('qbo_access_token');
  if (cached) return cached;
  const refreshToken = (await redis.get('qbo_refresh_token')) || process.env.QBO_REFRESH_TOKEN;
  const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const tokens = await resp.json();
  if (!resp.ok || !tokens.access_token) throw new Error(`QBO token refresh failed: ${JSON.stringify(tokens)}`);
  await redis.set('qbo_refresh_token', tokens.refresh_token, { ex: 86400 * 90 });
  await redis.set('qbo_access_token', tokens.access_token, { ex: 55 * 60 });
  return tokens.access_token;
}

export async function qboRequest(path, method, body) {
  const token = await getAccessToken();
  const resp = await fetch(`${QBO_BASE}${path}?minorversion=65`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

// Run a QBO SQL query, returning the QueryResponse object.
export async function qboQuery(sql) {
  const token = await getAccessToken();
  const r = await fetch(`${QBO_BASE}/query?query=${encodeURIComponent(sql)}&minorversion=65`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data.QueryResponse || {};
}
