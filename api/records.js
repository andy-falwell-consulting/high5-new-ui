// Fast bulk read of a replicated layout from Redis (see api/_replica.js).
// GET /api/records?layout=contacts&db=High5_Core4 → { records, meta }
import { readReplica, REPLICATED } from './_replica.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { layout, db } = req.query;
  if (!layout || !REPLICATED[layout]) return res.status(400).json({ error: 'unknown layout' });
  if (!db) return res.status(400).json({ error: 'db required' });
  try {
    const { records, meta } = await readReplica(db, layout);
    // Short cache: many users can share one warm response between syncs.
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ records, meta, count: records.length });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}
