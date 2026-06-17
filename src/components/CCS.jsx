import { useState, useCallback, useRef, useEffect } from 'react';
import { useAllRecords } from '../hooks/useAllRecords';
import { getRecord, prefetchRecord } from '../api/filemaker';
import './CCS.css';

const LAYOUT = 'RCD_New';

const STATUS_COLOR = {
  'Proposed':    '#e87722',
  'Confirmed':   '#3b82f6',
  'In Progress': '#a855f7',
  'Complete':    '#22c55e',
  'Cancelled':   '#64748b',
  'On Hold':     '#f59e0b',
};

function statusColor(s) { return STATUS_COLOR[s] || '#64748b'; }

function fmt(val) { return val || '—'; }
function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Check({ val, label }) {
  const on = Number(val) === 1;
  return (
    <div className={`ccs-check ${on ? 'on' : 'off'}`}>
      <span className="ccs-check-box">{on ? '✓' : ''}</span>
      <span className="ccs-check-label">{label}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="ccs-section">
      <h3 className="ccs-section-title">{title}</h3>
      <div className="ccs-section-body">{children}</div>
    </div>
  );
}

function Field({ label, value, wide }) {
  return (
    <div className={`ccs-field${wide ? ' wide' : ''}`}>
      <span className="ccs-field-label">{label}</span>
      <span className="ccs-field-value">{fmt(value)}</span>
    </div>
  );
}

function PortalTable({ columns, rows }) {
  if (!rows?.length) return <p className="ccs-empty-portal">No records</p>;
  return (
    <table className="ccs-portal-table">
      <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map(c => <td key={c.key}>{c.fmt ? c.fmt(row[c.key]) : fmt(row[c.key])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CCS() {
  const { records, total } = useAllRecords(LAYOUT, {
    slimForStorage: r => ({
      recordId: r.recordId,
      fieldData: {
        zz__Display_Organization__ct: r.fieldData.zz__Display_Organization__ct,
        zz__Display_Contact__ct: r.fieldData.zz__Display_Contact__ct,
        Status: r.fieldData.Status,
        'Type of Project': r.fieldData['Type of Project'],
        'rcd start date': r.fieldData['rcd start date'],
        Work_Order: r.fieldData['Work Order'],
      },
    }),
  });

  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [navWidth, setNavWidth] = useState(300);
  const [activePortal, setActivePortal] = useState('estimates');
  const isResizing = useRef(false);

  const startResize = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startW = navWidth;
    const onMove = (e) => {
      if (!isResizing.current) return;
      setNavWidth(Math.min(500, Math.max(200, startW + (e.clientX - startX))));
    };
    const onUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [navWidth]);

  const filtered = records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    const f = r.fieldData;
    return (
      f.zz__Display_Organization__ct?.toLowerCase().includes(q) ||
      f.zz__Display_Contact__ct?.toLowerCase().includes(q) ||
      f.Status?.toLowerCase().includes(q) ||
      f['Type of Project']?.toLowerCase().includes(q) ||
      f['Work Order']?.toLowerCase().includes(q)
    );
  });

  async function handleSelect(r) {
    setSelected(r);
    setActivePortal('estimates');
    getRecord(LAYOUT, r.recordId).then(detail => {
      setSelected(prev => prev?.recordId === r.recordId ? detail.response.data[0] : prev);
    }).catch(() => {});
  }

  const f = selected?.fieldData || {};
  const portals = selected?.portalData || {};

  const estimates = portals['Portal__Estimates 2'] || [];
  const invoices  = portals['Portal__Invoices']     || [];
  const payments  = portals['Portal__Payments']     || [];

  return (
    <div className="ccs-root">
      {/* Nav */}
      <nav className="ccs-nav" style={{ width: navWidth }}>
        <div className="ccs-nav-header">
          <span className="ccs-nav-title">CCS</span>
          <span className="ccs-nav-count">{total ? `${records.length} / ${total}` : records.length}</span>
        </div>
        <div className="ccs-search-wrap">
          <input
            className="ccs-search"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="ccs-list">
          {filtered.map(r => {
            const rf = r.fieldData;
            const sc = statusColor(rf.Status);
            return (
              <div
                key={r.recordId}
                className={`ccs-list-item${selected?.recordId === r.recordId ? ' active' : ''}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => prefetchRecord(LAYOUT, r.recordId)}
              >
                <div className="ccs-list-org">{rf.zz__Display_Organization__ct || '—'}</div>
                <div className="ccs-list-meta">
                  <span className="ccs-list-contact">{rf.zz__Display_Contact__ct || ''}</span>
                  {rf.Status && (
                    <span className="ccs-list-status" style={{ color: sc, borderColor: sc + '44', background: sc + '18' }}>
                      {rf.Status}
                    </span>
                  )}
                </div>
                {rf['Type of Project'] && <div className="ccs-list-type">{rf['Type of Project']}</div>}
                {rf['rcd start date'] && <div className="ccs-list-date">{fmtDate(rf['rcd start date'])}</div>}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Resize handle */}
      <div className="ccs-resize-handle" onMouseDown={startResize} />

      {/* Main */}
      <main className="ccs-main">
        {!selected ? (
          <div className="ccs-empty">
            <div className="ccs-empty-icon">◈</div>
            <p>Select a record</p>
          </div>
        ) : (
          <div className="ccs-detail">
            {/* Topbar */}
            <div className="ccs-topbar">
              <div className="ccs-topbar-left">
                <h1 className="ccs-title">{f.zz__Display_Organization__ct || '—'}</h1>
                <div className="ccs-topbar-meta">
                  {f.zz__Display_Contact__ct && <span className="ccs-contact-chip">{f.zz__Display_Contact__ct}</span>}
                  {f.Status && (
                    <span className="ccs-status-badge" style={{
                      color: statusColor(f.Status),
                      borderColor: statusColor(f.Status) + '44',
                      background: statusColor(f.Status) + '18',
                    }}>{f.Status}</span>
                  )}
                  {f['Type of Project'] && <span className="ccs-type-chip">{f['Type of Project']}</span>}
                  {f['Work Order'] && <span className="ccs-wo">WO: {f['Work Order']}</span>}
                </div>
              </div>
              <div className="ccs-topbar-right">
                {f['rcd start date'] && <div className="ccs-date-block"><span className="ccs-date-label">Start</span><span className="ccs-date-val">{fmtDate(f['rcd start date'])}</span></div>}
                {f['rcd end date']   && <div className="ccs-date-block"><span className="ccs-date-label">End</span><span className="ccs-date-val">{fmtDate(f['rcd end date'])}</span></div>}
                {f.Confirmed        && <div className="ccs-date-block"><span className="ccs-date-label">Confirmed</span><span className="ccs-date-val">{fmtDate(f.Confirmed)}</span></div>}
              </div>
            </div>

            {/* Sections */}
            <div className="ccs-sections">
              <Section title="Project Details">
                <div className="ccs-fields-grid">
                  <Field label="Type" value={f['Type of Project']} />
                  <Field label="Work Order" value={f['Work Order']} />
                  <Field label="PO Number" value={f.po_number} />
                  <Field label="Distance" value={f['Distance to High5']} />
                  <Field label="Drive Time" value={f['Drive Time']} />
                  <Field label="Lead Builder" value={f['Lead Builder']} />
                  <Field label="Builder 1" value={f.Builder1} />
                  <Field label="Builder 2" value={f.Builder2} />
                  <Field label="Builder 3" value={f.Builder3} />
                  <Field label="Report Date Sent" value={fmtDate(f['Report Date Sent'])} />
                  <Field label="Final Sent" value={fmtDate(f['Final Sent'])} />
                  <Field label="Contract Date Sent" value={fmtDate(f['Contract_Date_Sent'])} />
                </div>
                {f.Address_Block_Billing && (
                  <div className="ccs-address">
                    <span className="ccs-field-label">Address</span>
                    <span className="ccs-field-value">{f.Address_Block_Billing}</span>
                  </div>
                )}
                {f.Notes && (
                  <div className="ccs-notes">
                    <span className="ccs-field-label">Notes</span>
                    <p className="ccs-notes-text">{f.Notes}</p>
                  </div>
                )}
              </Section>

              <div className="ccs-checklist-grid">
                <Section title="Pre-Project">
                  <div className="ccs-checks">
                    <Check val={f.pp_New_cust_exist_course_survey} label="Site Survey" />
                    <Check val={f.pp_Created_Client_Folder || f['pp_Created Client Folder']} label="Client Folder" />
                    <Check val={f['pp_Create CCS for Site Eval']} label="CCS for Site Eval" />
                    <Check val={f['p_CCS Estimate']} label="CCS Estimate" />
                    <Check val={f['p_Training Plan']} label="Training Plan" />
                    <Check val={f['p_Drawings']} label="Drawings" />
                    <Check val={f['p_Mark as Proposed']} label="Mark as Proposed" />
                    <Check val={f['pp_Sent PD Form']} label="Sent PD Form" />
                  </div>
                </Section>

                <Section title="Contract & Deposit">
                  <div className="ccs-checks">
                    <Check val={f['cd_Sent Contract']} label="Sent Contract" />
                    <Check val={f['cd_Add to Cal']} label="Add to Calendar" />
                    <Check val={f['cd_Received Contract']} label="Received Contract" />
                    <Check val={f['cd_Received Deposit']} label="Received Deposit" />
                    <Check val={f['cd_Received PO']} label="Received PO" />
                    <Check val={f.Final_Invoice_Received} label="Final Invoice Received" />
                  </div>
                </Section>

                <Section title="Install Prep">
                  <div className="ccs-checks">
                    <Check val={f['iprep_Prefab List']} label="Prefab List" />
                    <Check val={f['iprep_Construction Layout']} label="Construction Layout" />
                    <Check val={f['iprep_Training']} label="Training" />
                    <Check val={f['iprep_Equipment']} label="Equipment" />
                    <Check val={f['iprep_Need Inspection']} label="Need Inspection" />
                  </div>
                </Section>

                <Section title="Event Prep">
                  <div className="ccs-checks">
                    <Check val={f['eprep_Setting Scheduled']} label="Setting Scheduled" />
                    <Check val={f['eprep_Setting Complete']} label="Setting Complete" />
                    <Check val={f['eprep_Dig Safe']} label="Dig Safe" />
                    <Check val={f['eprep_Equipment Requested']} label="Equipment Requested" />
                    <Check val={f['eprep_Equipment Reserved']} label="Equipment Reserved" />
                    <Check val={f['eprep_Poles Ordered']} label="Poles Ordered" />
                    <Check val={f['eprep_Poles Delivered']} label="Poles Delivered" />
                    <Check val={f['eprep_Climbing Holds Ordered']} label="Holds Ordered" />
                    <Check val={f['eprep_Climbing Holds Delivered']} label="Holds Delivered" />
                    <Check val={f['eprep_Tarps Mats Ordered']} label="Tarps/Mats Ordered" />
                    <Check val={f['eprep_Tarps Mats Delivered']} label="Tarps/Mats Delivered" />
                    <Check val={f['eprep_Specialty Hardware']} label="Specialty Hardware" />
                    <Check val={f['eprep_Lumber_ordered']} label="Lumber Ordered" />
                    <Check val={f['eprep_Lumber_ordered_delivered']} label="Lumber Delivered" />
                    <Check val={f['eprep_Permits']} label="Permits" />
                  </div>
                </Section>
              </div>

              {/* Job Sheet */}
              {(f['Job Sheet Poles'] || f['Job Sheet Setting'] || f['Job Sheet Equipment Rental'] ||
                f['Job Sheet Climbing Holds'] || f['Job Sheet Mats Tarps'] || f['Job Sheet Specialty Hardware'] ||
                f['Job Sheet Lumber Order'] || f['Job Sheet Permits']) && (
                <Section title="Job Sheet">
                  <div className="ccs-fields-grid">
                    <Field label="Poles" value={f['Job Sheet Poles']} />
                    <Field label="Setting" value={f['Job Sheet Setting']} />
                    <Field label="Equipment Rental" value={f['Job Sheet Equipment Rental']} />
                    <Field label="Climbing Holds" value={f['Job Sheet Climbing Holds']} />
                    <Field label="Mats / Tarps" value={f['Job Sheet Mats Tarps']} />
                    <Field label="Specialty Hardware" value={f['Job Sheet Specialty Hardware']} />
                    <Field label="Lumber Order" value={f['Job Sheet Lumber Order']} />
                    <Field label="Permits" value={f['Job Sheet Permits']} />
                  </div>
                </Section>
              )}

              {/* Financials portals */}
              <Section title="Financials">
                <div className="ccs-portal-tabs">
                  {[['estimates','Estimates'],['invoices','Invoices'],['payments','Payments']].map(([id,label]) => (
                    <button key={id} className={`ccs-portal-tab${activePortal===id?' active':''}`} onClick={() => setActivePortal(id)}>
                      {label}
                      <span className="ccs-portal-count">
                        {id==='estimates'?estimates.length:id==='invoices'?invoices.length:payments.length}
                      </span>
                    </button>
                  ))}
                </div>

                {activePortal === 'estimates' && (
                  <PortalTable
                    columns={[
                      { key: 'cntct_ESTMT::Title', label: 'Title' },
                      { key: 'cntct_ESTMT::Date', label: 'Date', fmt: fmtDate },
                      { key: 'cntct_ESTMT::Status', label: 'Status' },
                      { key: 'cntct_ESTMT::zz__Total__xn', label: 'Total', fmt: v => v ? `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2})}` : '—' },
                    ]}
                    rows={estimates}
                  />
                )}
                {activePortal === 'invoices' && (
                  <PortalTable
                    columns={[
                      { key: 'cntct_INVO::QuickBooks_Reference_Number', label: 'Ref #' },
                      { key: 'cntct_INVO::Date', label: 'Date', fmt: fmtDate },
                      { key: 'cntct_INVO::zz__Total__xn', label: 'Total', fmt: v => v ? `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2})}` : '—' },
                      { key: 'cntct_INVO::zz__Balance_Due__cn', label: 'Balance', fmt: v => v ? `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2})}` : '—' },
                    ]}
                    rows={invoices}
                  />
                )}
                {activePortal === 'payments' && (
                  <PortalTable
                    columns={[
                      { key: 'cntct_PMT::Date', label: 'Date', fmt: fmtDate },
                      { key: 'cntct_PMT::Method', label: 'Method' },
                      { key: 'cntct_PMT::Amount', label: 'Amount', fmt: v => v ? `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2})}` : '—' },
                      { key: 'cntct_PMT::zz__Balance__cn', label: 'Balance', fmt: v => v ? `$${Number(v).toLocaleString('en-US',{minimumFractionDigits:2})}` : '—' },
                    ]}
                    rows={payments}
                  />
                )}
              </Section>

              <div className="ccs-record-footer">
                ID {f._kpt__RCD_ID} · Record {selected.recordId}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
