import { useState, useCallback, useRef } from 'react';
import { useAllRecords } from '../hooks/useAllRecords';
import { getRecord, prefetchRecord, updateRecord } from '../api/filemaker';
import './CCS.css';

const LAYOUT = 'RCD_New';

const STATUS_OPTIONS = ['Proposed','Confirmed','In Progress','Complete','Cancelled','On Hold'];
const PROJECT_TYPES  = ['Inspection','New Construction','Renovation','Repair','Training','Other'];
const BUILDER_OPTIONS = ['','Lucas Germano','Ian Doak','Mike Hicks','Sam Bates','Dan Smith','Chris Young'];

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
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
}
function fmtMoney(v) {
  return v ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
}

// Editable field — renders input in edit mode, display value otherwise
function EField({ fieldKey, value, edits, onChange, dataEditing, type = 'text', options, textarea, wide }) {
  const val = fieldKey in edits ? edits[fieldKey] : (value ?? '');
  const ch = v => onChange(fieldKey, v);

  if (!dataEditing) {
    if (type === 'checkbox') {
      return <span className={`ccs-chk ${Number(val) === 1 ? 'on' : 'off'}`}>{Number(val) === 1 ? '✓' : ''}</span>;
    }
    if (type === 'date') return <span className="ccs-block-value">{fmtDate(val) || '—'}</span>;
    if (textarea) return <div className="ccs-textarea-display">{val || ''}</div>;
    if (options) return <span className="ccs-block-value">{val || '—'}</span>;
    return <span className="ccs-block-value">{val || '—'}</span>;
  }

  if (type === 'checkbox') {
    return (
      <input
        type="checkbox"
        className="ccs-edit-check"
        checked={Number(val) === 1}
        onChange={e => ch(e.target.checked ? 1 : 0)}
      />
    );
  }
  if (textarea) {
    return (
      <textarea
        className="ccs-edit-textarea"
        value={val}
        onChange={e => ch(e.target.value)}
        rows={6}
      />
    );
  }
  if (options) {
    return (
      <select className="ccs-edit-select" value={val} onChange={e => ch(e.target.value)}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    );
  }
  if (type === 'date') {
    // FMP date format: MM/DD/YYYY — input[type=date] needs YYYY-MM-DD
    const iso = val ? (() => { const p = val.split('/'); return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}` : ''; })() : '';
    return (
      <input
        type="date"
        className="ccs-edit-input"
        value={iso}
        onChange={e => {
          const [y,m,d] = e.target.value.split('-');
          ch(e.target.value ? `${m}/${d}/${y}` : '');
        }}
      />
    );
  }
  return (
    <input
      type={type}
      className="ccs-edit-input"
      value={val}
      onChange={e => ch(e.target.value)}
    />
  );
}

function CheckRow({ label, fieldKey, sentFieldKey, value, edits, onChange, dataEditing, sentVal, sentFieldKeyLabel }) {
  return (
    <div className="ccs-fin-row">
      <span className="ccs-fin-label">{label}</span>
      <span className="ccs-fin-sent">
        {sentFieldKey
          ? <EField fieldKey={sentFieldKey} value={sentVal} edits={edits} onChange={onChange} dataEditing={dataEditing} type="date" />
          : (sentVal ? fmtDate(sentVal) : '')}
      </span>
      <span className="ccs-fin-recv-label">Received</span>
      <EField fieldKey={fieldKey} value={value} edits={edits} onChange={onChange} dataEditing={dataEditing} type="checkbox" />
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
        'Work Order': r.fieldData['Work Order'],
      },
    }),
  });

  const [selected, setSelected]       = useState(null);
  const [search, setSearch]           = useState('');
  const [navWidth, setNavWidth]       = useState(300);
  const [activeTab, setActiveTab]     = useState('primary');
  const [activePortal, setActivePortal] = useState('estimates');
  const [dataEditing, setDataEditing] = useState(false);
  const [edits, setEdits]             = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);
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
    setEdits({}); setDataEditing(false); setSaveStatus(null);
    setSelected(r);
    setActiveTab('primary');
    getRecord(LAYOUT, r.recordId).then(detail => {
      setSelected(prev => prev?.recordId === r.recordId ? detail.response.data[0] : prev);
    }).catch(() => {});
  }

  const handleFieldChange = useCallback((fk, v) => setEdits(p => ({ ...p, [fk]: v })), []);
  const handleDiscard = () => { setEdits({}); setDataEditing(false); setSaveStatus(null); };

  const handleSave = async () => {
    if (!selected || !Object.keys(edits).length) return;
    setSaving(true); setSaveStatus(null);
    try {
      const res = await updateRecord(LAYOUT, selected.recordId, edits);
      if (res.messages?.[0]?.code === '0') {
        setSelected(p => ({ ...p, fieldData: { ...p.fieldData, ...edits } }));
        setEdits({}); setDataEditing(false); setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 3000);
      } else { setSaveStatus('error'); }
    } catch { setSaveStatus('error'); }
    finally { setSaving(false); }
  };

  const dirtyCount = Object.keys(edits).length;
  const f = selected?.fieldData || {};
  const portals = selected?.portalData || {};
  const estimates = portals['Portal__Estimates 2'] || [];
  const invoices  = portals['Portal__Invoices']     || [];
  const payments  = portals['Portal__Payments']     || [];

  // Shared props passed to every EField
  const ep = { edits, onChange: handleFieldChange, dataEditing };

  return (
    <div className="ccs-root">
      {/* Nav */}
      <nav className="ccs-nav" style={{ width: navWidth }}>
        <div className="ccs-nav-header">
          <span className="ccs-nav-title">CCS</span>
          <span className="ccs-nav-count">{total ? `${records.length} / ${total}` : records.length}</span>
        </div>
        <div className="ccs-search-wrap">
          <input className="ccs-search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
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
                    <span className="ccs-list-status" style={{ color: sc, borderColor: sc + '44', background: sc + '18' }}>{rf.Status}</span>
                  )}
                </div>
                {rf['Type of Project'] && <div className="ccs-list-type">{rf['Type of Project']}</div>}
                {rf['rcd start date'] && <div className="ccs-list-date">{fmtDate(rf['rcd start date'])}</div>}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="ccs-resize-handle" onMouseDown={startResize} />

      {/* Main */}
      <main className="ccs-main">
        {!selected ? (
          <div className="ccs-empty"><div className="ccs-empty-icon">◈</div><p>Select a record</p></div>
        ) : (
          <div className="ccs-detail">
            {/* Tab bar + action buttons */}
            <div className="ccs-tabs">
              <div className="ccs-tabs-left">
                {[['primary','Primary Info'],['checklists','Checklists'],['financials','Financials']].map(([id,label]) => (
                  <button key={id} className={`ccs-tab${activeTab===id?' active':''}`} onClick={() => setActiveTab(id)}>{label}</button>
                ))}
              </div>
              <div className="ccs-tabs-actions">
                {saveStatus === 'saved' && <span className="ccs-status-msg saved">✓ Saved</span>}
                {saveStatus === 'error' && <span className="ccs-status-msg error">✗ Failed</span>}
                {!dataEditing ? (
                  <button className="ccs-action-btn" onClick={() => setDataEditing(true)}>✎ Edit</button>
                ) : (
                  <>
                    <button
                      className="ccs-action-btn save"
                      onClick={handleSave}
                      disabled={saving || !dirtyCount}
                    >
                      {saving ? '…' : dirtyCount ? `Save ${dirtyCount} change${dirtyCount > 1 ? 's' : ''}` : 'Save'}
                    </button>
                    <button className="ccs-action-btn" onClick={handleDiscard}>Discard</button>
                  </>
                )}
              </div>
            </div>

            <div className="ccs-tab-body">

              {/* ── PRIMARY INFO ── */}
              {activeTab === 'primary' && (
                <>
                  {/* Card 1: Contact info */}
                  <div className="ccs-card">
                    <div className="ccs-card-body ccs-contact-layout">
                      <div className="ccs-contact-left">
                        <div className="ccs-contact-block">
                          <span className="ccs-block-label">Site</span>
                          <span className="ccs-block-value primary">{fmt(f.zz__Display_Organization__ct)}</span>
                        </div>
                        <div className="ccs-contact-block">
                          <span className="ccs-block-label">Individual</span>
                          <span className="ccs-block-value">{fmt(f.zz__Display_Contact__ct)}</span>
                        </div>
                        {f.Address_Block_Billing && (
                          <div className="ccs-contact-block">
                            <span className="ccs-block-label">Address</span>
                            <span className="ccs-block-value address">{f.Address_Block_Billing}</span>
                          </div>
                        )}
                        <div className="ccs-contact-inline-row">
                          {f['rcd_cntct_INADR__email::zz__Address__ct'] && (
                            <div className="ccs-contact-block">
                              <span className="ccs-block-label">Email</span>
                              <a className="ccs-block-value link" href={`mailto:${f['rcd_cntct_INADR__email::zz__Address__ct']}`}>
                                {f['rcd_cntct_INADR__email::zz__Address__ct']}
                              </a>
                            </div>
                          )}
                          <div className="ccs-contact-block">
                            <span className="ccs-block-label">Phone</span>
                            <span className="ccs-block-value">{fmt(f['rcd_cntct_PHONE__work::Number'])}</span>
                          </div>
                          <div className="ccs-contact-block">
                            <span className="ccs-block-label">Mobile</span>
                            <span className="ccs-block-value">{fmt(f['rcd_cntct_PHONE__mobile::Number'])}</span>
                          </div>
                        </div>
                        <div className="ccs-distance-row">
                          <div className="ccs-contact-block">
                            <span className="ccs-block-label">Distance</span>
                            <EField fieldKey="Distance to High5" value={f['Distance to High5']} {...ep} />
                          </div>
                          <div className="ccs-contact-block">
                            <span className="ccs-block-label">Drive Time</span>
                            <EField fieldKey="Drive Time" value={f['Drive Time']} {...ep} />
                          </div>
                        </div>
                      </div>

                      {/* Financial status panel */}
                      <div className="ccs-fin-panel">
                        <div className="ccs-fin-row">
                          <span className="ccs-fin-label">Estimate #</span>
                          <span className="ccs-fin-sent">
                            <EField fieldKey="_kat__QuickBooks_Estimate_ID" value={f._kat__QuickBooks_Estimate_ID} {...ep} />
                          </span>
                        </div>
                        <CheckRow label="Contract" fieldKey="cd_Received Contract" sentFieldKey="Contract_Date_Sent"
                          value={f['cd_Received Contract']} sentVal={f.Contract_Date_Sent} {...ep} />
                        <CheckRow label="Deposit Inv." fieldKey="cd_Received Deposit"
                          value={f['cd_Received Deposit']} sentVal={null} {...ep} />
                        <div className="ccs-fin-row">
                          <span className="ccs-fin-label">PO #</span>
                          <span className="ccs-fin-sent"><EField fieldKey="po_number" value={f.po_number} {...ep} /></span>
                          <span className="ccs-fin-recv-label">Received</span>
                          <EField fieldKey="cd_Received PO" value={f['cd_Received PO']} {...ep} type="checkbox" />
                        </div>
                        <CheckRow label="Final Inv." fieldKey="Final_Invoice_Received" sentFieldKey="Final Sent"
                          value={f.Final_Invoice_Received} sentVal={f['Final Sent']} {...ep} />
                        <div className="ccs-fin-row">
                          <span className="ccs-fin-label">Invoice #</span>
                          <span className="ccs-fin-sent">
                            <EField fieldKey="_kat__QuickBooks_Invoice_ID" value={f._kat__QuickBooks_Invoice_ID} {...ep} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Project info */}
                  <div className="ccs-card">
                    <div className="ccs-card-title">CCS Project Info</div>
                    <div className="ccs-card-body">
                      <div className="ccs-proj-row">
                        <div className="ccs-proj-field">
                          <span className="ccs-block-label">Project Type</span>
                          <EField fieldKey="Type of Project" value={f['Type of Project']} {...ep} options={PROJECT_TYPES} />
                        </div>
                        <div className="ccs-proj-field">
                          <span className="ccs-block-label">Status</span>
                          {dataEditing
                            ? <EField fieldKey="Status" value={f.Status} {...ep} options={STATUS_OPTIONS} />
                            : f.Status
                              ? <span className="ccs-status-pill" style={{ color: statusColor(f.Status), borderColor: statusColor(f.Status)+'44', background: statusColor(f.Status)+'18' }}>{f.Status}</span>
                              : <span className="ccs-block-value">—</span>
                          }
                        </div>
                        <div className="ccs-proj-field">
                          <span className="ccs-block-label">Start Date</span>
                          <EField fieldKey="rcd start date" value={f['rcd start date']} {...ep} type="date" />
                        </div>
                        <div className="ccs-proj-field">
                          <span className="ccs-block-label">End Date</span>
                          <EField fieldKey="rcd end date" value={f['rcd end date']} {...ep} type="date" />
                        </div>
                        <div className="ccs-proj-field">
                          <span className="ccs-block-label">Inspection Report Sent</span>
                          <EField fieldKey="Report Date Sent" value={f['Report Date Sent']} {...ep} type="date" />
                        </div>
                        <div className="ccs-proj-field">
                          <span className="ccs-block-label">Confirmed</span>
                          <EField fieldKey="Confirmed" value={f.Confirmed} {...ep} type="date" />
                        </div>
                      </div>

                      <div className="ccs-builders-row">
                        {[
                          ['Lead Builder', 'Lead Builder'],
                          ['Builder1', 'Builder 1'],
                          ['Builder2', 'Builder 2'],
                          ['Builder3', 'Builder 3'],
                        ].map(([fk, label]) => (
                          <div key={fk} className="ccs-proj-field">
                            <span className="ccs-block-label">{label}</span>
                            <EField fieldKey={fk} value={f[fk]} {...ep} options={BUILDER_OPTIONS} />
                          </div>
                        ))}
                      </div>

                      <div className="ccs-wo-notes-row">
                        <div className="ccs-wo-notes-field">
                          <span className="ccs-block-label">Work Order</span>
                          <EField fieldKey="Work Order" value={f['Work Order']} {...ep} textarea />
                        </div>
                        <div className="ccs-wo-notes-field">
                          <span className="ccs-block-label">Notes</span>
                          <EField fieldKey="Notes" value={f.Notes} {...ep} textarea />
                        </div>
                      </div>

                      <div className="ccs-meta-footer">
                        <span>Modified By <strong>{f.zz__Modified_By}</strong></span>
                        <span>Modified On <strong>{f.zz__Modified_On}</strong></span>
                        <span>Created By <strong>{f.zz__Created_By}</strong></span>
                        <span>Created On <strong>{f.zz__Created_On}</strong></span>
                        <span>RCD # <strong>{f._kpt__RCD_ID}</strong></span>
                        <span>kanban_status <strong>{f.kanban_status || '—'}</strong></span>
                        <span>record <strong>{selected.recordId}</strong></span>
                        {f.kb_Status && <span>kb_Status <strong>{f.kb_Status}</strong></span>}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── CHECKLISTS ── */}
              {activeTab === 'checklists' && (
                <div className="ccs-checklist-grid">
                  {[
                    ['Pre-Project', [
                      ['pp_New_cust_exist_course_survey', 'Site Survey'],
                      ['pp_Created Client Folder', 'Client Folder Created'],
                      ['pp_Create CCS for Site Eval', 'CCS for Site Eval'],
                      ['p_CCS Estimate', 'CCS Estimate'],
                      ['p_Training Plan', 'Training Plan'],
                      ['p_Drawings', 'Drawings'],
                      ['p_Mark as Proposed', 'Mark as Proposed'],
                      ['pp_Sent PD Form', 'Sent PD Form'],
                    ]],
                    ['Contract & Deposit', [
                      ['cd_Sent Contract', 'Sent Contract'],
                      ['cd_Add to Cal', 'Add to Calendar'],
                      ['cd_Received Contract', 'Received Contract'],
                      ['cd_Received Deposit', 'Received Deposit'],
                      ['cd_Received PO', 'Received PO'],
                      ['Final_Invoice_Received', 'Final Invoice Received'],
                    ]],
                    ['Install Prep', [
                      ['iprep_Prefab List', 'Prefab List'],
                      ['iprep_Construction Layout', 'Construction Layout'],
                      ['iprep_Training', 'Training'],
                      ['iprep_Equipment', 'Equipment'],
                      ['iprep_Need Inspection', 'Need Inspection'],
                    ]],
                    ['Event Prep', [
                      ['eprep_Setting Scheduled', 'Setting Scheduled'],
                      ['eprep_Setting Complete', 'Setting Complete'],
                      ['eprep_Dig Safe', 'Dig Safe'],
                      ['eprep_Equipment Requested', 'Equipment Requested'],
                      ['eprep_Equipment Reserved', 'Equipment Reserved'],
                      ['eprep_Poles Ordered', 'Poles Ordered'],
                      ['eprep_Poles Delivered', 'Poles Delivered'],
                      ['eprep_Climbing Holds Ordered', 'Holds Ordered'],
                      ['eprep_Climbing Holds Delivered', 'Holds Delivered'],
                      ['eprep_Tarps Mats Ordered', 'Tarps/Mats Ordered'],
                      ['eprep_Tarps Mats Delivered', 'Tarps/Mats Delivered'],
                      ['eprep_Specialty Hardware', 'Specialty Hardware'],
                      ['eprep_Lumber_ordered', 'Lumber Ordered'],
                      ['eprep_Lumber_ordered_delivered', 'Lumber Delivered'],
                      ['eprep_Permits', 'Permits'],
                    ]],
                  ].map(([title, items]) => (
                    <div key={title} className="ccs-card">
                      <div className="ccs-card-title">{title}</div>
                      <div className="ccs-card-body ccs-checks">
                        {items.map(([key, label]) => {
                          const val = key in edits ? edits[key] : f[key];
                          const on = Number(val) === 1;
                          return (
                            <div
                              key={key}
                              className={`ccs-check-item${on ? ' on' : ''}`}
                              onClick={() => dataEditing && handleFieldChange(key, on ? 0 : 1)}
                              style={{ cursor: dataEditing ? 'pointer' : 'default' }}
                            >
                              <span className={`ccs-chk-box${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
                              <span>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {(f['Job Sheet Poles']||f['Job Sheet Setting']||f['Job Sheet Equipment Rental']||
                    f['Job Sheet Climbing Holds']||f['Job Sheet Mats Tarps']||f['Job Sheet Specialty Hardware']||
                    f['Job Sheet Lumber Order']||f['Job Sheet Permits']) && (
                    <div className="ccs-card ccs-full-width">
                      <div className="ccs-card-title">Job Sheet</div>
                      <div className="ccs-card-body ccs-job-sheet-grid">
                        {[
                          ['Poles','Job Sheet Poles'],['Setting','Job Sheet Setting'],
                          ['Equipment Rental','Job Sheet Equipment Rental'],['Climbing Holds','Job Sheet Climbing Holds'],
                          ['Mats / Tarps','Job Sheet Mats Tarps'],['Specialty Hardware','Job Sheet Specialty Hardware'],
                          ['Lumber Order','Job Sheet Lumber Order'],['Permits','Job Sheet Permits'],
                        ].map(([label, key]) => (
                          <div key={key} className="ccs-proj-field">
                            <span className="ccs-block-label">{label}</span>
                            <EField fieldKey={key} value={f[key]} {...ep} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── FINANCIALS ── */}
              {activeTab === 'financials' && (
                <div className="ccs-card">
                  <div className="ccs-card-body">
                    <div className="ccs-portal-tabs">
                      {[['estimates','Estimates',estimates.length],['invoices','Invoices',invoices.length],['payments','Payments',payments.length]].map(([id,label,count]) => (
                        <button key={id} className={`ccs-portal-tab${activePortal===id?' active':''}`} onClick={() => setActivePortal(id)}>
                          {label}<span className="ccs-portal-count">{count}</span>
                        </button>
                      ))}
                    </div>
                    {activePortal === 'estimates' && (
                      <PortalTable
                        columns={[
                          { key: 'cntct_ESTMT::Title', label: 'Title' },
                          { key: 'cntct_ESTMT::Date', label: 'Date', fmt: fmtDate },
                          { key: 'cntct_ESTMT::Status', label: 'Status' },
                          { key: 'cntct_ESTMT::zz__Total__xn', label: 'Total', fmt: fmtMoney },
                        ]}
                        rows={estimates}
                      />
                    )}
                    {activePortal === 'invoices' && (
                      <PortalTable
                        columns={[
                          { key: 'cntct_INVO::QuickBooks_Reference_Number', label: 'Ref #' },
                          { key: 'cntct_INVO::Date', label: 'Date', fmt: fmtDate },
                          { key: 'cntct_INVO::zz__Total__xn', label: 'Total', fmt: fmtMoney },
                          { key: 'cntct_INVO::zz__Balance_Due__cn', label: 'Balance', fmt: fmtMoney },
                        ]}
                        rows={invoices}
                      />
                    )}
                    {activePortal === 'payments' && (
                      <PortalTable
                        columns={[
                          { key: 'cntct_PMT::Date', label: 'Date', fmt: fmtDate },
                          { key: 'cntct_PMT::Method', label: 'Method' },
                          { key: 'cntct_PMT::Amount', label: 'Amount', fmt: fmtMoney },
                          { key: 'cntct_PMT::zz__Balance__cn', label: 'Balance', fmt: fmtMoney },
                        ]}
                        rows={payments}
                      />
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
