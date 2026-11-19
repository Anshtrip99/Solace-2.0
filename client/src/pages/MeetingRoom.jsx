import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSessionMeeting } from '../services/api';
import { useAuth } from '../context/AuthContext';

const JITSI_API_URL = 'https://meet.jit.si/external_api.js';
const MeetingRoom = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const containerRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getSessionMeeting(sessionId)
      .then(result => { if (active) setMeeting(result.data); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.message || 'This meeting is not available.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!meeting || !containerRef.current) return undefined;
    let api;
    let disposed = false;
    const mountMeeting = () => {
      if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;
      api = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName: meeting.roomName,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        userInfo: { displayName: user?.name || 'Solace participant' },
        configOverwrite: { prejoinPageEnabled: true },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false }
      });
    };
    if (window.JitsiMeetExternalAPI) mountMeeting();
    else {
      let script = document.querySelector(`script[src="${JITSI_API_URL}"]`);
      if (!script) {
        script = document.createElement('script');
        script.src = JITSI_API_URL;
        script.async = true;
        document.body.appendChild(script);
      }
      script.addEventListener('load', mountMeeting);
      script.addEventListener('error', () => { if (!disposed) setError('Video could not load. You can open the meeting in a new tab instead.'); }, { once: true });
      if (window.JitsiMeetExternalAPI) mountMeeting();
    }
    return () => { disposed = true; api?.dispose(); };
  }, [meeting, user?.name]);

  return <main className="mentor-page meeting-page"><div className="mentor-wrap">
    <Link to="/mentor-connect" className="nav-link">← Back to sessions</Link>
    <p className="t-label" style={{ color: 'var(--sage-bright)', marginTop: 22 }}>Private session room</p>
    <h1 className="f-display t-h1">Meet with your mentor.</h1>
    <p className="mentor-muted">Video is provided by Jitsi Meet. Allow camera and microphone access when your browser asks.</p>
    {loading && <div className="mentor-loading"><div className="spinner" /></div>}
    {error && <div className="mentor-error" role="alert">{error}{meeting && <p><a href={`https://meet.jit.si/${encodeURIComponent(meeting.roomName)}`} target="_blank" rel="noreferrer">Open the meeting in a new tab</a></p>}</div>}
    {meeting && <div className="meeting-frame" ref={containerRef} aria-label="Video meeting" />}
  </div></main>;
};

export default MeetingRoom;
