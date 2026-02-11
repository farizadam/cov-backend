const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const cloudinary = require("cloudinary").v2;
const EmailOtp = require("../models/EmailOtp");
const admin = require("../config/firebaseAdmin");

class UserController {
  /**
   * Create Stripe Connect account for user
   * POST /api/v1/users/me/stripe-account
   */
  static async createStripeAccount(req, res, next) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }
      // If already has a Stripe account, return it
      if (user.stripeAccountId) {
        return res
          .status(200)
          .json({ success: true, stripeAccountId: user.stripeAccountId });
      }
      // Create Stripe Connect account (Express type)
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        business_type: "individual",
        individual: {
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        },
      });
      user.stripeAccountId = account.id;
      await user.save();
      // Optionally, create an onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: process.env.STRIPE_ONBOARD_REFRESH_URL,
        return_url: process.env.STRIPE_ONBOARD_RETURN_URL,
        type: "account_onboarding",
      });
      res.status(201).json({
        success: true,
        stripeAccountId: account.id,
        onboardingUrl: accountLink.url,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a user's public profile
   * GET /api/v1/users/:userId/profile
   */
  static async getPublicProfile(req, res, next) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id || null;

      // Find the user
      const user = await User.findOne({
        _id: userId,
        deleted_at: null,
      }).select(
        "first_name last_name avatar_url date_of_birth bio languages car_model car_color rating rating_count trips_completed createdAt phone",
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if current user can see phone number
      // Phone is visible if:
      // 1. It's the user's own profile
      // 2. They have a completed ride together (accepted booking)
      let canSeePhone = false;

      if (currentUserId) {
        // Check if it's their own profile
        if (currentUserId === userId) {
          canSeePhone = true;
        } else {
          // Check if they have an accepted booking together
          const Booking = require("../models/Booking");
          const sharedBooking = await Booking.findOne({
            $or: [
              // Current user is passenger, target user is driver of the ride
              { passenger_id: currentUserId, status: "accepted" },
              // Current user is driver, target user is passenger
              { passenger_id: userId, status: "accepted" },
            ],
          }).populate("ride_id");

          if (sharedBooking) {
            const ride = sharedBooking.ride_id;
            if (ride) {
              const driverId = ride.driver_id?.toString();
              // Check if they're connected through this ride
              if (
                (driverId === userId &&
                  sharedBooking.passenger_id.toString() === currentUserId) ||
                (driverId === currentUserId &&
                  sharedBooking.passenger_id.toString() === userId)
              ) {
                canSeePhone = true;
              }
            }
          }
        }
      }

      // Build public profile response
      const publicProfile = {
        id: user._id,
        _id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
        date_of_birth: user.date_of_birth,
        bio: user.bio,
        languages: user.languages,
        car_model: user.car_model,
        car_color: user.car_color,
        rating: user.rating || 0,
        rating_count: user.rating_count || 0,
        trips_completed: user.trips_completed || 0,
        created_at: user.createdAt,
        createdAt: user.createdAt,
        canSeePhone,
        phone: canSeePhone ? user.phone : null,
      };

      res.status(200).json({
        success: true,
        data: publicProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   * GET /api/v1/users/me
   */
  static async getProfile(req, res, next) {
    try {
      const user = req.user; // Already attached by auth middleware

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile
   * PATCH /api/v1/users/me
   */
  static async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const updates = req.validatedBody;

      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, deleted_at: null },
        updates,
        { new: true, runValidators: true },
      ).select("-password_hash");

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get saved locations
   * GET /api/v1/users/me/locations
   */
  static async getSavedLocations(req, res, next) {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId).select("saved_locations");

      res.status(200).json({
        success: true,
        data: user?.saved_locations || [],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add a saved location
   * POST /api/v1/users/me/locations
   */
  static async addSavedLocation(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        name,
        address,
        city,
        postcode,
        country,
        latitude,
        longitude,
        placeId,
      } = req.body;

      if (
        !name ||
        !address ||
        !city ||
        latitude === undefined ||
        longitude === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "Name, address, city, latitude, and longitude are required",
        });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            saved_locations: {
              name,
              address,
              city,
              postcode,
              country,
              latitude,
              longitude,
              placeId,
            },
          },
        },
        { new: true },
      ).select("saved_locations");

      const newLocation = user.saved_locations[user.saved_locations.length - 1];

      res.status(201).json({
        success: true,
        message: "Location saved successfully",
        data: newLocation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a saved location
   * PATCH /api/v1/users/me/locations/:locationId
   */
  static async updateSavedLocation(req, res, next) {
    try {
      const userId = req.user.id;
      const { locationId } = req.params;
      const updates = req.body;

      const user = await User.findOneAndUpdate(
        { _id: userId, "saved_locations._id": locationId },
        {
          $set: {
            "saved_locations.$.name": updates.name,
            "saved_locations.$.address": updates.address,
            "saved_locations.$.city": updates.city,
            "saved_locations.$.postcode": updates.postcode,
            "saved_locations.$.country": updates.country,
            "saved_locations.$.latitude": updates.latitude,
            "saved_locations.$.longitude": updates.longitude,
            "saved_locations.$.placeId": updates.placeId,
          },
        },
        { new: true },
      ).select("saved_locations");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Location not found",
        });
      }

      const updatedLocation = user.saved_locations.find(
        (loc) => loc._id.toString() === locationId,
      );

      res.status(200).json({
        success: true,
        message: "Location updated successfully",
        data: updatedLocation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a saved location
   * DELETE /api/v1/users/me/locations/:locationId
   */
  static async deleteSavedLocation(req, res, next) {
    try {
      const userId = req.user.id;
      const { locationId } = req.params;

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $pull: {
            saved_locations: { _id: locationId },
          },
        },
        { new: true },
      ).select("saved_locations");

      res.status(200).json({
        success: true,
        message: "Location deleted successfully",
        data: user?.saved_locations || [],
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload avatar (base64)
   * POST /api/v1/users/me/avatar
   */
  static async uploadAvatar(req, res, next) {
    try {
      const userId = req.user.id;
      const { image } = req.body;

      if (!image) {
        return res.status(400).json({
          success: false,
          message: "Image data is required",
        });
      }

      // Cloudinary is required
      if (!process.env.CLOUDINARY_URL) {
        return res.status(500).json({
          success: false,
          message: "Image upload service not configured",
        });
      }

      // Validate base64 image (should start with data:image/)
      if (!image.startsWith("data:image/")) {
        return res.status(400).json({
          success: false,
          message: "Invalid image format. Must be base64 encoded image.",
        });
      }

      // Check image size (limit to ~2MB in base64)
      const base64Length = image.length - (image.indexOf(",") + 1);
      const sizeInBytes = (base64Length * 3) / 4;
      const maxSize = 2 * 1024 * 1024; // 2MB

      if (sizeInBytes > maxSize) {
        return res.status(400).json({
          success: false,
          message: "Image too large. Maximum size is 2MB.",
        });
      }

      // Upload to Cloudinary (required)
      try {
        console.log(
          `Uploading avatar for user=${userId} size=${sizeInBytes}bytes`,
        );
        const preview = image.slice(0, 120);
        console.log(`Avatar payload preview: ${preview.replace(/\n/g, "")}`);

        const uploadResult = await cloudinary.uploader.upload(image, {
          folder: "avatars",
          resource_type: "image",
        });

        const updatedUser = await User.findByIdAndUpdate(
          userId,
          {
            avatar_url: uploadResult.secure_url,
            avatar_public_id: uploadResult.public_id,
          },
          { new: true },
        ).select("-password_hash");

        return res.status(200).json({
          success: true,
          message: "Avatar uploaded successfully",
          data: updatedUser,
        });
      } catch (err) {
        // Detailed logging for debugging Cloudinary failures
        try {
          const details = {
            userId,
            message: err && err.message,
            name: err && err.name,
            http_code: err && err.http_code,
            request_id: err && err.request_id,
          };
          console.error("Cloudinary upload failed", details, err && err.stack);
        } catch (logErr) {
          console.error(
            "Cloudinary upload failed, and logging failed:",
            logErr,
          );
        }

        return res.status(500).json({
          success: false,
          message: "Failed to upload avatar",
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete avatar
   * DELETE /api/v1/users/me/avatar
   */
  static async deleteAvatar(req, res, next) {
    try {
      const userId = req.user.id;

      // Fetch current public_id to delete from Cloudinary if present
      const user = await User.findById(userId).select("avatar_public_id");
      if (user && user.avatar_public_id && process.env.CLOUDINARY_URL) {
        try {
          await cloudinary.uploader.destroy(user.avatar_public_id, {
            resource_type: "image",
          });
        } catch (err) {
          console.warn("Cloudinary destroy failed", err);
          // proceed to remove DB references anyway
        }
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { avatar_url: null, avatar_public_id: null },
        { new: true },
      ).select("-password_hash");

      res.status(200).json({
        success: true,
        message: "Avatar deleted successfully",
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change email with OTP verification
   * POST /api/v1/users/me/change-email
   * Requires: new_email (must be verified via OTP first)
   */
  static async changeEmail(req, res, next) {
    try {
      const userId = req.user.id;
      const { new_email } = req.body;

      if (!new_email) {
        return res.status(400).json({
          success: false,
          message: "New email is required",
        });
      }

      const emailNormalized = new_email.toLowerCase().trim();

      // Check if email is already in use by another user
      const existingUser = await User.findOne({
        email: emailNormalized,
        _id: { $ne: userId },
        deleted_at: null,
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email is already in use by another account",
        });
      }

      // Check if the email has been verified via OTP
      const otpDoc = await EmailOtp.findOne({ email: emailNormalized });
      if (!otpDoc || !otpDoc.verified) {
        return res.status(400).json({
          success: false,
          message: "Please verify the new email first",
        });
      }

      // Check if verification hasn't expired
      if (otpDoc.verifiedExpiresAt && new Date() > otpDoc.verifiedExpiresAt) {
        return res.status(400).json({
          success: false,
          message: "Email verification has expired. Please verify again.",
        });
      }

      // Update the email
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { email: emailNormalized, email_verified: true },
        { new: true },
      ).select("-password_hash");

      // Clean up the OTP record
      await EmailOtp.deleteOne({ email: emailNormalized });

      res.status(200).json({
        success: true,
        message: "Email updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change phone with Firebase verification
   * POST /api/v1/users/me/change-phone
   * Requires: firebase_token (from phone auth)
   */
  static async changePhone(req, res, next) {
    try {
      const userId = req.user.id;
      const { firebase_token } = req.body;

      if (!firebase_token) {
        return res.status(400).json({
          success: false,
          message: "Firebase token is required for phone verification",
        });
      }

      // Verify Firebase token and extract phone number
      let phoneNumber = null;
      let firebaseUid = null;

      try {
        const decoded = await admin.auth().verifyIdToken(firebase_token);
        firebaseUid = decoded.uid;
        phoneNumber = decoded.phone_number;
      } catch (err) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired firebase token",
        });
      }

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "No phone number found in firebase token",
        });
      }

      // Check if phone is already in use by another user
      const existingUser = await User.findOne({
        phone: phoneNumber,
        _id: { $ne: userId },
        deleted_at: null,
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Phone number is already in use by another account",
        });
      }

      // Update the phone number and firebase_uid
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          phone: phoneNumber,
          phone_verified: true,
          firebase_uid: firebaseUid,
        },
        { new: true },
      ).select("-password_hash");

      res.status(200).json({
        success: true,
        message: "Phone number updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserController;
