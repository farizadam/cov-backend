const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema({
  // The identifier can be email or phone
  identifier: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  identifier_type: {
    type: String,
    enum: ["email", "phone"],
    required: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  code_hash: { type: String },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }, // TTL for unverified code
  verified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  verifiedExpiresAt: { type: Date }, // TTL for verified flag (15 min window to reset)
  sendCount: { type: Number, default: 0 },
  lastSentAt: { type: Date },
  attempts: { type: Number, default: 0 },
});

// TTL indexes
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
passwordResetSchema.index({ verifiedExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
