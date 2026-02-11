const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const NotificationService = require("../services/notificationService");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

class BookingController {
  /**
   * Create a booking request
   * POST /api/v1/rides/:rideId/bookings
   */
  static async create(req, res, next) {
    try {
      const { rideId } = req.params;
      const passengerId = req.user.id;
      const { seats, pickup_location, dropoff_location, luggage_count } =
        req.validatedBody || req.body; // Fallback to req.body if validatedBody doesn't have them yet

      // Get ride details
      const ride = await Ride.findById(rideId);

      if (!ride) {
        return res.status(404).json({
          success: false,
          message: "Ride not found",
        });
      }

      // Validate ride status
      if (ride.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "This ride is not available for booking",
        });
      }

      // Validate ride is in the future
      if (new Date(ride.datetime_start) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Cannot book a ride in the past",
        });
      }

      // Cannot book own ride
      if (ride.driver_id.toString() === passengerId) {
        return res.status(400).json({
          success: false,
          message: "You cannot book your own ride",
        });
      }

      // Check if already booked
      const alreadyBooked = await Booking.findOne({
        ride_id: rideId,
        passenger_id: passengerId,
      });

      if (alreadyBooked) {
        return res.status(409).json({
          success: false,
          message: "You already have a booking for this ride",
        });
      }

      // Check available seats
      if (ride.seats_left < seats) {
        return res.status(400).json({
          success: false,
          message: `Only ${ride.seats_left} seat(s) available`,
        });
      }

      // Check available luggage capacity
      const requestedLuggage = parseInt(luggage_count) || 0;
      if (requestedLuggage > 0 && ride.luggage_left < requestedLuggage) {
        return res.status(400).json({
          success: false,
          message: `Only ${ride.luggage_left} luggage spot(s) available`,
        });
      }

      // Create booking
      const booking = await Booking.create({
        ride_id: rideId,
        passenger_id: passengerId,
        seats,
        luggage_count: requestedLuggage,
        pickup_location,
        dropoff_location,
      });

      // Don't reserve seats yet - only reserve when accepted
      // This allows multiple pending requests

      // Get full booking details for notification
      const bookingWithDetails = await Booking.findById(booking._id)
        .populate("passenger_id", "first_name last_name phone avatar_url")
        .populate({
          path: "ride_id",
          populate: { path: "airport_id", select: "name iata_code" },
        });

      // Notify driver
      try {
        await NotificationService.notifyBookingRequest(
          ride.driver_id.toString(),
          {
            id: booking._id.toString(),
            ride_id: rideId,
            passenger_first_name: bookingWithDetails.passenger_id?.first_name,
            passenger_last_name: bookingWithDetails.passenger_id?.last_name,
            seats,
            pickup_location,
            dropoff_location,
          },
        );
        console.log(
          `[BookingController] Sent booking request notification to driver ${ride.driver_id}`,
        );
      } catch (notifErr) {
        console.error(
          "[BookingController] Failed to send booking request notification:",
          notifErr?.message || notifErr,
        );
        // Do not fail the booking if notification fails
      }

      res.status(201).json({
        success: true,
        message: "Booking request created successfully",
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get passenger's bookings
   * GET /api/v1/me/bookings
   */
  static async getMyBookings(req, res, next) {
    try {
      const passengerId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const pageNum = parseInt(page);
      const limitNum = Math.min(parseInt(limit), 100);
      const skip = (pageNum - 1) * limitNum;

      const bookings = await Booking.find({ passenger_id: passengerId })
        .populate({
          path: "ride_id",
          populate: [
            {
              path: "driver_id",
              select: "first_name last_name phone avatar_url rating",
            },
            { path: "airport_id", select: "name iata_code" },
          ],
        })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip);

      // Transform to match expected format
      const transformedBookings = bookings.map((booking) => {
        const ride = booking.ride_id ? booking.ride_id.toJSON() : null;
        if (ride) {
          if (ride.direction === "home_to_airport")
            ride.direction = "to_airport";
          else if (ride.direction === "airport_to_home")
            ride.direction = "from_airport";
        }

        return {
          ...booking.toJSON(),
          ride,
          datetime_start: ride?.datetime_start,
          direction: ride?.direction,
          home_city: ride?.home_city,
          price_per_seat: ride?.price_per_seat,
          ride_status: ride?.status,
          driver_id: ride?.driver_id?._id || ride?.driver_id,
          driver_first_name: ride?.driver_id?.first_name,
          driver_last_name: ride?.driver_id?.last_name,
          driver_phone: ride?.driver_id?.phone,
          driver_avatar_url: ride?.driver_id?.avatar_url,
          driver_rating: ride?.driver_id?.rating,
          airport_name: ride?.airport_id?.name,
          airport_code: ride?.airport_id?.iata_code,
        };
      });

      res.status(200).json({
        success: true,
        data: transformedBookings,
        pagination: {
          page: pageNum,
          limit: limitNum,
          count: transformedBookings.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update booking status (accept/reject/cancel) or seats
   * PATCH /api/v1/bookings/:id
   */
  static async updateBooking(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { status, seats } = req.validatedBody;

      console.log(
        `[BookingController] updateBooking: ID=${id}, User=${userId}, Body=${JSON.stringify(req.validatedBody)}`,
      );

      // Get booking details
      const booking = await Booking.findById(id).populate({
        path: "ride_id",
        populate: { path: "driver_id airport_id" }, // Populate driver_id here
      });

      if (!booking) {
        console.warn(`[BookingController] Booking not found for ID: ${id}`);
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      const ride = booking.ride_id;
      if (!ride) {
        console.error(
          `[BookingController] Ride not found for booking ID: ${id}`,
        );
        return res.status(404).json({
          success: false,
          message: "Associated ride not found",
        });
      }

      const isDriver = ride.driver_id._id.toString() === userId;
      const isPassenger = booking.passenger_id.toString() === userId;

      console.log(
        `[BookingController] isDriver=${isDriver}, isPassenger=${isPassenger}`,
      );

      // Validate permissions
      if (!isDriver && !isPassenger) {
        console.warn(
          `[BookingController] Permission denied for user ${userId} on booking ${id}`,
        );
        return res.status(403).json({
          success: false,
          message: "You don't have permission to modify this booking",
        });
      }

      let message = "Booking updated successfully";

      // Logic for updating seats
      if (seats && seats !== booking.seats) {
        console.log(
          `[BookingController] Attempting to change seats from ${booking.seats} to ${seats}`,
        );
        if (!isPassenger) {
          console.warn(
            `[BookingController] Driver ${userId} tried to change seats for booking ${id}`,
          );
          return res.status(403).json({
            success: false,
            message: "Only the passenger can change the number of seats.",
          });
        }

        if (booking.status !== "pending") {
          console.warn(
            `[BookingController] Cannot change seats for non-pending booking ${id} (status: ${booking.status})`,
          );
          return res.status(400).json({
            success: false,
            message:
              "You can only change the number of seats for a pending booking.",
          });
        }

        // const ride = await Ride.findById(booking.ride_id._id); // Ride already populated
        const seatsDifference = seats - booking.seats;

        if (seatsDifference > 0 && seatsDifference > ride.seats_left) {
          console.warn(
            `[BookingController] Not enough seats for booking ${id}. Requested: ${seatsDifference}, Available: ${ride.seats_left}`,
          );
          return res.status(400).json({
            success: false,
            message: `Only ${ride.seats_left} more seat(s) available on this ride`,
          });
        }
        booking.seats = seats;
      }

      const oldStatus = booking.status;
      console.log(
        `[BookingController] Old status: ${oldStatus}, New status requested: ${status}`,
      );

      // Logic for updating status
      if (status && status !== oldStatus) {
        // Validate status transitions
        if (status === "accepted" || status === "rejected") {
          if (!isDriver) {
            console.warn(
              `[BookingController] Non-driver ${userId} tried to ${status} booking ${id}`,
            );
            return res.status(403).json({
              success: false,
              message: "Only the driver can accept or reject bookings",
            });
          }

          if (oldStatus !== "pending") {
            console.warn(
              `[BookingController] Tried to ${status} non-pending booking ${id} (status: ${oldStatus})`,
            );
            return res.status(400).json({
              success: false,
              message: "Can only accept/reject pending bookings",
            });
          }
        }

        if (status === "cancelled") {
          if (!isPassenger) {
            console.warn(
              `[BookingController] Non-passenger ${userId} tried to cancel booking ${id}`,
            );
            return res.status(403).json({
              success: false,
              message: "Only the passenger can cancel their booking",
            });
          }

          if (!["pending", "accepted"].includes(oldStatus)) {
            console.warn(
              `[BookingController] Tried to cancel booking ${id} with invalid status ${oldStatus}`,
            );
            return res.status(400).json({
              success: false,
              message: "Cannot cancel this booking",
            });
          }

          const rideDate = new Date(booking.ride_id.datetime_start);
          const now = new Date();
          const hoursUntilRide = (rideDate - now) / (1000 * 60 * 60);

          if (hoursUntilRide < 24 && oldStatus === "accepted") {
            console.warn(
              `[BookingController] Tried to cancel accepted booking ${id} less than 24 hours before ride`,
            );
            return res.status(400).json({
              success: false,
              message: "Cannot cancel less than 24 hours before the ride",
            });
          }

          // Process refund for passenger cancellation
          if (booking.payment_status === "paid") {
            try {
              console.log(
                `[BookingCancel] Processing refund for booking ${id}, payment method: ${booking.payment_method}`,
              );

              if (
                booking.payment_method === "card" &&
                booking.payment_intent_id
              ) {
                // CARD PAYMENT REFUND via Stripe
                console.log(
                  `[BookingCancel] Refunding card payment for booking ${id}, PaymentIntent: ${booking.payment_intent_id}`,
                );

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
                      `[BookingCancel] Reversing transfer to ${paymentIntent.transfer_data.destination} and application fee`,
                    );
                  }
                } catch (retrieveErr) {
                  console.error(
                    `[BookingCancel] Error retrieving PaymentIntent ${booking.payment_intent_id}:`,
                    retrieveErr.message,
                  );
                }

                const refund = await stripe.refunds.create(refundParams);
                console.log(
                  `[BookingCancel] Stripe refund created: ${refund.id}, Amount: ${refund.amount} cents`,
                );

                // Create a transaction record for the passenger to show the refund in their history
                const passengerWallet = await Wallet.getOrCreateWallet(
                  booking.passenger_id,
                );

                // ADD MONEY TO PASSENGER'S WALLET BALANCE
                passengerWallet.balance += refund.amount;
                await passengerWallet.save();

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
                  description: "Card refund - passenger cancelled booking",
                  processed_at: new Date(),
                });
                console.log(
                  `[BookingCancel] Added ${refund.amount} cents to passenger wallet and created transaction record`,
                );

                // If driver was credited via wallet (no Stripe Connect), deduct from driver's wallet
                const driver = await User.findById(ride.driver_id._id);
                if (!driver?.stripeAccountId) {
                  try {
                    const driverWallet = await Wallet.getOrCreateWallet(
                      ride.driver_id._id,
                    );
                    const feePercentage = parseFloat(
                      process.env.PLATFORM_FEE_PERCENT || "10",
                    );
                    const grossAmount =
                      ride.price_per_seat * booking.seats * 100;
                    const driverEarnings = Math.round(
                      grossAmount * ((100 - feePercentage) / 100),
                    );

                    if (driverWallet.balance >= driverEarnings) {
                      driverWallet.balance -= driverEarnings;
                      driverWallet.total_earned -= driverEarnings;
                      await driverWallet.save();

                      await Transaction.create({
                        wallet_id: driverWallet._id,
                        user_id: ride.driver_id._id,
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
                          "Driver earnings reversed - passenger cancelled booking",
                        processed_at: new Date(),
                      });
                      console.log(
                        `[BookingCancel] Deducted ${driverEarnings} cents from driver wallet`,
                      );
                    } else {
                      console.warn(
                        `[BookingCancel] Driver wallet has insufficient balance for refund. Required: ${driverEarnings}, Available: ${driverWallet.balance}`,
                      );
                    }
                  } catch (walletErr) {
                    console.error(
                      `[BookingCancel] Error deducting from driver wallet:`,
                      walletErr.message,
                    );
                  }
                }
              } else if (booking.payment_method === "wallet") {
                // WALLET PAYMENT REFUND
                console.log(
                  `[BookingCancel] Refunding wallet payment for booking ${id}`,
                );

                const totalAmount = Math.round(
                  ride.price_per_seat * booking.seats * 100,
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
                  description: "Full refund - passenger cancelled booking",
                  processed_at: new Date(),
                });

                // Deduct from driver's wallet
                const driverWallet = await Wallet.getOrCreateWallet(
                  ride.driver_id._id,
                );
                if (driverWallet.balance >= driverEarnings) {
                  driverWallet.balance -= driverEarnings;
                  driverWallet.total_earned -= driverEarnings;
                  await driverWallet.save();

                  await Transaction.create({
                    wallet_id: driverWallet._id,
                    user_id: ride.driver_id._id,
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
                    description:
                      "Driver earnings reversed - passenger cancelled booking",
                    processed_at: new Date(),
                  });
                } else {
                  console.warn(
                    `[BookingCancel] Driver wallet has insufficient balance for refund. Required: ${driverEarnings}, Available: ${driverWallet.balance}`,
                  );
                }

                console.log(
                  `[BookingCancel] Wallet refund: ${totalAmount} cents to passenger, ${driverEarnings} cents deducted from driver`,
                );

                // Mark booking as refunded
                booking.payment_status = "refunded";
                booking.refunded_at = new Date();
                booking.refund_reason = "passenger_cancelled";
              }

              // Mark booking as refunded
              booking.payment_status = "refunded";
              booking.refund_id = refund.id;
              booking.refunded_at = new Date();
              booking.refund_reason = "passenger_cancelled";
            } catch (refundError) {
              console.error(
                `[BookingCancel] Error processing refund for booking ${id}:`,
                refundError,
              );
              // Don't fail the cancellation if refund fails - log it for manual processing
              message =
                "Booking cancelled successfully. Refund will be processed manually.";
            }
          }
        }

        booking.status = status;
        if (status === "cancelled" && booking.payment_status === "refunded") {
          message = "Booking cancelled and refund processed successfully";
        } else {
          message = `Booking ${status} successfully`;
        }

        const rideId = booking.ride_id._id || booking.ride_id;

        if (oldStatus === "pending" && status === "accepted") {
          // const ride = await Ride.findById(rideId); // Ride already populated
          if (ride.seats_left < booking.seats) {
            console.warn(
              `[BookingController] Not enough seats to accept booking ${id}. Ride seats left: ${ride.seats_left}, Booking seats: ${booking.seats}`,
            );
            return res.status(400).json({
              success: false,
              message: `Cannot accept booking. Only ${ride.seats_left} seat(s) available.`,
            });
          }
          // Check luggage capacity
          if (
            booking.luggage_count > 0 &&
            ride.luggage_left < booking.luggage_count
          ) {
            console.warn(
              `[BookingController] Not enough luggage space to accept booking ${id}. Ride luggage left: ${ride.luggage_left}, Booking luggage: ${booking.luggage_count}`,
            );
            return res.status(400).json({
              success: false,
              message: `Cannot accept booking. Only ${ride.luggage_left} luggage spot(s) available.`,
            });
          }
          const updateInc = { seats_left: -booking.seats };
          if (booking.luggage_count > 0) {
            updateInc.luggage_left = -booking.luggage_count;
          }
          await Ride.findByIdAndUpdate(
            rideId,
            { $inc: updateInc },
            { new: true },
          );
          console.log(
            `[BookingController] Decremented seats_left for ride ${rideId} by ${booking.seats}, luggage_left by ${booking.luggage_count || 0}`,
          );
        } else if (oldStatus === "accepted" && status === "cancelled") {
          const updateInc = { seats_left: booking.seats };
          if (booking.luggage_count > 0) {
            updateInc.luggage_left = booking.luggage_count;
          }
          await Ride.findByIdAndUpdate(
            rideId,
            { $inc: updateInc },
            { new: true },
          );
          console.log(
            `[BookingController] Incremented seats_left for ride ${rideId} by ${booking.seats}, luggage_left by ${booking.luggage_count || 0}`,
          );
        }
      }

      await booking.save();
      console.log(
        `[BookingController] Booking ${id} saved with new status: ${booking.status}`,
      );

      // Send notifications for status change (cache invalidation handled by NotificationService)
      if (status && status !== oldStatus) {
        if (status === "accepted") {
          await NotificationService.notifyBookingAccepted(
            booking.passenger_id.toString(),
            {
              id: booking._id.toString(),
              ride_id: booking.ride_id._id.toString(),
              driver_first_name: ride.driver_id?.first_name,
              driver_last_name: ride.driver_id?.last_name,
            },
          );
          console.log(
            `[BookingController] Sent accepted notification for booking ${id}`,
          );
        } else if (status === "rejected") {
          await NotificationService.notifyBookingRejected(
            booking.passenger_id.toString(),
            {
              id: booking._id.toString(),
              ride_id: booking.ride_id._id.toString(),
            },
          );
          console.log(
            `[BookingController] Sent rejected notification for booking ${id}`,
          );
        } else if (status === "cancelled") {
          await NotificationService.notifyBookingCancelled(
            booking.ride_id.driver_id.toString(),
            {
              id: booking._id.toString(),
              ride_id: booking.ride_id._id.toString(),
            },
            true,
          );
          console.log(
            `[BookingController] Sent cancelled notification for booking ${id}`,
          );
        }
      }

      res.status(200).json({
        success: true,
        message,
        data: booking,
      });
    } catch (error) {
      console.error(
        `[BookingController] Error in updateBooking for ID ${id}:`,
        error,
      );
      next(error);
    }
  }
}

module.exports = BookingController;
