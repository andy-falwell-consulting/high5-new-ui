import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Prefer the OAuth token stored in Redis (set by /api/shopify-callback); fall
// back to the static SHOPIFY_TOKEN env var.
async function resolveToken() {
  try { const t = await redis.get('shopify_token'); if (t) return { token: t, source: 'oauth' }; } catch { /* redis unavailable */ }
  return { token: process.env.SHOPIFY_TOKEN || null, source: process.env.SHOPIFY_TOKEN ? 'env' : null };
}

export default async function handler(req, res) {
  const store = process.env.SHOPIFY_STORE;
  const { token, source: tokenSource } = await resolveToken();

  // Read-only health check — safe to open in a browser at /api/shopify.
  // Reports whether the env vars are set and whether an authenticated Shopify
  // call actually succeeds (so we can tell config vs token vs scope problems apart).
  if (req.method === 'GET') {
    const out = {
      configured: !!(store && token),
      store: store || null,
      tokenSource,
      tokenPrefix: token ? token.slice(0, 6) + '…' : null,
      tokenLength: token ? token.length : 0,
      oauth: (() => {
        const apiKey = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
        const apiSecret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
        return { storeSet: !!store, apiKeySet: !!apiKey, apiSecretSet: !!apiSecret, ready: !!(store && apiKey && apiSecret) };
      })(),
    };
    if (out.configured) {
      try {
        const r = await fetch(`https://${store}/admin/api/2025-10/shop.json`, { headers: { 'X-Shopify-Access-Token': token } });
        out.shopHttpStatus = r.status;
        out.ok = r.ok;
        if (r.ok) { out.shopName = (await r.json())?.shop?.name || null; }
        else { out.shopError = (await r.text()).slice(0, 400); }
      } catch (e) { out.ok = false; out.shopError = String(e?.message || e); }
    }
    return res.status(200).json(out);
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { action, productId, product } = req.body;

  if (!store || !token) return res.status(500).json({ error: 'Shopify not configured' });
  if (action === 'debug') return res.status(200).json({ store, tokenPrefix: token.slice(0, 8) + '...' });


  const base = `https://${store}/admin/api/2025-10`;
  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };

  try {
    let upstream;

    if (action === 'create') {
      upstream = await fetch(`${base}/products.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ product }),
      });
    } else if (action === 'update') {
      if (!productId) return res.status(400).json({ error: 'productId required for update' });
      // A variant without an id makes Shopify try to CREATE a variant, which
      // collides with the existing "Default Title" and the update fails. If the
      // caller didn't supply the variant id (e.g. the FMP record never stored
      // it), resolve it from the live product by SKU so we update in place.
      if (product?.variants?.length && !product.variants[0].id) {
        const cur = await fetch(`${base}/products/${productId}.json`, { headers });
        if (cur.ok) {
          const existing = (await cur.json()).product;
          const want = String(product.variants[0].sku || '');
          const match = existing?.variants?.find(v => String(v.sku) === want) || existing?.variants?.[0];
          if (match) product.variants[0].id = match.id;
        }
      }
      upstream = await fetch(`${base}/products/${productId}.json`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ product }),
      });
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json(data);
    console.log('Shopify response variants:', JSON.stringify(data.product?.variants?.map(v => ({ id: v.id, sku: v.sku })) ?? []));
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
