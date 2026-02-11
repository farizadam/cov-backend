const mongoose = require("mongoose");
const Ride = require("../models/Ride");
const Airport = require("../models/Airport");
const Booking = require("../models/Booking");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const NotificationService = require("../services/notificationService");
const MapService = require("../services/mapService");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

class RideController {
  /**
   * Create a new ride
   * POST /api/v1/rides
   */
  static async create(req, res, next) {
    try {
      console.log("🚗 Creating ride for driver:", req.user.id);
      const driverId = req.user.id;
      const rideData = { ...req.validatedBody, driver_id: driverId };
      console.log("📝 Ride data:", rideData);

      // In covoiturage, any user can offer rides
      // No role restriction needed

      // Verify airport exists
      const airport = await Airport.findById(rideData.airport_id);
      if (!airport) {
        return res.status(404).json({
          success: false,
          message: "Airport not found",
        });
      }

      // Validate datetime is in the future
      const rideDate = new Date(rideData.datetime_start);
      if (rideDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Ride date must be in the future",
        });
      }

      // Set seats_left equal to seats_total
      rideData.seats_left = rideData.seats_total;

      // Set luggage_left equal to luggage_capacity
      rideData.luggage_left = rideData.luggage_capacity || 0;

      // Ensure coordinates are numbers
      if (rideData.home_latitude)
        rideData.home_latitude = parseFloat(rideData.home_latitude);
      if (rideData.home_longitude)
        rideData.home_longitude = parseFloat(rideData.home_longitude);

      console.log(
        `📍 Coordinates received: [${rideData.home_latitude}, ${rideData.home_longitude}]`,
      );

      // Calculate Route
      if (rideData.home_latitude && rideData.home_longitude) {
        const homeLoc = {
          lat: rideData.home_latitude,
          lng: rideData.home_longitude,
        };
        const airportLoc = {
          lat: airport.latitude,
          lng: airport.longitude,
        };

        let origin, destination;
        if (rideData.direction === "home_to_airport") {
          origin = homeLoc;
          destination = airportLoc;
        } else {
          origin = airportLoc;
          destination = homeLoc;
        }

        console.log("🗺️ Calculating route...");
        try {
          const route = await MapService.getRoute(origin, destination);
          rideData.route = route;
          console.log(
            "✅ Route calculated with",
            route.coordinates ? route.coordinates.length : 0,
            "points",
          );
        } catch (routeError) {
          console.error("❌ Route calculation failed:", routeError);
          // Fallback to straight line
          rideData.route = {
            type: "LineString",
            coordinates: [
              [origin.lng, origin.lat],
              [destination.lng, destination.lat],
            ],
          };
          console.log("⚠️ Using straight line fallback route");
        }
      } else {
        console.warn("⚠️ No coordinates provided, skipping route calculation");
      }

      const ride = await Ride.create(rideData);

      // Populate and transform the ride to match getMyRides format
      const populatedRide = await Ride.findById(ride._id).populate(
        "airport_id",
        "name iata_code",
      );

      // Map direction back to frontend format
      let frontendDirection = populatedRide.direction;
      if (populatedRide.direction === "home_to_airport") {
        frontendDirection = "to_airport";
      } else if (populatedRide.direction === "airport_to_home") {
        frontendDirection = "from_airport";
      }

      const transformedRide = {
        ...populatedRide.toJSON(),
        id: populatedRide._id.toString(),
        departure_datetime: populatedRide.datetime_start,
        direction: frontendDirection,
        available_seats: populatedRide.seats_left,
        luggage_capacity: populatedRide.luggage_capacity,
        luggage_left: populatedRide.luggage_left,
        driver_comment: populatedRide.comment,
        airport: {
          name: populatedRide.airport_id?.name,
          iata_code: populatedRide.airport_id?.iata_code,
        },
        bookings_count: 0,
        pending_count: 0,
        accepted_count: 0,
      };

      console.log("✅ Ride created successfully:", transformedRide.id);
      res.status(201).json({
        success: true,
        message: "Ride created successfully",
        data: transformedRide,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search rides
   * GET /api/v1/rides
   */
  static async search(req, res, next) {
    try {
      const {
        airport_id,
        direction,
        date,
        home_postcode,
        seats_min,
        page = 1,
        limit = 20,
        latitude,
        longitude,
        radius = 8000, // Default 8km radius
      } = req.query;

      if (!airport_id) {
        return res.status(400).json({
          success: false,
          message: "airport_id is required",
        });
      }

      console.log("Search Query Params:", req.query);

      // Map frontend direction values to database values
      let mappedDirection = direction;
      if (direction === "to_airport") {
        mappedDirection = "home_to_airport";
      } else if (direction === "from_airport") {
        mappedDirection = "airport_to_home";
      }

      console.log(
        "[RideSearch] Direction mapping:",
        direction,
        "->",
        mappedDirection,
      );

      const filter = {
        airport_id: new mongoose.Types.ObjectId(airport_id),
        status: "active",
      };

      if (mappedDirection) filter.direction = mappedDirection;
      if (seats_min) filter.seats_left = { $gte: parseInt(seats_min) };

      console.log(
        "[RideSearch] Filter being applied:",
        JSON.stringify(filter, null, 2),
      );

      // Handle date filtering
      if (date) {
        // If date is provided, search for rides on that specific date (ignoring hours)
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);
        console.log("Date range:", { startOfDay, endOfDay });
        filter.datetime_start = {
          $gte: startOfDay,
          $lte: endOfDay,
        };
      } else {
        // Only apply future check when no specific date is provided
        filter.datetime_start = { $gt: new Date() };
      }

      // Handle postcode fallback for non-geospatial searches
      if (!latitude && !longitude && home_postcode && !date) {
        // Fallback to postcode only if no geo coordinates and no date
        filter.home_postcode = home_postcode;
      }

      console.log("Filter being used:", JSON.stringify(filter, null, 2));

      // Debug: Check rides without direction filter
      const debugFilter = { ...filter };
      delete debugFilter.direction;
      const allRidesForDate = await Ride.find(debugFilter);
      console.log(
        `Debug: Found ${allRidesForDate.length} rides without direction filter`,
      );
      if (allRidesForDate.length > 0) {
        console.log(
          "Sample ride directions:",
          allRidesForDate.map((r) => ({ id: r._id, direction: r.direction })),
        );
      }

      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      let aggregationPipeline = [];

      // Geospatial Search (Route Matching) - must be first stage if used
      if (latitude && longitude) {
        console.log(
          `📍 Performing geospatial search near [${latitude}, ${longitude}] with radius ${radius}m`,
        );

        // Use $geoNear as first stage for geospatial queries
        aggregationPipeline.push({
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            distanceField: "distance",
            maxDistance: parseInt(radius),
            spherical: true,
            query: filter, // Apply all other filters here
          },
        });

        // Skip and limit after geospatial filtering
        if (skip > 0) aggregationPipeline.push({ $skip: skip });
        if (limitNum) aggregationPipeline.push({ $limit: limitNum });
      } else {
        // Non-geospatial search - use regular pipeline
        aggregationPipeline.push(
          { $match: filter },
          { $sort: { datetime_start: 1 } },
          { $skip: skip },
          { $limit: limitNum },
        );
      }

      // Add lookups for driver and airport data
      aggregationPipeline.push(
        {
          $lookup: {
            from: "users",
            localField: "driver_id",
            foreignField: "_id",
            as: "driver_id",
          },
        },
        { $unwind: { path: "$driver_id", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "airports",
            localField: "airport_id",
            foreignField: "_id",
            as: "airport_id",
          },
        },
        { $unwind: { path: "$airport_id", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            route: 0, // Exclude heavy geometry
            "driver_id.password": 0,
            "driver_id.email": 0,
          },
        },
      );

      // Execute the aggregation pipeline
      const rides = await Ride.aggregate(aggregationPipeline);

      console.log(`Found ${rides.length} rides`);

      // Transform to match expected format
      const transformedRides = rides.map((ride) => {
        // Map direction back to frontend format
        let frontendDirection = ride.direction;
        if (ride.direction === "home_to_airport") {
          frontendDirection = "to_airport";
        } else if (ride.direction === "airport_to_home") {
          frontendDirection = "from_airport";
        }

        return {
          ...ride,
          id: ride._id.toString(),
          departure_datetime: ride.datetime_start,
          direction: frontendDirection,
          available_seats: ride.seats_left,
          luggage_capacity: ride.luggage_capacity,
          luggage_left: ride.luggage_left,
          driver: {
            first_name: ride.driver_id?.first_name,
            last_name: ride.driver_id?.last_name,
            avatar_url: ride.driver_id?.avatar_url,
          },
          airport: {
            name: ride.airport_id?.name,
            code: ride.airport_id?.iata_code,
            city: ride.airport_id?.city,
            latitude: ride.airport_id?.latitude,
            longitude: ride.airport_id?.longitude,
          },
          home_latitude: ride.home_latitude,
          home_longitude: ride.home_longitude,
          driver_comment: ride.comment,
          // Keep backward compatibility
          driver_first_name: ride.driver_id?.first_name,
          driver_last_name: ride.driver_id?.last_name,
          driver_avatar: ride.driver_id?.avatar_url,
          airport_name: ride.airport_id?.name,
          airport_code: ride.airport_id?.iata_code,
        };
      });

      console.log("Transformed rides:", transformedRides);

      res.status(200).json({
        success: true,
        data: transformedRides,
        pagination: {
          page: pageNum,
          limit: limitNum,
          count: transformedRides.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get ride by ID
   * GET /api/v1/rides/:id
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      console.log("getById - Received ID:", id, "Type:", typeof id);
      console.log("getById - req.params:", req.params);

      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ride ID format",
        });
      }

      const ride = await Ride.findById(id)
        .populate("driver_id", "first_name last_name phone avatar_url")
        .populate("airport_id", "name iata_code city");

      if (!ride) {
        return res.status(404).json({
          success: false,
          message: "Ride not found",
        });
      }

      // Map direction back to frontend format
      let frontendDirection = ride.direction;
      if (ride.direction === "home_to_airport") {
        frontendDirection = "to_airport";
      } else if (ride.direction === "airport_to_home") {
        frontendDirection = "from_airport";
      }

      // Get the original driver_id before it was populated
      const driverIdString =
        ride.driver_id?._id?.toString() || ride.driver_id?.toString();

      // Transform to match expected format
      const transformedRide = {
        ...ride.toJSON(),
        id: ride._id.toString(),
        driver_id: driverIdString, // Ensure driver_id is the string ID, not the populated object
        departure_datetime: ride.datetime_start,
        direction: frontendDirection,
        available_seats: ride.seats_left,
        luggage_capacity: ride.luggage_capacity,
        luggage_left: ride.luggage_left,
        driver: {
          first_name: ride.driver_id?.first_name,
          last_name: ride.driver_id?.last_name,
          phone_number: ride.driver_id?.phone,
          avatar_url: ride.driver_id?.avatar_url,
        },
        airport: {
          name: ride.airport_id?.name,
          code: ride.airport_id?.iata_code,
          city: ride.airport_id?.city,
        },
        driver_comment: ride.comment,
        driver_first_name: ride.driver_id?.first_name,
        driver_last_name: ride.driver_id?.last_name,
        driver_phone: ride.driver_id?.phone,
        driver_avatar: ride.driver_id?.avatar_url,
        airport_name: ride.airport_id?.name,
        airport_code: ride.airport_id?.iata_code,
        airport_city: ride.airport_id?.city,
      };

      res.status(200).json({
        success: true,
        data: transformedRide,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get driver's rides
   * GET /api/v1/me/rides
   */
  static async getMyRides(req, res, next) {
    try {
      console.log("🔍 Fetching rides for driver:", req.user.id);
      const driverId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      // Optimized: Use aggregation pipeline to fetch rides with bookings in one query
      const rides = await Ride.aggregate([
        { $match: { driver_id: new mongoose.Types.ObjectId(driverId) } },
        { $sort: { datetime_start: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        {
          $lookup: {
            from: "airports",
            localField: "airport_id",
            foreignField: "_id",
            as: "airport_id",
          },
        },
        { $unwind: { path: "$airport_id", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "bookings",
            localField: "_id",
            foreignField: "ride_id",
            as: "bookings",
          },
        },
        {
          $addFields: {
            pending_count: {
              $size: {
                $filter: {
                  input: "$bookings",
                  as: "booking",
                  cond: { $eq: ["$$booking.status", "pending"] },
                },
              },
            },
            accepted_count: {
              $size: {
                $filter: {
                  input: "$bookings",
                  as: "booking",
                  cond: { $eq: ["$$booking.status", "accepted"] },
                },
              },
            },
          },
        },
        {
          $project: {
            route: 0, // Exclude heavy route geometry
          },
        },
      ]);

      console.log(`📊 Found ${rides.length} rides for driver ${driverId}`);

      // Transform results
      const transformedRides = rides.map((ride) => {
        let frontendDirection = ride.direction;
        if (ride.direction === "home_to_airport") {
          frontendDirection = "to_airport";
        } else if (ride.direction === "airport_to_home") {
          frontendDirection = "from_airport";
        }

        return {
          ...ride,
          id: ride._id.toString(),
          departure_datetime: ride.datetime_start,
          direction: frontendDirection,
          available_seats: ride.seats_left,
          luggage_capacity: ride.luggage_capacity,
          luggage_left: ride.luggage_left,
          driver_comment: ride.comment,
          airport_name: ride.airport_id?.name,
          airport_code: ride.airport_id?.iata_code,
          pending_bookings_count: ride.pending_count || 0,
          accepted_bookings_count: ride.accepted_count || 0,
          bookings: (ride.bookings || []).map((b) => ({
            _id: b._id?.toString(),
            status: b.status,
            seats: b.seats_booked || b.seats,
            passenger_id: b.passenger_id,
            passenger_first_name: b.passenger_first_name,
            passenger_last_name: b.passenger_last_name,
            passenger_phone: b.passenger_phone,
          })),
        };
      });

      console.log(`✅ Returning ${transformedRides.length} transformed rides`);
      res.status(200).json({
        success: true,
        data: transformedRides,
        pagination: {
          page: pageNum,
          limit: limitNum,
          count: transformedRides.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update ride
   * PATCH /api/v1/rides/:id
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const driverId = req.user.id;
      const updates = req.validatedBody;

      // Verify ride exists and user is the driver
      const existingRide = await Ride.findById(id);
      if (!existingRide) {
        return res.status(404).json({
          success: false,
          message: "Ride not found",
        });
      }

      if (existingRide.driver_id.toString() !== driverId) {
        return res.status(403).json({
          success: false,
          message: "You can only update your own rides",
        });
      }

      if (existingRide.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "Cannot update a cancelled or completed ride",
        });
      }

      // If luggage_capacity is being updated, adjust luggage_left accordingly
      if (updates.luggage_capacity !== undefined) {
        const bookedLuggage =
          (existingRide.luggage_capacity || 0) -
          (existingRide.luggage_left || 0);
        updates.luggage_left = Math.max(
          0,
          updates.luggage_capacity - bookedLuggage,
        );
      }

      const updatedRide = await Ride.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });

      res.status(200).json({
        success: true,
        message: "Ride updated successfully",
        data: updatedRide,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel ride
   * DELETE /api/v1/rides/:id
   */
  static async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const driverId = req.user.id;

      // Verify ride exists and user is the driver
      const existingRide = await Ride.findById(id).populate("airport_id");
      if (!existingRide) {
        return res.status(404).json({
          success: false,
          message: "Ride not found",
        });
      }

      if (existingRide.driver_id.toString() !== driverId) {
        return res.status(403).json({
          success: false,
          message: "You can only cancel your own rides",
        });
      }

      // Check 12-hour restriction for driver cancellations
      const rideDate = new Date(existingRide.datetime_start);
      const now = new Date();
      const hoursUntilRide = (rideDate - now) / (1000 * 60 * 60);

      if (hoursUntilRide < 12) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot cancel ride less than 12 hours before departure. Please contact support if this is an emergency.",
        });
      }

      // Get all affected bookings that need refunds BEFORE cancelling
      const paidBookings = await Booking.find({
        ride_id: id,
        status: { $in: ["pending", "accepted"] },
        payment_status: "paid",
      }).populate("passenger_id", "first_name last_name");

      console.log(
        `[RideCancel] Found ${paidBookings.length} paid bookings to refund for ride ${id}`,
      );

      // Cancel the ride
      const cancelledRide = await Ride.findByIdAndUpdate(
        id,
        { status: "cancelled" },
        { new: true },
      );

      if (!cancelledRide) {
        return res.status(400).json({
          success: false,
          message: "Ride cannot be cancelled",
        });
      }

      // Cancel all associated bookings
      const result = await Booking.updateMany(
        { ride_id: id, status: { $in: ["pending", "accepted"] } },
        { status: "cancelled" },
      );

      // Process refunds for paid bookings
      const refundResults = {
        processed: 0,
        failed: 0,
        errors: [],
      };

      for (const booking of paidBookings) {
        try {
          console.log(
            `[RideCancel] Processing refund for booking ${booking._id}, payment method: ${booking.payment_method}`,
          );

          if (booking.payment_method === "card" && booking.payment_intent_id) {
            // CARD PAYMENT REFUND via Stripe
            console.log(
              `[RideCancel] Refunding card payment for booking ${booking._id}, PaymentIntent: ${booking.payment_intent_id}`,
            );

            const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
            const refundParams = {
              payment_intent: booking.payment_intent_id,
            };

            // Check if the payment had a transfer (driver has Stripe Connect)
            try {
              const paymentIntent = await stripe.paymentIntents.retrieve(
                booking.payment_intent_id,
              );
              if (paymentIntent.transfer_data?.destination) {
                // Driver has Stripe Connect - reverse the transfer and application fee
                refundParams.reverse_transfer = true;
                refundParams.refund_application_fee = true;
                console.log(
                  `[RideCancel] Reversing transfer to ${paymentIntent.transfer_data.destination} and application fee`,
                );
              }
            } catch (retrieveErr) {
              console.error(
                `[RideCancel] Error retrieving PaymentIntent ${booking.payment_intent_id}:`,
                retrieveErr.message,
              );
            }

            const refund = await stripe.refunds.create(refundParams);
            console.log(
              `[RideCancel] Stripe refund created: ${refund.id}, Amount: ${refund.amount} cents`,
            );

            // Create a transaction record for the passenger to show the refund in their history
            const passengerWallet = await Wallet.getOrCreateWallet(
              booking.passenger_id,
            );
            await Transaction.create({
              wallet_id: passengerWallet._id,
              user_id: booking.passenger_id,
              type: "refund",
              amount: refund.amount,
              gross_amount: refund.amount,
              fee_amount: 0,
              fee_percentage: 0,
              net_amount: refund.amount,
              currency: "EUR",
              status: "completed",
              reference_type: "booking",
              reference_id: booking._id,
              stripe_payment_intent_id: booking.payment_intent_id,
              description: "Card refund - driver cancelled ride",
              processed_at: new Date(),
            });
            console.log(
              `[RideCancel] Created transaction record for card refund: ${refund.amount} cents to passenger`,
            );

            // If driver was credited via wallet (no Stripe Connect), deduct from driver's wallet
            const driver = await User.findById(driverId);
            if (!driver?.stripeAccountId) {
              try {
                const driverWallet = await Wallet.getOrCreateWallet(driverId);
                const feePercentage = parseFloat(
                  process.env.PLATFORM_FEE_PERCENT || "10",
                );
                const grossAmount =
                  existingRide.price_per_seat * booking.seats * 100;
                const driverEarnings = Math.round(
                  grossAmount * ((100 - feePercentage) / 100),
                );

                if (driverWallet.balance >= driverEarnings) {
                  driverWallet.balance -= driverEarnings;
                  driverWallet.total_earned -= driverEarnings;
                  await driverWallet.save();

                  await Transaction.create({
                    wallet_id: driverWallet._id,
                    user_id: driverId,
                    type: "refund",
                    amount: -driverEarnings,
                    gross_amount: grossAmount,
                    fee_amount: 0,
                    fee_percentage: 0,
                    net_amount: driverEarnings,
                    currency: "EUR",
                    status: "completed",
                    reference_type: "booking",
                    reference_id: booking._id,
                    stripe_payment_intent_id: booking.payment_intent_id,
                    description:
                      "Driver earnings reversed - driver cancelled ride",
                    processed_at: new Date(),
                  });
                  console.log(
                    `[RideCancel] Deducted ${driverEarnings} cents from driver wallet`,
                  );
                } else {
                  console.warn(
                    `[RideCancel] Driver wallet has insufficient balance for refund. Required: ${driverEarnings}, Available: ${driverWallet.balance}`,
                  );
                }
              } catch (walletErr) {
                console.error(
                  `[RideCancel] Error deducting from driver wallet:`,
                  walletErr.message,
                );
              }
            }

            // Update booking with refund information
            await Booking.findByIdAndUpdate(booking._id, {
              payment_status: "refunded",
              refund_id: refund.id,
              refunded_at: new Date(),
              refund_reason: "ride_cancelled",
            });
          } else if (booking.payment_method === "wallet") {
            // WALLET PAYMENT REFUND
            console.log(
              `[RideCancel] Refunding wallet payment for booking ${booking._id}`,
            );

            const totalAmount = Math.round(
              existingRide.price_per_seat * booking.seats * 100,
            );
            const feePercentage = parseFloat(
              process.env.PLATFORM_FEE_PERCENT || "10",
            );
            const driverEarnings = Math.round(
              totalAmount * ((100 - feePercentage) / 100),
            );

            // Credit passenger's wallet with FULL amount (100%)
            const passengerWallet = await Wallet.getOrCreateWallet(
              booking.passenger_id,
            );
            passengerWallet.balance += totalAmount;
            await passengerWallet.save();

            // Create refund transaction for passenger
            await Transaction.create({
              wallet_id: passengerWallet._id,
              user_id: booking.passenger_id,
              type: "refund",
              amount: totalAmount,
              gross_amount: totalAmount,
              fee_amount: 0,
              fee_percentage: 0,
              net_amount: totalAmount,
              currency: "EUR",
              status: "completed",
              reference_type: "booking",
              reference_id: booking._id,
              description: "Full refund - driver cancelled ride",
              processed_at: new Date(),
            });

            // Deduct from driver's wallet
            const driverWallet = await Wallet.getOrCreateWallet(driverId);
            if (driverWallet.balance >= driverEarnings) {
              driverWallet.balance -= driverEarnings;
              driverWallet.total_earned -= driverEarnings;
              await driverWallet.save();

              await Transaction.create({
                wallet_id: driverWallet._id,
                user_id: driverId,
                type: "refund",
                amount: -driverEarnings,
                gross_amount: totalAmount,
                fee_amount: 0,
                fee_percentage: 0,
                net_amount: driverEarnings,
                currency: "EUR",
                status: "completed",
                reference_type: "booking",
                reference_id: booking._id,
                description: "Driver earnings reversed - driver cancelled ride",
                processed_at: new Date(),
              });
            } else {
              console.warn(
                `[RideCancel] Driver wallet has insufficient balance for refund. Required: ${driverEarnings}, Available: ${driverWallet.balance}`,
              );
            }

            // Update booking with refund information
            await Booking.findByIdAndUpdate(booking._id, {
              payment_status: "refunded",
              refunded_at: new Date(),
              refund_reason: "ride_cancelled",
            });

            console.log(
              `[RideCancel] Wallet refund: ${totalAmount} cents to passenger, ${driverEarnings} cents deducted from driver`,
            );
          }

          refundResults.processed++;
        } catch (refundError) {
          console.error(
            `[RideCancel] Error processing refund for booking ${booking._id}:`,
            refundError,
          );
          refundResults.failed++;
          refundResults.errors.push(
            `Booking ${booking._id}: ${refundError.message}`,
          );
        }
      }

      // Get all affected bookings for notifications
      const affectedBookings = await Booking.find({
        ride_id: id,
        status: "cancelled",
      });

      // Notify all affected passengers
      for (const booking of affectedBookings) {
        await NotificationService.notifyRideCancelled(
          booking.passenger_id.toString(),
          {
            id: existingRide._id.toString(),
            airport_name: existingRide.airport_id?.name,
            datetime_start: existingRide.datetime_start,
            refund_processed: booking.payment_status === "paid", // Will be refunded
          },
        );
      }

      let message = "Ride cancelled successfully";
      if (refundResults.processed > 0) {
        message += `. ${refundResults.processed} passenger refund(s) processed`;
      }
      if (refundResults.failed > 0) {
        message += `. ${refundResults.failed} refund(s) failed - please contact support`;
      }

      res.status(200).json({
        success: true,
        message,
        data: {
          ride: cancelledRide,
          cancelled_bookings: result.modifiedCount,
          refunds: refundResults,
        },
      });
    } catch (error) {
      console.error(`[RideCancel] Error cancelling ride ${id}:`, error);
      next(error);
    }
  }

  /**
   * Get bookings for a ride (for driver)
   * GET /api/v1/rides/:id/bookings
   */
  static async getRideBookings(req, res, next) {
    try {
      const { id } = req.params;
      const driverId = req.user.id;

      // Verify ride exists and user is the driver
      const ride = await Ride.findById(id);
      if (!ride) {
        return res.status(404).json({
          success: false,
          message: "Ride not found",
        });
      }

      if (ride.driver_id.toString() !== driverId) {
        return res.status(403).json({
          success: false,
          message: "You can only view bookings for your own rides",
        });
      }

      const bookings = await Booking.find({ ride_id: id })
        .populate("passenger_id", "first_name last_name phone avatar_url")
        .sort({ createdAt: -1 });

      // Transform to match expected format
      const transformedBookings = bookings.map((booking) => ({
        ...booking.toJSON(),
        passenger_first_name: booking.passenger_id?.first_name,
        passenger_last_name: booking.passenger_id?.last_name,
        passenger_phone: booking.passenger_id?.phone,
        passenger_avatar: booking.passenger_id?.avatar_url,
      }));

      res.status(200).json({
        success: true,
        data: transformedBookings,
        count: transformedBookings.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Preview route
   * POST /api/v1/rides/route-preview
   */
  static async getRoutePreview(req, res, next) {
    try {
      const { origin, destination } = req.body;

      if (!origin || !destination) {
        return res.status(400).json({
          success: false,
          message: "Origin and destination are required",
        });
      }

      const route = await MapService.getRoute(origin, destination);

      // Transform GeoJSON coordinates [lng, lat] to { latitude, longitude } for frontend
      const frontendCoordinates = route.coordinates.map((coord) => ({
        latitude: coord[1],
        longitude: coord[0],
      }));

      res.status(200).json({
        success: true,
        data: frontendCoordinates,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = RideController;
