require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");

async function cleanupUserCollection() {
  try {
    console.log("Starting DB cleanup...");

    // Connect to MongoDB
    const dbURI = process.env.MONGODB_URI || process.env.MONGODB_URI_CLOUD;
    await mongoose.connect(dbURI);
    console.log("✅ Connected to MongoDB");

    // This removes the heavy 'data' fields from ALL users
    const result = await User.updateMany(
      {},
      {
        $unset: {
          "id_image_front.data": "",
          "id_image_back.data": "",
        },
      },
    );

    console.log(`✅ Successfully cleaned up ${result.modifiedCount} users.`);
    console.log("Collection is now slim. Performance should improve.");

    await mongoose.connection.close();
    console.log("✅ Connection closed");
  } catch (error) {
    console.error("❌ Cleanup error:", error.message);
    process.exit(1);
  }
}

cleanupUserCollection();
