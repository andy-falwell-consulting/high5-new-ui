import { useState } from 'react';
import './NewItemModal.css';

const CATEGORIES = ['Catalog','Hardware','Typical Component','Tool','Labor','Lumber','Low Element','High Element','Repair','Training'];
const TYPES = ['Product','Service'];
const VENDORS = ['AtHeight','Atomik Climbing','Edelrid','High 5','Liberty Mountain','Lavalley Building Supply, Perkins','Peak','Petzl','S&S','Sticker Mule'];
const QBO_INCOME = [
  { label: '4010 - Open Enrollment', value: '151' },
  { label: '4020 - Custom training', value: '177' },
  { label: '4021 - Adult Custom Direct Service', value: '112' },
  { label: '4022 - Corporate Programs', value: '116' },
  { label: '4023 - College Programs', value: '117' },
  { label: '4024 - Youth Programs', value: '118' },
  { label: '4050 - Program Review', value: '137' },
  { label: '4065 - Planning - Custom', value: '329' },
  { label: '4200 - Challenge Course Services', value: '236' },
  { label: '4210 - Low or High Elements', value: '244' },
  { label: '4230 - Inspection Services', value: '303' },
  { label: '4240 - Repairs', value: '268' },
  { label: '4410 - Store / Catalog Sales', value: '155' },
  { label: '4430 - Manuals and Misc', value: '156' },
];

export default function NewItemModal({ onClose, onCreate }) {
  const [fields, setFields] = useState({
    Name: '', Type: 'Product', Category: 'Hardware',
    Vendor: '', Cost: '', Unit_Price: '', Description: '',
  });
  const [pushShopify, setPushShopify] = useState(false);
  const [shopifyStatus, setShopifyStatus] = useState('draft');
  const [pushQBO, setPushQBO] = useState(false);
  const [qboIncome, setQboIncome] = useState('155');
  const [status, setStatus] = useState(null); // null | 'saving' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!fields.Name.trim()) { setErrorMsg('Name is required.'); setStatus('error'); return; }
    setStatus('saving'); setErrorMsg('');
    try {
      await onCreate({ fields, pushShopify, shopifyStatus, pushQBO, qboIncome });
      onClose();
    } catch (e) {
      setErrorMsg(e.message || 'Something went wrong.');
      setStatus('error');
    }
  };

  return (
    <div className="nim-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="nim-drawer">
        <div className="nim-header">
          <h2>New Product / Service</h2>
          <button className="nim-close" onClick={onClose}>✕</button>
        </div>

        <div className="nim-body">
          {/* Core fields */}
          <section className="nim-section">
            <h3>FileMaker</h3>
            <div className="nim-grid">
              <label>Name *
                <input value={fields.Name} onChange={e => set('Name', e.target.value)} placeholder="Product name" />
              </label>
              <label>SKU
                <input value="Assigned automatically on save" readOnly disabled className="nim-readonly" />
              </label>
              <label>Type
                <select value={fields.Type} onChange={e => set('Type', e.target.value)}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label>Category
                <select value={fields.Category} onChange={e => set('Category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>Vendor
                <select value={fields.Vendor} onChange={e => set('Vendor', e.target.value)}>
                  <option value="">—</option>
                  {VENDORS.map(v => <option key={v}>{v}</option>)}
                </select>
              </label>
              <label>Cost ($)
                <input type="number" value={fields.Cost} onChange={e => set('Cost', e.target.value)} placeholder="0.00" step="0.01" />
              </label>
              <label>Unit Price ($)
                <input type="number" value={fields.Unit_Price} onChange={e => set('Unit_Price', e.target.value)} placeholder="0.00" step="0.01" />
              </label>
            </div>
            <label className="nim-wide">Description
              <textarea value={fields.Description} onChange={e => set('Description', e.target.value)} rows={3} placeholder="Product description…" />
            </label>
          </section>

          {/* Shopify */}
          <section className="nim-section">
            <label className="nim-toggle">
              <input type="checkbox" checked={pushShopify} onChange={e => setPushShopify(e.target.checked)} />
              <span>Also create in <strong>Shopify</strong></span>
            </label>
            {pushShopify && (
              <div className="nim-grid nim-sub">
                <label>Status
                  <select value={shopifyStatus} onChange={e => setShopifyStatus(e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </select>
                </label>
              </div>
            )}
          </section>

          {/* QBO */}
          <section className="nim-section">
            <label className="nim-toggle">
              <input type="checkbox" checked={pushQBO} onChange={e => setPushQBO(e.target.checked)} />
              <span>Also create in <strong>QuickBooks</strong></span>
            </label>
            {pushQBO && (
              <div className="nim-grid nim-sub">
                <label>Income Account
                  <select value={qboIncome} onChange={e => setQboIncome(e.target.value)}>
                    {QBO_INCOME.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
              </div>
            )}
          </section>
        </div>

        <div className="nim-footer">
          {status === 'error' && <span className="nim-error">{errorMsg}</span>}
          <button className="nim-btn cancel" onClick={onClose}>Cancel</button>
          <button className="nim-btn save" onClick={handleSubmit} disabled={status === 'saving'}>
            {status === 'saving' ? 'Creating…' : 'Create Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
