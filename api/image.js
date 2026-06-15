const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const BASIC = 'Basic ' + Buffer.from('admin:itstime').toString('base64');

export default async function handler(req, res) {
  const { db, layout, recordId, field = 'Picture' } = req.query;
  if (!db || !layout || !recordId) return res.status(400).end('Missing params');

  const url = `${FMP_HOST}/fmi/xml/cnt/data.jpg?-db=${encodeURIComponent(db)}&-lay=${encodeURIComponent(layout)}&-field=${encodeURIComponent(field)}(1)&-recid=${encodeURIComponent(recordId)}`;

  const upstream = await fetch(url, {
    headers: { Authorization: BASIC },
  });

  res.status(upstream.status);
  const ct = upstream.headers.get('content-type');
  if (ct) res.setHeader('Content-Type', ct);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const buf = await upstream.arrayBuffer();
  res.end(Buffer.from(buf));
}
