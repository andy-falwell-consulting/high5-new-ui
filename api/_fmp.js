// Shared FileMaker Data API helpers for server-side jobs (admin creds).
// Files starting with _ are not Vercel routes.
const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const FMP_USER = 'admin';
const FMP_PASS = 'itstime';
export const ALLOWED_DBS = new Set(['High5_Core4', 'High5_Core4_Stage', 'High5_Core4_Dev']);

export async function fmpToken(db) {
  if (!ALLOWED_DBS.has(db)) throw new Error('db not allowed: ' + db);
  const r = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${db}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${FMP_USER}:${FMP_PASS}`).toString('base64') },
    body: '{}',
  });
  const j = await r.json().catch(() => ({}));
  const token = j?.response?.token;
  if (!token) throw new Error('FMP auth failed: ' + JSON.stringify(j?.messages || j));
  return token;
}

const url = (db, layout, suffix = '') =>
  `${FMP_HOST}/fmi/data/v2/databases/${db}/layouts/${encodeURIComponent(layout)}${suffix}`;

// Returns the records array (empty if none / not found).
export async function fmFind(db, layout, query, token, limit = 1) {
  const r = await fetch(url(db, layout, '/_find'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });
  const j = await r.json().catch(() => ({}));
  if (j?.messages?.[0]?.code === '401') return []; // no records match
  return j?.response?.data || [];
}

export async function fmCreate(db, layout, fieldData, token) {
  const r = await fetch(url(db, layout, '/records'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldData }),
  });
  const j = await r.json().catch(() => ({}));
  if (j?.messages?.[0]?.code !== '0') throw new Error('FMP create failed: ' + JSON.stringify(j?.messages || j));
  return j.response.recordId;
}

export async function fmUpdate(db, layout, recordId, fieldData, token) {
  const r = await fetch(url(db, layout, `/records/${recordId}`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldData }),
  });
  const j = await r.json().catch(() => ({}));
  if (j?.messages?.[0]?.code !== '0') throw new Error('FMP update failed: ' + JSON.stringify(j?.messages || j));
  return true;
}

export async function fmDelete(db, layout, recordId, token) {
  await fetch(url(db, layout, `/records/${recordId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
