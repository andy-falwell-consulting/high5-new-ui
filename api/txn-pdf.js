// Returns a QBO transaction PDF as base64, for any of the four sales types.
// POST /api/txn-pdf  { type: 'Invoice'|'Estimate'|'CreditMemo'|'SalesReceipt', id }
import { getGoogleSession } from './_googleSession.js';
import { getAccessToken, QBO_BASE } from './_qbo.js';

const SYNC_KEY = process.env.QBO_SYNC_KEY;
const PATH = { Invoice: 'invoice', Estimate: 'estimate', CreditMemo: 'creditmemo', SalesReceipt: 'salesreceipt' };

async function authorized(req) {
  if (SYNC_KEY && (req.headers['x-sync-key'] === SYNC_KEY || req.query?.key === SYNC_KEY)) return true;
  return !!(await getGoogleSession(req));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await authorized(req))) return res.status(401).json({ error: 'unauthorized' });
  const { type, id } = req.body || {};
  const path = PATH[type];
  if (!path || !id) return res.status(400).json({ error: 'valid type and id required' });
  try {
    const token = await getAccessToken();
    const r = await fetch(`${QBO_BASE}/${path}/${id}/pdf?minorversion=65`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const buf = Buffer.from(await r.arrayBuffer());
    return res.status(200).json({ ok: true, base64: buf.toString('base64') });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}
