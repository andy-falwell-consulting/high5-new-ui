// Fetch a QuickBooks invoice PDF by its DocNumber — the reference # stored in
// FileMaker as _kat__QuickBooks_Invoice_ID (and QuickBooks_Reference_Number on
// the INVO portal). FMP stores the DocNumber, not QBO's internal id, so we
// resolve the id first, then pull the styled PDF. Returns a File ready to feed
// straight into the existing attachment upload path.

async function qboPost(body) {
  const r = await fetch('/api/qbo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `QuickBooks request failed (${r.status})`);
  return data;
}

export const invoiceFileName = ref => `Invoice ${String(ref ?? '').trim()}.pdf`;

export async function fetchInvoicePdfFile(docNumber) {
  const ref = String(docNumber ?? '').trim();
  if (!ref) throw new Error('No invoice number on this record');

  // 1. resolve DocNumber → QBO invoice (gives the internal id + customer/total)
  const lookup = await qboPost({ action: 'get-invoice', docNumber: ref });
  const inv = lookup?.QueryResponse?.Invoice?.[0];
  if (!inv) throw new Error(`No QuickBooks invoice found for #${ref}`);

  // 2. fetch the styled PDF by the internal id
  const pdf = await qboPost({ action: 'invoice-pdf', invoiceId: inv.Id, base64: true });
  if (!pdf?.base64) throw new Error('Could not retrieve the invoice PDF');

  const bytes = Uint8Array.from(atob(pdf.base64), c => c.charCodeAt(0));
  const file = new File([bytes], invoiceFileName(ref), { type: 'application/pdf' });
  return { file, invoice: inv };
}
