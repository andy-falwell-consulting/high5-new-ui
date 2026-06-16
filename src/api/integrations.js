// Push a product record to Shopify. Returns { shopifyId, variantId } on success.
export async function pushToShopify(f, recordId, existingShopifyId = null) {
  const product = {
    title: f.Name,
    body_html: f.Description || '',
    status: existingShopifyId ? undefined : 'draft',
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
  const item = {
    Name: f.Name,
    Type: f.Type === 'Service' ? 'Service' : 'NonInventory',
    Description: f.Description || '',
    UnitPrice: Number(f.Unit_Price || 0),
    ...(incomeAccount ? { IncomeAccountRef: { value: incomeAccount } } : {}),
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
