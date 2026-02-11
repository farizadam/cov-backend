const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const Rating = require("../models/Rating");
const NotificationService = require("./notificationService");

// 30 minutes buffer after ride departure
const RIDE_COMPLETION_BUFFER_MS = 30 * 60 * 1000;

class RatingSchedulerService {
  static intervalId = null;

  /**
   * Start the scheduler that checks for completed rides
   * Runs every 5 minutes
   */
  static start() {
    console.log("🕐 Rating notification scheduler started");
    
    // Run immediately on start
    this.checkAndSendRatingNotifications();
    
    // Then run every 5 minutes
    this.intervalId = setInterval(() => {
      this.checkAndSendRatingNotifications();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Stop the scheduler
   */
  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("🛑 Rating notification scheduler stopped");
    }
  }

  /**
   * Check for rides that completed 30 minutes ago and send rating notifications
   */
  static async checkAndSendRatingNotifications() {
    try {
      const now = new Date();
      
      // Find the time window: rides that departed between 30-35 minutes ago
      // This ensures we only send notifications once per ride
      const windowStart = new Date(now.getTime() - (35 * 60 * 1000)); // 35 minutes ago
      const windowEnd = new Date(now.getTime() - RIDE_COMPLETION_BUFFER_MS); // 30 minutes ago

      // Find rides that are in the completion window
      const completedRides = await Ride.find({
        departure_datetime: {
          $gte: windowStart,
          $lte: windowEnd,
        },
        status: "active", // Only active rides
      }).populate("driver_id", "first_name last_name avatar_url");

      if (completedRides.length === 0) {
        return;
      }

      console.log(`📋 Found ${completedRides.length} rides to check for rating notifications`);

      for (const ride of completedRides) {
        // Find all accepted bookings for this ride
        const bookings = await Booking.find({
          ride_id: ride._id,
          status: "accepted",
        }).populate("passenger_id", "first_name last_name avatar_url");

        for (const booking of bookings) {
          // Check if ratings already exist
          const existingRatings = await Rating.find({
            booking_id: booking._id,
          });

          const passengerRated = existingRatings.some(
            (r) => r.type === "passenger_to_driver"
          );
          const driverRated = existingRatings.some(
            (r) => r.type === "driver_to_passenger"
          );

          // Send notification to passenger to rate driver (if not already rated)
          if (!passengerRated) {
            try {
              await NotificationService.notifyRateDriver(
                booking.passenger_id._id,
                {
                  booking_id: booking._id,
                  ride_id: ride._id,
                  driver_id: ride.driver_id._id,
                  driver_name: `${ride.driver_id.first_name} ${ride.driver_id.last_name}`,
                  driver_avatar: ride.driver_id.avatar_url,
                  ride_direction: ride.direction,
                  ride_datetime: ride.departure_datetime,
                }
              );
              console.log(
                `✅ Sent rate driver notification to passenger ${booking.passenger_id.first_name}`
              );
            } catch (err) {
              console.error("Error sending rate driver notification:", err.message);
            }
          }

          // Send notification to driver to rate passenger (if not already rated)
          if (!driverRated) {
            try {
              await NotificationService.notifyRatePassenger(ride.driver_id._id, {
                booking_id: booking._id,
                ride_id: ride._id,
                passenger_id: booking.passenger_id._id,
                passenger_name: `${booking.passenger_id.first_name} ${booking.passenger_id.last_name}`,
                passenger_avatar: booking.passenger_id.avatar_url,
                ride_direction: ride.direction,
                ride_datetime: ride.departure_datetime,
              });
              console.log(
                `✅ Sent rate passenger notification to driver ${ride.driver_id.first_name}`
              );
            } catch (err) {
              console.error("Error sending rate passenger notification:", err.message);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in rating notification scheduler:", error.message);
    }
  }
}

module.exports = RatingSchedulerService;
