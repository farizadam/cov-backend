const express = require("express");
const stripeWebhookController = require("../controllers/stripeWebhookController");

const router = express.Router();

// Stripe webhook endpoint - uses raw body for signature verification
// Note: This route should be registered BEFORE express.json() middleware
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookController.handleWebhook
);

module.exports = router;
