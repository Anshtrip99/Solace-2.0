import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSessionMessages, sendSessionMessage } from '../services/api';

const SessionChat = ({ sessionId, isDemo = false }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const load = useCallback(async () => {
    try {
      const result = await getSessionMessages(sessionId);
      setMessages(result.data || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load session messages.');
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const submit = async event => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true); setError('');
    try { await sendSessionMessage(sessionId, content); setDraft(''); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Message could not be sent.'); }
    finally { setSending(false); }
  };

  return <section className="session-chat" aria-label="Session chat">
    <div className="session-chat-header">
      <div><strong>Session chat</strong><p>{isDemo ? 'Fictional sample conversation for this demo session.' : 'Messages are shared only with the other session participant.'}</p></div>
      <span className="session-chat-count">{messages.length} messages</span>
    </div>
    <div className="session-chat-messages" aria-live="polite">
      {messages.length === 0 && <p className="mentor-muted">Start a conversation about the upcoming session.</p>}
      {messages.map(message => {
        const mine = String(message.sender?.id) === String(user?.id);
        return <div key={message.id} className={`session-chat-message${mine ? ' mine' : ''}`}>
          <div className="session-chat-meta"><strong>{mine ? 'You' : message.sender?.name}</strong><time>{new Date(message.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time></div>
          <p>{message.content}</p>
        </div>;
      })}
      <div ref={endRef} />
    </div>
    {error && <p className="mentor-error" role="alert">{error}</p>}
    <form className="session-chat-compose" onSubmit={submit}>
      <input className="input" value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder="Write a message…" aria-label="Message" />
      <button className="btn btn-primary" disabled={!draft.trim() || sending}>{sending ? 'Sending…' : 'Send'}</button>
    </form>
  </section>;
};

export default SessionChat;
