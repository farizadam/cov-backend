const express = require("express");
const router = express.Router();

// Simple in-memory cache
const geocodeCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting helper
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

/**
 * GET /api/v1/geocoding/reverse-geocode
 * Reverse geocode coordinates to address
 * Query params: lat, lon
 */
router.get("/reverse-geocode", async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res
        .status(400)
        .json({ success: false, error: "Missing lat or lon parameter" });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    // Validate coordinates
    if (
      isNaN(latitude) ||
      isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid coordinates" });
    }

    // Check cache first
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = geocodeCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Geocoding cache hit: ${cacheKey}`);
      return res.json({
        success: true,
        address: cached.address,
        city: cached.city,
        country: cached.country,
        cached: true,
      });
    }

    // Rate limiting: wait if needed
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest),
      );
    }
    lastRequestTime = Date.now();

    console.log(`🌍 Nominatim reverse geocode: ${latitude}, ${longitude}`);

    // Make request to Nominatim
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
      {
        headers: {
          "User-Agent": "AirportCarpoolApp/1.0",
        },
      },
    );

    if (!response.ok) {
      console.warn(
        `⚠️ Nominatim HTTP ${response.status}, using fallback for ${cacheKey}`,
      );
      const fallback = {
        address: `Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}`,
        city: "Location",
        country: "",
      };

      // Cache the fallback
      geocodeCache.set(cacheKey, {
        ...fallback,
        timestamp: Date.now(),
      });

      return res.json({
        success: true,
        ...fallback,
        fallback: true,
        httpStatus: response.status,
      });
    }

    const data = await response.json();

    if (!data || !data.address) {
      console.warn(`⚠️ Nominatim no address found for ${cacheKey}`);
      const fallback = {
        address: `Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}`,
        city: "Location",
        country: "",
      };

      geocodeCache.set(cacheKey, {
        ...fallback,
        timestamp: Date.now(),
      });

      return res.json({
        success: true,
        ...fallback,
        fallback: true,
        reason: "No address data",
      });
    }

    // Extract address components
    const address = data.address;
    const result = {
      address: data.display_name,
      city:
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        "Location",
      country: address.country || "",
      postcode: address.postcode || "",
    };

    // Cache the result
    geocodeCache.set(cacheKey, {
      ...result,
      timestamp: Date.now(),
    });

    console.log(`✅ Geocoding success for ${cacheKey}`);

    res.json({
      success: true,
      ...result,
      cached: false,
    });
  } catch (error) {
    console.error("❌ Geocoding error:", error.message);

    const latitude = parseFloat(req.query.lat || 0);
    const longitude = parseFloat(req.query.lon || 0);

    // Always return a fallback address on error
    const fallback = {
      address: `Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}`,
      city: "Location",
      country: "",
    };

    res.json({
      success: true,
      ...fallback,
      fallback: true,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/geocoding/cache-stats
 * Get cache statistics (for monitoring)
 */
router.get("/cache-stats", (req, res) => {
  res.json({
    cacheSize: geocodeCache.size,
    cacheEntries: Array.from(geocodeCache.keys()),
  });
});

/**
 * POST /api/v1/geocoding/cache-clear
 * Clear the geocoding cache (admin only - optional)
 */
router.post("/cache-clear", (req, res) => {
  const size = geocodeCache.size;
  geocodeCache.clear();
  res.json({
    success: true,
    message: `Cleared ${size} cache entries`,
  });
});

module.exports = router;
