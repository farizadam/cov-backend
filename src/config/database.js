const mongoose = require("mongoose");

// Connect to MongoDB
const connectDB = async () => {
  // Priority: MONGODB_URI (local) > MONGODB_URI_CLOUD (Atlas)
  const dbURI = process.env.MONGODB_URI || process.env.MONGODB_URI_CLOUD;
  const isLocal = dbURI && dbURI.includes("localhost");

  if (!dbURI) {
    console.error("❌ No MongoDB URI found in .env file.");
    process.exit(1);
  }

  try {
    if (isLocal) {
      console.log("🏠 Connecting to Local MongoDB...");
    } else {
      console.log("🌐 Connecting to MongoDB Atlas...");
    }
    await mongoose.connect(dbURI, {
      retryWrites: false, // Fix for "Transaction numbers are only allowed on a replica set member or mongos"
    });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    if (isLocal) {
      console.error("💡 TIP: Make sure MongoDB service is running. Run: net start MongoDB");
    } else {
      console.error("💡 TIP: Your IP might have changed. Check MongoDB Atlas Network Access whitelist.");
    }
    process.exit(1);
  }

  // Handle connection events (attached after successful connection)
  mongoose.connection.on("disconnected", () => {
    console.log("⚠️  MongoDB disconnected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB error:", err);
  });
};

module.exports = { connectDB, mongoose };
