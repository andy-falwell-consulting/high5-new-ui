import { useState, useRef, useEffect } from 'react';
import { getCurrentEnv } from '../config/fmpEnvironments';
import './AgentPanel.css';

const SUGGESTIONS = [
  'Which inspections need repair?',
  'Summarize the most recent project',
  'When was 4-H Camp Bristol Hills last inspected?',
];

export default function AgentPanel({ open, onClose }) {
  const [messages, setMessages] = useState([]); // { role, content, tools? }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db: getCurrentEnv().db,
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const detail = res.status === 404
          ? 'The assistant only runs on the deployed app, not in local preview.'
          : (await res.json().catch(() => ({}))).error || `Request failed (${res.status})`;
        setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${detail}`, error: true }]);
      } else {
        const data = await res.json();
        setMessages(m => [...m, { role: 'assistant', content: data.answer || '(no answer)', tools: data.toolCalls }]);
      }
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e.message || 'Network error'}`, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="agent-panel">
      <div className="agent-head">
        <span className="agent-title"><span className="agent-spark">✦</span> Assistant</span>
        <div className="agent-head-right">
          {messages.length > 0 && <button className="agent-clear" onClick={() => setMessages([])} title="Clear conversation">Clear</button>}
          <button className="agent-close" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="agent-body" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="agent-empty">
            <p className="agent-empty-title">Ask about your records</p>
            <p className="agent-empty-sub">Inspections, contacts, projects, and products — read-only.</p>
            <div className="agent-suggest">
              {SUGGESTIONS.map(s => (
                <button key={s} className="agent-chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`agent-msg ${m.role}${m.error ? ' error' : ''}`}>
              {m.role === 'assistant' && !m.error && m.tools?.length > 0 && (
                <div className="agent-tools">{m.tools.length} lookup{m.tools.length > 1 ? 's' : ''}</div>
              )}
              <div className="agent-bubble">{m.content}</div>
            </div>
          ))
        )}
        {loading && (
          <div className="agent-msg assistant">
            <div className="agent-bubble agent-typing"><span></span><span></span><span></span></div>
          </div>
        )}
      </div>

      <form className="agent-input" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          placeholder="Ask a question…"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button type="submit" disabled={!input.trim() || loading} title="Send">↑</button>
      </form>
    </div>
  );
}
