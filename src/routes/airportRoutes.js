const express = require("express");
const AirportController = require("../controllers/airportController");

const router = express.Router();

// Public routes (no auth required for reading airports)
router.get("/", AirportController.getAll);
router.get("/:id", AirportController.getById);

module.exports = router;
