const bcrypt = require("bcrypt");
const { generateTokens, verifyRefreshToken } = require("../utils/jwt");
const User = require("../models/User");
const EmailOtp = require("../models/EmailOtp");
const admin = require("../config/firebaseAdmin");
const cloudinary = require("cloudinary").v2;

const SALT_ROUNDS = 10;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

let sharpAvailable = false;
let sharp = null;
try {
  sharp = require("sharp");
  sharpAvailable = true;
} catch (e) {
  // sharp not installed — we'll gracefully fallback and instruct client
  sharpAvailable = false;
}

class AuthController {
  /**
   * Helper: Process images to Cloudinary only
   */
  static async processImage(dataUri) {
    if (!dataUri) return { url: null };

    // Cloudinary is required
    if (!process.env.CLOUDINARY_URL) {
      throw new Error("Cloudinary is not configured. Cannot process images.");
    }

    const match = dataUri.match(/^data:(image\/jpeg|image\/png);base64,(.+)$/);
    if (!match)
      throw new Error("Invalid image format. Use PNG or JPG base64 data URI.");

    const b64 = match[2];
    const sizeInBytes =
      (b64.length * 3) / 4 -
      (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

    let buffer = Buffer.from(b64, "base64");

    // If the image is bigger than allowed, try server-side compression using sharp
    if (sizeInBytes > MAX_BYTES) {
      if (!sharpAvailable) {
        throw new Error(
          "ID image too large (max 5MB). Server can compress images if 'sharp' is installed, or compress on the client.",
        );
      }

      try {
        // Attempt progressive compression: start at 80% quality and downscale until under limit
        let quality = 80;
        let resizedBuffer = buffer;
        // decode metadata to determine width for resizing if necessary
        const meta = await sharp(buffer).metadata();
        let width = meta.width || 1000;

        while (resizedBuffer.length > MAX_BYTES && quality >= 20) {
          const targetWidth = Math.max(
            400,
            Math.floor((width * quality) / 100),
          );
          resizedBuffer = await sharp(buffer)
            .resize({ width: targetWidth })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
          quality -= 15;
        }

        if (resizedBuffer.length > MAX_BYTES) {
          throw new Error(
            "ID image too large after server compression (max 5MB)",
          );
        }

        buffer = resizedBuffer;
      } catch (e) {
        console.error("Server-side image compression failed", e);
        throw new Error("ID image too large (max 5MB)");
      }
    }

    // Upload to Cloudinary (required)
    try {
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: "user_ids",
      });
      return {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      };
    } catch (e) {
      console.error("Cloudinary upload failed", e);
      throw new Error("Failed to upload image to Cloudinary");
    }
  }

  /**
   * Register user
   * POST /api/v1/auth/register
   */
  static async register(req, res, next) {
    try {
      const {
        email,
        password,
        first_name,
        last_name,
        phone,
        role,
        id_image_front,
        id_image_back,
        firebase_token,
      } = req.validatedBody;

      console.log("DEBUG: register received", {
        email: email && email.toLowerCase(),
        phone,
        firebase_token: firebase_token
          ? `${firebase_token.slice(0, 40)}...`
          : null,
      });

      const timing = {
        start: Date.now(),
        last: Date.now(),
      };

      function logStep(name) {
        const now = Date.now();
        console.log(
          `TIMING: ${name} ${now - timing.last}ms (since last); ${now - timing.start}ms (total)`,
        );
        timing.last = now;
      }

      let firebaseUid = null;
      let phoneNumberFromToken = null;

      // 1. Verify Phone via Firebase
      if (firebase_token) {
        try {
          const decoded = await admin.auth().verifyIdToken(firebase_token);
          firebaseUid = decoded.uid;
          phoneNumberFromToken = decoded.phone_number || null;
        } catch (err) {
          console.warn(
            "DEBUG: firebase token verification failed",
            err && err.message ? err.message : err,
          );
          return res.status(401).json({
            success: false,
            message: "Invalid or expired firebase token",
          });
        }
      }

      logStep("firebase_verify");

      const phoneNumber = phoneNumberFromToken || phone;
      if (!phoneNumber)
        return res
          .status(400)
          .json({ success: false, message: "Phone number required" });

      // 2. Verify Email OTP
      const emailNormalized = (email || "").toLowerCase().trim();
      const otpDoc = await EmailOtp.findOne({ email: emailNormalized });
      logStep("email_otp_lookup");
      if (!otpDoc || !otpDoc.verified) {
        return res
          .status(400)
          .json({ success: false, message: "Email not verified" });
      }

      // 3. Duplicate Checks
      const existing = await User.findOne({
        $or: [{ email: emailNormalized }, { phone: phoneNumber }],
        deleted_at: null,
      });
      if (existing)
        return res
          .status(409)
          .json({ success: false, message: "User already exists" });

      // 4. Process Images (Cloudinary only)
      let front, back;
      try {
        const imgStart = Date.now();
        front = await AuthController.processImage(id_image_front);
        logStep("image_front_process");
        back = await AuthController.processImage(id_image_back);
        logStep("image_back_process");
        console.log("TIMING: images_total", Date.now() - imgStart, "ms");
      } catch (imgErr) {
        return res
          .status(400)
          .json({ success: false, message: imgErr.message });
      }

      // 5. Create User
      const hashStart = Date.now();
      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      logStep("password_hash");
      const userCreateStart = Date.now();
      const user = await User.create({
        email: emailNormalized,
        password_hash,
        first_name,
        last_name,
        phone: phoneNumber,
        role,
        firebase_uid: firebaseUid,
        phone_verified: !!firebaseUid,
        email_verified: true,
        // Store Cloudinary URLs and public IDs
        id_image_front_url: front.url,
        id_image_front_public_id: front.public_id,
        id_image_back_url: back.url,
        id_image_back_public_id: back.public_id,
        // Ensure avatar fields exist so client/profile endpoints don't fail
        avatar_url: null,
        avatar_public_id: null,
      });

      logStep("user_create");
      console.log("DEBUG: user created", {
        userId: user._id.toString(),
        email: user.email,
      });

      // Cleanup
      await EmailOtp.deleteOne({ email: emailNormalized });
      logStep("email_otp_cleanup");

      console.log(`TIMING: register_total ${Date.now() - timing.start}ms`);
      const tokens = generateTokens(user._id.toString());

      const safeUser = user.toJSON();
      delete safeUser.id_image_front;
      delete safeUser.id_image_back; // Don't send buffers back

      res
        .status(201)
        .json({ success: true, data: { user: safeUser, ...tokens } });
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.validatedBody;
      const emailNormalized = (email || "").toLowerCase().trim();

      console.log("DEBUG: login attempt", {
        emailNormalized,
        passwordLength: password?.length,
      });

      const user = await User.findOne({
        email: emailNormalized,
        deleted_at: null,
      });

      if (!user) {
        console.log("DEBUG: user not found for email:", emailNormalized);
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      console.log("DEBUG: user found", {
        userId: user._id,
        email: user.email,
        passwordHashExists: !!user.password_hash,
        passwordHashLength: user.password_hash?.length,
      });

      const isPasswordValid = await bcrypt.compare(
        password,
        user.password_hash,
      );

      console.log("DEBUG: password comparison result:", isPasswordValid);

      if (!isPasswordValid) {
        console.log("DEBUG: password mismatch for user:", emailNormalized);
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      const tokens = generateTokens(user._id.toString());
      const safeUser = user.toJSON();
      delete safeUser.id_image_front;
      delete safeUser.id_image_back;

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: { user: safeUser, ...tokens },
      });
    } catch (error) {
      next(error);
    }
  }

  // Placeholder for Google login (not implemented yet)
  static async googleLogin(req, res, next) {
    try {
      res
        .status(501)
        .json({ success: false, message: "Google login not implemented" });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req, res, next) {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token)
        return res
          .status(400)
          .json({ success: false, message: "Refresh token required" });

      const decoded = verifyRefreshToken(refresh_token);
      const user = await User.findOne({
        _id: decoded.userId,
        deleted_at: null,
      });
      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "User not found" });

      const tokens = generateTokens(user._id.toString());
      res
        .status(200)
        .json({ success: true, data: { user: user.toJSON(), ...tokens } });
    } catch (error) {
      res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }
  }

  static async logout(req, res) {
    res.status(200).json({ success: true, message: "Logout successful" });
  }

  static async getMe(req, res) {
    res.status(200).json({ success: true, data: req.user });
  }

  static async deleteAccount(req, res, next) {
    try {
      await User.findByIdAndUpdate(req.user.id, { deleted_at: new Date() });
      res.status(200).json({ success: true, message: "Account deleted" });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
