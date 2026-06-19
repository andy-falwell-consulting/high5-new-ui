const QBO_INCOME_NAMES = {
  '151': '4010 - Open Enrollment',
  '177': '4020 - Custom training',
  '112': '4021 - Adult Custom Direct Service',
  '116': '4022 - Corporate Programs',
  '117': '4023 - College Programs',
  '118': '4024 - Youth Programs',
  '137': '4050 - Program Review',
  '329': '4065 - Planning - Custom',
  '236': '4200 - Challenge Course Services',
  '244': '4210 - Low or High Elements (new installations)',
  '303': '4230 - Inspection Services',
  '268': '4240 - Repairs',
  '155': '4410 - Store / Catalog Sales',
  '156': '4430 - Manuals and Miscellaneous Items',
};

// Push a product record to Shopify. Returns { shopifyId, variantId } on success.
export async function pushToShopify(f, recordId, existingShopifyId = null) {
  const product = {
    title: f.Name,
    body_html: f.Description || '',
    status: existingShopifyId ? undefined : (f.status || 'draft'),
    variants: [{ price: String(f.Unit_Price || 0), sku: f.SKU || '' }],
  };

  const action = existingShopifyId ? 'update' : 'create';
  const body = { action, product };
  if (existingShopifyId) body.productId = existingShopifyId;

  const res = await fetch('/api/shopify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Shopify error');

  const p = data.product;
  return { shopifyId: String(p.id), variantId: String(p.variants?.[0]?.id ?? '') };
}

// Push a product record to QBO. Returns { qboId } on success.
export async function pushToQBO(f, existingQboId = null, incomeAccount = null) {
  const incomeRef = incomeAccount
    ? { value: String(incomeAccount), name: QBO_INCOME_NAMES[incomeAccount] ?? '' }
    : null;

  const item = {
    Name: f.Name,
    Type: f.Type === 'Service' ? 'Service' : 'NonInventory',
    Sku: f.SKU || '',
    Description: f.Description || '',
    UnitPrice: Number(f.Unit_Price || 0),
    ...(incomeRef ? { IncomeAccountRef: incomeRef } : {}),
  };

  const action = existingQboId ? 'update' : 'create';
  const body = { action, item };
  if (existingQboId) body.itemId = existingQboId;

  const res = await fetch('/api/qbo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'QBO error');

  return { qboId: String(data.QueryResponse?.Item?.[0]?.Id ?? data.Item?.Id ?? '') };
}
