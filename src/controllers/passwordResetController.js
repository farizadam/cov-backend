const bcrypt = require("bcrypt");
const { sendEmail } = require("../services/emailService");
const EmailOtp = require("../models/EmailOtp");
const User = require("../models/User");
const admin = require("../config/firebaseAdmin");

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const VERIFIED_TTL_SECONDS = 15 * 60; // 15 minutes to reset password after verification
const SALT_ROUNDS = 10;

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

class PasswordResetController {
  /**
   * Step 1: Send a reset code to email or phone
   * POST /api/v1/auth/forgot-password/send-code
   * Body: { identifier, identifier_type: "email" | "phone" }
   */
  static async sendResetCode(req, res, next) {
    try {
      const { identifier: rawIdentifier, identifier_type } = req.body;

      if (!rawIdentifier || !identifier_type) {
        return res.status(400).json({
          success: false,
          message: "Identifier and identifier_type are required",
        });
      }

      if (!["email", "phone"].includes(identifier_type)) {
        return res.status(400).json({
          success: false,
          message: 'identifier_type must be "email" or "phone"',
        });
      }

      const identifier = (rawIdentifier || "").toLowerCase().trim();

      // Find user by email or phone
      let user;
      if (identifier_type === "email") {
        user = await User.findOne({ email: identifier, deleted_at: null });
      } else {
        user = await User.findOne({ phone: identifier, deleted_at: null });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "No account found with this " + identifier_type,
        });
      }

      // Use the user's email as the key with a reset: prefix to avoid collision with register OTP
      const email = user.email.toLowerCase().trim();
      const resetKey = `reset:${email}`;

      let doc = await EmailOtp.findOne({ email: resetKey });
      const now = new Date();
      if (!doc) {
        doc = new EmailOtp({ email: resetKey, sendCount: 0, attempts: 0 });
      } else {
        if (doc.lastSentAt && now - doc.lastSentAt > 60 * 60 * 1000) {
          doc.sendCount = 0;
          doc.attempts = 0;
          doc.lastSentAt = undefined;
        }
      }

      if (
        (doc.sendCount || 0) >= 5 &&
        doc.lastSentAt &&
        now - doc.lastSentAt <= 60 * 60 * 1000
      ) {
        return res.status(429).json({
          success: false,
          message: "Too many reset requests. Try later.",
        });
      }

      const code = generateOtp();
      console.log("DEBUG forgot-password send-code: OTP for", email, "=", code);
      const hash = await bcrypt.hash(code, SALT_ROUNDS);

      doc.code_hash = hash;
      doc.expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
      doc.lastSentAt = now;
      doc.sendCount = (doc.sendCount || 0) + 1;
      doc.attempts = 0;
      doc.verified = false;
      await doc.save();

      // Send code via email
      await sendEmail({
        to: email,
        subject: "Password Reset Code",
        text: `Your password reset code is: ${code}. It expires in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1E40AF;">Password Reset</h2>
            <p>You requested a password reset. Use the code below to verify your identity:</p>
            <div style="background: #F1F5F9; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1E40AF;">${code}</span>
            </div>
            <p style="color: #64748B; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
          </div>
        `,
      });

      // Return masked info
      let maskedDestination;
      if (identifier_type === "email") {
        const [name, domain] = email.split("@");
        maskedDestination = name.substring(0, 2) + "***@" + domain;
      } else {
        maskedDestination =
          user.phone.substring(0, 4) + "****" + user.phone.slice(-2);
      }

      res.json({
        success: true,
        message: "Verification code sent",
        data: {
          masked_destination: maskedDestination,
          identifier_type,
          reset_email: email,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Step 2: Verify the reset code
   * POST /api/v1/auth/forgot-password/verify-code
   * Body: { email, code }
   */
  static async verifyResetCode(req, res, next) {
    try {
      const { email: rawEmail, code } = req.body;
      if (!rawEmail || !code)
        return res
          .status(400)
          .json({ success: false, message: "Email and code are required" });

      const resetKey = `reset:${(rawEmail || "").toLowerCase().trim()}`;

      console.log("DEBUG forgot-password verify-code:", { resetKey, code, codeType: typeof code });

      const doc = await EmailOtp.findOne({ email: resetKey });
      if (!doc || !doc.code_hash) {
        console.log("DEBUG forgot-password verify-code: no doc or no hash", { found: !!doc, hasHash: !!(doc && doc.code_hash) });
        return res
          .status(400)
          .json({ success: false, message: "Reset code expired or not found. Request a new one." });
      }

      if ((doc.attempts || 0) >= 5) {
        try { await doc.deleteOne(); } catch (e) { /* ignore */ }
        return res.status(429).json({
          success: false,
          message: "Too many failed attempts. Please request a new code.",
        });
      }

      if (doc.expiresAt && new Date() > doc.expiresAt) {
        return res.status(400).json({ success: false, message: "Reset code expired. Request a new one." });
      }

      const ok = await bcrypt.compare(String(code), doc.code_hash);
      console.log("DEBUG forgot-password verify-code: bcrypt result =", ok);
      if (!ok) {
        doc.attempts = (doc.attempts || 0) + 1;
        await doc.save();
        if ((doc.attempts || 0) >= 5) {
          try { await doc.deleteOne(); } catch (e) { /* ignore */ }
          return res.status(429).json({
            success: false,
            message: "Too many failed attempts. Please request a new code.",
          });
        }
        return res.status(400).json({ success: false, message: "Invalid code" });
      }

      // Mark verified
      doc.verified = true;
      doc.verifiedAt = new Date();
      doc.verifiedExpiresAt = new Date(Date.now() + VERIFIED_TTL_SECONDS * 1000);
      doc.code_hash = undefined;
      await doc.save();

      res.json({ success: true, message: "Code verified. You can now reset your password." });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Step 2b: Verify phone via Firebase token (for phone-based reset)
   * POST /api/v1/auth/forgot-password/verify-phone
   * Body: { phone, firebase_token }
   */
  static async verifyPhone(req, res, next) {
    try {
      const { phone, firebase_token } = req.body;

      if (!phone || !firebase_token) {
        return res.status(400).json({
          success: false,
          message: "Phone and firebase_token are required",
        });
      }

      // Verify Firebase token
      let decoded;
      try {
        decoded = await admin.auth().verifyIdToken(firebase_token);
      } catch (err) {
        console.warn("DEBUG forgot-password verify-phone: firebase token failed", err?.message);
        return res.status(401).json({
          success: false,
          message: "Invalid or expired firebase token",
        });
      }

      const phoneFromToken = decoded.phone_number || null;
      console.log("DEBUG forgot-password verify-phone:", { phone, phoneFromToken });

      // Ensure the phone from the token matches
      if (!phoneFromToken || phoneFromToken !== phone) {
        return res.status(400).json({
          success: false,
          message: "Phone number does not match verified token",
        });
      }

      // Find user by phone
      const user = await User.findOne({ phone, deleted_at: null });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "No account found with this phone number",
        });
      }

      // Mark reset as verified using the user's email as key (same pattern as email flow)
      const email = user.email.toLowerCase().trim();
      const resetKey = `reset:${email}`;

      let doc = await EmailOtp.findOne({ email: resetKey });
      if (!doc) {
        doc = new EmailOtp({ email: resetKey });
      }

      doc.verified = true;
      doc.verifiedAt = new Date();
      doc.verifiedExpiresAt = new Date(Date.now() + VERIFIED_TTL_SECONDS * 1000);
      doc.code_hash = undefined;
      doc.attempts = 0;
      await doc.save();

      res.json({
        success: true,
        message: "Phone verified. You can now reset your password.",
        data: { reset_email: email },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Step 3: Reset the password
   * POST /api/v1/auth/forgot-password/reset
   * Body: { email, new_password }
   */
  static async resetPassword(req, res, next) {
    try {
      const { email: rawEmail, new_password } = req.body;

      if (!rawEmail || !new_password) {
        return res.status(400).json({
          success: false,
          message: "Email and new_password are required",
        });
      }

      if (new_password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      const email = (rawEmail || "").toLowerCase().trim();
      const resetKey = `reset:${email}`;

      const doc = await EmailOtp.findOne({ email: resetKey, verified: true });
      if (!doc) {
        return res.status(400).json({
          success: false,
          message: "No verified reset request found. Please start over.",
        });
      }

      if (doc.verifiedExpiresAt && new Date() > doc.verifiedExpiresAt) {
        await doc.deleteOne();
        return res.status(400).json({
          success: false,
          message: "Reset window expired. Please start over.",
        });
      }

      const user = await User.findOne({ email, deleted_at: null });
      if (!user) {
        await doc.deleteOne();
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
      user.password_hash = password_hash;
      await user.save();

      await doc.deleteOne();

      try {
        await sendEmail({
          to: email,
          subject: "Password Changed Successfully",
          text: "Your password has been changed successfully. If you didn't do this, please contact support immediately.",
        });
      } catch (e) {
        console.warn("Failed to send password change confirmation email:", e.message);
      }

      res.json({
        success: true,
        message: "Password has been reset successfully. You can now log in.",
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = PasswordResetController;
