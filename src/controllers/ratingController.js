const Rating = require("../models/Rating");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Ride = require("../models/Ride");

// 30 minutes buffer after ride departure before ratings are allowed
const RIDE_COMPLETION_BUFFER_MS = 30 * 60 * 1000;

class RatingController {
  /**
   * Create a new rating
   * Only allowed after ride departure time + 30 min has passed
   * POST /api/v1/ratings
   */
  static async createRating(req, res, next) {
    try {
      const { booking_id, stars, comment } = req.body;
      const fromUserId = req.user.id;
      const now = new Date();

      // Validate stars
      if (!stars || stars < 1 || stars > 5) {
        return res.status(400).json({
          success: false,
          message: "Stars must be between 1 and 5",
        });
      }

      // Get the booking with ride info
      const booking = await Booking.findById(booking_id)
        .populate("ride_id")
        .populate("passenger_id");

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      // Check if booking is accepted
      if (booking.status !== "accepted") {
        return res.status(400).json({
          success: false,
          message: "Can only rate completed rides",
        });
      }

      const ride = booking.ride_id;

      // Check if ride time has passed (departure + 30 minutes)
      if (ride.departure_datetime) {
        const departureTime = new Date(ride.departure_datetime);
        const completionTime = new Date(departureTime.getTime() + RIDE_COMPLETION_BUFFER_MS);
        
        if (now < completionTime) {
          return res.status(400).json({
            success: false,
            message: "Cannot rate until the ride is completed",
            rideEndsAt: completionTime,
          });
        }
      }

      const driverId = ride.driver_id.toString();
      const passengerId = booking.passenger_id._id.toString();

      // Determine rating type and target user
      let toUserId;
      let ratingType;

      if (fromUserId === driverId) {
        // Driver rating passenger
        toUserId = passengerId;
        ratingType = "driver_to_passenger";
      } else if (fromUserId === passengerId) {
        // Passenger rating driver
        toUserId = driverId;
        ratingType = "passenger_to_driver";
      } else {
        return res.status(403).json({
          success: false,
          message: "You are not part of this booking",
        });
      }

      // Check if rating already exists
      const existingRating = await Rating.findOne({
        booking_id: booking_id,
        from_user: fromUserId,
        to_user: toUserId,
      });

      if (existingRating) {
        return res.status(400).json({
          success: false,
          message: "You have already rated this ride",
        });
      }

      // Create the rating
      const rating = await Rating.create({
        from_user: fromUserId,
        to_user: toUserId,
        booking_id: booking_id,
        ride_id: ride._id,
        type: ratingType,
        stars: stars,
        comment: comment || null,
      });

      // Update the target user's average rating
      await RatingController.updateUserRating(toUserId);

      // Populate the rating for response
      const populatedRating = await Rating.findById(rating._id)
        .populate("from_user", "first_name last_name avatar_url")
        .populate("to_user", "first_name last_name avatar_url");

      res.status(201).json({
        success: true,
        data: populatedRating,
        message: "Rating submitted successfully",
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "You have already rated this ride",
        });
      }
      next(error);
    }
  }

  /**
   * Update user's average rating
   */
  static async updateUserRating(userId) {
    const ratings = await Rating.find({ to_user: userId });
    
    if (ratings.length === 0) {
      await User.findByIdAndUpdate(userId, {
        rating: 0,
        rating_count: 0,
      });
      return;
    }

    const totalStars = ratings.reduce((sum, r) => sum + r.stars, 0);
    const averageRating = Math.round((totalStars / ratings.length) * 10) / 10; // Round to 1 decimal

    await User.findByIdAndUpdate(userId, {
      rating: averageRating,
      rating_count: ratings.length,
    });
  }

  /**
   * Get ratings received by a user
   * GET /api/v1/ratings/user/:userId
   */
  static async getUserRatings(req, res, next) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const ratings = await Rating.find({ to_user: userId })
        .populate("from_user", "first_name last_name avatar_url")
        .populate("ride_id", "direction airport_id departure_datetime")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Rating.countDocuments({ to_user: userId });

      // Get user's current rating stats
      const user = await User.findById(userId).select("rating rating_count first_name last_name");

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            first_name: user.first_name,
            last_name: user.last_name,
            rating: user.rating,
            rating_count: user.rating_count,
          },
          ratings: ratings,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            totalPages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get my received ratings
   * GET /api/v1/ratings/me
   */
  static async getMyRatings(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const ratings = await Rating.find({ to_user: userId })
        .populate("from_user", "first_name last_name avatar_url")
        .populate("ride_id", "direction airport_id departure_datetime")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Rating.countDocuments({ to_user: userId });

      res.json({
        success: true,
        data: {
          ratings: ratings,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            totalPages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if user can rate a booking
   * Only allows rating after ride departure time + 30 min has passed
   * GET /api/v1/ratings/can-rate/:bookingId
   */
  static async canRateBooking(req, res, next) {
    try {
      const { bookingId } = req.params;
      const userId = req.user.id;

      // 30 minutes buffer after ride departure
      const RIDE_COMPLETION_BUFFER_MS = 30 * 60 * 1000;
      const now = new Date();

      const booking = await Booking.findById(bookingId)
        .populate("ride_id")
        .populate("passenger_id");

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      // Check if booking is accepted
      if (booking.status !== "accepted") {
        return res.json({
          success: true,
          data: {
            canRate: false,
            reason: "Ride not completed",
          },
        });
      }

      const ride = booking.ride_id;

      // Check if ride time has passed (departure + 30 minutes)
      if (ride.departure_datetime) {
        const departureTime = new Date(ride.departure_datetime);
        const completionTime = new Date(departureTime.getTime() + RIDE_COMPLETION_BUFFER_MS);
        
        if (now < completionTime) {
          return res.json({
            success: true,
            data: {
              canRate: false,
              reason: "Ride not yet completed",
              rideEndsAt: completionTime,
            },
          });
        }
      }

      const driverId = ride.driver_id.toString();
      const passengerId = booking.passenger_id._id.toString();

      // Check if user is part of this booking
      if (userId !== driverId && userId !== passengerId) {
        return res.json({
          success: true,
          data: {
            canRate: false,
            reason: "Not part of this booking",
          },
        });
      }

      // Determine who the user would rate
      const toUserId = userId === driverId ? passengerId : driverId;
      const ratingType = userId === driverId ? "driver_to_passenger" : "passenger_to_driver";

      // Check if already rated
      const existingRating = await Rating.findOne({
        booking_id: bookingId,
        from_user: userId,
      });

      if (existingRating) {
        return res.json({
          success: true,
          data: {
            canRate: false,
            reason: "Already rated",
            existingRating: existingRating,
          },
        });
      }

      // Get target user info
      const targetUser = await User.findById(toUserId)
        .select("first_name last_name avatar_url rating rating_count");

      res.json({
        success: true,
        data: {
          canRate: true,
          ratingType: ratingType,
          targetUser: {
            id: targetUser._id,
            first_name: targetUser.first_name,
            last_name: targetUser.last_name,
            avatar_url: targetUser.avatar_url,
            rating: targetUser.rating,
            rating_count: targetUser.rating_count,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get pending ratings (rides completed but not yet rated)
   * Only shows rides where departure_datetime + 30 min has passed
   * GET /api/v1/ratings/pending
   */
  static async getPendingRatings(req, res, next) {
    try {
      const userId = req.user.id;

      // Calculate the cutoff time (current time - 30 minutes buffer after ride)
      // A ride is considered "completed" 30 minutes after its departure time
      const RIDE_COMPLETION_BUFFER_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
      const now = new Date();

      // Find all accepted bookings where user is driver or passenger
      // and hasn't rated yet

      // Get rides where user is driver
      const driverRides = await Ride.find({ driver_id: userId }).select("_id");
      const driverRideIds = driverRides.map((r) => r._id);

      // Get bookings where user is passenger
      const passengerBookings = await Booking.find({
        passenger_id: userId,
        status: "accepted",
      })
        .populate("ride_id")
        .populate({
          path: "ride_id",
          populate: { path: "driver_id", select: "first_name last_name avatar_url rating rating_count" },
        });

      // Get bookings where user is driver
      const driverBookings = await Booking.find({
        ride_id: { $in: driverRideIds },
        status: "accepted",
      })
        .populate("passenger_id", "first_name last_name avatar_url rating rating_count")
        .populate("ride_id");

      // Get existing ratings by this user
      const existingRatings = await Rating.find({ from_user: userId });
      const ratedBookingIds = new Set(existingRatings.map((r) => r.booking_id.toString()));

      // Helper function to check if ride is completed (departure time + 30 min has passed)
      const isRideCompleted = (ride) => {
        if (!ride || !ride.departure_datetime) return false;
        const departureTime = new Date(ride.departure_datetime);
        const completionTime = new Date(departureTime.getTime() + RIDE_COMPLETION_BUFFER_MS);
        return now >= completionTime;
      };

      // Filter out already rated bookings AND rides that haven't completed yet
      const pendingAsPassenger = passengerBookings
        .filter((b) => {
          const notRated = !ratedBookingIds.has(b._id.toString());
          const rideCompleted = isRideCompleted(b.ride_id);
          return notRated && rideCompleted;
        })
        .map((b) => ({
          booking_id: b._id,
          ride_id: b.ride_id._id,
          type: "passenger_to_driver",
          target_user: {
            id: b.ride_id.driver_id._id,
            first_name: b.ride_id.driver_id.first_name,
            last_name: b.ride_id.driver_id.last_name,
            avatar_url: b.ride_id.driver_id.avatar_url,
            rating: b.ride_id.driver_id.rating,
            rating_count: b.ride_id.driver_id.rating_count,
          },
          ride: {
            direction: b.ride_id.direction,
            departure_datetime: b.ride_id.departure_datetime,
          },
        }));

      const pendingAsDriver = driverBookings
        .filter((b) => {
          const notRated = !ratedBookingIds.has(b._id.toString());
          const rideCompleted = isRideCompleted(b.ride_id);
          return notRated && rideCompleted;
        })
        .map((b) => ({
          booking_id: b._id,
          ride_id: b.ride_id._id,
          type: "driver_to_passenger",
          target_user: {
            id: b.passenger_id._id,
            first_name: b.passenger_id.first_name,
            last_name: b.passenger_id.last_name,
            avatar_url: b.passenger_id.avatar_url,
            rating: b.passenger_id.rating,
            rating_count: b.passenger_id.rating_count,
          },
          ride: {
            direction: b.ride_id.direction,
            departure_datetime: b.ride_id.departure_datetime,
          },
        }));

      res.json({
        success: true,
        data: {
          pending: [...pendingAsPassenger, ...pendingAsDriver],
          count: pendingAsPassenger.length + pendingAsDriver.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get rating statistics for a user
   * GET /api/v1/ratings/stats/:userId
   */
  static async getUserRatingStats(req, res, next) {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId).select("rating rating_count first_name last_name");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get rating distribution
      const distribution = await Rating.aggregate([
        { $match: { to_user: user._id } },
        { $group: { _id: "$stars", count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]);

      // Format distribution
      const starDistribution = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      };
      distribution.forEach((d) => {
        starDistribution[d._id] = d.count;
      });

      // Get recent comments (with ratings)
      const recentReviews = await Rating.find({
        to_user: userId,
        comment: { $ne: null, $ne: "" },
      })
        .populate("from_user", "first_name last_name avatar_url")
        .sort({ createdAt: -1 })
        .limit(5);

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            first_name: user.first_name,
            last_name: user.last_name,
            rating: user.rating,
            rating_count: user.rating_count,
          },
          distribution: starDistribution,
          recentReviews: recentReviews,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = RatingController;
