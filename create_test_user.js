const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

// Import User model
const User = require("./src/models/User");

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Check if user already exists
    const existingUser = await User.findOne({ email: "demo2@gmail.com" });
    if (existingUser) {
      console.log("❌ User already exists with email: demo2@gmail.com");
      await mongoose.connection.close();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("demo12345", 10);

    // Create new user
    const newUser = new User({
      email: "demo2@gmail.com",
      password_hash: hashedPassword,
      first_name: "Demo",
      last_name: "User",
      phone: "+1234567890", // You can change this phone number
      date_of_birth: null,
      role: "both",
      avatar_url: null,
      bio: null,
      languages: [],
      car_model: null,
      car_color: null,
      is_email_verified: true,
      is_phone_verified: true,
      id_verification_status: "none",
      id_image_url: null,
      address_proof_url: null,
      license_plate: null,
      vehicle_image_url: null,
      vehicle_registration_url: null,
    });

    // Save user
    await newUser.save();
    console.log("✅ Test user created successfully!");
    console.log("📧 Email: demo2@gmail.com");
    console.log("🔐 Password: demo12345");
    console.log("📱 Phone: +1234567890");
    console.log("🆔 User ID:", newUser._id);

    await mongoose.connection.close();
  } catch (error) {
    console.error("❌ Error creating user:", error.message);
    process.exit(1);
  }
}

createTestUser();
