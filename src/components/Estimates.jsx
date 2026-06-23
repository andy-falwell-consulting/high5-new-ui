import { useState, useEffect, useRef, useCallback } from 'react'
import { getRecord, updateRecord, invalidateRecord, patchCachedRecord } from '../api/filemaker'
import { useAllRecords } from '../hooks/useAllRecords'
import ListToolbar, { useListControls, ListBody } from './ListControls'
import './Estimates.css'

const LAYOUT = 'Estimates_New'
const CACHE_VERSION = 1

const STATUS_COLOR = {
  'Draft':    '#64748b',
  'Sent':     '#3b82f6',
  'Approved': '#22c55e',
  'Declined': '#e8322a',
  'Expired':  '#f59e0b',
}

const TYPE_COLOR = {
  'New Build': '#c084fc',
  'Repair':    '#fb923c',
}

function fmtCurrency(val) {
  const n = parseFloat(String(val ?? '').replace(/[^0-9.-]/g, ''))
  if (isNaN(n)) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(val) {
  if (!val) return '—'
  return String(val).split(' ')[0] || '—'
}

const fv = (f, edits, key) => (key in edits ? edits[key] : f?.[key])
const isDirty = (f, edits, key) => key in edits && edits[key] !== (f?.[key] ?? '')

function Field({ label, fk, f, edits, onChange, editing, editable = true, wide, mono, textarea }) {
  const val = fv(f, edits, fk)
  const dirty = isDirty(f, edits, fk)
  return (
    <div className={`est-field${wide ? ' wide' : ''}`}>
      <label>{label}{dirty && <span className="est-dirty" />}</label>
      {editing && editable ? (
        textarea
          ? <textarea className="est-input est-textarea" value={val || ''} onChange={e => onChange(fk, e.target.value)} rows={4} />
          : <input className="est-input" value={val || ''} onChange={e => onChange(fk, e.target.value)} />
      ) : (
        <span className={`est-value${mono ? ' mono' : ''}`}>{val || '—'}</span>
      )}
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div className="est-section">
      <div className="est-section-header">
        <span className="est-section-icon">{icon}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function Estimates({ navTarget, onClearNav, onRecordSelect } = {}) {
  const { records, total, loading, error } = useAllRecords(LAYOUT, { cacheVersion: CACHE_VERSION })
  const [selected, setSelected] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [editing, setEditing] = useState(false)
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const dragging = useRef(false)

  const controls = useListControls({
    records,
    storageKey: 'estimates',
    name: f => f['est_CNTCT::Name_Organization'] || f['est_CNTCT::NameFirstLast'] || '',
    searchKeys: ['est_CNTCT::Name_Organization', 'est_CNTCT::NameFirstLast', '_kp__Estimate_ID', 'Type', 'Status'],
    chips: [
      { id: 'draft',    label: 'Draft',    match: f => f.Status === 'Draft' },
      { id: 'sent',     label: 'Sent',     match: f => f.Status === 'Sent' },
      { id: 'approved', label: 'Approved', match: f => f.Status === 'Approved' },
      { id: 'declined', label: 'Declined', match: f => f.Status === 'Declined' },
    ],
    sorts: [
      { id: 'date',   label: 'Date',         value: f => f.Date ?? '' },
      { id: 'org',    label: 'Organization', value: f => f['est_CNTCT::Name_Organization'] ?? '' },
      { id: 'total',  label: 'Total',        value: f => parseFloat(String(f.Total ?? '').replace(/[^0-9.-]/g, '')) || 0 },
      { id: 'status', label: 'Status',       value: f => f.Status ?? '' },
    ],
    defaultSort: 'date', defaultOrder: 'desc',
  })

  async function handleSelect(r) {
    setEdits({}); setEditing(false); setSaveStatus(null)
    setSelected(r)
    getRecord(LAYOUT, r.recordId).then(d => {
      const fresh = d?.response?.data?.[0]
      if (fresh) setSelected(fresh)
    }).catch(() => {})
  }

  useEffect(() => {
    if (!navTarget || navTarget.moduleId !== 'estimates') return
    const rec = controls.processed.find(r => String(r.recordId) === String(navTarget.recordId))
    if (rec) { handleSelect(rec); onClearNav?.(); return }
    let alive = true
    getRecord(LAYOUT, navTarget.recordId).then(d => {
      const r = d?.response?.data?.[0]
      if (alive && r) { handleSelect(r); onClearNav?.() }
    }).catch(() => {})
    return () => { alive = false }
  }, [navTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMouseDown = useCallback(e => {
    dragging.current = true
    const startX = e.clientX, startW = sidebarWidth
    const onMove = ev => { if (!dragging.current) return; setSidebarWidth(Math.max(220, Math.min(520, startW + ev.clientX - startX))) }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const handleChange = useCallback((fk, val) => setEdits(p => ({ ...p, [fk]: val })), [])
  const handleDiscard = () => { setEdits({}); setEditing(false); setSaveStatus(null) }

  async function handleSave() {
    const n = Object.keys(edits).length
    if (!n) { setEditing(false); return }
    setSaving(true); setSaveStatus(null)
    try {
      await updateRecord(LAYOUT, selected.recordId, edits)
      patchCachedRecord(LAYOUT, CACHE_VERSION, selected.recordId, edits)
      invalidateRecord(LAYOUT, selected.recordId)
      setSelected(prev => ({ ...prev, fieldData: { ...prev.fieldData, ...edits } }))
      setEdits({}); setEditing(false); setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 2000)
    } catch { setSaveStatus('error') }
    finally { setSaving(false) }
  }

  const f = selected?.fieldData ?? {}
  const p = selected?.portalData
  const lineItems = p?.est_ESTLI || []
  const dirtyCount = Object.keys(edits).length

  const fmTotal = parseFloat(String(f.Total ?? '').replace(/[^0-9.-]/g, '')) || 0
  const computedTotal = lineItems.reduce((sum, li) => (
    sum + (parseFloat(String(li['est_ESTLI::Line_Total'] ?? '').replace(/[^0-9.-]/g, '')) || 0)
  ), 0)
  const displayTotal = fmTotal || computedTotal

  // Group line items by category
  const grouped = lineItems.reduce((acc, li) => {
    const cat = li['est_ESTLI::Category'] || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(li)
    return acc
  }, {})

  return (
    <div className="est-container">
      <aside className="est-sidebar" style={{ width: sidebarWidth }}>
        <div className="est-sidebar-header">
          <div>
            <div className="est-sidebar-module">Estimates</div>
            <div className="est-sidebar-count">{loading ? 'Loading…' : `${total.toLocaleString()} estimates`}</div>
          </div>
          <ListToolbar c={controls} />
        </div>

        {loading && controls.processed.length === 0 ? (
          <div className="est-loading">{Array.from({ length: 12 }, (_, i) => <div key={i} className="est-skeleton" />)}</div>
        ) : error ? (
          <div className="est-empty-state"><p>Failed to load records.</p></div>
        ) : (
          <ListBody c={controls} renderItem={r => {
            const fd = r.fieldData
            const status = fd.Status || 'Draft'
            const color = STATUS_COLOR[status] ?? STATUS_COLOR.Draft
            const org = fd['est_CNTCT::Name_Organization'] || fd['est_CNTCT::NameFirstLast'] || '—'
            const tot = parseFloat(String(fd.Total ?? '').replace(/[^0-9.-]/g, '')) || null
            return (
              <div key={r.recordId}
                className={`est-list-item ${selected?.recordId === r.recordId ? 'active' : ''}`}
                onClick={() => { handleSelect(r); onRecordSelect?.(r.recordId) }}>
                <div className="est-item-dot" style={{ background: color }} />
                <div className="est-item-text">
                  <div className="est-item-name">{org}</div>
                  <div className="est-item-sub">
                    {fd._kp__Estimate_ID && <span>{fd._kp__Estimate_ID}</span>}
                    {fd.Date && <span>{fmtDate(fd.Date)}</span>}
                    {tot !== null && <span>{fmtCurrency(tot)}</span>}
                  </div>
                </div>
                <span className="est-item-status" style={{ color }}>{status}</span>
              </div>
            )
          }} />
        )}
      </aside>

      <div className="est-resize-handle" onMouseDown={onMouseDown} />

      <main className="est-main">
        {!selected ? (
          <div className="est-empty-state">
            <div className="est-empty-icon">◧</div>
            <p>Select an estimate</p>
          </div>
        ) : (
          <>
            <div className="est-topbar">
              <div className="est-topbar-left">
                <h1 className="est-title">{f['est_CNTCT::Name_Organization'] || f['est_CNTCT::NameFirstLast'] || '—'}</h1>
                <div className="est-meta-row">
                  {f.Status && (
                    <span className="est-chip status" style={{
                      background: (STATUS_COLOR[f.Status] ?? '#64748b') + '22',
                      color: STATUS_COLOR[f.Status] ?? '#64748b',
                      borderColor: (STATUS_COLOR[f.Status] ?? '#64748b') + '44',
                    }}>{f.Status}</span>
                  )}
                  {f.Type && (
                    <span className="est-chip type" style={{
                      background: (TYPE_COLOR[f.Type] ?? '#4a5568') + '22',
                      color: TYPE_COLOR[f.Type] ?? '#94a3b8',
                      borderColor: (TYPE_COLOR[f.Type] ?? '#4a5568') + '44',
                    }}>{f.Type}</span>
                  )}
                  {f._kp__Estimate_ID && <span className="est-chip id">#{f._kp__Estimate_ID}</span>}
                  {f.Date && <span className="est-chip muted">{fmtDate(f.Date)}</span>}
                </div>
              </div>
              <div className="est-topbar-right">
                {displayTotal > 0 && (
                  <div className="est-total-badge">
                    <span className="est-total-label">Total</span>
                    <span className="est-total-amount">{fmtCurrency(displayTotal)}</span>
                  </div>
                )}
                <div className="est-topbar-actions">
                  {saveStatus === 'saved' && <span className="est-save-status saved">✓ Saved</span>}
                  {saveStatus === 'error' && <span className="est-save-status error">✗ Failed</span>}
                  {!editing ? (
                    <button className="est-btn edit" onClick={() => setEditing(true)}>✎ Edit</button>
                  ) : (
                    <>
                      <button className="est-btn discard" onClick={handleDiscard} disabled={saving}>Discard</button>
                      <button className="est-btn save" onClick={handleSave} disabled={saving || dirtyCount === 0}>
                        {saving ? 'Saving…' : dirtyCount ? `Save ${dirtyCount}` : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="est-content">

              <Section title="Contact" icon="◉">
                <div className="est-field-grid">
                  <Field label="Organization"   fk="est_CNTCT::Name_Organization" f={f} edits={edits} onChange={handleChange} editing={editing} editable={false} />
                  <Field label="Contact"         fk="est_CNTCT::NameFirstLast"     f={f} edits={edits} onChange={handleChange} editing={editing} editable={false} />
                  <Field label="Email"           fk="est_CNTCT::zz__Email__ct"     f={f} edits={edits} onChange={handleChange} editing={editing} editable={false} />
                  <Field label="Phone"           fk="est_CNTCT::Phone"             f={f} edits={edits} onChange={handleChange} editing={editing} editable={false} />
                  {f['est_CNTCT::Address_Block'] && (
                    <Field label="Address"       fk="est_CNTCT::Address_Block"     f={f} edits={edits} onChange={handleChange} editing={editing} editable={false} wide />
                  )}
                </div>
              </Section>

              <Section title="Estimate Details" icon="◧">
                <div className="est-field-grid">
                  <Field label="Estimate #"   fk="_kp__Estimate_ID"  f={f} edits={edits} onChange={handleChange} editing={editing} editable={false} mono />
                  <Field label="Status"       fk="Status"            f={f} edits={edits} onChange={handleChange} editing={editing} />
                  <Field label="Type"         fk="Type"              f={f} edits={edits} onChange={handleChange} editing={editing} />
                  <Field label="Date"         fk="Date"              f={f} edits={edits} onChange={handleChange} editing={editing} />
                  <Field label="Expiry Date"  fk="Expiry_Date"       f={f} edits={edits} onChange={handleChange} editing={editing} />
                  {(f._kf__Inspection_ID || editing) && (
                    <Field label="Source Inspection" fk="_kf__Inspection_ID" f={f} edits={edits} onChange={handleChange} editing={editing} editable={false} mono />
                  )}
                  <Field label="Description"  fk="Description"       f={f} edits={edits} onChange={handleChange} editing={editing} wide textarea />
                </div>
              </Section>

              <Section title={`Line Items${lineItems.length ? ` (${lineItems.length})` : ''}`} icon="≡">
                {lineItems.length === 0 ? (
                  <p className="est-empty-portal">No line items on this estimate</p>
                ) : (
                  <div className="est-table-wrap">
                    {Object.entries(grouped).map(([cat, items]) => {
                      const catTotal = items.reduce((s, li) => (
                        s + (parseFloat(String(li['est_ESTLI::Line_Total'] ?? '').replace(/[^0-9.-]/g, '')) || 0)
                      ), 0)
                      return (
                        <div key={cat} className="est-line-group">
                          <div className="est-line-group-header">
                            <span>{cat}</span>
                            <span>{fmtCurrency(catTotal)}</span>
                          </div>
                          <table className="est-table">
                            <thead>
                              <tr>
                                <th className="desc">Description</th>
                                <th className="num">Qty</th>
                                <th className="num">Unit Price</th>
                                <th className="num">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((li, i) => (
                                <tr key={li.recordId || i}>
                                  <td className="desc">{li['est_ESTLI::Description'] || '—'}</td>
                                  <td className="num">{li['est_ESTLI::Quantity'] ?? '—'}</td>
                                  <td className="num">{fmtCurrency(li['est_ESTLI::Unit_Price'])}</td>
                                  <td className="num">{fmtCurrency(li['est_ESTLI::Line_Total'])}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })}

                    <div className="est-totals">
                      {f.Subtotal && (
                        <div className="est-total-row"><span>Subtotal</span><span>{fmtCurrency(f.Subtotal)}</span></div>
                      )}
                      {f.Tax_Rate && (
                        <div className="est-total-row"><span>Tax ({f.Tax_Rate}%)</span><span>{fmtCurrency(f.Tax_Amount)}</span></div>
                      )}
                      <div className="est-total-row grand"><span>Total</span><span>{fmtCurrency(displayTotal)}</span></div>
                    </div>
                  </div>
                )}
              </Section>

              {(f.Notes || editing) && (
                <Section title="Notes" icon="✎">
                  <div className="est-field-grid">
                    <Field label="Notes" fk="Notes" f={f} edits={edits} onChange={handleChange} editing={editing} wide textarea />
                  </div>
                </Section>
              )}

              {(f.Terms || editing) && (
                <Section title="Terms & Conditions" icon="§">
                  <div className="est-field-grid">
                    <Field label="Terms" fk="Terms" f={f} edits={edits} onChange={handleChange} editing={editing} wide textarea />
                  </div>
                </Section>
              )}

              <div className="est-record-footer">
                ID {f._kp__Estimate_ID || '—'} · Record {selected.recordId} · Created {f.zz__Created_On?.split(' ')[0] || '—'} by {f.zz__Created_By || '—'} · Modified {f.zz__Modified_On?.split(' ')[0] || '—'} by {f.zz__Modified_By || '—'}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
