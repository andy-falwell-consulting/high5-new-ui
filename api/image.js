const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const FMP_USER = 'admin';
const FMP_PASS = 'itstime';

// Reuse a token per database for the lifetime of this function instance
const tokenCache = {};

async function getToken(db) {
  if (tokenCache[db]) return tokenCache[db];
  const res = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${db}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${FMP_USER}:${FMP_PASS}`).toString('base64'),
    },
    body: '{}',
  });
  const data = await res.json();
  if (!data.response?.token) throw new Error('Auth failed');
  tokenCache[db] = data.response.token;
  return tokenCache[db];
}

export default async function handler(req, res) {
  const { path, db } = req.query;
  if (!path || !db) return res.status(400).end('Missing path or db');

  let token;
  try {
    token = await getToken(db);
  } catch {
    return res.status(401).end('Auth failed');
  }

  const url = `${FMP_HOST}/Streaming_SSL/${path}`;
  let upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Retry once if token expired
  if (upstream.status === 401) {
    delete tokenCache[db];
    token = await getToken(db);
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  res.status(upstream.status);
  const ct = upstream.headers.get('content-type');
  if (ct) res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const buf = await upstream.arrayBuffer();
  res.end(Buffer.from(buf));
}
