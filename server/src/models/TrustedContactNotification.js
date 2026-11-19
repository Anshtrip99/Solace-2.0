const mongoose = require('mongoose');

const trustedContactNotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
  recipientEmail: { type: String, required: true, lowercase: true, trim: true },
  riskLevel: { type: String, enum: ['high', 'crisis'], required: true },
  status: { type: String, enum: ['sending', 'sent', 'failed'], default: 'sending', index: true },
  dedupeKey: { type: String, required: true, unique: true },
  providerMessageId: { type: String, default: '' },
  failureCode: { type: String, maxlength: 80, default: '' },
  sentAt: { type: Date, default: null },
}, { timestamps: true });

trustedContactNotificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('TrustedContactNotification', trustedContactNotificationSchema);
