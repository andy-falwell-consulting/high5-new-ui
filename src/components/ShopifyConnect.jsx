import { useState, useEffect } from 'react';
import './ShopifyConnect.css';

// Small Shopify connection status + Connect/Reconnect button. Reads the
// read-only health check (GET /api/shopify) and starts OAuth via /api/shopify-auth.
export default function ShopifyConnect() {
  const [status, setStatus] = useState(undefined); // undefined=loading
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams(window.location.search);
    if (p.get('shopify')) {
      const t = p.get('shopify') === 'connected'
        ? { ok: true, text: 'Connected to Shopify' }
        : { ok: false, text: `Connect failed: ${p.get('reason') || 'error'}` };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time OAuth return handling
      setToast(t);
      p.delete('shopify'); p.delete('reason');
      const qs = p.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      setTimeout(() => { if (alive) setToast(null); }, 5000);
    }
    fetch('/api/shopify')
      .then(r => (r.ok ? r.json() : { unreachable: true }))
      .catch(() => ({ unreachable: true }))
      .then(s => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);

  const connected = status?.ok === true;
  const state = status === undefined ? 'loading' : connected ? 'on' : status?.unreachable ? 'unknown' : 'off';
  const label = status === undefined ? 'Checking Shopify…'
    : connected ? (status.shopName || 'Shopify connected')
    : status.unreachable ? 'Shopify status unavailable'
    : 'Shopify not connected';

  return (
    <div className="shopify-connect">
      <div className="sc-row">
        <span className={`sc-dot ${state}`} />
        <span className="sc-label" title={label}>{label}</span>
        {status !== undefined && !status?.unreachable && (
          <button className="sc-btn" onClick={() => { window.location.href = '/api/shopify-auth'; }}>
            {connected ? 'Reconnect' : 'Connect'}
          </button>
        )}
      </div>
      {toast && <div className={`sc-toast ${toast.ok ? 'ok' : 'err'}`}>{toast.text}</div>}
    </div>
  );
}
