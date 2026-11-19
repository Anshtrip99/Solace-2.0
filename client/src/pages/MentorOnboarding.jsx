import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyMentorProfile, submitMentorProfile } from '../services/api';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const tags = value => value.split(',').map(item => item.trim()).filter(Boolean);
const MentorOnboarding = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: user?.name || '', phone: '', photoUrl: '', background: '', expertise: '', mentorType: 'peer_wellbeing', qualifications: '', experienceYears: '0', languages: 'English', introduction: '', bio: '', approach: '', selectedDays: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', sessionDuration: '30' });
  useEffect(() => {
    if (user?.role !== 'mentor') { navigate('/home', { replace: true }); return; }
    getMyMentorProfile().then(result => {
      setProfile(result.data);
      if (result.data) setForm(current => ({ ...current, ...result.data, name: result.data.user?.name || user?.name || '', expertise: result.data.expertise?.join(', ') || '', qualifications: result.data.qualifications?.join(', ') || '', languages: result.data.languages?.join(', ') || '', selectedDays: result.data.availability?.map(slot => slot.day) || current.selectedDays, start: result.data.availability?.[0]?.start || current.start, end: result.data.availability?.[0]?.end || current.end }));
    }).catch(() => {}).finally(() => setBusy(false));
  }, [user, navigate]);
  const set = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const toggleDay = day => setForm(current => ({ ...current, selectedDays: current.selectedDays.includes(day) ? current.selectedDays.filter(value => value !== day) : [...current.selectedDays, day] }));
  const submit = async event => {
    event.preventDefault(); setError(''); setMessage('');
    if (!form.selectedDays.length) { setError('Select at least one available day.'); return; }
    try {
      const availability = form.selectedDays.map(day => ({ day, start: form.start, end: form.end }));
      const result = await submitMentorProfile({ ...form, expertise: tags(form.expertise), qualifications: tags(form.qualifications), languages: tags(form.languages), experienceYears: Number(form.experienceYears), sessionDuration: Number(form.sessionDuration), availability });
      setProfile(result.data); await refreshUser(); setMessage(result.message || 'Your profile is now published.');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not submit your profile.'); }
  };
  if (busy) return <main className="mentor-page"><div className="spinner" /></main>;
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 6 };
  const labelStyle = { fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 };
  const inputStyle = { width: '100%' };
  return <main className="mentor-page">
    <div className="mentor-wrap">
      <Link to="/home" className="nav-link">← Dashboard</Link>
      <p className="t-label" style={{ color: 'var(--sage-bright)', marginTop: 24 }}>Mentor onboarding</p>
      <h1 className="f-display t-h1">Share the support you can offer.</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 680 }}>Add your background and availability. Your profile becomes visible to users as soon as you save it, and you can edit it at any time. Credentials are self-reported and are not verified by Solace.</p>
      {profile && <div className="mentor-notice"><strong>Your mentor profile is live</strong><p>Users can find your profile and request a free session.</p></div>}
      {profile?.status === 'suspended' ? <p className="mentor-error">This mentor profile is unavailable. Contact Solace support for assistance.</p> : <form className="mentor-form card" onSubmit={submit}>
        {error && <div className="mentor-error" role="alert">{error}</div>}{message && <div className="mentor-success" role="status">{message}</div>}
        <div className="mentor-form-grid">
          <label style={fieldStyle}><span style={labelStyle}>Full name</span><input className="input" name="name" required maxLength="50" value={form.name} onChange={set} /></label>
          <label style={fieldStyle}><span style={labelStyle}>Account email</span><input className="input" value={user?.email || ''} disabled /></label>
          <label style={fieldStyle}><span style={labelStyle}>Phone number</span><input className="input" name="phone" required value={form.phone || ''} onChange={set} autoComplete="tel" /></label>
          <label style={fieldStyle}><span style={labelStyle}>Profile photo URL (optional)</span><input className="input" name="photoUrl" type="url" placeholder="https://…" value={form.photoUrl || ''} onChange={set} /></label>
          <label style={fieldStyle}><span style={labelStyle}>Mentor background</span><select className="input" name="mentorType" value={form.mentorType} onChange={set}><option value="peer_wellbeing">Peer or general wellbeing mentor</option><option value="qualified_professional">Mental-health professional (self-described)</option></select></label>
          <label style={fieldStyle}><span style={labelStyle}>Years of experience</span><input className="input" name="experienceYears" type="number" min="0" max="80" value={form.experienceYears} onChange={set} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Background (education or professional experience)</span><textarea className="input" name="background" required maxLength="1000" value={form.background} onChange={set} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Areas of expertise (comma separated)</span><input className="input" name="expertise" required placeholder="Academic stress, career transitions, relationships" value={form.expertise} onChange={set} style={inputStyle} /></label>
          {form.mentorType === 'qualified_professional' && <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Qualifications and certifications (comma separated)</span><input className="input" name="qualifications" required value={form.qualifications} onChange={set} /><small style={{ color: 'var(--text-faint)' }}>Qualifications are self-reported and are not verified by Solace.</small></label>}
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Languages (comma separated)</span><input className="input" name="languages" required value={form.languages} onChange={set} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Short introduction</span><input className="input" name="introduction" required maxLength="300" value={form.introduction} onChange={set} placeholder="A sentence people will see on your card" /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Biography</span><textarea className="input" name="bio" required maxLength="2000" value={form.bio} onChange={set} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}><span style={labelStyle}>Mentoring approach</span><textarea className="input" name="approach" required maxLength="1000" value={form.approach} onChange={set} /></label>
          <fieldset style={{ gridColumn: '1 / -1', border: 0, padding: 0 }}><legend style={labelStyle}>Available days (times are UTC)</legend><div className="mentor-days">{days.map((day, index) => <label key={day}><input type="checkbox" checked={form.selectedDays.includes(index)} onChange={() => toggleDay(index)} /> {day.slice(0, 3)}</label>)}</div></fieldset>
          <label style={fieldStyle}><span style={labelStyle}>Available from (UTC)</span><input className="input" name="start" type="time" value={form.start} onChange={set} /></label>
          <label style={fieldStyle}><span style={labelStyle}>Available until (UTC)</span><input className="input" name="end" type="time" value={form.end} onChange={set} /></label>
          <label style={fieldStyle}><span style={labelStyle}>Session duration</span><select className="input" name="sessionDuration" value={form.sessionDuration} onChange={set}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
        </div>
        <button className="btn btn-primary" type="submit">{profile ? 'Save profile changes' : 'Save and publish profile'}</button>
      </form>}
    </div>
  </main>;
};
export default MentorOnboarding;
