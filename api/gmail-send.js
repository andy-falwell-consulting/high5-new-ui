// Send an email AS the logged-in user via their Gmail. Reads the user's Google
// access token from the session (never exposed to the browser), builds an
// RFC-2822 MIME message (multipart/mixed when attachments are present), and
// posts it to the Gmail API. The message is sent from the user's address and
// lands in their Sent folder.
import { getGoogleSession } from './_googleSession.js';

const GMAIL_SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const wrap76 = b64 => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

// Email headers are ASCII-only. Encode any value with non-ASCII characters as an
// RFC 2047 base64 encoded-word so UTF-8 (em-dashes, accents, emoji) renders
// correctly instead of mojibake. Pure-ASCII values pass through untouched.
const encodeHeader = value => {
  const s = String(value ?? '');
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=`;
};

// A text/plain body with non-ASCII must declare an 8-bit-safe transfer encoding.
// Base64-encode it so UTF-8 survives transport intact.
const textPart = bodyText => [
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: base64', '',
  wrap76(Buffer.from(String(bodyText ?? ''), 'utf-8').toString('base64')),
].join('\r\n');

function buildMime({ from, to, cc, bcc, subject, bodyText, inReplyTo, attachments }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${encodeHeader(subject)}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    inReplyTo ? `References: ${inReplyTo}` : null,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  if (!attachments?.length) {
    const msg = [...headers, textPart(bodyText)].join('\r\n');
    return Buffer.from(msg, 'utf-8').toString('base64url');
  }

  const boundary = 'mix_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const parts = [
    [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
      `--${boundary}`,
      textPart(bodyText),
    ].join('\r\n'),
  ];
  for (const a of attachments) {
    parts.push([
      `--${boundary}`,
      `Content-Type: ${a.mimeType || 'application/octet-stream'}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64', '',
      wrap76(String(a.base64 || '')),
    ].join('\r\n'));
  }
  parts.push(`--${boundary}--`);
  return Buffer.from(parts.join('\r\n'), 'utf-8').toString('base64url');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getGoogleSession(req);
  if (!session?.accessToken) return res.status(401).json({ error: 'Not authenticated' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Bad JSON' }); } }
  const { to, cc, bcc, subject, bodyText, attachments, threadId, inReplyTo } = body || {};
  if (!to || !subject) return res.status(400).json({ error: 'to and subject are required' });

  const raw = buildMime({ from: session.email, to, cc, bcc, subject, bodyText, inReplyTo, attachments });
  const sendBody = { raw };
  if (threadId) sendBody.threadId = threadId;

  let j;
  try {
    const r = await fetch(GMAIL_SEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sendBody),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: j.error?.message || 'Send failed' });
  } catch {
    return res.status(502).json({ error: 'Gmail unreachable' });
  }
  return res.status(200).json({ sent: true, messageId: j.id, threadId: j.threadId, from: session.email });
}
