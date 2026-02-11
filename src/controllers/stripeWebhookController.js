const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const Payout = require("../models/Payout");
const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const User = require("../models/User");

/**
 * POST /api/v1/stripe/webhook
 * Handle Stripe webhook events
 * 
 * IMPORTANT: This endpoint should NOT use express.json() middleware
 * It needs the raw body to verify the webhook signature
 */
exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object);
        break;

      case "transfer.created":
        await handleTransferCreated(event.data.object);
        break;

      case "payout.paid":
        await handlePayoutPaid(event.data.object);
        break;

      case "payout.failed":
        await handlePayoutFailed(event.data.object);
        break;

      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error(`Error handling webhook ${event.type}:`, error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
};

/**
 * Handle successful payment
 * This is where we credit the driver's wallet
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log("Payment succeeded:", paymentIntent.id);

  const { rideId, passengerId, driverId, seats, bookingId } = paymentIntent.metadata;

  if (!rideId || !driverId) {
    console.log("Missing metadata, skipping wallet update");
    return;
  }

  try {
    // Get the ride and driver
    const ride = await Ride.findById(rideId);
    const driver = await User.findById(driverId);
    const passenger = await User.findById(passengerId);

    if (!ride || !driver) {
      console.error("Ride or driver not found for payment:", paymentIntent.id);
      return;
    }

    // Get or create driver's wallet
    const wallet = await Wallet.getOrCreateWallet(driverId);

    // Calculate amounts
    const grossAmount = paymentIntent.amount; // Already in cents
    const feePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENT || "10");
    const feeAmount = Math.round(grossAmount * (feePercentage / 100));
    const netAmount = grossAmount - feeAmount;

    // Check if transaction already exists (idempotency)
    const existingTransaction = await Transaction.findOne({
      stripe_payment_intent_id: paymentIntent.id,
    });

    if (existingTransaction) {
      console.log("Transaction already processed:", paymentIntent.id);
      return;
    }

    // Find the booking
    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId);
    } else {
      // Find by ride and passenger
      booking = await Booking.findOne({
        ride_id: rideId,
        passenger_id: passengerId,
        status: "accepted",
      });
    }

    // Add to driver's pending balance (will be released when ride completes)
    // For now, we'll add directly to available balance
    // You can change this to pending_balance if you want to hold funds
    await wallet.addEarnings(netAmount, false);

    // Create transaction record
    await Transaction.createRideEarning({
      wallet_id: wallet._id,
      user_id: driverId,
      gross_amount: grossAmount,
      fee_percentage: feePercentage,
      booking: booking || { _id: bookingId, seats: parseInt(seats) || 1 },
      ride,
      passenger,
      stripe_payment_intent_id: paymentIntent.id,
    });

    console.log(`Credited ${netAmount} cents to driver ${driverId}'s wallet`);
  } catch (error) {
    console.error("Error processing payment success:", error);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentIntentFailed(paymentIntent) {
  console.log("Payment failed:", paymentIntent.id);

  const { bookingId } = paymentIntent.metadata;

  if (bookingId) {
    // Update booking status if needed
    await Booking.findByIdAndUpdate(bookingId, {
      payment_status: "failed",
    });
  }
}

/**
 * Handle transfer created (when money is sent to connected account)
 */
async function handleTransferCreated(transfer) {
  console.log("Transfer created:", transfer.id);

  const { payout_id } = transfer.metadata || {};

  if (payout_id) {
    const payout = await Payout.findById(payout_id);
    if (payout) {
      payout.stripe_transfer_id = transfer.id;
      await payout.save();
    }
  }
}

/**
 * Handle successful payout to bank account
 */
async function handlePayoutPaid(payout) {
  console.log("Payout paid:", payout.id);

  // Find payout record by Stripe payout ID
  const payoutRecord = await Payout.findOne({ stripe_payout_id: payout.id });

  if (payoutRecord) {
    await payoutRecord.markCompleted();

    // Update related transaction
    await Transaction.findOneAndUpdate(
      { reference_id: payoutRecord._id, type: "withdrawal" },
      {
        status: "completed",
        processed_at: new Date(),
      }
    );

    console.log(`Payout ${payout.id} marked as completed`);
  }
}

/**
 * Handle failed payout
 */
async function handlePayoutFailed(payout) {
  console.log("Payout failed:", payout.id);

  const payoutRecord = await Payout.findOne({ stripe_payout_id: payout.id });

  if (payoutRecord) {
    // Mark as failed
    await payoutRecord.markFailed(
      payout.failure_message || "Payout failed",
      payout.failure_code
    );

    // Refund the wallet
    const wallet = await Wallet.findById(payoutRecord.wallet_id);
    if (wallet) {
      await wallet.refundWithdrawal(payoutRecord.amount);
    }

    // Update transaction
    await Transaction.findOneAndUpdate(
      { reference_id: payoutRecord._id, type: "withdrawal" },
      {
        status: "failed",
        metadata: {
          failure_reason: payout.failure_message,
          failure_code: payout.failure_code,
        },
      }
    );

    console.log(`Payout ${payout.id} failed, wallet refunded`);
  }
}

/**
 * Handle Stripe Connect account updates
 */
async function handleAccountUpdated(account) {
  console.log("Account updated:", account.id);

  // Find user with this Stripe account
  const user = await User.findOne({ stripeAccountId: account.id });

  if (user) {
    // You could store verification status, capabilities, etc.
    console.log(
      `User ${user._id} Stripe account updated. Charges enabled: ${account.charges_enabled}`
    );
  }
}

/**
 * Handle charge refund
 */
async function handleChargeRefunded(charge) {
  console.log("Charge refunded:", charge.id);

  // Get the payment intent
  const paymentIntentId = charge.payment_intent;

  if (!paymentIntentId) return;

  // Find the original transaction
  const originalTransaction = await Transaction.findOne({
    stripe_payment_intent_id: paymentIntentId,
    type: "ride_earning",
  });

  if (!originalTransaction) return;

  // Calculate refund amount
  const refundAmount = charge.amount_refunded;
  const feePercentage = originalTransaction.fee_percentage || 10;
  const driverRefund = Math.round(refundAmount * ((100 - feePercentage) / 100));

  // Deduct from driver's wallet
  const wallet = await Wallet.findById(originalTransaction.wallet_id);
  if (wallet && wallet.balance >= driverRefund) {
    wallet.balance -= driverRefund;
    wallet.total_earned -= driverRefund;
    await wallet.save();

    // Create refund transaction
    await Transaction.create({
      wallet_id: wallet._id,
      user_id: originalTransaction.user_id,
      type: "refund",
      amount: -driverRefund,
      gross_amount: refundAmount,
      fee_amount: refundAmount - driverRefund,
      net_amount: driverRefund,
      status: "completed",
      reference_type: "refund",
      reference_id: originalTransaction.reference_id,
      stripe_payment_intent_id: paymentIntentId,
      description: "Refund for cancelled booking",
      processed_at: new Date(),
    });

    console.log(`Deducted ${driverRefund} cents from driver wallet for refund`);
  }
}
