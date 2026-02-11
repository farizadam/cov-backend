// Check what rides exist in the database
const mongoose = require('mongoose');

// Connect to database
mongoose.connect('mongodb://localhost:27017/airport_carpooling');

const Ride = mongoose.model('Ride', new mongoose.Schema({
  driver_id: mongoose.Schema.Types.ObjectId,
  airport_id: mongoose.Schema.Types.ObjectId,
  direction: String,
  home_latitude: Number,
  home_longitude: Number,
  datetime_start: Date,
  status: String,
  route: {
    type: { type: String },
    coordinates: [[Number]]
  }
}, { timestamps: true }));

async function checkRides() {
  try {
    console.log('🔍 Checking all rides in the database...');
    
    // Get total count
    const totalRides = await Ride.countDocuments();
    console.log('📊 Total rides:', totalRides);
    
    // Get recent rides (last 10)
    const recentRides = await Ride.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select('_id direction status datetime_start route createdAt');
    
    console.log('\n===== RECENT RIDES =====');
    recentRides.forEach(ride => {
      console.log(`📍 ID: ${ride._id}`);
      console.log(`   Direction: ${ride.direction}`);
      console.log(`   Status: ${ride.status}`);
      console.log(`   Date: ${ride.datetime_start}`);
      console.log(`   Route exists: ${!!ride.route}`);
      console.log(`   Route coords: ${ride.route?.coordinates?.length || 0} points`);
      console.log(`   Created: ${ride.createdAt}\n`);
    });
    
    // Check active rides specifically
    console.log('\n===== ACTIVE RIDES =====');
    const activeRides = await Ride.find({ status: 'active' })
      .select('_id direction airport_id datetime_start route home_latitude home_longitude');
    
    console.log('📊 Active rides:', activeRides.length);
    
    activeRides.forEach(ride => {
      console.log(`🚗 ID: ${ride._id}`);
      console.log(`   Direction: ${ride.direction}`);
      console.log(`   Airport: ${ride.airport_id}`);
      console.log(`   Date: ${ride.datetime_start}`);
      console.log(`   Home coords: [${ride.home_latitude}, ${ride.home_longitude}]`);
      console.log(`   Route: ${ride.route?.type || 'none'} with ${ride.route?.coordinates?.length || 0} points`);
      if (ride.route?.coordinates?.length > 0) {
        console.log(`   First point: [${ride.route.coordinates[0]}]`);
        console.log(`   Last point: [${ride.route.coordinates[ride.route.coordinates.length-1]}]`);
      }
      console.log('');
    });
    
    // Test a simple geospatial query on any ride that has route data
    const ridesWithRoutes = activeRides.filter(r => r.route?.coordinates?.length > 0);
    if (ridesWithRoutes.length > 0) {
      console.log('\n===== TESTING GEOSPATIAL QUERY =====');
      const testRide = ridesWithRoutes[0];
      console.log(`🧪 Testing with ride: ${testRide._id}`);
      
      // Use Paris coordinates from search
      const searchLng = 2.3483915;
      const searchLat = 48.8534951;
      const radius = 8000; // 8km
      
      const geoResults = await Ride.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [searchLng, searchLat]
            },
            distanceField: "distance",
            maxDistance: radius,
            spherical: true,
            query: { status: "active" }
          }
        },
        { $limit: 5 }
      ]);
      
      console.log(`📊 Geospatial results: ${geoResults.length}`);
      geoResults.forEach(result => {
        console.log(`   🎯 Found ride ${result._id} at distance: ${result.distance}m`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

checkRides();