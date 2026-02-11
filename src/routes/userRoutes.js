const express = require("express");
const UserController = require("../controllers/userController");
const AuthController = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");
const optionalAuthMiddleware = require("../middleware/optionalAuth");
const { validate, validationRules, Joi } = require("../middleware/validation");

const router = express.Router();
// Stripe Connect onboarding
router.post("/me/stripe-account", UserController.createStripeAccount);

// Public profile route (optional auth to check if can see phone)
router.get("/:userId/profile", optionalAuthMiddleware, UserController.getPublicProfile);

// All routes below require authentication
router.use(authMiddleware);

// Validation schema for profile update
const updateProfileSchema = Joi.object({
  first_name: Joi.string().min(2).max(100).trim(),
  last_name: Joi.string().min(2).max(100).trim(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).allow(null, ""),
  role: Joi.string().valid("driver", "passenger", "both"),
  avatar_url: Joi.string().uri().allow(null, ""),
  date_of_birth: Joi.date().iso().allow(null),
  bio: Joi.string().max(500).allow(null, ""),
  languages: Joi.array().items(Joi.string().max(50)).max(10).allow(null),
  car_model: Joi.string().max(100).allow(null, ""),
  car_color: Joi.string().max(50).allow(null, ""),
}).min(1); // At least one field required

// Routes
router.get("/me", UserController.getProfile);
// Accept both PATCH and PUT for profile updates (frontend may use PUT)
router.patch(
  "/me",
  validate(updateProfileSchema),
  UserController.updateProfile,
);
router.put("/me", validate(updateProfileSchema), UserController.updateProfile);

// Allow deleting account via /users/me to match mobile client
router.delete("/me", AuthController.deleteAccount);

// Avatar upload route
router.post("/me/avatar", UserController.uploadAvatar);
router.delete("/me/avatar", UserController.deleteAvatar);

// Email/Phone change routes (with verification)
router.post("/me/change-email", UserController.changeEmail);
router.post("/me/change-phone", UserController.changePhone);

// Saved locations routes
router.get("/me/locations", UserController.getSavedLocations);
router.post("/me/locations", UserController.addSavedLocation);
router.patch("/me/locations/:locationId", UserController.updateSavedLocation);
router.delete("/me/locations/:locationId", UserController.deleteSavedLocation);

module.exports = router;
