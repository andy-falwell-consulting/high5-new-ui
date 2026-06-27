// FileMaker → Redis replica sync. Driven by Vercel Cron (see vercel.json), and
// callable manually for testing. Runs a bounded slice per invocation: resumable
// backfill first, then incremental modified-since.
//
// GET/POST /api/sync?db=High5_Core4           → sync all replicated layouts
// GET/POST /api/sync?db=High5_Core4&layout=contacts
import { runSync, REPLICATED } from './_replica.js';

// Pro plan: allow a long slice so each run makes real progress on the backfill.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const db = req.query.db || 'High5_Core4';
  const only = req.query.layout;
  const keys = only ? [only] : Object.keys(REPLICATED);

  // Per-run budget shared across layouts (leave headroom under maxDuration).
  const perLayoutBudget = Math.floor(270000 / keys.length);
  const out = {};
  for (const key of keys) {
    if (!REPLICATED[key]) { out[key] = { error: 'not replicated' }; continue; }
    try {
      const meta = await runSync(db, key, perLayoutBudget);
      out[key] = { phase: meta.phase, count: meta.count, total: meta.total, lastSync: meta.lastSync };
    } catch (e) {
      out[key] = { error: String(e?.message || e) };
    }
  }
  return res.status(200).json({ db, result: out });
}
