const bcrypt = require("bcrypt");
const User = require("../models/User");
const { generateTokens } = require("../utils/jwt");

const SALT_ROUNDS = 10;

class AuthService {
  /**
   * Register a new user
   */
  static async register(userData) {
    const { email, password, first_name, last_name, phone, role } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ email, deleted_at: null });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = await User.create({
      email,
      password_hash,
      first_name,
      last_name,
      phone,
      role,
    });

    // Convert to plain object and remove password
    const userObject = user.toJSON();

    // Generate tokens
    const tokens = generateTokens(user._id.toString());

    return {
      user: userObject,
      ...tokens,
    };
  }

  /**
   * Login user
   */
  static async login(email, password) {
    // Find user by email
    const user = await User.findOne({ email, deleted_at: null });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    // Generate tokens
    const tokens = generateTokens(user._id.toString());

    // Remove password from response
    const userObject = user.toJSON();

    return {
      user: userObject,
      ...tokens,
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(userId) {
    // Verify user still exists
    const user = await User.findOne({ _id: userId, deleted_at: null });

    if (!user) {
      throw new Error("User not found");
    }

    // Generate new tokens
    const tokens = generateTokens(user._id.toString());

    return {
      user: user.toJSON(),
      ...tokens,
    };
  }
}

module.exports = AuthService;
