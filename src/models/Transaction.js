const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "ride_earning",      // Driver receives payment for ride
        "ride_payment",      // Passenger pays for ride using wallet
        "platform_fee",      // Platform commission deducted
        "withdrawal",        // User withdraws to bank
        "withdrawal_failed", // Failed withdrawal (money returned)
        "refund",           // Refund to passenger
        "bonus",            // Promotional bonus
        "adjustment",       // Manual adjustment by admin
      ],
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      description: "Amount in cents (positive for credit, negative for debit)",
    },
    gross_amount: {
      type: Number,
      default: null,
      description: "Original amount before fees (in cents)",
    },
    fee_amount: {
      type: Number,
      default: 0,
      description: "Platform fee amount in cents",
    },
    fee_percentage: {
      type: Number,
      default: 10,
      description: "Fee percentage applied (e.g., 10 for 10%)",
    },
    net_amount: {
      type: Number,
      required: true,
      description: "Final amount after fees (in cents)",
    },
    currency: {
      type: String,
      default: "EUR",
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    // References
    reference_type: {
      type: String,
      enum: ["booking", "ride", "payout", "refund", "manual"],
      default: null,
    },
    reference_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      description: "ID of related booking, ride, or payout",
    },
    // Stripe references
    stripe_payment_intent_id: {
      type: String,
      default: null,
      index: true,
    },
    stripe_transfer_id: {
      type: String,
      default: null,
    },
    stripe_payout_id: {
      type: String,
      default: null,
    },
    // Additional info
    description: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // For ride earnings
    ride_details: {
      ride_id: { type: mongoose.Schema.Types.ObjectId, ref: "Ride" },
      booking_id: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
      passenger_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      passenger_name: String,
      seats: Number,
      price_per_seat: Number,
      route: String,
    },
    // Processing timestamps
    processed_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Convert cents to euros for display
        ret.amount_display = (ret.amount / 100).toFixed(2);
        ret.gross_amount_display = ret.gross_amount ? (ret.gross_amount / 100).toFixed(2) : null;
        ret.fee_amount_display = (ret.fee_amount / 100).toFixed(2);
        ret.net_amount_display = (ret.net_amount / 100).toFixed(2);
        return ret;
      },
    },
  }
);

// Index for querying user's transaction history
transactionSchema.index({ user_id: 1, createdAt: -1 });
transactionSchema.index({ wallet_id: 1, createdAt: -1 });

// Static method to create a ride earning transaction
transactionSchema.statics.createRideEarning = async function ({
  wallet_id,
  user_id,
  gross_amount,
  fee_percentage = 10,
  booking,
  ride,
  passenger,
  stripe_payment_intent_id,
}) {
  const fee_amount = Math.round(gross_amount * (fee_percentage / 100));
  const net_amount = gross_amount - fee_amount;

  return this.create({
    wallet_id,
    user_id,
    type: "ride_earning",
    amount: net_amount,
    gross_amount,
    fee_amount,
    fee_percentage,
    net_amount,
    status: "completed",
    reference_type: "booking",
    reference_id: booking._id,
    stripe_payment_intent_id,
    description: `Ride earning from ${passenger?.first_name || "passenger"}`,
    ride_details: {
      ride_id: ride._id,
      booking_id: booking._id,
      passenger_id: passenger?._id,
      passenger_name: passenger ? `${passenger.first_name} ${passenger.last_name}` : "Unknown",
      seats: booking.seats,
      price_per_seat: ride.price_per_seat,
      route: `${ride.home_city} → Airport`,
    },
    processed_at: new Date(),
  });
};

// Static method to create a withdrawal transaction
transactionSchema.statics.createWithdrawal = async function ({
  wallet_id,
  user_id,
  amount,
  payout_id,
  stripe_payout_id,
}) {
  return this.create({
    wallet_id,
    user_id,
    type: "withdrawal",
    amount: -amount, // Negative because money is leaving
    gross_amount: amount,
    fee_amount: 0,
    net_amount: amount,
    status: "pending",
    reference_type: "payout",
    reference_id: payout_id,
    stripe_payout_id,
    description: "Withdrawal to bank account",
    processed_at: null,
  });
};

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
