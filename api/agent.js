// Read-only data assistant. Answers questions about FileMaker records by letting
// Claude call a small set of read-only tools (schema / search / get) that this
// function executes server-side against the FileMaker Data API. The API key and
// FMP credentials never leave the server.
import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 60 };

const FMP_HOST = 'https://ILELLCO.pcifmhosting.com';
const FMP_BASIC = 'Basic ' + Buffer.from('admin:itstime').toString('base64');
const ALLOWED_DBS = ['High5_Core4_Dev', 'High5_Core4_Stage', 'High5_Core4'];
const MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_TURNS = 8;

// Which FileMaker layout backs each module the assistant can read, plus the
// fields most useful for searching (seeded into the prompt; full schema is
// available on demand via the get_schema tool).
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

const SYSTEM = `You are the High 5 Core DB assistant. You answer questions about the organization's FileMaker records: adventure-course Inspections, Contacts, Course projects (internally "RCD"), and Products & Services.

You are READ-ONLY. You can search and read records but never create, edit, or delete anything.

Tools:
- get_schema(module): list the real field names on a module's layout. Call this when you are unsure of a field name before searching.
- search_records(module, query, limit): query is a FileMaker find — an array of objects mapping field name to a search value (supports operators like ">=", "*wildcard*", "==exact"). Multiple objects are OR'd; fields within one object are AND'd. Example: [{"Organization":"*camp*"}].
- get_record(module, recordId): full detail for one record, including related line items where applicable.

Modules and useful fields:
- inspections (layout Inspections_New): ${MODULES.inspections.keyFields.join(', ')}. Each inspection has line items (category, grade, description) returned by get_record. "needs_repair" non-empty / "Report Ready"=Yes are status flags.
- contacts (Contacts_New): ${MODULES.contacts.keyFields.join(', ')}.
- projects (RCD_app): ${MODULES.projects.keyFields.join(', ')}. "kanban_status" is the pipeline stage.
- products (Products & Services_New): ${MODULES.products.keyFields.join(', ')}.

Guidance:
- Prefer searching by organization/name with wildcards (e.g. "*bristol*").
- When asked about a specific record, search to find it, then get_record for detail.
- Be concise and factual. Cite the record id and organization/name you used. If a search returns nothing, say so rather than guessing.
- Dates are M/D/YYYY. Today's context may be provided by the user.`;

// ── FileMaker Data API (server-side) ──────────────────────────────────────
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

async function runTool(name, input, ctx) {
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
      if (j?.messages?.[0]?.code === '401') return { found: 0, records: [] }; // no match
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

// Trim empty/huge fields to keep tool results token-light.
function slim(fieldData = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fieldData)) {
    if (v === '' || v == null) continue;
    out[k] = typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + '…' : v;
  }
  return out;
}

const TOOLS = [
  { name: 'get_schema', description: 'List the real field names on a module layout.', input_schema: { type: 'object', properties: { module: { type: 'string', enum: Object.keys(MODULES) } }, required: ['module'] } },
  { name: 'search_records', description: 'Find records via a FileMaker query (array of field→value objects, OR-combined).', input_schema: { type: 'object', properties: { module: { type: 'string', enum: Object.keys(MODULES) }, query: { type: 'array', items: { type: 'object' }, description: 'FileMaker find query, e.g. [{"Organization":"*camp*"}]' }, limit: { type: 'number' } }, required: ['module', 'query'] } },
  { name: 'get_record', description: 'Full detail for one record (incl. line items where applicable).', input_schema: { type: 'object', properties: { module: { type: 'string', enum: Object.keys(MODULES) }, recordId: { type: 'string' } }, required: ['module', 'recordId'] } },
];

// Human-readable status while a tool runs (streamed to the panel).
const STATUS = { get_schema: 'Reading schema', search_records: 'Searching', get_record: 'Reading' };
function statusFor(name, input) {
  return `${STATUS[name] || 'Looking up'} ${input?.module || ''}…`.replace(/\s+…/, '…');
}

// Pull a human label for a record so a source chip reads nicely.
function labelFor(module, f = {}) {
  if (module === 'inspections') return f.Organization || f['inspt_CNTCT__site::Name_Organization'] || `Inspection ${f._kpt__Inspection_ID || ''}`.trim();
  if (module === 'contacts') return f.zz__Display__ct || f.NameFirstLast || f.Name_Organization || 'Contact';
  if (module === 'projects') return f.zz__Display_Organization__ct || `Project ${f._kpt__RCD_ID || ''}`.trim();
  if (module === 'products') return f.Name || 'Product';
  return 'Record';
}

// Records the agent actually touched become clickable sources. get_record is the
// most precise signal; search hits are included (capped) for list-style answers.
function collectSources(name, input, result, add) {
  const module = input?.module;
  if (name === 'get_record' && result?.recordId) {
    add({ module, recordId: String(result.recordId), label: labelFor(module, result.fields) });
  } else if (name === 'search_records' && Array.isArray(result?.records)) {
    for (const r of result.records.slice(0, 6)) add({ module, recordId: String(r.recordId), label: labelFor(module, r) });
  }
}

// ── Handler (Server-Sent Events) ────────────────────────────────────────────
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
      break; // end_turn — text already streamed
    }

    if (sources.length) send({ type: 'sources', sources });
    send({ type: 'done' });
    res.end();
  } catch (e) {
    send({ type: 'error', error: String(e?.message || e) });
    res.end();
  }
}
