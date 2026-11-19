import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMentors, getMentorSessions, getMentorAvailability, requestMentorSession, updateMentorSession, updateEmergencyPreferences } from '../services/api';
import SessionChat from '../components/SessionChat';

const categories = ['Academic stress', 'Career and placement stress', 'Anxiety and emotional wellbeing', 'Relationship challenges', 'Personal development', 'Family-related concerns'];
const dateKey = date => date.toISOString().slice(0, 10);
const dateLabel = date => date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const MentorConnect = () => {
  const { user } = useAuth();
  const [mentors, setMentors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [expertise, setExpertise] = useState('');
  const [language, setLanguage] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [tab, setTab] = useState(user?.role === 'mentor' ? 'sessions' : 'discover');
  const [selected, setSelected] = useState(null);
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [summaryDrafts, setSummaryDrafts] = useState({});
  const [openChatId, setOpenChatId] = useState(null);
  const [notice, setNotice] = useState('');
  const [contacts, setContacts] = useState([{ name: '', relationship: '', phone: '', email: '', consentToContact: false, consentToEmail: false }]);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState('crisis');
  const sessionStatusRef = useRef(null);

  useEffect(() => {
    if (user?.role === 'mentor') setTab('sessions');
  }, [user?.role]);

  const loadMentors = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await getMentors({ search: query, expertise, language }); setMentors(result.data || []); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not load mentors. Please try again.'); }
    finally { setLoading(false); }
  }, [query, expertise, language]);
  const loadSessions = useCallback(async () => {
    try {
      const result = await getMentorSessions();
      const next = result.data || [];
      if (sessionStatusRef.current) {
        const oldStatus = new Map(sessionStatusRef.current.map(session => [session.id, session.status]));
        const changed = next.find(session => oldStatus.has(session.id) && oldStatus.get(session.id) !== session.status);
        if (changed) setNotice(`A session with ${user?.role === 'mentor' ? changed.user?.name : changed.mentor?.name} is now ${changed.status}.`);
      }
      sessionStatusRef.current = next;
      setSessions(next);
    } catch (_) { setSessions([]); }
  }, [user?.role]);
  useEffect(() => { if (user?.role !== 'mentor') loadMentors(); }, [loadMentors, user?.role]);
  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    if (tab !== 'sessions') return undefined;
    const timer = window.setInterval(loadSessions, 30000);
    return () => window.clearInterval(timer);
  }, [tab, loadSessions]);
  useEffect(() => {
    if (!selected || !day) { setAvailableSlots([]); return; }
    let current = true;
    setAvailabilityLoading(true);
    getMentorAvailability(selected.id, day).then(result => { if (current) setAvailableSlots(result.data || []); }).catch(() => { if (current) setAvailableSlots([]); }).finally(() => { if (current) setAvailabilityLoading(false); });
    return () => { current = false; };
  }, [selected, day]);
  useEffect(() => {
    const savedContacts = user?.trustedContacts;
    if (savedContacts?.length) setContacts(savedContacts);
    setEnabled(Boolean(user?.emergencyPreferences?.enabled));
    setThreshold(user?.emergencyPreferences?.threshold || 'crisis');
  }, [user]);

  const upcomingDays = Array.from({ length: 21 }, (_, index) => { const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() + index); return date; });
  const book = async () => {
    if (!selected || !slot) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await requestMentorSession(selected.id, { startsAt: slot, note });
      setNotice(result.message); setSelected(null); setSlot(''); setDay(''); setNote(''); setTab('sessions'); await loadSessions();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not request that session. Please choose another slot.'); }
    finally { setSaving(false); }
  };
  const changeSession = async (sessionId, status, summary = '') => {
    setSaving(true); setError('');
    try { await updateMentorSession(sessionId, { status, summary }); setNotice(`Session ${status}.`); await loadSessions(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not update session.'); }
    finally { setSaving(false); }
  };
  const saveContacts = async event => {
    event.preventDefault(); setError(''); setNotice('');
    try {
      const result = await updateEmergencyPreferences({ contacts: contacts.filter(contact => contact.name || contact.phone || contact.email), enabled, threshold });
      setContacts(result.data?.contacts || contacts);
      setEnabled(Boolean(result.data?.preferences?.enabled));
      setNotice(result.data?.preferences?.enabled ? 'Trusted contacts and safety email preferences saved.' : enabled ? 'Trusted contacts saved, but prompts remain off until a contact has agreed to be listed.' : 'Trusted contacts saved. Safety prompts are off.');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not save emergency preferences.'); }
  };
  const updateContact = (index, key, value) => setContacts(current => current.map((contact, i) => i === index ? { ...contact, [key]: value } : contact));
  const visibleMentors = mentors.filter(mentor => {
    if (!dateFilter && !timeFilter) return true;
    const date = dateFilter ? new Date(`${dateFilter}T00:00:00Z`) : null;
    if (date && date < new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) return false;
    const weekday = date?.getUTCDay();
    const minute = timeFilter ? Number(timeFilter.slice(0, 2)) * 60 + Number(timeFilter.slice(3, 5)) : null;
    return mentor.availability.some(item => {
      if (weekday !== undefined && item.day !== weekday) return false;
      if (minute === null) return true;
      const [sh, sm] = item.start.split(':').map(Number); const [eh, em] = item.end.split(':').map(Number);
      return minute >= sh * 60 + sm && minute + mentor.sessionDuration <= eh * 60 + em;
    });
  });

  return <main className="mentor-page"><div className="mentor-wrap">
    <p className="t-label" style={{ color: 'var(--sage-bright)' }}>{user?.role === 'mentor' ? 'Mentor workspace' : 'Human support, when it helps'}</p>
    <h1 className="f-display t-h1">{user?.role === 'mentor' ? 'Your sessions and requests.' : 'You Don’t Have to Figure Everything Out Alone.'}</h1>
    <p className="mentor-lead">{user?.role === 'mentor' ? 'Review session requests and keep track of your booked sessions.' : 'Connect with supportive mentors who are ready to listen, understand, and guide you.'}</p>
    {user?.isDemo && <div className="demo-banner" role="note"><strong>Demo workspace</strong><span>Profiles, bookings, and conversations here are fictional examples for the presentation.</span></div>}
    <div className="mentor-toolbar"><div className="mentor-tabs" role="tablist">
      {user?.role !== 'mentor' && <button className={tab === 'discover' ? 'selected' : ''} onClick={() => { setTab('discover'); setSelected(null); }}>Find a mentor</button>}
      <button className={tab === 'sessions' ? 'selected' : ''} onClick={() => setTab('sessions')}>{user?.role === 'mentor' ? 'Session requests' : 'My sessions'}</button>
      {user?.role !== 'mentor' && <button className={tab === 'safety' ? 'selected' : ''} onClick={() => setTab('safety')}>Trusted contacts</button>}
    </div>
      {user?.role === 'mentor' && <Link to="/mentor/onboarding" className="btn btn-secondary">Manage mentor profile</Link>}
    </div>
    {(error || notice) && <div className={error ? 'mentor-error' : 'mentor-success'} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    {user?.role !== 'mentor' && tab === 'discover' && !selected && <>
      <section className="mentor-search card" id="mentor-search">
        <label><span>Search by mentor or focus area</span><input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or keyword" /></label>
        <label><span>Area of expertise</span><select className="input" value={expertise} onChange={event => setExpertise(event.target.value)}><option value="">All areas</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label><span>Language</span><input className="input" value={language} onChange={event => setLanguage(event.target.value)} placeholder="e.g. English" /></label>
        <label><span>Available date</span><input className="input" type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} /></label>
        <label><span>Available time (UTC)</span><input className="input" type="time" value={timeFilter} onChange={event => setTimeFilter(event.target.value)} /></label>
        <button className="btn btn-primary" onClick={loadMentors}>Find your mentor</button>
      </section>
      {loading ? <div className="mentor-loading"><div className="spinner" /></div> : visibleMentors.length ? <div className="mentor-cards">{visibleMentors.map(mentor => <article className="mentor-card card" key={mentor.id}>
        <div className="mentor-card-head">{mentor.photoUrl ? <img src={mentor.photoUrl} alt={`${mentor.name} profile`} /> : <div className="mentor-avatar" aria-hidden="true">{mentor.name?.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>}<div>{mentor.isDemo && <span className="demo-pill">Demo profile</span>}<p className="t-label">{mentor.mentorType === 'qualified_professional' ? 'Professional background (self-reported)' : 'Peer wellbeing mentor'}</p><h2 className="f-display">{mentor.name}</h2><p className="mentor-muted">{mentor.experienceYears} years’ experience · {mentor.sessionDuration} min · Free</p></div></div>
        <p>{mentor.introduction}</p><div className="mentor-tags">{mentor.expertise.map(tag => <span key={tag}>{tag}</span>)}</div>
        <p className="mentor-muted">Languages: {mentor.languages.join(', ')}</p>
        <div className="mentor-card-actions"><button className="btn btn-secondary" onClick={() => { setSelected(mentor); setDay(''); setSlot(''); }}>View profile</button><button className="btn btn-primary" onClick={() => { setSelected(mentor); setDay(''); setSlot(''); }}>Book free session</button></div>
      </article>)}</div> : <div className="mentor-empty card"><h2 className="f-display">No mentors match those filters yet.</h2><p>Mentor profiles appear here as soon as their owners save them. Try clearing a filter or check back later.</p><button className="btn btn-secondary" onClick={() => { setQuery(''); setExpertise(''); setLanguage(''); setDateFilter(''); setTimeFilter(''); }}>Clear filters</button></div>}
    </>}

    {user?.role !== 'mentor' && tab === 'discover' && selected && <section className="mentor-profile card">
      <button className="btn btn-ghost" onClick={() => setSelected(null)}>← Back to mentors</button>
      <div className="mentor-profile-top">{selected.photoUrl ? <img src={selected.photoUrl} alt={`${selected.name} profile`} /> : <div className="mentor-avatar large">{selected.name?.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>}<div><p className="t-label">{selected.mentorType === 'qualified_professional' ? 'Professional background (self-reported)' : 'Peer wellbeing mentor'}</p><h2 className="f-display t-h2">{selected.name}</h2><p>{selected.introduction}</p></div></div>
      <div className="mentor-details-grid"><div><h3>Background</h3><p>{selected.background}</p><h3>About</h3><p>{selected.bio}</p></div><div><h3>Mentoring approach</h3><p>{selected.approach}</p><h3>Expertise</h3><div className="mentor-tags">{selected.expertise.map(tag => <span key={tag}>{tag}</span>)}</div><h3>Languages & experience</h3><p>{selected.languages.join(', ')} · {selected.experienceYears} years</p>{selected.qualifications?.length > 0 && <><h3>Self-reported qualifications</h3><p>{selected.qualifications.join(' · ')}</p></>}</div></div>
      <div className="mentor-booking"><h3 className="f-display">Book a free {selected.sessionDuration}-minute session</h3><p className="mentor-muted">Times shown in UTC. A request stays pending until the mentor responds.</p>
        <label className="mentor-select-label">Choose a day<select className="input" value={day} onChange={event => { setDay(event.target.value); setSlot(''); }}><option value="">Select date</option>{upcomingDays.map(date => <option key={dateKey(date)} value={dateKey(date)}>{dateLabel(date)}</option>)}</select></label>
        {day && <div className="mentor-slot-grid">{availabilityLoading ? <span className="mentor-muted">Checking openings…</span> : availableSlots.map(time => <button key={time} className={slot === time ? 'selected' : ''} onClick={() => setSlot(time)}>{new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</button>)}{!availabilityLoading && availableSlots.length === 0 && <p>No future openings that day.</p>}</div>}
        <label className="mentor-select-label">What would you like to discuss? <span className="mentor-muted">(optional)</span><textarea className="input" maxLength={1000} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Share only what you feel comfortable sharing." /></label>
        <button className="btn btn-primary" disabled={!slot || saving} onClick={book}>{saving ? 'Requesting…' : 'Request session'}</button>
      </div>
    </section>}

    {tab === 'sessions' && <section className="mentor-session-list">{sessions.length ? sessions.map(session => {
      const now = Date.now();
      const canJoin = session.status === 'accepted' && (session.isDemo || (now >= new Date(session.startsAt).getTime() - 15 * 60000 && now <= new Date(session.endsAt).getTime() + 60 * 60000));
      const canChat = !['rejected', 'cancelled'].includes(session.status);
      return <article className="mentor-session card" key={session.id}>
        <div className="mentor-session-info">{session.isDemo && <span className="demo-pill">Demo data</span>}<span className={`mentor-status ${session.status}`}>{session.status}</span><h2 className="f-display">{user?.role === 'mentor' ? session.user?.name : session.mentor?.name}</h2><p>{new Date(session.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {new Date(session.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>{session.note && <p className="mentor-muted">“{session.note}”</p>}{session.summary && <div className="mentor-summary"><strong>Session summary</strong><p>{session.summary}</p></div>}</div>
        <div className="mentor-session-actions">
          {user?.role === 'mentor' && session.status === 'pending' && <><button className="btn btn-primary" disabled={saving} onClick={() => changeSession(session.id, 'accepted')}>Accept</button><button className="btn btn-secondary" disabled={saving} onClick={() => changeSession(session.id, 'rejected')}>Decline</button></>}
          {user?.role !== 'mentor' && ['pending', 'accepted'].includes(session.status) && <button className="btn btn-secondary" disabled={saving} onClick={() => changeSession(session.id, 'cancelled')}>Cancel session</button>}
          {user?.role === 'mentor' && session.status === 'accepted' && <div className="mentor-summary-editor"><label>Optional summary to share with the user<textarea className="input" maxLength={2000} rows={3} value={summaryDrafts[session.id] || ''} onChange={event => setSummaryDrafts(current => ({ ...current, [session.id]: event.target.value }))} /></label><button className="btn btn-secondary" disabled={saving} onClick={() => changeSession(session.id, 'completed', summaryDrafts[session.id] || '')}>Complete session</button></div>}
          {canChat && <button className="btn btn-secondary" onClick={() => setOpenChatId(openChatId === session.id ? null : session.id)}>{openChatId === session.id ? 'Close chat' : 'Chat'}</button>}
          {canJoin && <Link className="btn btn-primary" to={`/mentor/sessions/${session.id}/meeting`}>Join video session</Link>}
        </div>
        {openChatId === session.id && canChat && <SessionChat sessionId={session.id} isDemo={session.isDemo} />}
      </article>;
    }) : <div className="mentor-empty card"><h2 className="f-display">No sessions yet</h2><p>Requests, upcoming sessions, and completed sessions will appear here.</p>{user?.role !== 'mentor' && <button className="btn btn-primary" onClick={() => setTab('discover')}>Find a mentor</button>}</div>}</section>}

    {tab === 'safety' && <form className="mentor-safety card" onSubmit={saveContacts}><h2 className="f-display">Your trusted people</h2><p>If your selected safety threshold is detected, Solace can email a consenting contact. The email shares only that a safety concern was detected; it does not include your message or chat history. Solace does not send SMS or place calls.</p>
      {contacts.map((contact, index) => <div className="mentor-contact-row" key={index}><input className="input" aria-label="Contact name" placeholder="Name" value={contact.name || ''} onChange={event => updateContact(index, 'name', event.target.value)} /><input className="input" aria-label="Relationship" placeholder="Relationship" value={contact.relationship || ''} onChange={event => updateContact(index, 'relationship', event.target.value)} /><input className="input" aria-label="Phone" placeholder="Phone" value={contact.phone || ''} onChange={event => updateContact(index, 'phone', event.target.value)} /><input className="input" aria-label="Email" placeholder="Email" value={contact.email || ''} onChange={event => updateContact(index, 'email', event.target.value)} /><label><input type="checkbox" checked={Boolean(contact.consentToContact)} onChange={event => updateContact(index, 'consentToContact', event.target.checked)} /> They agreed to be listed as my trusted contact</label><label><input type="checkbox" checked={Boolean(contact.consentToEmail)} disabled={!contact.email} onChange={event => updateContact(index, 'consentToEmail', event.target.checked)} /> They agreed to receive safety alert emails from Solace</label>{contacts.length > 1 && <button className="btn btn-ghost" type="button" onClick={() => setContacts(current => current.filter((_, i) => i !== index))}>Remove</button>}</div>)}
      {contacts.length < 5 && <button type="button" className="btn btn-secondary" onClick={() => setContacts(current => [...current, { name: '', relationship: '', phone: '', email: '', consentToContact: false, consentToEmail: false }])}>Add another contact</button>}
      <label className="mentor-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Show a trusted-contact prompt when a safety concern is detected</label>
      <label className="mentor-select-label">Prompt threshold<select className="input" value={threshold} onChange={event => setThreshold(event.target.value)}><option value="crisis">Crisis level</option><option value="high">High or crisis level</option></select></label>
      <p className="mentor-muted">Email delivery requires the server's Resend email settings. Alerts are sent once per contact per chat when the selected threshold is met. This does not replace emergency services. In immediate danger, call your local emergency number.</p><button className="btn btn-primary">Save safety preferences</button>
    </form>}
  </div></main>;
};
export default MentorConnect;
