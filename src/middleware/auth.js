const { verifyAccessToken } = require("../utils/jwt");
const User = require("../models/User");

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
async function authMiddleware(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided. Authentication required.",
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyAccessToken(token);

    // Get user from database
    const user = await User.findOne({
      _id: decoded.userId,
      deleted_at: null,
    }).select("-password_hash");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found or deleted.",
      });
    }

    // Attach user to request (convert to plain object to avoid .toJSON() issues later if we forget)
    // We manually construct the object to ensure only safe fields are passed.
    req.user = {
      id: user._id.toString(),
      _id: user._id.toString(), // Keep _id for compatibility
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role,
      avatar_url: user.avatar_url,
      date_of_birth: user.date_of_birth,
      bio: user.bio,
      languages: user.languages,
      car_model: user.car_model,
      car_color: user.car_color,
      trips_completed: user.trips_completed,
      rating: user.rating,
      rating_count: user.rating_count,
      phone_verified: user.phone_verified,
      email_verified: user.email_verified,
      createdAt: user.createdAt,
    };
    return next();
  } catch (e) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
}

module.exports = authMiddleware;