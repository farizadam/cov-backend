// Test ride creation to see if it's working
const mongoose = require('mongoose');

// Connect to database
mongoose.connect('mongodb://localhost:27017/airport_rideshare');

// Import the actual models
const Ride = require('./src/models/Ride');
const Airport = require('./src/models/Airport');
const User = require('./src/models/User');

async function testRideCreation() {
  try {
    console.log('🔍 Testing database connection and ride creation...');
    
    // Check if we have any airports
    const airports = await Airport.find({}).limit(1);
    console.log('📊 Airports in database:', airports.length);
    
    if (airports.length === 0) {
      console.log('❌ No airports found in database!');
      return;
    }
    
    const airport = airports[0];
    console.log('✅ Using airport:', airport.name, airport._id);
    
    // Check if we have any users (drivers)
    const users = await User.find({}).limit(1);
    console.log('📊 Users in database:', users.length);
    
    if (users.length === 0) {
      console.log('❌ No users found in database!');
      return;
    }
    
    const user = users[0];
    console.log('✅ Using user:', user.first_name, user._id);
    
    // Create a test ride
    console.log('\n🚗 Creating test ride...');
    
    const testRideData = {
      driver_id: user._id,
      airport_id: airport._id,
      direction: 'home_to_airport',
      home_address: '123 Test Street, Paris',
      home_postcode: '75001',
      home_city: 'Paris',
      home_latitude: 48.8534951,
      home_longitude: 2.3483915,
      datetime_start: new Date('2026-02-15T10:00:00.000Z'),
      seats_total: 3,
      seats_left: 3,
      price_per_seat: 25,
      comment: 'Test ride for debugging',
      status: 'active'
    };
    
    // Add route coordinates (straight line from home to airport)
    if (airport.latitude && airport.longitude) {
      testRideData.route = {
        type: 'LineString',
        coordinates: [
          [testRideData.home_longitude, testRideData.home_latitude], // Home
          [airport.longitude, airport.latitude] // Airport
        ]
      };
      console.log('✅ Route coordinates added:', testRideData.route.coordinates);
    }
    
    const newRide = await Ride.create(testRideData);
    console.log('✅ Test ride created successfully!');
    console.log('📍 Ride ID:', newRide._id.toString());
    console.log('📍 Direction:', newRide.direction);
    console.log('📍 Route points:', newRide.route?.coordinates?.length || 0);
    
    // Test the search query that was failing
    console.log('\n🔍 Testing geospatial search...');
    
    const searchLng = 2.3483915;
    const searchLat = 48.8534951;
    const radius = 8000; // 8km
    
    const searchResults = await Ride.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [searchLng, searchLat]
          },
          distanceField: "distance",
          maxDistance: radius,
          spherical: true,
          query: { 
            status: "active",
            direction: "home_to_airport" 
          }
        }
      }
    ]);
    
    console.log('📊 Search results:', searchResults.length);
    if (searchResults.length > 0) {
      console.log('🎯 Found ride at distance:', searchResults[0].distance, 'meters');
      console.log('✅ Geospatial search is working!');
    } else {
      console.log('❌ No results found in geospatial search');
    }
    
    // Clean up - delete the test ride
    await Ride.deleteOne({ _id: newRide._id });
    console.log('🗑️ Test ride deleted');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.connection.close();
  }
}

testRideCreation();