// Quick debug script to check ride data
const mongoose = require('mongoose');

// Connect to database
mongoose.connect('mongodb://localhost:27017/airport_rideshare', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

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
}));

async function debugRide() {
  try {
    console.log('🔍 Looking for ride 698a64831073de3a72b43b86...');
    
    // Find the specific ride
    const ride = await Ride.findById('698a64831073de3a72b43b86');
    
    if (!ride) {
      console.log('❌ Ride not found');
      return;
    }
    
    console.log('\n===== RIDE DATA =====');
    console.log('ID:', ride._id.toString());
    console.log('Direction:', ride.direction);
    console.log('Status:', ride.status);
    console.log('Date:', ride.datetime_start);
    console.log('Home coordinates:', ride.home_latitude, ride.home_longitude);
    console.log('\n===== ROUTE DATA =====');
    console.log('Route exists:', !!ride.route);
    console.log('Route type:', ride.route?.type);
    console.log('Route coordinates length:', ride.route?.coordinates?.length || 0);
    
    if (ride.route?.coordinates?.length > 0) {
      console.log('First coordinate:', ride.route.coordinates[0]);
      console.log('Last coordinate:', ride.route.coordinates[ride.route.coordinates.length - 1]);
    }
    
    // Test geospatial query manually
    console.log('\n===== TESTING GEOSPATIAL QUERIES =====');
    
    // Search point from your logs: [48.8534951, 2.3483915]
    const searchLng = 2.3483915;
    const searchLat = 48.8534951;
    const radius = 8000; // 8km
    
    console.log(`🔍 Testing geospatial search near [${searchLat}, ${searchLng}] within ${radius}m`);
    
    // Check if route coordinates exist and are not empty
    const ridesWithRoute = await Ride.find({
      _id: ride._id,
      'route.coordinates': { $exists: true, $ne: [] }
    });
    
    console.log('Rides with non-empty route:', ridesWithRoute.length);
    
    // Manual geospatial query using $geoNear
    const pipeline = [
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
            _id: mongoose.Types.ObjectId(ride._id.toString()),
            status: "active"
          }
        }
      }
    ];
    
    console.log('\n🧪 Testing $geoNear aggregation...');
    const geoResults = await Ride.aggregate(pipeline);
    console.log('GeoNear results:', geoResults.length);
    
    if (geoResults.length > 0) {
      console.log('Distance found:', geoResults[0].distance, 'meters');
    }
    
    // Also test $geoWithin for comparison
    const geoWithinResults = await Ride.find({
      _id: ride._id,
      status: "active",
      route: {
        $geoWithin: {
          $centerSphere: [[searchLng, searchLat], radius / 6378100] // Earth radius in meters
        }
      }
    });
    
    console.log('GeoWithin results:', geoWithinResults.length);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

debugRide();