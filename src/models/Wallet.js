const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
      description: "Available balance in cents (100 = 1.00 EUR)",
    },
    pending_balance: {
      type: Number,
      default: 0,
      min: 0,
      description: "Pending earnings from active rides (released after completion)",
    },
    total_earned: {
      type: Number,
      default: 0,
      min: 0,
      description: "Total lifetime earnings in cents",
    },
    total_withdrawn: {
      type: Number,
      default: 0,
      min: 0,
      description: "Total amount withdrawn in cents",
    },
    currency: {
      type: String,
      default: "EUR",
      enum: ["EUR", "USD", "GBP"],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Convert cents to euros for display
        ret.balance_display = (ret.balance / 100).toFixed(2);
        ret.pending_balance_display = (ret.pending_balance / 100).toFixed(2);
        ret.total_earned_display = (ret.total_earned / 100).toFixed(2);
        ret.total_withdrawn_display = (ret.total_withdrawn / 100).toFixed(2);
        return ret;
      },
    },
  }
);

// Static method to get or create wallet for a user
walletSchema.statics.getOrCreateWallet = async function (userId) {
  let wallet = await this.findOne({ user_id: userId });
  if (!wallet) {
    wallet = await this.create({ user_id: userId });
  }
  return wallet;
};

// Method to add earnings (from completed ride)
walletSchema.methods.addEarnings = async function (amount, fromPending = false) {
  if (fromPending) {
    // Move from pending to available
    this.pending_balance = Math.max(0, this.pending_balance - amount);
  }
  this.balance += amount;
  this.total_earned += amount;
  return this.save();
};

// Method to add pending earnings (ride booked but not completed)
walletSchema.methods.addPendingEarnings = async function (amount) {
  this.pending_balance += amount;
  return this.save();
};

// Method to withdraw funds
walletSchema.methods.withdraw = async function (amount) {
  if (amount > this.balance) {
    throw new Error("Insufficient balance");
  }
  this.balance -= amount;
  this.total_withdrawn += amount;
  return this.save();
};

// Method to refund (add back after failed payout)
walletSchema.methods.refundWithdrawal = async function (amount) {
  this.balance += amount;
  this.total_withdrawn -= amount;
  return this.save();
};

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
