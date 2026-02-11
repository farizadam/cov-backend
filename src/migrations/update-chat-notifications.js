/**
 * Migration: Update existing chat_message notifications to add sender_role
 * Run with: node src/migrations/update-chat-notifications.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const Booking = require("../models/Booking");
const Ride = require("../models/Ride"); // Need to register the Ride model for populate

async function migrate() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/airoprt";
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find all chat_message notifications without sender_role
    const chatNotifications = await Notification.find({
      type: "chat_message",
      "payload.sender_role": { $exists: false },
    });

    console.log(`Found ${chatNotifications.length} chat notifications to update`);

    let updated = 0;
    let failed = 0;

    for (const notification of chatNotifications) {
      try {
        const bookingId = notification.payload?.booking_id;
        const senderId = notification.payload?.sender_id;

        if (!bookingId || !senderId) {
          console.log(`⚠️ Skipping notification ${notification._id} - missing booking_id or sender_id`);
          failed++;
          continue;
        }

        // Get the booking to find the driver
        const booking = await Booking.findById(bookingId).populate({
          path: "ride_id",
          select: "driver_id",
        });

        if (!booking || !booking.ride_id) {
          console.log(`⚠️ Skipping notification ${notification._id} - booking not found`);
          failed++;
          continue;
        }

        const driverId = booking.ride_id.driver_id?.toString();
        const senderRole = senderId.toString() === driverId ? "driver" : "passenger";

        // Update the notification
        await Notification.updateOne(
          { _id: notification._id },
          { $set: { "payload.sender_role": senderRole } }
        );

        updated++;
        console.log(`✅ Updated notification ${notification._id} - sender is ${senderRole}`);
      } catch (err) {
        console.error(`❌ Error updating notification ${notification._id}:`, err.message);
        failed++;
      }
    }

    console.log("\n========== Migration Complete ==========");
    console.log(`✅ Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${chatNotifications.length}`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
