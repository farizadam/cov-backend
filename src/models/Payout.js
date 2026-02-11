const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      description: "Amount in cents",
    },
    currency: {
      type: String,
      default: "EUR",
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "processing", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    // Stripe references
    stripe_payout_id: {
      type: String,
      default: null,
      index: true,
    },
    stripe_transfer_id: {
      type: String,
      default: null,
    },
    // Bank account info (masked for security)
    bank_account: {
      last4: { type: String, default: null },
      bank_name: { type: String, default: null },
      account_holder_name: { type: String, default: null },
    },
    // Method used
    payout_method: {
      type: String,
      enum: ["bank_transfer", "instant", "standard"],
      default: "standard",
    },
    // Timing
    requested_at: {
      type: Date,
      default: Date.now,
    },
    processing_started_at: {
      type: Date,
      default: null,
    },
    completed_at: {
      type: Date,
      default: null,
    },
    // If failed
    failure_reason: {
      type: String,
      default: null,
    },
    failure_code: {
      type: String,
      default: null,
    },
    // Estimated arrival
    estimated_arrival: {
      type: Date,
      default: null,
    },
    // Transaction reference
    transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.amount_display = (ret.amount / 100).toFixed(2);
        return ret;
      },
    },
  }
);

// Index for querying user's payout history
payoutSchema.index({ user_id: 1, createdAt: -1 });
payoutSchema.index({ status: 1, createdAt: -1 });

// Static method to create a new payout request
payoutSchema.statics.createPayoutRequest = async function ({
  user_id,
  wallet_id,
  amount,
  bank_account,
  payout_method = "standard",
}) {
  // Estimate arrival based on method
  const now = new Date();
  let estimated_arrival;
  
  if (payout_method === "instant") {
    estimated_arrival = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
  } else {
    estimated_arrival = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
  }

  return this.create({
    user_id,
    wallet_id,
    amount,
    bank_account,
    payout_method,
    estimated_arrival,
    requested_at: now,
  });
};

// Method to mark as processing
payoutSchema.methods.markProcessing = async function (stripe_payout_id, stripe_transfer_id = null) {
  this.status = "processing";
  this.stripe_payout_id = stripe_payout_id;
  this.stripe_transfer_id = stripe_transfer_id;
  this.processing_started_at = new Date();
  return this.save();
};

// Method to mark as completed
payoutSchema.methods.markCompleted = async function () {
  this.status = "completed";
  this.completed_at = new Date();
  return this.save();
};

// Method to mark as failed
payoutSchema.methods.markFailed = async function (failure_reason, failure_code = null) {
  this.status = "failed";
  this.failure_reason = failure_reason;
  this.failure_code = failure_code;
  return this.save();
};

const Payout = mongoose.model("Payout", payoutSchema);

module.exports = Payout;
