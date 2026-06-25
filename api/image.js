// FileMaker container images: GET serves a container image; POST uploads one.
// Merged from the old image.js + upload-image.js to stay under the serverless
// function cap.
const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const BASIC = 'Basic ' + Buffer.from('admin:itstime').toString('base64');

let sessionToken = null;
async function getToken(db) {
  if (sessionToken) return sessionToken;
  const res = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${encodeURIComponent(db)}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: BASIC },
    body: '{}',
  });
  const data = await res.json();
  if (!data.response?.token) throw new Error('FMP auth failed');
  sessionToken = data.response.token;
  return sessionToken;
}

export default async function handler(req, res) {
  if (req.method === 'POST') return upload(req, res);
  return serve(req, res);
}

async function serve(req, res) {
  const { db, layout, recordId, field = 'Picture' } = req.query;
  if (!db || !layout || !recordId) return res.status(400).end('Missing params');

  const url = `${FMP_HOST}/fmi/xml/cnt/data.jpg?-db=${encodeURIComponent(db)}&-lay=${encodeURIComponent(layout)}&-field=${encodeURIComponent(field)}(1)&-recid=${encodeURIComponent(recordId)}`;
  const upstream = await fetch(url, { headers: { Authorization: BASIC } });

  res.status(upstream.status);
  const ct = upstream.headers.get('content-type');
  if (ct) res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const buf = await upstream.arrayBuffer();
  res.end(Buffer.from(buf));
}

async function upload(req, res) {
  const { recordId, layout, db } = req.query;
  if (!recordId || !layout || !db) return res.status(400).json({ error: 'Missing params' });

  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const contentType = req.headers['content-type'] || 'image/jpeg';
  const filename = req.headers['x-filename'] || 'image.jpg';

  const doUpload = async (token) => {
    const formData = new FormData();
    formData.append('upload', new Blob([buf], { type: contentType }), filename);
    const url = `${FMP_HOST}/fmi/data/v2/databases/${encodeURIComponent(db)}/layouts/${encodeURIComponent(layout)}/records/${recordId}/containers/Picture/1`;
    return fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
  };

  try {
    let upstream = await doUpload(await getToken(db));
    if (upstream.status === 401) { sessionToken = null; upstream = await doUpload(await getToken(db)); }
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json(data);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// bodyParser off so the POST upload reads raw image bytes. GET is unaffected.
export const config = { api: { bodyParser: false } };
