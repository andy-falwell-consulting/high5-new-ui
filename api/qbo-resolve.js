// Resolve a customer name + item names to QBO ids, by querying QBO directly
// (the target system). Returns matches (with alternates) so the shared
// "Create in QBO" panel can auto-fill and let the user confirm/pick.
//   POST { env, customerName, itemNames: [] }
import { getGoogleSession } from './_googleSession.js';
import { qboQuery } from './_qbo.js';

const SYNC_KEY = process.env.QBO_SYNC_KEY;
async function authorized(req) {
  if (SYNC_KEY && (req.headers['x-sync-key'] === SYNC_KEY || req.query?.key === SYNC_KEY)) return true;
  return !!(await getGoogleSession(req));
}
const esc = s => String(s == null ? '' : s).replace(/'/g, "\\'").trim();
const envOf = v => (v === 'sandbox' ? 'sandbox' : 'production');

async function matchCustomer(name, env) {
  if (!name) return [];
  let m = (await qboQuery(`SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${esc(name)}'`, env)).Customer || [];
  if (!m.length) m = (await qboQuery(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${esc(name)}%' MAXRESULTS 5`, env)).Customer || [];
  return m.map(c => ({ id: c.Id, name: c.DisplayName }));
}
async function matchItem(name, env) {
  if (!name) return [];
  let m = (await qboQuery(`SELECT Id, Name, FullyQualifiedName FROM Item WHERE Name = '${esc(name)}'`, env)).Item || [];
  if (!m.length) m = (await qboQuery(`SELECT Id, Name, FullyQualifiedName FROM Item WHERE Name LIKE '%${esc(name)}%' MAXRESULTS 4`, env)).Item || [];
  return m.map(i => ({ id: i.Id, name: i.FullyQualifiedName || i.Name }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await authorized(req))) return res.status(401).json({ error: 'unauthorized' });
  const { env: e, customerName, itemNames = [] } = req.body || {};
  const env = envOf(e);
  try {
    const custMatches = await matchCustomer(customerName, env);
    const items = [];
    for (const name of itemNames) {
      const matches = await matchItem(name, env);
      items.push({ query: name, matched: matches[0] || null, matches });
    }
    return res.status(200).json({
      env,
      customer: { query: customerName, matched: custMatches[0] || null, matches: custMatches },
      items,
    });
  } catch (err) {
    return res.status(502).json({ error: String(err?.message || err).slice(0, 500) });
  }
}
