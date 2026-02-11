const Airport = require("../models/Airport");

class AirportController {
  /**
   * Get all airports (with search and geo-location)
   * GET /api/v1/airports
   */
  static async getAll(req, res, next) {
    try {
      const { country, q, latitude, longitude, radius = 200000 } = req.query; // Default radius 200km

      const filter = { is_active: true };

      // Text Search using MongoDB text index
      if (q) {
        filter.$text = { $search: q };
      }

      // Geospatial Search
      if (latitude && longitude) {
        filter.location = {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            $maxDistance: parseInt(radius),
          },
        };
      }

      if (country) {
        filter.country = country;
      }

      // Determine limit - return all airports by default (there are ~1070 EU airports)
      // A client can pass ?limit=50 to reduce, but the dropdown/map needs all of them
      const requestedLimit = req.query.limit ? parseInt(req.query.limit) : null;
      const limit = requestedLimit || 2000;

      // Also ensure airports have valid coordinates for map display
      // Skip this filter when doing geospatial search (already ensures valid location)
      if (!q && !country && !(latitude && longitude)) {
        filter.latitude = { $ne: null };
        filter.longitude = { $ne: null };
      }

      let query = Airport.find(filter).limit(limit);

      // Add text score sorting if text search was used
      if (q) {
        query = query
          .select({ score: { $meta: "textScore" } })
          .sort({ score: { $meta: "textScore" } });
      } else {
        query = query.sort({ name: 1 });
      }

      const airports = await query;

      res.status(200).json({
        success: true,
        data: airports,
        count: airports.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get airport by ID
   * GET /api/v1/airports/:id
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const airport = await Airport.findById(id);

      if (!airport) {
        return res.status(404).json({
          success: false,
          message: "Airport not found",
        });
      }

      res.status(200).json({
        success: true,
        data: airport,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AirportController;
