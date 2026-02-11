const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },
    request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RideRequest",
      index: true,
    },
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
    message_type: {
      type: String,
      enum: ["text", "image"],
      default: "text",
    },
    image_url: {
      type: String,
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
    },
    read_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Index for efficient chat queries
messageSchema.index({ booking_id: 1, createdAt: -1 });
messageSchema.index({ request_id: 1, createdAt: -1 });
messageSchema.index({ receiver_id: 1, read: 1 });

// Validation: Must have either booking_id or request_id
messageSchema.pre('save', function(next) {
  if (!this.booking_id && !this.request_id) {
    next(new Error('Message must have either booking_id or request_id'));
  } else {
    next();
  }
});

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
