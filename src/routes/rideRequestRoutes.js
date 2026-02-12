const express = require("express");
const router = express.Router();
const rideRequestController = require("../controllers/rideRequestController");
const protect = require("../middleware/auth");

// All routes require authentication
router.use(protect);

// Passenger routes
router.post("/", rideRequestController.createRequest);
router.get("/my-requests", rideRequestController.getMyRequests);
router.put("/:id", rideRequestController.updateRequest);
router.put("/:id/cancel", rideRequestController.cancelRequest);
router.put("/:id/accept-offer", rideRequestController.acceptOffer);
router.post("/:id/accept-offer-with-payment", rideRequestController.acceptOfferWithPayment);
router.put("/:id/reject-offer", rideRequestController.rejectOffer);

// Driver routes
router.get("/available", rideRequestController.getAvailableRequests);
router.get("/my-offers", rideRequestController.getMyOffers);
router.post("/:id/offer", rideRequestController.makeOffer);
router.delete("/:id/offer", rideRequestController.withdrawOffer);
router.delete("/:id/cancel-accepted-offer", rideRequestController.cancelAcceptedOffer);

// Common routes
router.get("/:id", rideRequestController.getRequest);

module.exports = router;
