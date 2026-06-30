import { getGoogleSession } from './_googleSession.js';

// Issues the next product SKU by calling the Tray workflow that owns the
// incrementing counter (single source of truth). The FMP-side script trigger
// still assigns SKUs for products added directly in FileMaker; this endpoint
// covers products created through Belay (Data API creates don't fire FMP
// triggers), drawing from the same Tray counter so numbers never collide.
//
// Auth gate (mirrors qbo.js): a logged-in user (Google session cookie) OR a
// server job presenting the sync key (x-sync-key header / ?key=).
const SYNC_KEY = process.env.QBO_SYNC_KEY;
const WEBHOOK_URL = process.env.TRAY_SKU_WEBHOOK_URL;

async function authorized(req) {
  if (SYNC_KEY && (req.headers['x-sync-key'] === SYNC_KEY || req.query?.key === SYNC_KEY)) return true;
  return !!(await getGoogleSession(req));
}

// Pull a SKU string out of whatever shape Tray replies with. SKUs are TEXT
// (e.g. "1159", "115-STAP500x08"), so never coerce to a number — preserve the
// string verbatim (leading zeros / prefixes must survive).
function extractSku(payload) {
  if (payload == null) return null;
  if (typeof payload === 'number') return String(payload);
  if (typeof payload === 'string') {
    const s = payload.trim();
    if (!s) return null;
    // Tray sometimes replies text/plain with the bare value; if it looks like
    // JSON, parse and recurse, otherwise treat the string as the SKU.
    if (s[0] === '{' || s[0] === '[') { try { return extractSku(JSON.parse(s)); } catch { return s; } }
    return s;
  }
  if (typeof payload === 'object') {
    for (const k of ['sku', 'SKU', 'value', 'result', 'nextSku', 'next_sku', 'output']) {
      if (k in payload) { const v = extractSku(payload[k]); if (v) return v; }
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!(await authorized(req))) return res.status(401).json({ error: 'unauthorized' });
  if (!WEBHOOK_URL) return res.status(500).json({ error: 'TRAY_SKU_WEBHOOK_URL not configured' });

  const debug = req.query?.debug === '1';
  try {
    const upstream = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const text = await upstream.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    const sku = extractSku(parsed);

    if (!upstream.ok || !sku) {
      return res.status(502).json({
        error: 'tray webhook did not return a SKU',
        status: upstream.status,
        ...(debug ? { raw: text.slice(0, 2000) } : {}),
      });
    }
    return res.status(200).json({ sku: String(sku), ...(debug ? { status: upstream.status, raw: text.slice(0, 2000) } : {}) });
  } catch (e) {
    return res.status(502).json({ error: 'tray webhook call failed', detail: String(e?.message || e) });
  }
}
