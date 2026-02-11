/**
 * Fix Orphaned Payments Script
 * 
 * Finds Stripe PaymentIntents that succeeded but have no matching booking in MongoDB.
 * Can either:
 *   1. CREATE missing bookings (recover the payment)
 *   2. REFUND orphaned payments
 * 
 * Usage:
 *   node fix_orphaned_payments.js              # Dry run - just list orphans
 *   node fix_orphaned_payments.js --recover     # Create missing bookings
 *   node fix_orphaned_payments.js --refund      # Refund orphaned payments
 */

require('dotenv').config();
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Models
const Booking = require('./src/models/Booking');
const Ride = require('./src/models/Ride');
const Wallet = require('./src/models/Wallet');
const Transaction = require('./src/models/Transaction');
const User = require('./src/models/User');

const mode = process.argv[2]; // --recover or --refund or undefined (dry run)

async function findOrphanedPayments() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Get all successful PaymentIntents from Stripe (last 30 days)
  console.log('Fetching successful PaymentIntents from Stripe...');
  const paymentIntents = [];
  let hasMore = true;
  let startingAfter = undefined;

  while (hasMore) {
    const params = {
      limit: 100,
      created: { gte: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60 }, // last 30 days
    };
    if (startingAfter) params.starting_after = startingAfter;

    const list = await stripe.paymentIntents.list(params);
    const succeeded = list.data.filter(pi => pi.status === 'succeeded');
    paymentIntents.push(...succeeded);

    hasMore = list.has_more;
    if (list.data.length > 0) {
      startingAfter = list.data[list.data.length - 1].id;
    }
  }

  console.log(`Found ${paymentIntents.length} succeeded PaymentIntents\n`);

  // Check each PaymentIntent for a matching booking
  const orphaned = [];
  const matched = [];

  for (const pi of paymentIntents) {
    const booking = await Booking.findOne({ payment_intent_id: pi.id });
    if (booking) {
      matched.push({ pi, booking });
    } else {
      // Check if it was already refunded
      const refunds = await stripe.refunds.list({ payment_intent: pi.id, limit: 1 });
      const isRefunded = refunds.data.length > 0;
      orphaned.push({ pi, isRefunded });
    }
  }

  // Also check for wallet-paid bookings that might be orphaned
  // (wallet payments don't go through Stripe, so they won't be found above)

  console.log(`✅ ${matched.length} payments have matching bookings`);
  console.log(`⚠️  ${orphaned.length} orphaned payments (no booking in DB)\n`);

  if (orphaned.length === 0) {
    console.log('No orphaned payments found. Everything is in order!');
    await mongoose.disconnect();
    return;
  }

  // Display orphaned payments
  console.log('--- ORPHANED PAYMENTS ---');
  for (const { pi, isRefunded } of orphaned) {
    const rideId = pi.metadata?.rideId || pi.metadata?.ride_id || 'unknown';
    const seats = pi.metadata?.seats || 'unknown';
    const passengerId = pi.metadata?.passengerId || pi.metadata?.userId || pi.metadata?.user_id || 'unknown';
    console.log(`  PI: ${pi.id}`);
    console.log(`    Amount: €${(pi.amount / 100).toFixed(2)}`);
    console.log(`    Created: ${new Date(pi.created * 1000).toISOString()}`);
    console.log(`    Ride: ${rideId}, Seats: ${seats}, Passenger: ${passengerId}`);
    console.log(`    Already refunded: ${isRefunded ? 'YES' : 'NO'}`);
    console.log('');
  }

  // --- RECOVER MODE ---
  if (mode === '--recover') {
    console.log('\n🔧 RECOVERING: Creating missing bookings...\n');
    
    for (const { pi, isRefunded } of orphaned) {
      if (isRefunded) {
        console.log(`  ⏭️  Skipping ${pi.id} (already refunded)`);
        continue;
      }

      const rideId = pi.metadata?.rideId || pi.metadata?.ride_id;
      const seats = parseInt(pi.metadata?.seats || '1');
      const passengerId = pi.metadata?.passengerId || pi.metadata?.userId || pi.metadata?.user_id;

      if (!rideId || !passengerId) {
        console.log(`  ❌ Cannot recover ${pi.id} - missing metadata (rideId: ${rideId}, passengerId: ${passengerId})`);
        continue;
      }

      // Check if ride still exists
      const ride = await Ride.findById(rideId);
      if (!ride) {
        console.log(`  ❌ Cannot recover ${pi.id} - ride ${rideId} not found`);
        continue;
      }

      // Check for duplicate booking (either already in DB or we just created one in this run)
      const existingBooking = await Booking.findOne({ ride_id: rideId, passenger_id: passengerId });
      if (existingBooking) {
        console.log(`  ⏭️  Duplicate: ${pi.id} - booking already exists: ${existingBooking._id}`);
        // Just update the payment_intent_id if missing
        if (!existingBooking.payment_intent_id) {
          existingBooking.payment_intent_id = pi.id;
          existingBooking.payment_status = 'paid';
          existingBooking.payment_method = 'card';
          await existingBooking.save();
          console.log(`     Updated existing booking with payment intent`);
        } else {
          // This is a true duplicate charge — refund it
          try {
            await stripe.refunds.create({ payment_intent: pi.id });
            console.log(`     💸 Refunded duplicate charge €${(pi.amount / 100).toFixed(2)}`);
          } catch (refErr) {
            console.log(`     ❌ Failed to refund duplicate: ${refErr.message}`);
          }
        }
        continue;
      }

      try {
        const booking = await Booking.create({
          ride_id: rideId,
          passenger_id: passengerId,
          seats: seats,
          status: 'accepted',
          payment_status: 'paid',
          payment_method: 'card',
          payment_intent_id: pi.id,
        });

        // Update ride seats
        await Ride.findByIdAndUpdate(rideId, { $inc: { seats_left: -seats } });

        // Credit driver wallet
        const driver = await User.findById(ride.driver_id);
        if (!driver?.stripeAccountId) {
          try {
            const wallet = await Wallet.getOrCreateWallet(ride.driver_id);
            const grossAmount = pi.amount;
            const feePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENT || "10");
            const feeAmount = Math.round(grossAmount * (feePercentage / 100));
            const netAmount = grossAmount - feeAmount;
            const passenger = await User.findById(passengerId);
            
            await wallet.addEarnings(netAmount, false);
            await Transaction.createRideEarning({
              wallet_id: wallet._id,
              user_id: ride.driver_id,
              gross_amount: grossAmount,
              fee_percentage: feePercentage,
              booking,
              ride,
              passenger,
              stripe_payment_intent_id: pi.id,
            });
            console.log(`  ✅ Recovered ${pi.id} → Booking ${booking._id} (€${(pi.amount / 100).toFixed(2)}, driver wallet credited)`);
          } catch (walletErr) {
            console.log(`  ✅ Recovered ${pi.id} → Booking ${booking._id} (wallet credit failed: ${walletErr.message})`);
          }
        } else {
          console.log(`  ✅ Recovered ${pi.id} → Booking ${booking._id} (€${(pi.amount / 100).toFixed(2)}, driver has Stripe Connect)`);
        }
      } catch (err) {
        console.log(`  ❌ Failed to recover ${pi.id}: ${err.message}`);
      }
    }
  }

  // --- REFUND MODE ---
  if (mode === '--refund') {
    console.log('\n💸 REFUNDING orphaned payments...\n');
    
    for (const { pi, isRefunded } of orphaned) {
      if (isRefunded) {
        console.log(`  ⏭️  Already refunded: ${pi.id}`);
        continue;
      }
      
      try {
        await stripe.refunds.create({ payment_intent: pi.id });
        console.log(`  ✅ Refunded ${pi.id} (€${(pi.amount / 100).toFixed(2)})`);
      } catch (err) {
        console.log(`  ❌ Failed to refund ${pi.id}: ${err.message}`);
      }
    }
  }

  if (!mode) {
    console.log('\nThis was a DRY RUN. Use:');
    console.log('  node fix_orphaned_payments.js --recover   # Create missing bookings');
    console.log('  node fix_orphaned_payments.js --refund    # Refund orphaned payments');
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

findOrphanedPayments().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
