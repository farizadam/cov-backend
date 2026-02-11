const Message = require("../models/Message");
const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const RideRequest = require("../models/RideRequest");
const User = require("../models/User");
const NotificationService = require("../services/notificationService");
const cloudinary = require("cloudinary").v2;

// Cloudinary is auto-configured via CLOUDINARY_URL env variable

/**
 * Get chat messages for a booking
 * GET /api/v1/chat/:bookingId
 */
exports.getMessages = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    // Verify user has access to this chat (driver or passenger)
    const booking = await Booking.findById(bookingId).populate({
      path: "ride_id",
      select: "driver_id",
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Only accepted bookings can have chat
    if (booking.status !== "accepted") {
      return res.status(403).json({
        success: false,
        message: "Chat is only available for accepted bookings",
      });
    }

    const driverId = booking.ride_id?.driver_id?.toString();
    const passengerId = booking.passenger_id?.toString();

    if (userId !== driverId && userId !== passengerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this chat",
      });
    }

    // Get messages
    const messages = await Message.find({ booking_id: bookingId })
      .populate("sender_id", "first_name last_name avatar_url")
      .populate("receiver_id", "first_name last_name avatar_url")
      .sort({ createdAt: 1 });

    // Mark messages as read if user is the receiver
    await Message.updateMany(
      { booking_id: bookingId, receiver_id: userId, read: false },
      { read: true, read_at: new Date() }
    );

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get messages",
      error: error.message,
    });
  }
};

/**
 * Send a message
 * POST /api/v1/chat/:bookingId
 */
exports.sendMessage = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { content, message_type = "text", image } = req.body;
    const userId = req.user.id;

    // Verify user has access to this chat
    const booking = await Booking.findById(bookingId).populate({
      path: "ride_id",
      select: "driver_id",
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.status !== "accepted") {
      return res.status(403).json({
        success: false,
        message: "Chat is only available for accepted bookings",
      });
    }

    const driverId = booking.ride_id?.driver_id?.toString();
    const passengerId = booking.passenger_id?.toString();

    if (userId !== driverId && userId !== passengerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this chat",
      });
    }

    // Determine receiver
    const receiverId = userId === driverId ? passengerId : driverId;

    let imageUrl = null;

    // Handle image upload
    if (message_type === "image" && image) {
      // Option 1: Use Cloudinary if configured
      if (process.env.CLOUDINARY_URL) {
        try {
          console.log("Uploading image to Cloudinary, data length:", image.length);
          const uploadResult = await cloudinary.uploader.upload(image, {
            folder: "chat_images",
            resource_type: "image",
            transformation: [
              { width: 1200, height: 1200, crop: "limit" },
              { quality: "auto" },
            ],
          });
          console.log("Cloudinary upload success:", uploadResult.secure_url);
          imageUrl = uploadResult.secure_url;
        } catch (uploadError) {
          console.error("Image upload error details:", {
            message: uploadError.message,
            http_code: uploadError.http_code,
            name: uploadError.name,
          });
          return res.status(400).json({
            success: false,
            message: "Failed to upload image: " + uploadError.message,
          });
        }
      } else {
        // Option 2: Store base64 directly in database (local development)
        console.log("Cloudinary not configured, storing image in database");
        // Validate image size (max 2MB for base64)
        if (image.length > 2800000) {
          return res.status(400).json({
            success: false,
            message: "Image too large. Maximum size is 2MB.",
          });
        }
        imageUrl = image; // Store the data:image/...;base64,... string directly
      }
    }

    // Create message
    const message = await Message.create({
      booking_id: bookingId,
      sender_id: userId,
      receiver_id: receiverId,
      content: content || "",
      message_type,
      image_url: imageUrl,
    });

    // Populate sender info
    await message.populate("sender_id", "first_name last_name avatar_url");
    await message.populate("receiver_id", "first_name last_name avatar_url");

    // Create notification for receiver
    try {
      const sender = await User.findById(userId).select("first_name last_name");
      
      // Get ride info for the notification
      const rideInfo = booking.ride_id;
      const airport = rideInfo.airport_id ? await require("../models/Airport").findById(rideInfo.airport_id).select("name code") : null;
      const isToAirport = rideInfo.direction === "to_airport" || rideInfo.direction === "home_to_airport";
      
      // Determine if sender is driver or passenger
      const senderRole = userId === driverId ? "driver" : "passenger";
      
      await NotificationService.notifyChatMessage(receiverId, {
        booking_id: bookingId,
        sender_id: userId,
        sender_name: `${sender.first_name} ${sender.last_name}`,
        sender_role: senderRole,
        message_type: message_type,
        content: message_type === "image" ? "Sent a photo" : (content || "").substring(0, 100),
        message_id: message._id,
        ride_id: rideInfo._id,
        ride_from: isToAirport ? rideInfo.home_city : (airport?.name || "Airport"),
        ride_to: isToAirport ? (airport?.name || "Airport") : rideInfo.home_city,
      });
      // Note: Cache invalidation is now handled automatically by NotificationService
    } catch (notifError) {
      console.error("Failed to create chat notification:", notifError);
      // Don't fail the message send if notification fails
    }

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
};

/**
 * Get unread message count for current user
 * GET /api/v1/chat/unread/count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Message.countDocuments({
      receiver_id: userId,
      read: false,
    });

    res.json({
      success: true,
      data: { unread_count: unreadCount },
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unread count",
    });
  }
};

/**
 * Get chat info (who you're chatting with)
 * GET /api/v1/chat/:bookingId/info
 */
exports.getChatInfo = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    const booking = await Booking.findById(bookingId)
      .populate("passenger_id", "first_name last_name avatar_url phone")
      .populate({
        path: "ride_id",
        select: "driver_id home_address home_city datetime_start direction airport_id",
        populate: [
          {
            path: "driver_id",
            select: "first_name last_name avatar_url phone",
          },
          {
            path: "airport_id",
            select: "name code city",
          },
        ],
      });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.status !== "accepted") {
      return res.status(403).json({
        success: false,
        message: "Chat is only available for accepted bookings",
      });
    }

    const driverId = booking.ride_id?.driver_id?._id?.toString();
    const passengerId = booking.passenger_id?._id?.toString();

    if (userId !== driverId && userId !== passengerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this chat",
      });
    }

    // Return the other person's info
    const isDriver = userId === driverId;
    const otherUser = isDriver ? booking.passenger_id : booking.ride_id.driver_id;

    res.json({
      success: true,
      data: {
        other_user: otherUser,
        booking: {
          id: booking._id,
          status: booking.status,
          seats: booking.seats,
        },
        ride: {
          id: booking.ride_id._id,
          home_city: booking.ride_id.home_city,
          home_address: booking.ride_id.home_address,
          airport_name: booking.ride_id.airport_id?.name || "Airport",
          airport_code: booking.ride_id.airport_id?.code,
          departure: booking.ride_id.datetime_start,
          direction: booking.ride_id.direction,
        },
        is_driver: isDriver,
      },
    });
  } catch (error) {
    console.error("Get chat info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat info",
    });
  }
};

/**
 * Get all user's active chats
 * GET /api/v1/chat/conversations
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all accepted bookings where user is driver or passenger
    const asPassenger = await Booking.find({
      passenger_id: userId,
      status: "accepted",
    }).populate({
      path: "ride_id",
      select: "driver_id origin_address destination_address departure_datetime direction airport_name city_address",
      populate: {
        path: "driver_id",
        select: "first_name last_name avatar_url",
      },
    });

    // Find rides where user is driver
    const driverRides = await Ride.find({ driver_id: userId }).select("_id");
    const driverRideIds = driverRides.map((r) => r._id);

    const asDriver = await Booking.find({
      ride_id: { $in: driverRideIds },
      status: "accepted",
    })
      .populate("passenger_id", "first_name last_name avatar_url")
      .populate({
        path: "ride_id",
        select: "driver_id origin_address destination_address departure_datetime direction airport_name city_address",
      });

    // Format conversations
    const conversations = [];

    for (const booking of asPassenger) {
      const lastMessage = await Message.findOne({ booking_id: booking._id })
        .sort({ createdAt: -1 })
        .limit(1);

      const unreadCount = await Message.countDocuments({
        booking_id: booking._id,
        receiver_id: userId,
        read: false,
      });

      conversations.push({
        booking_id: booking._id,
        other_user: booking.ride_id?.driver_id,
        ride: {
          origin: booking.ride_id?.origin_address,
          destination: booking.ride_id?.destination_address,
          departure: booking.ride_id?.departure_datetime,
          direction: booking.ride_id?.direction,
          airport_name: booking.ride_id?.airport_name,
        },
        last_message: lastMessage,
        unread_count: unreadCount,
        is_driver: false,
      });
    }

    for (const booking of asDriver) {
      const lastMessage = await Message.findOne({ booking_id: booking._id })
        .sort({ createdAt: -1 })
        .limit(1);

      const unreadCount = await Message.countDocuments({
        booking_id: booking._id,
        receiver_id: userId,
        read: false,
      });

      conversations.push({
        booking_id: booking._id,
        other_user: booking.passenger_id,
        ride: {
          origin: booking.ride_id?.origin_address,
          destination: booking.ride_id?.destination_address,
          departure: booking.ride_id?.departure_datetime,
          direction: booking.ride_id?.direction,
          airport_name: booking.ride_id?.airport_name,
        },
        last_message: lastMessage,
        unread_count: unreadCount,
        is_driver: true,
      });
    }

    // Sort by last message time
    conversations.sort((a, b) => {
      const aTime = a.last_message?.createdAt || 0;
      const bTime = b.last_message?.createdAt || 0;
      return new Date(bTime) - new Date(aTime);
    });

    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get conversations",
    });
  }
};

/**
 * Get chat messages for a ride request (when offer is accepted)
 * GET /api/v1/chat/request/:requestId
 */
exports.getRequestMessages = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    // Verify user has access to this chat (driver or passenger)
    const request = await RideRequest.findById(requestId)
      .populate("matched_driver", "_id first_name last_name avatar_url")
      .populate("passenger", "_id first_name last_name avatar_url");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Only accepted requests can have chat
    if (request.status !== "accepted") {
      return res.status(403).json({
        success: false,
        message: "Chat is only available for accepted requests",
      });
    }

    const driverId = request.matched_driver?._id?.toString();
    const passengerId = request.passenger?._id?.toString();

    if (userId !== driverId && userId !== passengerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this chat",
      });
    }

    // Get messages for this request
    const messages = await Message.find({ request_id: requestId })
      .populate("sender_id", "first_name last_name avatar_url")
      .populate("receiver_id", "first_name last_name avatar_url")
      .sort({ createdAt: 1 });

    // Mark messages as read if user is the receiver
    await Message.updateMany(
      { request_id: requestId, receiver_id: userId, read: false },
      { read: true, read_at: new Date() }
    );

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Get request messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get messages",
      error: error.message,
    });
  }
};

/**
 * Send a message in a ride request chat
 * POST /api/v1/chat/request/:requestId
 */
exports.sendRequestMessage = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { content, message_type = "text", image } = req.body;
    const userId = req.user.id;

    // Verify user has access to this chat
    const request = await RideRequest.findById(requestId)
      .populate("matched_driver", "_id first_name last_name")
      .populate("passenger", "_id first_name last_name")
      .populate("airport", "name code");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (request.status !== "accepted") {
      return res.status(403).json({
        success: false,
        message: "Chat is only available for accepted requests",
      });
    }

    const driverId = request.matched_driver?._id?.toString();
    const passengerId = request.passenger?._id?.toString();

    if (userId !== driverId && userId !== passengerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this chat",
      });
    }

    // Determine receiver
    const receiverId = userId === driverId ? passengerId : driverId;

    let imageUrl = null;

    // Handle image upload
    if (message_type === "image" && image) {
      if (process.env.CLOUDINARY_URL) {
        try {
          console.log("Uploading image to Cloudinary, data length:", image.length);
          const uploadResult = await cloudinary.uploader.upload(image, {
            folder: "chat_images",
            resource_type: "image",
            transformation: [
              { width: 1200, height: 1200, crop: "limit" },
              { quality: "auto" },
            ],
          });
          console.log("Cloudinary upload success:", uploadResult.secure_url);
          imageUrl = uploadResult.secure_url;
        } catch (uploadError) {
          console.error("Image upload error details:", {
            message: uploadError.message,
            http_code: uploadError.http_code,
            name: uploadError.name,
          });
          return res.status(400).json({
            success: false,
            message: "Failed to upload image: " + uploadError.message,
          });
        }
      } else {
        console.log("Cloudinary not configured, storing image in database");
        if (image.length > 2800000) {
          return res.status(400).json({
            success: false,
            message: "Image too large. Maximum size is 2MB.",
          });
        }
        imageUrl = image;
      }
    }

    // Create message with request_id instead of booking_id
    const message = await Message.create({
      request_id: requestId,
      sender_id: userId,
      receiver_id: receiverId,
      content: content || "",
      message_type,
      image_url: imageUrl,
    });

    // Populate sender info
    await message.populate("sender_id", "first_name last_name avatar_url");
    await message.populate("receiver_id", "first_name last_name avatar_url");

    // Create notification for receiver
    try {
      const sender = await User.findById(userId).select("first_name last_name");
      const isToAirport = request.direction === "to_airport";
      const senderRole = userId === driverId ? "driver" : "passenger";
      
      await NotificationService.notifyChatMessage(receiverId, {
        request_id: requestId,
        sender_id: userId,
        sender_name: `${sender.first_name} ${sender.last_name}`,
        sender_role: senderRole,
        message_type: message_type,
        content: message_type === "image" ? "Sent a photo" : (content || "").substring(0, 100),
        message_id: message._id,
        ride_from: isToAirport ? request.location_city : (request.airport?.name || "Airport"),
        ride_to: isToAirport ? (request.airport?.name || "Airport") : request.location_city,
      });
    } catch (notifError) {
      console.error("Failed to create chat notification:", notifError);
    }

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Send request message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
};

/**
 * Get chat info for a ride request
 * GET /api/v1/chat/request/:requestId/info
 */
exports.getRequestChatInfo = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await RideRequest.findById(requestId)
      .populate("passenger", "first_name last_name avatar_url phone")
      .populate("matched_driver", "first_name last_name avatar_url phone")
      .populate("airport", "name code");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (request.status !== "accepted") {
      return res.status(403).json({
        success: false,
        message: "Chat is only available for accepted requests",
      });
    }

    const driverId = request.matched_driver?._id?.toString();
    const passengerId = request.passenger?._id?.toString();

    if (userId !== driverId && userId !== passengerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this chat",
      });
    }

    // Return the other person's info
    const isDriver = userId === driverId;
    const otherUser = isDriver ? request.passenger : request.matched_driver;

    res.json({
      success: true,
      data: {
        other_user: otherUser,
        request: {
          id: request._id,
          status: request.status,
          seats: request.seats_needed,
        },
        ride: {
          id: request._id,
          home_city: request.location_city,
          home_address: request.location_address,
          airport_name: request.airport?.name || "Airport",
          airport_code: request.airport?.code,
          departure: request.preferred_datetime,
          direction: request.direction,
        },
        is_driver: isDriver,
      },
    });
  } catch (error) {
    console.error("Get request chat info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat info",
    });
  }
};
