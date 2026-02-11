const express = require("express");
const AuthController = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");
const { validate, validationRules, Joi } = require("../middleware/validation");

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: validationRules.email,
  password: validationRules.password,
  first_name: validationRules.firstName,
  last_name: validationRules.lastName,
  phone: validationRules.phone,
  role: validationRules.role,
  firebase_token: Joi.string().required(),
  firebase_token: Joi.string().optional(),
  id_image_front: Joi.string().optional(),
  id_image_back: Joi.string().optional(),
});

const loginSchema = Joi.object({
  email: validationRules.email,
  password: Joi.string().required(),
});

// Routes
router.post("/register", validate(registerSchema), AuthController.register);
const EmailOtpController = require("../controllers/emailOtpController");
const PasswordResetController = require("../controllers/passwordResetController");

router.post("/send-email-otp", EmailOtpController.sendEmailOtp);
router.post("/verify-email-otp", EmailOtpController.verifyEmailOtp);
router.post("/login", validate(loginSchema), AuthController.login);
router.post("/google", AuthController.googleLogin); // Google login endpoint
router.post("/refresh", AuthController.refresh);
router.post("/logout", AuthController.logout);
router.get("/me", authMiddleware, AuthController.getMe);
router.delete("/me", authMiddleware, AuthController.deleteAccount);

// Forgot Password flow
router.post("/forgot-password/send-code", PasswordResetController.sendResetCode);
router.post("/forgot-password/verify-code", PasswordResetController.verifyResetCode);
router.post("/forgot-password/verify-phone", PasswordResetController.verifyPhone);
router.post("/forgot-password/reset", PasswordResetController.resetPassword);

module.exports = router;
