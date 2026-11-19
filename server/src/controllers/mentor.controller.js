const MentorProfile = require('../models/MentorProfile');
const MentorSession = require('../models/MentorSession');
const User = require('../models/User');
const MentorMessage = require('../models/MentorMessage');
const crypto = require('crypto');

const escapedRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const publicMentor = (profile) => ({
  id: profile._id,
  name: profile.user?.name,
  email: profile.user?.email,
  photoUrl: profile.photoUrl,
  background: profile.background,
  expertise: profile.expertise,
  mentorType: profile.mentorType,
  qualifications: profile.qualifications,
  experienceYears: profile.experienceYears,
  languages: profile.languages,
  introduction: profile.introduction,
  bio: profile.bio,
  approach: profile.approach,
  availability: profile.availability,
  sessionDuration: profile.sessionDuration,
  isDemo: profile.isDemo,
  status: profile.status
});

const listMentors = async (req, res) => {
  try {
    const query = { status: { $ne: 'suspended' } };
    if (req.query.expertise) query.expertise = { $regex: escapedRegex(String(req.query.expertise).slice(0, 60)), $options: 'i' };
    if (req.query.language) query.languages = { $regex: escapedRegex(String(req.query.language).slice(0, 40)), $options: 'i' };
    const profiles = await MentorProfile.find(query).populate('user', 'name').sort({ createdAt: -1 }).limit(100);
    const search = String(req.query.search || '').trim().slice(0, 80).toLowerCase();
    const filtered = search ? profiles.filter(p => `${p.user?.name} ${p.introduction} ${p.expertise.join(' ')}`.toLowerCase().includes(search)) : profiles;
    res.json({ success: true, data: filtered.map(publicMentor) });
  } catch (error) {
    console.error('List mentors error:', error);
    res.status(500).json({ success: false, message: 'Could not load mentors' });
  }
};

const getMentor = async (req, res) => {
  try {
    const profile = await MentorProfile.findOne({ _id: req.params.mentorId, status: { $ne: 'suspended' } }).populate('user', 'name');
    if (!profile) return res.status(404).json({ success: false, message: 'Mentor not found' });
    res.json({ success: true, data: publicMentor(profile) });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Invalid mentor id' });
  }
};

const getAvailability = async (req, res) => {
  try {
    const { date } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ success: false, message: 'Provide a UTC date in YYYY-MM-DD format' });
    const profile = await MentorProfile.findOne({ _id: req.params.mentorId, status: { $ne: 'suspended' } });
    if (!profile) return res.status(404).json({ success: false, message: 'Mentor not found' });
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const weekday = dayStart.getUTCDay();
    const duration = profile.sessionDuration;
    const occupied = await MentorSession.find({ mentor: profile._id, activeSlot: true, startsAt: { $lt: dayEnd }, endsAt: { $gt: dayStart } }).select('startsAt endsAt');
    const available = [];
    for (const window of profile.availability.filter(item => item.day === weekday)) {
      const [sh, sm] = window.start.split(':').map(Number);
      const [eh, em] = window.end.split(':').map(Number);
      for (let minute = sh * 60 + sm; minute + duration <= eh * 60 + em; minute += duration) {
        const startsAt = new Date(dayStart.getTime() + minute * 60000);
        const endsAt = new Date(startsAt.getTime() + duration * 60000);
        if (startsAt <= new Date()) continue;
        if (occupied.some(session => startsAt < session.endsAt && endsAt > session.startsAt)) continue;
        available.push(startsAt.toISOString());
      }
    }
    res.json({ success: true, data: available });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Could not load availability' });
  }
};

const submitProfile = async (req, res) => {
  try {
    if (req.user.role !== 'mentor') return res.status(403).json({ success: false, message: 'Mentor account required' });
    const fields = ['name', 'phone', 'photoUrl', 'background', 'expertise', 'mentorType', 'qualifications', 'experienceYears', 'languages', 'introduction', 'bio', 'approach', 'availability', 'sessionDuration'];
    const data = Object.fromEntries(fields.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    const name = String(data.name || req.user.name || '').trim();
    if (!name || name.length > 50) return res.status(400).json({ success: false, message: 'Enter a name up to 50 characters long' });
    if (!Array.isArray(data.availability) || !data.availability.length || !Array.isArray(data.expertise) || !data.expertise.length || !Array.isArray(data.languages) || !data.languages.length) {
      return res.status(400).json({ success: false, message: 'Add at least one area of expertise, language, and available time window' });
    }
    const daySlots = new Map();
    for (const slot of data.availability) {
      const toMinutes = value => { const [hour, minute] = String(value || '').split(':').map(Number); return hour * 60 + minute; };
      const start = toMinutes(slot.start); const end = toMinutes(slot.end);
      if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return res.status(400).json({ success: false, message: 'Availability needs valid weekdays and end times later than start times' });
      }
      const existing = daySlots.get(slot.day) || [];
      if (existing.some(window => start < window.end && end > window.start)) return res.status(400).json({ success: false, message: 'Availability windows cannot overlap on the same day' });
      existing.push({ start, end }); daySlots.set(slot.day, existing);
    }
    if (data.mentorType === 'qualified_professional' && (!Array.isArray(data.qualifications) || !data.qualifications.length)) {
      return res.status(400).json({ success: false, message: 'Add at least one qualification for a professional profile' });
    }
    const existing = await MentorProfile.findOne({ user: req.user._id });
    if (existing?.status === 'suspended') return res.status(403).json({ success: false, message: 'This profile is unavailable. Contact Solace support.' });
    await User.findByIdAndUpdate(req.user._id, { name });
    delete data.name;
    if (existing) {
      Object.assign(existing, data, { status: 'approved' });
      await existing.save();
      return res.json({ success: true, data: existing, message: 'Profile saved and published' });
    }
    const profile = await MentorProfile.create({ ...data, user: req.user._id, status: 'approved' });
    res.status(201).json({ success: true, data: profile, message: 'Profile saved and published' });
  } catch (error) {
    const message = error.name === 'ValidationError' ? Object.values(error.errors).map(e => e.message).join(', ') : 'Could not submit mentor profile';
    res.status(400).json({ success: false, message });
  }
};

const myMentorProfile = async (req, res) => {
  if (req.user.role !== 'mentor') return res.status(403).json({ success: false, message: 'Mentor account required' });
  const profile = await MentorProfile.findOne({ user: req.user._id }).populate('user', 'name email');
  res.json({ success: true, data: profile });
};

const requestSession = async (req, res) => {
  try {
    if (req.user.role === 'mentor') return res.status(403).json({ success: false, message: 'Only user accounts can request sessions' });
    const { startsAt, note = '' } = req.body;
    const start = new Date(startsAt);
    if (!startsAt || Number.isNaN(start.getTime()) || start <= new Date()) return res.status(400).json({ success: false, message: 'Choose a future time slot' });
    if (typeof note !== 'string' || note.length > 1000) return res.status(400).json({ success: false, message: 'The session note must be under 1000 characters' });
    const mentor = await MentorProfile.findOne({ _id: req.params.mentorId, status: { $ne: 'suspended' } });
    if (!mentor) return res.status(404).json({ success: false, message: 'Mentor not found' });
    const duration = mentor.sessionDuration;
    const weekday = start.getUTCDay();
    const minuteOfDay = start.getUTCHours() * 60 + start.getUTCMinutes();
    const slotAllowed = mentor.availability.some(slot => {
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const offset = minuteOfDay - (sh * 60 + sm);
      return slot.day === weekday && offset >= 0 && offset % duration === 0 && minuteOfDay + duration <= eh * 60 + em && start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0;
    });
    if (!slotAllowed) return res.status(400).json({ success: false, message: 'That time is outside the mentor’s published availability' });
    const end = new Date(start.getTime() + duration * 60000);
    const overlap = await MentorSession.exists({ mentor: mentor._id, activeSlot: true, startsAt: { $lt: end }, endsAt: { $gt: start } });
    if (overlap) return res.status(409).json({ success: false, message: 'That slot was just booked. Please choose another time.' });
    const session = await MentorSession.create({ user: req.user._id, mentor: mentor._id, startsAt: start, endsAt: end, note: note.trim(), timezone: 'UTC', meetingRoom: `solace-${crypto.randomBytes(24).toString('hex')}` });
    res.status(201).json({ success: true, data: { id: session._id, startsAt: session.startsAt, endsAt: session.endsAt, status: session.status }, message: 'Session request sent to your mentor' });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'That slot was just booked. Please choose another time.' });
    console.error('Request session error:', error);
    res.status(400).json({ success: false, message: 'Could not request this session' });
  }
};

const listSessions = async (req, res) => {
  try {
    let filter;
    if (req.user.role === 'mentor') {
      const profile = await MentorProfile.findOne({ user: req.user._id });
      if (!profile) return res.json({ success: true, data: [] });
      filter = { mentor: profile._id };
    } else filter = { user: req.user._id };
    const sessions = await MentorSession.find(filter).populate('user', 'name').populate({ path: 'mentor', populate: { path: 'user', select: 'name' } }).sort({ startsAt: 1 }).limit(100);
    res.json({ success: true, data: sessions.map(session => ({
      id: session._id, startsAt: session.startsAt, endsAt: session.endsAt, note: session.note, status: session.status, summary: session.summary, isDemo: session.isDemo,
      user: session.user ? { id: session.user._id, name: session.user.name } : null,
      mentor: session.mentor ? { id: session.mentor._id, name: session.mentor.user?.name } : null
    })) });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ success: false, message: 'Could not load sessions' });
  }
};

const updateSession = async (req, res) => {
  try {
    const session = await MentorSession.findById(req.params.sessionId).populate('mentor');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    const isMentor = req.user.role === 'mentor' && String(session.mentor.user) === String(req.user._id);
    const isUser = String(session.user) === String(req.user._id);
    if (!isMentor && !isUser) return res.status(403).json({ success: false, message: 'Not authorized for this session' });
    const { status, summary = '' } = req.body;
    const transitionAllowed = (session.status === 'pending' && ((isMentor && ['accepted', 'rejected'].includes(status)) || (isUser && status === 'cancelled')))
      || (session.status === 'accepted' && ((isMentor && status === 'completed') || (isUser && status === 'cancelled' && session.startsAt > new Date())));
    if (!transitionAllowed) return res.status(409).json({ success: false, message: 'This session cannot make that status change' });
    if (status === 'completed' && session.startsAt > new Date()) return res.status(400).json({ success: false, message: 'A future session cannot be marked completed' });
    if (status === 'completed' && typeof summary !== 'string') return res.status(400).json({ success: false, message: 'Invalid summary' });
    session.status = status;
    if (['rejected', 'cancelled', 'completed'].includes(status)) session.activeSlot = false;
    if (status === 'completed') session.summary = summary.slice(0, 2000);
    await session.save();
    res.json({ success: true, data: session, message: `Session ${status}` });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Could not update session' });
  }
};

const findParticipantSession = async (req, res, includeMeetingRoom = false) => {
  let query = MentorSession.findById(req.params.sessionId).populate('mentor');
  if (includeMeetingRoom) query = query.select('+meetingRoom');
  const session = await query;
  if (!session) {
    res.status(404).json({ success: false, message: 'Session not found' });
    return null;
  }
  const isUser = String(session.user) === String(req.user._id);
  const isMentor = req.user.role === 'mentor' && String(session.mentor.user) === String(req.user._id);
  if (!isUser && !isMentor) {
    res.status(403).json({ success: false, message: 'Only the session participants can access this session' });
    return null;
  }
  return session;
};

const getSessionMessages = async (req, res) => {
  try {
    const session = await findParticipantSession(req, res);
    if (!session) return;
    if (['rejected', 'cancelled'].includes(session.status)) return res.status(403).json({ success: false, message: 'Chat is closed for this session' });
    const messages = await MentorMessage.find({ session: session._id }).sort({ createdAt: -1 }).limit(200).populate('sender', 'name');
    res.json({ success: true, data: messages.reverse().map(message => ({
      id: message._id,
      content: message.content,
      createdAt: message.createdAt,
      sender: { id: message.sender._id, name: message.sender.name }
    })) });
  } catch (error) {
    console.error('Load mentor session chat error:', error);
    res.status(500).json({ success: false, message: 'Could not load session chat' });
  }
};

const sendSessionMessage = async (req, res) => {
  try {
    const session = await findParticipantSession(req, res);
    if (!session) return;
    if (['rejected', 'cancelled'].includes(session.status)) return res.status(403).json({ success: false, message: 'Chat is closed for this session' });
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 2000) return res.status(400).json({ success: false, message: 'Enter a message up to 2000 characters' });
    const message = await MentorMessage.create({ session: session._id, sender: req.user._id, content });
    await message.populate('sender', 'name');
    res.status(201).json({ success: true, data: { id: message._id, content: message.content, createdAt: message.createdAt, sender: { id: message.sender._id, name: message.sender.name } } });
  } catch (error) {
    console.error('Send mentor session chat error:', error);
    res.status(500).json({ success: false, message: 'Could not send this message' });
  }
};

const getSessionMeeting = async (req, res) => {
  try {
    const session = await findParticipantSession(req, res, true);
    if (!session) return;
    if (session.status !== 'accepted') return res.status(409).json({ success: false, message: 'The mentor must accept this session before you can join video' });
    const now = new Date();
    if (!session.isDemo && (now < new Date(session.startsAt.getTime() - 15 * 60000) || now > new Date(session.endsAt.getTime() + 60 * 60000))) {
      return res.status(403).json({ success: false, message: 'Video is available 15 minutes before the session until one hour after it ends' });
    }
    if (!session.meetingRoom) {
      session.meetingRoom = `solace-${crypto.randomBytes(24).toString('hex')}`;
      await session.save();
    }
    res.json({ success: true, data: { roomName: session.meetingRoom, startsAt: session.startsAt, endsAt: session.endsAt } });
  } catch (error) {
    console.error('Get mentor meeting error:', error);
    res.status(500).json({ success: false, message: 'Could not open this meeting' });
  }
};

const saveEmergencyPreferences = async (req, res) => {
  try {
    const contacts = Array.isArray(req.body.contacts) ? req.body.contacts.slice(0, 5) : [];
    for (const contact of contacts) {
      if (!contact.name || (!contact.phone && !contact.email)) return res.status(400).json({ success: false, message: 'Each contact needs a name and phone or email' });
    }
    const enabled = req.body.enabled === true && contacts.some(contact => contact.consentToContact === true);
    const threshold = req.body.threshold === 'high' ? 'high' : 'crisis';
    const user = await User.findByIdAndUpdate(req.user._id, { trustedContacts: contacts, emergencyPreferences: { enabled, threshold } }, { new: true });
    res.json({ success: true, data: { contacts: user.trustedContacts, preferences: user.emergencyPreferences } });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Could not save emergency preferences' });
  }
};

module.exports = { listMentors, getMentor, getAvailability, submitProfile, myMentorProfile, requestSession, listSessions, updateSession, getSessionMessages, sendSessionMessage, getSessionMeeting, saveEmergencyPreferences };
