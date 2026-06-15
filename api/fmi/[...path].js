export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const downstream = req.url.replace(/^\/api/, '');
  const url = `https://ILELLCO.pcifmhosting.com${downstream}`;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === 'host') continue;
    headers[k] = v;
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let body;
  if (hasBody) {
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
