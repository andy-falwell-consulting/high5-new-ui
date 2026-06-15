export const config = { api: { bodyParser: false } };

const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';

export default async function handler(req, res) {
  const parsed = new URL(req.url, 'http://localhost');
  const prefix = parsed.searchParams.get('prefix');
  const path = parsed.searchParams.get('path') ?? '';
  parsed.searchParams.delete('prefix');
  parsed.searchParams.delete('path');
  const qs = parsed.searchParams.toString();
  const url = `${FMP_HOST}/${prefix}/${path}${qs ? '?' + qs : ''}`;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === 'host') continue;
    headers[k] = v;
  }

  let body;
  if (!['GET', 'HEAD'].includes(req.method)) {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  const upstream = await fetch(url, { method: req.method, headers, body });

  res.status(upstream.status);
  upstream.headers.forEach((v, k) => {
    if (k === 'transfer-encoding') return;
    res.setHeader(k, v);
  });

  const buf = await upstream.arrayBuffer();
  res.end(Buffer.from(buf));
}
