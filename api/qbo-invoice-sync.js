// QuickBooks → FileMaker INVO mirror. Upserts an INVO record (+ line items) for
// every QBO invoice whose customer maps to a reconciled FMP contact
// (Contacts_New._kaf__qbo_id == QBO customer id). Figures live in the INVO Memo
// (JSON) because FMP's total fields are script-maintained calcs; the app reads
// them via invoiceRowInfo(). PDFs are mirrored lazily elsewhere (on first view).
//
// Resumable + bounded per run (cron-driven): backfill paginates all invoices,
// then switches to incremental (LastUpdatedTime high-water mark).
//
// GET/POST /api/qbo-invoice-sync?db=High5_Core4_Dev   (gated; see authorized())
import { Redis } from '@upstash/redis';
import { getGoogleSession } from './_googleSession.js';
import { qboQuery, qboRequest } from './_qbo.js';
import { fmpToken, fmFind, fmCreate, fmUpdate, fmDelete, ALLOWED_DBS } from './_fmp.js';

export const config = { maxDuration: 300 };

const redis = Redis.fromEnv();
const SYNC_KEY = process.env.QBO_SYNC_KEY;
const PAGE = 25; // QBO invoices per page (each does several FMP writes → keep small)

async function authorized(req) {
  if (SYNC_KEY && (req.headers['x-sync-key'] === SYNC_KEY || req.query?.key === SYNC_KEY)) return true;
  return !!(await getGoogleSession(req));
}

const mk = db => `qboinv:${db}:meta`;
const fmDate = iso => { if (!iso) return ''; const [y, m, d] = String(iso).split('T')[0].split('-'); return `${m}/${d}/${y}`; };
const n = v => Number(v || 0);

async function getMeta(db) {
  return (await redis.get(mk(db))) || { phase: 'backfill', cursor: 1, hwm: '', upserted: 0, skipped: 0, lastSync: 0 };
}

// customerId -> FMP contact _kpt__Contact_ID (or null), cached per run.
function makeResolver(db, token) {
  const cache = new Map();
  return async function resolve(customerId) {
    if (!customerId) return null;
    if (cache.has(customerId)) return cache.get(customerId);
    const rows = await fmFind(db, 'Contacts_New', [{ _kaf__qbo_id: `==${customerId}` }], token, 50);
    let pick = rows.find(r => (r.fieldData?.Name_Organization || '').trim()) || rows[0];
    const cid = pick?.fieldData?._kpt__Contact_ID || null;
    cache.set(customerId, cid);
    return cid;
  };
}

// Upsert one QBO invoice into FMP (INVO record + line items).
async function upsertInvoice(db, token, inv, resolve) {
  const customerId = inv.CustomerRef?.value;
  const contactId = await resolve(customerId);
  if (!contactId) return 'skipped'; // no reconciled contact → hold

  const doc = inv.DocNumber ? String(inv.DocNumber) : '';
  const total = n(inv.TotalAmt), balance = n(inv.Balance);
  const tax = n(inv.TxnTaxDetail?.TotalTax);
  const status = balance > 0 ? 'Open' : (total > 0 ? 'Paid' : '—');
  const memo = JSON.stringify({ qboId: inv.Id, customerId, subtotal: Math.round((total - tax) * 100) / 100, tax, total, balance, status });
  const fieldData = {
    Date: fmDate(inv.TxnDate),
    Title: inv.CustomerRef?.name || '',
    _kft__Contact_ID: String(contactId),
    QuickBooks_Reference_Number: doc,
    QuickBooks_Needs_Refresh: 0,
    Memo: memo,
  };

  // find existing INVO by DocNumber
  let invoiceId; // FMP _kpt__Invoice_ID
  const existing = doc ? await fmFind(db, 'Invoices_Form', [{ QuickBooks_Reference_Number: `==${doc}` }], token, 1) : [];
  if (existing.length) {
    await fmUpdate(db, 'Invoices_Form', existing[0].recordId, fieldData, token);
    invoiceId = existing[0].fieldData._kpt__Invoice_ID;
  } else {
    await fmCreate(db, 'Invoices_Form', fieldData, token);
    const created = await fmFind(db, 'Invoices_Form', [{ QuickBooks_Reference_Number: `==${doc}` }], token, 1);
    invoiceId = created[0]?.fieldData?._kpt__Invoice_ID;
  }
  if (!invoiceId) return 'upserted'; // header in; couldn't key line items (rare)

  // reconcile line items: delete existing, recreate from QBO SalesItemLines
  const old = await fmFind(db, 'Invoice_Line_Items', [{ _kft__Invoice_ID: `==${invoiceId}` }], token, 100);
  for (const o of old) await fmDelete(db, 'Invoice_Line_Items', o.recordId, token);
  for (const L of (inv.Line || [])) {
    if (L.DetailType !== 'SalesItemLineDetail') continue;
    const d = L.SalesItemLineDetail || {};
    await fmCreate(db, 'Invoice_Line_Items', {
      _kft__Invoice_ID: String(invoiceId),
      Item_Name: (L.Description || d.ItemRef?.name || 'Item').slice(0, 250),
      Quantity: d.Qty || 1,
      Amount: n(L.Amount),
    }, token);
  }
  return 'upserted';
}

export async function runInvoiceSync(db, budgetMs = 260000) {
  if (!ALLOWED_DBS.has(db)) throw new Error('db not allowed');
  const started = Date.now();
  const token = await fmpToken(db);
  const meta = await getMeta(db);
  const resolve = makeResolver(db, token);

  const processPage = async (sql) => {
    const qr = await qboQuery(sql);
    const invoices = qr.Invoice || [];
    for (const lite of invoices) {
      if (Date.now() - started > budgetMs) return { invoices, stopped: true };
      // list query returns full invoices already (SELECT *), incl Line[]
      const r = await upsertInvoice(db, token, lite, resolve);
      meta[r === 'skipped' ? 'skipped' : 'upserted']++;
      const u = lite.MetaData?.LastUpdatedTime;
      if (u && u > meta.hwm) meta.hwm = u;
    }
    return { invoices, stopped: false };
  };

  if (meta.phase === 'backfill') {
    while (Date.now() - started < budgetMs) {
      const { invoices, stopped } = await processPage(
        `SELECT * FROM Invoice ORDERBY Id STARTPOSITION ${meta.cursor} MAXRESULTS ${PAGE}`);
      if (!stopped) meta.cursor += invoices.length;
      await redis.set(mk(db), meta);
      if (invoices.length < PAGE) { meta.phase = 'idle'; break; }
      if (stopped) break;
    }
  } else {
    // incremental: invoices changed since the high-water mark (balance/edits)
    let pos = 1;
    while (Date.now() - started < budgetMs) {
      const where = meta.hwm ? ` WHERE MetaData.LastUpdatedTime > '${meta.hwm}'` : '';
      const { invoices, stopped } = await processPage(
        `SELECT * FROM Invoice${where} ORDERBY MetaData.LastUpdatedTime STARTPOSITION ${pos} MAXRESULTS ${PAGE}`);
      if (stopped) break;
      pos += invoices.length;
      if (invoices.length < PAGE) break;
    }
  }

  meta.lastSync = Date.now();
  await redis.set(mk(db), meta);
  return meta;
}

export default async function handler(req, res) {
  if (!(await authorized(req))) return res.status(401).json({ error: 'unauthorized' });
  const db = req.query.db || 'High5_Core4';
  try {
    const meta = await runInvoiceSync(db, 270000);
    return res.status(200).json({ db, phase: meta.phase, upserted: meta.upserted, skipped: meta.skipped, cursor: meta.cursor, hwm: meta.hwm, lastSync: meta.lastSync });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
