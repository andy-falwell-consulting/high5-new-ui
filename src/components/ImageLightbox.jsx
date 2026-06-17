import { useEffect } from 'react';
import './ImageLightbox.css';

export default function ImageLightbox({ src, name, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filename = name ? `${name.replace(/[^a-z0-9]/gi, '_')}.jpg` : 'image.jpg';

  return (
    <div className="ilb-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ilb-box">
        <button className="ilb-close" onClick={onClose}>✕</button>
        <img className="ilb-img" src={src} alt={name} />
        <div className="ilb-footer">
          <a className="ilb-download" href={src} download={filename}>⬇ Download</a>
        </div>
      </div>
    </div>
  );
}
