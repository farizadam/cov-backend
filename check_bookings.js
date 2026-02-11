const mongoose = require('mongoose');
require('dotenv').config();

const Booking = require('./src/models/Booking');

async function checkBookings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get bookings for the cancelled rides
    const rideIds = ['698cc4c4964982bcdd09a8cc', '698cc3da964982bcdd09a7df'];
    
    for (const rideId of rideIds) {
      console.log(`\n--- Bookings for ride ${rideId} ---`);
      const bookings = await Booking.find({ ride_id: rideId });
      
      if (bookings.length === 0) {
        console.log('No bookings found');
      } else {
        bookings.forEach(b => {
          console.log(`- Booking ${b._id}: status=${b.status}, payment_status=${b.payment_status}, payment_method=${b.payment_method}, amount=${b.total_amount}`);
        });
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBookings();
