import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const REALM_ID = process.env.QBO_REALM_ID;
const CLIENT_ID = process.env.QBO_CLIENT_ID;
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_BASE = `https://quickbooks.api.intuit.com/v3/company/${REALM_ID}`;

async function getAccessToken() {
  // Try cached access token first (TTL 55 min)
  const cached = await redis.get('qbo_access_token');
  if (cached) return cached;

  // Get current refresh token (KV takes precedence over env var)
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
  if (!resp.ok || !tokens.access_token) {
    throw new Error(`QBO token refresh failed: ${JSON.stringify(tokens)}`);
  }

  // Persist rotated refresh token and cache access token
  await redis.set('qbo_refresh_token', tokens.refresh_token, { ex: 86400 * 90 });
  await redis.set('qbo_access_token', tokens.access_token, { ex: 55 * 60 });

  return tokens.access_token;
}

async function qboRequest(path, method, body) {
  const token = await getAccessToken();
  const resp = await fetch(`${QBO_BASE}${path}?minorversion=65`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { action, item, itemId } = req.body;

  try {
    if (action === 'create') {
      const data = await qboRequest('/item', 'POST', item);
      return res.status(200).json(data);
    }

    if (action === 'update') {
      if (!itemId) return res.status(400).json({ error: 'itemId required' });
      // QBO requires SyncToken for optimistic locking — fetch it first
      const existing = await qboRequest(`/item/${itemId}`, 'GET');
      const syncToken = existing.Item?.SyncToken;
      const updated = await qboRequest('/item', 'POST', { ...item, Id: itemId, SyncToken: syncToken, sparse: true });
      return res.status(200).json(updated);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('QBO error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
