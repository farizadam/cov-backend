const express = require("express");
const cors = require("cors");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

// Import Route files
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const airportRoutes = require("./routes/airportRoutes");
const rideRoutes = require("./routes/rideRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const rideRequestRoutes = require("./routes/rideRequestRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const walletRoutes = require("./routes/walletRoutes");
const stripeRoutes = require("./routes/stripeRoutes");
const chatRoutes = require("./routes/chatRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const geocodingRoutes = require("./routes/geocodingRoutes");

const app = express();

// --- MIDDLEWARE ---
app.use(cors());

// IMPORTANT: Stripe webhook must be before express.json() middleware
// because it needs the raw body for signature verification
app.use("/api/v1/stripe", stripeRoutes);

// Increase JSON/body size limit to allow base64 image uploads (e.g. ID images)
// Default is 100kb; set to 10mb to accommodate images up to ~2MB encoded in base64
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Request logging (development)
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// --- ROUTES ---
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Airport Carpooling API is running",
    version: "1.0.0",
    endpoints: {
      auth: "/api/v1/auth",
      users: "/api/v1/users",
      airports: "/api/v1/airports",
      rides: "/api/v1/rides",
      bookings: "/api/v1/bookings",
      rideRequests: "/api/v1/ride-requests",
      wallet: "/api/v1/wallet",
    },
  });
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/airports", airportRoutes);
app.use("/api/v1/rides", rideRoutes);
app.use("/api/v1", bookingRoutes); // Includes /rides/:rideId/bookings and /me/bookings

app.use("/api/v1/ride-requests", rideRequestRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/ratings", ratingRoutes);
app.use("/api/v1/geocoding", geocodingRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// --- ERROR HANDLING ---
app.use(notFoundHandler);
app.use(errorHandler);

// --- EXPORT ---
module.exports = app;
