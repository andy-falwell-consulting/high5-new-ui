// Mint a FileMaker Data API session token bound to the logged-in user, so their
// edits are attributed to them (Get(AccountName) = their email) instead of the
// shared admin account.
//
// Approach (Option 1): the user has an internal FileMaker account whose NAME is
// their email and whose password is a single shared server secret
// (FMP_USER_PASSWORD). We read who's logged in from the Google session cookie,
// then Basic-auth to the Data API as email:secret. The password never touches
// the browser. If the user has no matching FileMaker account, this returns 404
// and the app falls back to the shared admin token for writes.

import { getGoogleSession } from './_googleSession.js';

const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const ALLOWED_DBS = new Set(['High5_Core4_Dev', 'High5_Core4_Stage', 'High5_Core4']);

export default async function handler(req, res) {
  const session = await getGoogleSession(req);
  const email = session?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  const db = String(req.query.db || '');
  if (!ALLOWED_DBS.has(db)) return res.status(400).json({ error: 'Unknown database' });

  const password = process.env.FMP_USER_PASSWORD;
  if (!password) return res.status(500).json({ error: 'FMP_USER_PASSWORD not configured' });

  const auth = Buffer.from(`${email}:${password}`).toString('base64');
  let data;
  try {
    const r = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${db}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: '{}',
    });
    data = await r.json();
  } catch {
    return res.status(502).json({ error: 'FileMaker unreachable' });
  }

  const token = data?.response?.token;
  if (!token) {
    // No FileMaker account for this user (or bad shared password) — the client
    // will fall back to the admin write path. Not a hard error.
    return res.status(404).json({ error: data?.messages?.[0]?.message || 'No FileMaker account', email });
  }

  return res.status(200).json({ token, email });
}
