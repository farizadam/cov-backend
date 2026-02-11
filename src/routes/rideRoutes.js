const express = require("express");
const RideController = require("../controllers/rideController");
const authMiddleware = require("../middleware/auth");
const { validate, validationRules, Joi } = require("../middleware/validation");

const router = express.Router();

// Validation schemas
const createRideSchema = Joi.object({
  airport_id: validationRules.objectId,
  direction: validationRules.direction,
  home_address: Joi.string().max(500).trim().allow(null, ""),
  home_postcode: validationRules.postcode,
  home_city: validationRules.city,
  home_latitude: Joi.number().min(-90).max(90),
  home_longitude: Joi.number().min(-180).max(180),
  datetime_start: validationRules.datetime,
  seats_total: validationRules.positiveInt,
  price_per_seat: validationRules.price,
  luggage_capacity: Joi.number().integer().min(0).default(0),
  comment: Joi.string().max(1000).trim().allow(null, ""),
});

const updateRideSchema = Joi.object({
  datetime_start: Joi.date().iso().min("now"),
  seats_total: Joi.number().integer().min(1),
  price_per_seat: Joi.number().positive().precision(2),
  luggage_capacity: Joi.number().integer().min(0),
  comment: Joi.string().max(1000).trim().allow(null, ""),
  home_address: Joi.string().max(500).trim().allow(null, ""),
  home_postcode: Joi.string().max(10).trim(),
  home_city: Joi.string().max(100).trim(),
  home_latitude: Joi.number().min(-90).max(90),
  home_longitude: Joi.number().min(-180).max(180),
}).min(1);

// Public routes
router.get("/search", RideController.search);

// Protected routes (specific routes must come before /:id)
router.get("/my-rides", authMiddleware, RideController.getMyRides);
router.get("/driver", authMiddleware, RideController.getMyRides);
router.post("/route-preview", authMiddleware, RideController.getRoutePreview);

// Prevent /create from being treated as an ID
router.get("/create", (req, res) => {
  res.status(404).json({ success: false, message: "Not implemented" });
});
router.post(
  "/",
  authMiddleware,
  validate(createRideSchema),
  RideController.create
);

// Dynamic routes with specific sub-routes (must come before /:id)
router.get("/:id/bookings", authMiddleware, RideController.getRideBookings);
router.get("/:id", RideController.getById);
router.patch(
  "/:id",
  authMiddleware,
  validate(updateRideSchema),
  RideController.update
);
router.delete("/:id", authMiddleware, RideController.cancel);

module.exports = router;
