const mongoose = require("mongoose");

const savedLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    postcode: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    placeId: {
      type: String,
      default: null,
    },
  },
  { _id: true, timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password_hash: {
      type: String,
      required: true,
    },
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    date_of_birth: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      required: false,
      enum: ["driver", "passenger", "both"],
      default: "both",
    },
    avatar_url: {
      type: String,
      default: null,
    },
    avatar_public_id: {
      type: String,
      default: null,
    },
    firebase_uid: {
      type: String,
      default: null,
      index: true,
    },
    phone_verified: {
      type: Boolean,
      default: false,
    },
    email_verified: {
      type: Boolean,
      default: false,
    },
    // Profile fields
    bio: {
      type: String,
      default: null,
      maxlength: 500,
    },
    languages: {
      type: [String],
      default: [],
    },
    car_model: {
      type: String,
      default: null,
      maxlength: 100,
    },
    car_color: {
      type: String,
      default: null,
      maxlength: 50,
    },
    trips_completed: {
      type: Number,
      default: 0,
      min: 0,
    },
    id_image_front_url: {
      type: String,
      default: null,
    },
    id_image_back_url: {
      type: String,
      default: null,
    },
    id_image_front_public_id: {
      type: String,
      default: null,
      description: "Cloudinary public ID for front ID image",
    },
    id_image_back_public_id: {
      type: String,
      default: null,
      description: "Cloudinary public ID for back ID image",
    },
    stripeAccountId: {
      type: String,
      default: null,
      description: "Stripe Connect Account ID for payouts",
    },
    stripeCustomerId: {
      type: String,
      default: null,
      description: "Stripe Customer ID for payments",
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    rating_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    saved_locations: {
      type: [savedLocationSchema],
      default: [],
    },
    deleted_at: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password_hash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Index for active users (not deleted)
userSchema.index({ email: 1, deleted_at: 1 });

const User = mongoose.model("User", userSchema);

module.exports = User;
