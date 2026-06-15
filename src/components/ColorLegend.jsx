import './ColorLegend.css'

export default function ColorLegend({ items }) {
  return (
    <div className="cl-wrap">
      <span className="cl-trigger" title="Color key">ⓘ</span>
      <div className="cl-tooltip">
        <div className="cl-title">Color Key</div>
        {items.map(({ color, label }) => (
          <div key={label} className="cl-row">
            <span className="cl-dot" style={{ background: color }} />
            <span className="cl-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
