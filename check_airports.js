const mongoose = require('mongoose');
require('dotenv').config();
const Airport = require('./src/models/Airport');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/covoit');
    const total = await Airport.countDocuments();
    const active = await Airport.countDocuments({ is_active: true });
    const withCoords = await Airport.countDocuments({ 
      latitude: { $ne: null }, 
      longitude: { $ne: null } 
    });
    
    console.log('\n📊 AIRPORT DATABASE STATS:');
    console.log('===========================');
    console.log('Total airports in DB:     ', total);
    console.log('Active airports:          ', active);
    console.log('With valid coordinates:   ', withCoords);
    
    if (total < 1030) {
      console.log('\n⚠️  WARNING: Only', total, 'airports found (expected 1030)');
      console.log('Run: npm run seed:airports');
    } else {
      console.log('\n✅ All 1,030 airports present!');
    }
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
