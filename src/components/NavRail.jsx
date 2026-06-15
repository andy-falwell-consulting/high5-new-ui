import { useState } from 'react'

export default function NavRail({ modules, activeId, onSelect }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={{
      width: expanded ? 180 : 48,
      flexShrink: 0,
      background: '#0b0d14',
      borderRight: '1px solid #1e2130',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* Toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        title={expanded ? 'Collapse' : 'Expand'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-end' : 'center',
          padding: '10px 12px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#475569', borderBottom: '1px solid #1e2130',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{expanded ? '«' : '»'}</span>
      </button>

      {/* Nav items */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {modules.map(mod => {
          const active = mod.id === activeId
          return (
            <button
              key={mod.id}
              onClick={() => onSelect(mod.id)}
              title={expanded ? undefined : mod.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 14px',
                background: active ? '#1e2130' : 'none',
                border: 'none', cursor: 'pointer',
                color: active ? '#e2e8f0' : '#64748b',
                textAlign: 'left', whiteSpace: 'nowrap',
                borderLeft: `2px solid ${active ? '#6366f1' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{mod.icon}</span>
              {expanded && (
                <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {mod.label}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
