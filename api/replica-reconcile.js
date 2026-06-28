// Replica deletion reconcile (hourly cron). For each replicated layout, compares
// the replica's record IDs against FileMaker's current set and removes any that
// no longer exist in FMP — catching deletions from ANY source (UI, scripts,
// imports, mass deletes), with no FileMaker-side work.
//
// Cheap by default: only does the (fast, portals-suppressed) ID pull for a table
// when FMP's foundCount has dropped below the replica's count. `?full=1` forces a
// full pull+diff on every table (deeper sweep; catches delete+add-in-same-window).
//
// Safety: reads the replica's keys FIRST, then pulls FMP — so a record added
// concurrently can never be mistaken for a deletion. Only removes orphans when
// the FMP pull completed within budget.
//
// GET/POST /api/replica-reconcile?db=High5_Core4   (gated)
import { Redis } from '@upstash/redis';
import { getGoogleSession } from './_googleSession.js';
import { REPLICATED } from './_replica.js';
import { fmpToken, ALLOWED_DBS } from './_fmp.js';

export const config = { maxDuration: 300 };

const redis = Redis.fromEnv();
const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const SYNC_KEY = process.env.REPLICA_SYNC_KEY || process.env.QBO_SYNC_KEY;
const rk = (db, layout, s) => `repl:${db}:${layout}:${s}`;

async function authorized(req) {
  if (SYNC_KEY && (req.headers['x-sync-key'] === SYNC_KEY || req.query?.key === SYNC_KEY)) return true;
  const cron = process.env.CRON_SECRET;
  if (cron && req.headers.authorization === `Bearer ${cron}`) return true;
  return !!(await getGoogleSession(req));
}

async function fmFoundCount(db, layout, token) {
  const r = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${db}/layouts/${encodeURIComponent(layout)}/records?_limit=1`,
    { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return j?.response?.dataInfo?.foundCount ?? null;
}

// Pull all current FMP recordIds for a layout (portals suppressed → fast).
async function collectFmpIds(db, layout, token, deadline) {
  const ids = new Set();
  let offset = 1; const LIM = 500;
  while (Date.now() < deadline) {
    const url = `${FMP_HOST}/fmi/data/v2/databases/${db}/layouts/${encodeURIComponent(layout)}/records`
      + `?_limit=${LIM}&_offset=${offset}&portal=${encodeURIComponent('[]')}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    const code = j?.messages?.[0]?.code;
    if (code && code !== '0') throw new Error('FMP read failed: ' + JSON.stringify(j.messages));
    const data = j?.response?.data || [];
    for (const rec of data) ids.add(String(rec.recordId));
    offset += data.length;
    if (data.length < LIM) return { ids, complete: true };
  }
  return { ids, complete: false };
}

export default async function handler(req, res) {
  if (!(await authorized(req))) return res.status(401).json({ error: 'unauthorized' });
  const db = req.query.db || 'High5_Core4';
  if (!ALLOWED_DBS.has(db)) return res.status(400).json({ error: 'valid db required' });
  const full = req.query.full === '1';
  const deadline = Date.now() + 270000;

  let token;
  try { token = await fmpToken(db); } catch (e) { return res.status(502).json({ error: String(e?.message || e) }); }

  const out = {};
  for (const [key, cfg] of Object.entries(REPLICATED)) {
    if (Date.now() > deadline) { out[key] = { skipped: 'budget' }; continue; }
    const layout = cfg.layout;
    try {
      // Read replica keys FIRST (so concurrent adds can't look like deletions).
      const replicaKeys = await redis.hkeys(rk(db, layout, 'recs'));
      const rcount = replicaKeys.length;
      if (rcount === 0) { out[key] = { replica: 0, skip: 'empty' }; continue; }

      const fc = await fmFoundCount(db, layout, token);
      if (!full && fc != null && fc >= rcount) { out[key] = { foundCount: fc, replica: rcount, deletions: 0 }; continue; }

      const { ids, complete } = await collectFmpIds(db, layout, token, deadline);
      if (!complete) { out[key] = { foundCount: fc, replica: rcount, skipped: 'pull-incomplete (retry next run)' }; continue; }

      const orphans = replicaKeys.filter(k => !ids.has(String(k)));
      let removed = 0;
      for (let i = 0; i < orphans.length; i += 1000) {
        const chunk = orphans.slice(i, i + 1000);
        if (chunk.length) removed += await redis.hdel(rk(db, layout, 'recs'), ...chunk);
      }
      if (removed) {
        const metaKey = rk(db, layout, 'meta');
        const meta = await redis.get(metaKey);
        if (meta) { meta.count = await redis.hlen(rk(db, layout, 'recs')); await redis.set(metaKey, meta); }
      }
      out[key] = { foundCount: fc, replicaBefore: rcount, removed };
    } catch (e) {
      out[key] = { error: String(e?.message || e) };
    }
  }
  return res.status(200).json({ db, full, result: out });
}
