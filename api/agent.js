// Read-only data assistant. Answers questions about FileMaker records, Shopify,
// and QuickBooks Online by letting Claude call a small set of read-only tools
// executed server-side. Credentials never leave the server.
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const FMP_BASIC = 'Basic ' + Buffer.from('admin:itstime').toString('base64');
const ALLOWED_DBS = ['High5_Core4_Dev', 'High5_Core4_Stage', 'High5_Core4'];
const MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_TURNS = 10;

// ── FileMaker modules ────────────────────────────────────────────────────────
const MODULES = {
  inspections: {
    layout: 'Inspections_New',
    portals: { inspt_INSPLI: 200 },
    keyFields: ['_kpt__Inspection_ID', 'Organization', 'inspt_CNTCT__site::Name_Organization', 'inspt_CNTCT::NameFirstLast', 'Inspectors Name', 'Date', 'needs_repair', 'Report Ready'],
  },
  contacts: {
    layout: 'Contacts_New',
    keyFields: ['zz__Display__ct', 'cntct_ADDR::zz__Display_Single_Line__ct', 'Type', 'Status', 'NameFirstLast', 'Name_Organization'],
  },
  projects: {
    layout: 'RCD_app',
    keyFields: ['_kpt__RCD_ID', 'zz__Display_Organization__ct', 'zz__Display_Contact__ct', 'Status', 'kanban_status', 'rcd start date', 'rcd end date', 'Work Order'],
  },
  products: {
    layout: 'Products & Services_New',
    keyFields: ['Name', 'SKU', 'Vendor', 'Category'],
  },
};

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are the High 5 Adventure Learning Center assistant. You answer questions about the organization's data across three systems: FileMaker (internal records), Shopify (e-commerce store), and QuickBooks Online (accounting).

You are READ-ONLY. Never create, edit, or delete anything.

## FileMaker tools
- get_schema(module): list real field names on a layout. Call before searching if unsure of a field name.
- search_records(module, query, limit): FileMaker find — array of field→value objects (OR-combined, fields within one object AND'd). Supports ">=date", "*wildcard*", "==exact". Example: [{"Organization":"*camp*"}].
- get_record(module, recordId): full record detail including related line items.

FileMaker modules:
- inspections: ${MODULES.inspections.keyFields.join(', ')}. Line items returned by get_record. "needs_repair" non-empty / "Report Ready"=Yes are status flags.
- contacts: ${MODULES.contacts.keyFields.join(', ')}.
- projects (internally "RCD"): ${MODULES.projects.keyFields.join(', ')}. "kanban_status" is the pipeline stage.
- products (Products & Services_New): ${MODULES.products.keyFields.join(', ')} — this is the internal product catalog, NOT the Shopify store.

## Shopify tool
- shopify_graphql(query, variables?): run a read-only GraphQL query against the Shopify Admin API.
  Use for: store products, inventory, orders, customers, collections, sales data.
  Key types: Product (id, title, createdAt, updatedAt, status, totalInventory, variants), Order (id, name, createdAt, totalPriceSet, customer, lineItems), Customer (id, displayName, email, ordersCount).
  Date filters use ISO 8601: "created_at:>2026-03-01". Count queries: productsCount, ordersCount.
  Example — products added in last 90 days:
    { productsCount(query: "created_at:>2026-03-22") { count } }
  Example — recent orders:
    { orders(first: 10, sortKey: CREATED_AT, reverse: true) { edges { node { id name createdAt totalPriceSet { shopMoney { amount currencyCode } } } } } }

## QuickBooks Online tool
- qbo_query(sql): run a read-only QBO SQL query.
  Use for: invoices, payments, items/services, customers, vendors, accounts, AR aging.
  SQL syntax: SELECT [fields|*|COUNT(*)] FROM [Table] WHERE [conditions] [ORDER BY] [STARTPOSITION n] [MAXRESULTS n]
  Key tables: Item (Name, Type, UnitPrice, QtyOnHand, CreateTime, LastUpdatedTime), Invoice (DocNumber, TxnDate, DueDate, TotalAmt, Balance, CustomerRef, CreateTime), Customer (DisplayName, Balance, CreateTime), Payment (TotalAmt, TxnDate, CustomerRef).
  Dates use ISO 8601 format: CreateTime > '2026-03-22'
  Example — items created in last 3 months:
    SELECT * FROM Item WHERE CreateTime > '2026-03-22' ORDERBY CreateTime DESC MAXRESULTS 100
  Example — open invoices:
    SELECT * FROM Invoice WHERE Balance > '0' ORDERBY DueDate ASC MAXRESULTS 50

## Guidance
- Choose the right system: internal catalog/inspections/projects/contacts → FileMaker; store products/orders/customers → Shopify; accounting/invoices/payments → QBO.
- For date questions, today is provided in the conversation or use the current date.
- Be concise and cite the record id or name you used. If a search returns nothing, say so.
- FileMaker dates are M/D/YYYY. Shopify/QBO dates are ISO 8601.`;

// ── FileMaker auth ───────────────────────────────────────────────────────────
async function fmpToken(db) {
  const r = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${db}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: FMP_BASIC },
    body: '{}',
  });
  const j = await r.json();
  if (!j?.response?.token) throw new Error('FileMaker auth failed: ' + (j?.messages?.[0]?.message || r.status));
  return j.response.token;
}
const fmpHeaders = token => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

// ── Shopify auth ─────────────────────────────────────────────────────────────
async function shopifyToken() {
  const redis = Redis.fromEnv();
  try { const t = await redis.get('shopify_token'); if (t) return t; } catch { /* redis unavailable */ }
  return process.env.SHOPIFY_TOKEN || null;
}

// ── QBO auth ─────────────────────────────────────────────────────────────────
async function qboToken() {
  const redis = Redis.fromEnv();
  const cached = await redis.get('qbo_access_token').catch(() => null);
  if (cached) return cached;

  const refreshToken = (await redis.get('qbo_refresh_token').catch(() => null)) || process.env.QBO_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('QBO not connected — no refresh token available.');

  const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const tokens = await resp.json();
  if (!resp.ok || !tokens.access_token) throw new Error('QBO token refresh failed: ' + JSON.stringify(tokens));
  await redis.set('qbo_refresh_token', tokens.refresh_token, { ex: 86400 * 90 }).catch(() => {});
  await redis.set('qbo_access_token', tokens.access_token, { ex: 55 * 60 }).catch(() => {});
  return tokens.access_token;
}

// ── Tool runner ───────────────────────────────────────────────────────────────
async function runTool(name, input, ctx) {

  // ── Shopify GraphQL ──────────────────────────────────────────────────────
  if (name === 'shopify_graphql') {
    const store = process.env.SHOPIFY_STORE;
    const token = await shopifyToken();
    if (!store || !token) return { error: 'Shopify is not connected. Check Admin → Shopify settings.' };

    const body = { query: input.query };
    if (input.variables) body.variables = input.variables;

    const r = await fetch(`https://${store}/admin/api/2025-10/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.errors) return { error: j.errors.map(e => e.message).join('; '), data: j.data ?? null };
    return { data: j.data };
  }

  // ── QBO SQL query ────────────────────────────────────────────────────────
  if (name === 'qbo_query') {
    const realmId = process.env.QBO_REALM_ID;
    if (!realmId) return { error: 'QBO is not connected. REALM_ID missing.' };

    let token;
    try { token = await qboToken(); }
    catch (e) { return { error: String(e.message) }; }

    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(input.sql)}&minorversion=65`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const j = await r.json();
    if (!r.ok) return { error: JSON.stringify(j?.Fault ?? j).slice(0, 400) };
    const qr = j?.QueryResponse ?? {};
    // Return the first entity type found, with count
    const entityKey = Object.keys(qr).find(k => k !== 'startPosition' && k !== 'maxResults' && k !== 'totalCount');
    return {
      totalCount: qr.totalCount ?? (entityKey ? (qr[entityKey]?.length ?? 0) : 0),
      startPosition: qr.startPosition,
      maxResults: qr.maxResults,
      entity: entityKey || null,
      records: entityKey ? qr[entityKey] : [],
    };
  }

  // ── FileMaker tools ──────────────────────────────────────────────────────
  const mod = MODULES[input?.module];
  if (!mod) return { error: `Unknown module "${input?.module}". Valid: ${Object.keys(MODULES).join(', ')}` };
  const layout = encodeURIComponent(mod.layout);

  if (name === 'get_schema') {
    const r = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${ctx.db}/layouts/${layout}`, { headers: fmpHeaders(ctx.token) });
    const j = await r.json();
    return { module: input.module, fields: (j?.response?.fieldMetaData || []).map(f => f.name) };
  }

  if (name === 'search_records') {
    const limit = Math.min(input.limit || 15, 40);
    const query = Array.isArray(input.query) && input.query.length ? input.query : [{ [mod.keyFields[0]]: '*' }];
    const r = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${ctx.db}/layouts/${layout}/_find`, {
      method: 'POST', headers: fmpHeaders(ctx.token), body: JSON.stringify({ query, limit }),
    });
    const j = await r.json();
    if (j?.messages?.[0]?.code !== '0') {
      if (j?.messages?.[0]?.code === '401') return { found: 0, records: [] };
      return { error: j?.messages?.[0]?.message || 'search failed', code: j?.messages?.[0]?.code };
    }
    const rows = j?.response?.data || [];
    return {
      module: input.module,
      found: j?.response?.dataInfo?.foundCount ?? rows.length,
      returned: rows.length,
      records: rows.map(row => ({ recordId: row.recordId, ...slim(row.fieldData) })),
    };
  }

  if (name === 'get_record') {
    const portalParam = mod.portals ? '?' + Object.entries(mod.portals).map(([p, n]) => `_limit.${encodeURIComponent(p)}=${n}`).join('&') : '';
    const r = await fetch(`${FMP_HOST}/fmi/data/v2/databases/${ctx.db}/layouts/${layout}/records/${encodeURIComponent(input.recordId)}${portalParam}`, { headers: fmpHeaders(ctx.token) });
    const j = await r.json();
    const rec = j?.response?.data?.[0];
    if (!rec) return { error: `No record ${input.recordId} in ${input.module}` };
    const out = { module: input.module, recordId: rec.recordId, fields: slim(rec.fieldData) };
    if (rec.portalData) out.lineItems = rec.portalData;
    return out;
  }

  return { error: `Unknown tool ${name}` };
}

function slim(fieldData = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fieldData)) {
    if (v === '' || v == null) continue;
    out[k] = typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + '…' : v;
  }
  return out;
}

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_schema',
    description: 'List the real field names on a FileMaker module layout.',
    input_schema: { type: 'object', properties: { module: { type: 'string', enum: Object.keys(MODULES) } }, required: ['module'] },
  },
  {
    name: 'search_records',
    description: 'Find FileMaker records via a query (array of field→value objects, OR-combined).',
    input_schema: { type: 'object', properties: { module: { type: 'string', enum: Object.keys(MODULES) }, query: { type: 'array', items: { type: 'object' }, description: 'FileMaker find, e.g. [{"Organization":"*camp*"}]' }, limit: { type: 'number' } }, required: ['module', 'query'] },
  },
  {
    name: 'get_record',
    description: 'Full detail for one FileMaker record (incl. line items where applicable).',
    input_schema: { type: 'object', properties: { module: { type: 'string', enum: Object.keys(MODULES) }, recordId: { type: 'string' } }, required: ['module', 'recordId'] },
  },
  {
    name: 'shopify_graphql',
    description: 'Run a read-only GraphQL query against the Shopify Admin API. Use for store products, orders, customers, inventory, and sales data.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'GraphQL query string' }, variables: { type: 'object', description: 'Optional GraphQL variables' } }, required: ['query'] },
  },
  {
    name: 'qbo_query',
    description: 'Run a read-only SQL query against QuickBooks Online. Use for invoices, payments, items/services, customers, and accounting data.',
    input_schema: { type: 'object', properties: { sql: { type: 'string', description: 'QBO SQL query, e.g. "SELECT * FROM Item WHERE CreateTime > \'2026-03-01\' MAXRESULTS 100"' } }, required: ['sql'] },
  },
];

const STATUS = {
  get_schema: 'Reading schema',
  search_records: 'Searching',
  get_record: 'Reading record',
  shopify_graphql: 'Querying Shopify',
  qbo_query: 'Querying QuickBooks',
};
function statusFor(name, input) {
  const base = STATUS[name] || 'Looking up';
  const detail = input?.module ? ` ${input.module}` : '';
  return `${base}${detail}…`;
}

function labelFor(module, f = {}) {
  if (module === 'inspections') return f.Organization || f['inspt_CNTCT__site::Name_Organization'] || `Inspection ${f._kpt__Inspection_ID || ''}`.trim();
  if (module === 'contacts') return f.zz__Display__ct || f.NameFirstLast || f.Name_Organization || 'Contact';
  if (module === 'projects') return f.zz__Display_Organization__ct || `Project ${f._kpt__RCD_ID || ''}`.trim();
  if (module === 'products') return f.Name || 'Product';
  return 'Record';
}

function collectSources(name, input, result, add) {
  const module = input?.module;
  if (name === 'get_record' && result?.recordId) {
    add({ module, recordId: String(result.recordId), label: labelFor(module, result.fields) });
  } else if (name === 'search_records' && Array.isArray(result?.records)) {
    for (const r of result.records.slice(0, 6)) add({ module, recordId: String(r.recordId), label: labelFor(module, r) });
  }
  // Shopify and QBO results don't link to in-app records (no deep-link target yet)
}

// ── Handler (Server-Sent Events) ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { messages = [], db: reqDb } = body || {};
  const db = ALLOWED_DBS.includes(reqDb) ? reqDb : ALLOWED_DBS[0];
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages required' });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const ctx = { db, token: await fmpToken(db) };
    const convo = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }));

    const sources = []; const seen = new Set();
    const addSource = s => { const k = `${s.module}:${s.recordId}`; if (!seen.has(k) && sources.length < 12) { seen.add(k); sources.push(s); } };

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const stream = anthropic.messages.stream({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, messages: convo });
      stream.on('text', delta => send({ type: 'delta', text: delta }));
      const msg = await stream.finalMessage();

      if (msg.stop_reason === 'tool_use') {
        convo.push({ role: 'assistant', content: msg.content });
        const results = [];
        for (const block of msg.content) {
          if (block.type !== 'tool_use') continue;
          send({ type: 'status', text: statusFor(block.name, block.input) });
          let result;
          try { result = await runTool(block.name, block.input, ctx); }
          catch (e) { result = { error: String(e?.message || e) }; }
          collectSources(block.name, block.input, result, addSource);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
        convo.push({ role: 'user', content: results });
        continue;
      }
      break;
    }

    if (sources.length) send({ type: 'sources', sources });
    send({ type: 'done' });
    res.end();
  } catch (e) {
    send({ type: 'error', error: String(e?.message || e) });
    res.end();
  }
}
