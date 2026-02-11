const bcrypt = require("bcrypt");
const { sendEmail } = require("../services/emailService");
const EmailOtp = require("../models/EmailOtp");

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const VERIFIED_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const SALT_ROUNDS = 10;

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

class EmailOtpController {
  static async sendEmailOtp(req, res, next) {
    try {
      const { email: rawEmail } = req.body;
      if (!rawEmail)
        return res
          .status(400)
          .json({ success: false, message: "Email required" });

      const email = (rawEmail || "").toLowerCase().trim();

      // Basic rate limiting stored in DB: allow up to 5 sends per hour
      let doc = await EmailOtp.findOne({ email });
      const now = new Date();
      if (!doc) {
        doc = new EmailOtp({ email, sendCount: 0, attempts: 0 });
      } else {
        // If the window expired, reset sendCount and attempts so the user gets a fresh rate window
        if (doc.lastSentAt && now - doc.lastSentAt > 60 * 60 * 1000) {
          doc.sendCount = 0;
          doc.attempts = 0;
          // clear lastSentAt so the rate check below treats this as a fresh window
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
          message: "Too many OTP requests. Try later.",
        });
      }

      const code = generateOtp();
      const hash = await bcrypt.hash(code, SALT_ROUNDS);

      doc.code_hash = hash;
      doc.expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
      doc.lastSentAt = now;
      doc.sendCount = (doc.sendCount || 0) + 1;
      doc.attempts = 0;
      doc.verified = false;
      await doc.save();

      await sendEmail({
        to: email,
        subject: "Your verification code",
        text: `Your verification code is ${code}`,
      });

      res.json({ success: true, message: "OTP sent" });
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmailOtp(req, res, next) {
    try {
      const { email: rawEmail, code } = req.body;
      if (!rawEmail || !code)
        return res
          .status(400)
          .json({ success: false, message: "Email and code are required" });

      const email = (rawEmail || "").toLowerCase().trim();

      const doc = await EmailOtp.findOne({ email });
      if (!doc || !doc.code_hash) {
        return res
          .status(400)
          .json({ success: false, message: "OTP expired or not found" });
      }

      // If they've already failed too many times, force them to request a new code
      if ((doc.attempts || 0) >= 5) {
        try {
          await doc.deleteOne();
        } catch (e) {
          // ignore
        }
        return res.status(429).json({
          success: false,
          message: "Too many failed attempts. Please request a new code.",
        });
      }

      // Check expiry
      if (doc.expiresAt && new Date() > doc.expiresAt) {
        return res.status(400).json({ success: false, message: "OTP expired" });
      }

      const ok = await bcrypt.compare(code, doc.code_hash);
      if (!ok) {
        // increment attempts
        doc.attempts = (doc.attempts || 0) + 1;
        await doc.save();
        if ((doc.attempts || 0) >= 5) {
          try {
            await doc.deleteOne();
          } catch (e) {
            // ignore
          }
          return res.status(429).json({
            success: false,
            message: "Too many failed attempts. Please request a new code.",
          });
        }

        return res
          .status(400)
          .json({ success: false, message: "Invalid code" });
      }

      // mark verified and set verification TTL
      doc.verified = true;
      doc.verifiedAt = new Date();
      doc.verifiedExpiresAt = new Date(
        Date.now() + VERIFIED_TTL_SECONDS * 1000,
      );
      // clear code hash so it can't be reused
      doc.code_hash = undefined;
      await doc.save();

      res.json({ success: true, message: "Email verified" });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = EmailOtpController;
