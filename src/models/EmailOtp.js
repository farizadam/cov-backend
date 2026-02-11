const mongoose = require("mongoose");

const emailOtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  code_hash: { type: String },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }, // TTL for unverified OTP
  verified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  verifiedExpiresAt: { type: Date }, // TTL for verified flag
  sendCount: { type: Number, default: 0 },
  lastSentAt: { type: Date },
  attempts: { type: Number, default: 0 },
});

// TTL indexes: remove document when expiresAt passes (unverified OTP)
// and remove verified marker when verifiedExpiresAt passes
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailOtpSchema.index({ verifiedExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("EmailOtp", emailOtpSchema);
