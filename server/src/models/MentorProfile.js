const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  day: { type: Number, min: 0, max: 6, required: true },
  start: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  end: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }
}, { _id: false });

const mentorProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  photoUrl: { type: String, trim: true, default: '' },
  background: { type: String, required: true, trim: true, maxlength: 1000 },
  expertise: [{ type: String, trim: true, maxlength: 60 }],
  mentorType: { type: String, enum: ['qualified_professional', 'peer_wellbeing'], required: true },
  qualifications: [{ type: String, trim: true, maxlength: 160 }],
  experienceYears: { type: Number, min: 0, max: 80, default: 0 },
  languages: [{ type: String, trim: true, maxlength: 40 }],
  introduction: { type: String, required: true, trim: true, maxlength: 300 },
  bio: { type: String, required: true, trim: true, maxlength: 2000 },
  approach: { type: String, required: true, trim: true, maxlength: 1000 },
  availability: [availabilitySchema],
  sessionDuration: { type: Number, enum: [30, 45, 60], default: 30 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'approved', index: true },
  isDemo: { type: Boolean, default: false, index: true }
}, { timestamps: true });

module.exports = mongoose.model('MentorProfile', mentorProfileSchema);
