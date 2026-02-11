const express = require("express");
const router = express.Router();
const RatingController = require("../controllers/ratingController");
const authMiddleware = require("../middleware/auth");

// All routes require authentication
router.use(authMiddleware);

// Create a new rating
router.post("/", RatingController.createRating);

// Get my received ratings
router.get("/me", RatingController.getMyRatings);

// Get pending ratings (rides not yet rated)
router.get("/pending", RatingController.getPendingRatings);

// Check if can rate a specific booking
router.get("/can-rate/:bookingId", RatingController.canRateBooking);

// Get rating statistics for a user
router.get("/stats/:userId", RatingController.getUserRatingStats);

// Get ratings for a specific user
router.get("/user/:userId", RatingController.getUserRatings);

module.exports = router;
