const mongoose = require("mongoose");

const rideRequestSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    airport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Airport",
      required: true,
    },
    direction: {
      type: String,
      enum: ["to_airport", "from_airport"],
      required: true,
    },
    // Pickup/dropoff location details
    location_address: {
      type: String,
      required: true,
    },
    location_city: {
      type: String,
      required: true,
    },
    location_postcode: {
      type: String,
    },
    location_latitude: {
      type: Number,
      required: true,
    },
    location_longitude: {
      type: Number,
      required: true,
    },
    // GeoJSON point for geospatial queries
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },
    // When the passenger needs the ride
    preferred_datetime: {
      type: Date,
      required: true,
    },
    // Flexibility in time (in minutes)
    time_flexibility: {
      type: Number,
      default: 30, // +/- 30 minutes
    },
    seats_needed: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
      default: 1,
    },
    luggage_count: {
      type: Number,
      default: 1,
    },
    // Max price passenger is willing to pay per seat
    max_price_per_seat: {
      type: Number,
    },
    // Additional notes from passenger
    notes: {
      type: String,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "matched", "accepted", "cancelled", "expired"],
      default: "pending",
    },
    // If a driver responds
    matched_ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
    },
    matched_driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Driver offers (multiple drivers can offer)
    offers: [
      {
        driver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        ride: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ride",
        },
        price_per_seat: Number,
        message: String,
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected"],
          default: "pending",
        },
        created_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    expires_at: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Index for searching requests
rideRequestSchema.index({
  airport: 1,
  direction: 1,
  status: 1,
  preferred_datetime: 1,
});
rideRequestSchema.index({ passenger: 1, status: 1 });
rideRequestSchema.index({ location_city: 1 });
rideRequestSchema.index({ expires_at: 1 });
rideRequestSchema.index({ location: "2dsphere" });

// Virtual for id
rideRequestSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

rideRequestSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("RideRequest", rideRequestSchema);
