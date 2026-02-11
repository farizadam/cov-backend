const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    from_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    to_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    ride_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["driver_to_passenger", "passenger_to_driver"],
      index: true,
    },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: null,
      maxlength: 500,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Ensure one rating per booking per direction (user can only rate once per ride)
ratingSchema.index(
  { booking_id: 1, from_user: 1, to_user: 1 },
  { unique: true }
);

// Index for fetching user's received ratings
ratingSchema.index({ to_user: 1, createdAt: -1 });

// Index for fetching user's given ratings
ratingSchema.index({ from_user: 1, createdAt: -1 });

const Rating = mongoose.model("Rating", ratingSchema);

module.exports = Rating;
