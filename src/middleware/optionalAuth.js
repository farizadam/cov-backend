const { verifyAccessToken } = require("../utils/jwt");
const User = require("../models/User");

/**
 * Optional Authentication middleware
 * Verifies JWT token if present and attaches user to request
 * Does NOT fail if token is missing or invalid - just continues without user
 */
async function optionalAuthMiddleware(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token, continue without user
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify token
      const decoded = verifyAccessToken(token);

      // Get user from database
      const user = await User.findOne({
        _id: decoded.userId,
        deleted_at: null,
      }).select("-password_hash");

      if (user) {
        // Attach user to request
        req.user = {
          id: user._id.toString(),
          _id: user._id.toString(),
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          role: user.role,
          avatar_url: user.avatar_url,
          date_of_birth: user.date_of_birth,
          rating: user.rating,
          rating_count: user.rating_count,
          phone_verified: user.phone_verified,
          email_verified: user.email_verified,
          createdAt: user.createdAt,
        };
      } else {
        req.user = null;
      }
    } catch (tokenError) {
      // Invalid token, continue without user
      req.user = null;
    }

    return next();
  } catch (e) {
    // Any other error, continue without user
    req.user = null;
    return next();
  }
}

module.exports = optionalAuthMiddleware;
