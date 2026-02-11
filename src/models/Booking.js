const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    ride_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
      index: true,
    },
    passenger_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    seats: {
      type: Number,
      required: true,
      min: 1,
    },
    luggage_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "accepted", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    pickup_location: {
      address: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
    },
    dropoff_location: {
      address: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
    },
    // Payment tracking fields
    payment_status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    payment_method: {
      type: String,
      enum: ["card", "wallet"],
      required: function() {
        return this.payment_status === "paid" || this.payment_status === "refunded";
      }
    },
    payment_intent_id: {
      type: String,
      required: function() {
        return this.payment_method === "card" && (this.payment_status === "paid" || this.payment_status === "refunded");
      }
    },
    refund_id: {
      type: String,
      required: function() {
        return this.payment_status === "refunded" && this.payment_method === "card";
      }
    },
    refunded_at: {
      type: Date,
      required: function() {
        return this.payment_status === "refunded";
      }
    },
    refund_reason: {
      type: String,
      enum: ["passenger_cancelled", "driver_cancelled", "ride_cancelled", "admin_action"],
      required: function() {
        return this.payment_status === "refunded";
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Unique constraint: one booking per ride per passenger
bookingSchema.index({ ride_id: 1, passenger_id: 1 }, { unique: true });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
