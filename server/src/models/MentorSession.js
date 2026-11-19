const mongoose = require('mongoose');

const mentorSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'MentorProfile', required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  timezone: { type: String, required: true, default: 'UTC' },
  meetingRoom: { type: String, trim: true, select: false },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'], default: 'pending', index: true },
  isDemo: { type: Boolean, default: false, index: true },
  demoKey: { type: String, trim: true, unique: true, sparse: true },
  activeSlot: { type: Boolean, default: true },
  summary: { type: String, trim: true, maxlength: 2000, default: '' }
}, { timestamps: true });

// A pending or accepted request holds the selected start time against concurrent bookings.
mentorSessionSchema.index(
  { mentor: 1, startsAt: 1, activeSlot: 1 },
  { unique: true, partialFilterExpression: { activeSlot: true } }
);

module.exports = mongoose.model('MentorSession', mentorSessionSchema);
