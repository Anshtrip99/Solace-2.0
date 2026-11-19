const mongoose = require('mongoose');

const mentorMessageSchema = new mongoose.Schema({
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'MentorSession', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 }
}, { timestamps: true });

module.exports = mongoose.model('MentorMessage', mentorMessageSchema);
