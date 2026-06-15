import { useState, useRef } from 'react'
import './ColorLegend.css'

export default function ColorLegend({ items }) {
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)

  function handleMouseEnter() {
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: rect.left })
  }

  function handleMouseLeave() {
    setPos(null)
  }

  return (
    <div className="cl-wrap" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <span className="cl-trigger" ref={triggerRef} title="Color key">ⓘ</span>
      {pos && (
        <div className="cl-tooltip" style={{ top: pos.top, left: pos.left }}>
          <div className="cl-title">Color Key</div>
          {items.map(({ color, label }) => (
            <div key={label} className="cl-row">
              <span className="cl-dot" style={{ background: color }} />
              <span className="cl-label">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
