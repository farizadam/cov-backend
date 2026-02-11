const axios = require("axios");
const User = require("../models/User");
const { generateTokens } = require("../utils/jwt");

/**
 * Verifies Google ID token and returns user info
 * @param {string} idToken
 * @returns {Promise<object>} Google user info
 */
async function verifyGoogleIdToken(idToken) {
  const googleApiUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
  const { data } = await axios.get(googleApiUrl);
  if (!data || !data.email_verified) {
    throw new Error("Invalid or unverified Google token");
  }
  return data;
}

/**
 * Login or register user with Google
 * @param {string} idToken
 * @returns {Promise<object>} user and tokens
 */
async function loginOrRegisterWithGoogle(idToken) {
  const googleUser = await verifyGoogleIdToken(idToken);
  let user = await User.findOne({ email: googleUser.email, deleted_at: null });
  if (!user) {
    user = await User.create({
      email: googleUser.email,
      first_name: googleUser.given_name || "",
      last_name: googleUser.family_name || "",
      avatar_url: googleUser.picture || null,
      password_hash: "google-oauth", // Not used, but required by schema
      role: "both",
      phone: "", // Optional: update if you collect phone
    });
  }
  const tokens = generateTokens(user._id.toString());
  return { user: user.toJSON(), ...tokens };
}

module.exports = { loginOrRegisterWithGoogle };
