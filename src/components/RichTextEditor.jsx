import { useRef, useEffect, useCallback } from 'react';
import './RichTextEditor.css';

// Minimal HTML (WYSIWYG) editor for the Shopify description. Shopify stores the
// description as HTML (body_html); editing it visually here means what you type
// maps to how it renders in Shopify. No dependency — a contentEditable surface
// with a small toolbar (execCommand). Runs UNCONTROLLED after the initial load
// (parent passes a `key` per record) so the caret never jumps mid-edit.
//
// Strip scripts / event handlers so pasted or Shopify-sourced HTML can't inject
// anything when we render it.
export function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
}

export default function RichTextEditor({ value, onChange, placeholder }) {
  const ref = useRef(null);

  // Load the initial HTML once (component is remounted per record via `key`).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeHtml(value);
    try { document.execCommand('styleWithCSS', false, false); } catch { /* older browsers */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => { onChange?.(ref.current?.innerHTML || ''); }, [onChange]);

  // onMouseDown + preventDefault keeps the selection in the editor when a
  // toolbar button is clicked (onClick would blur it first).
  const cmd = (command, arg) => (e) => {
    e.preventDefault();
    ref.current?.focus();
    try { document.execCommand(command, false, arg); } catch { /* unsupported */ }
    emit();
  };
  const addLink = (e) => {
    e.preventDefault();
    ref.current?.focus();
    const url = window.prompt('Link URL (https://…):', 'https://');
    if (url && url !== 'https://') document.execCommand('createLink', false, url);
    emit();
  };

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" title="Bold" onMouseDown={cmd('bold')}><b>B</b></button>
        <button type="button" title="Italic" onMouseDown={cmd('italic')}><i>I</i></button>
        <span className="rte-sep" />
        <button type="button" title="Heading" onMouseDown={cmd('formatBlock', 'H2')}>H2</button>
        <button type="button" title="Subheading" onMouseDown={cmd('formatBlock', 'H3')}>H3</button>
        <button type="button" title="Paragraph" onMouseDown={cmd('formatBlock', 'P')}>¶</button>
        <span className="rte-sep" />
        <button type="button" title="Bulleted list" onMouseDown={cmd('insertUnorderedList')}>• List</button>
        <button type="button" title="Numbered list" onMouseDown={cmd('insertOrderedList')}>1. List</button>
        <span className="rte-sep" />
        <button type="button" title="Add link" onMouseDown={addLink}>🔗</button>
        <button type="button" title="Clear formatting" onMouseDown={cmd('removeFormat')}>Clear</button>
      </div>
      <div
        ref={ref}
        className="rte-body"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Write the storefront description…'}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}
