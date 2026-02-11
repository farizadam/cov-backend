const mongoose = require('mongoose');
require('dotenv').config({ path: 'myapp-backend/.env' });

async function testSearch() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/airport_carpooling");
  
  const searchLng = 4.044799860566855;
  const searchLat = 49.263622555597905;
  const radius = 50000; // 50km
  const radians = radius / 6378100;

  console.log(`Searching near [${searchLng}, ${searchLat}] with radius ${radius}m (${radians} rads)`);

  const query = {
    "route": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [searchLng, searchLat]
        },
        $maxDistance: 5000 // Back to 5km
      }
    }
  };

  const rides = await mongoose.connection.collection('rides').find(query).toArray();
  console.log(`Found ${rides.length} rides.`);
  rides.forEach(r => console.log(`- Ride ${r._id}: ${r.home_city}`));

  await mongoose.disconnect();
}

testSearch();
