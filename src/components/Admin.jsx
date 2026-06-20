import ShopifyConnect from './ShopifyConnect';
import './Admin.css';

// Admin / settings hub. Add future integration + system cards here.
export default function Admin() {
  return (
    <main className="admin-main">
      <div className="admin-head">
        <h1>Admin</h1>
        <p className="admin-sub">Integrations and system settings</p>
      </div>

      <section className="admin-section">
        <h2 className="admin-section-title">Integrations</h2>
        <div className="admin-cards">
          <div className="admin-card">
            <div className="admin-card-head">
              <span className="admin-card-icon">◫</span>
              <div className="admin-card-meta">
                <div className="admin-card-title">Shopify</div>
                <div className="admin-card-desc">Connect the store to sync products and prices.</div>
              </div>
            </div>
            <ShopifyConnect />
          </div>
        </div>
      </section>
    </main>
  );
}
