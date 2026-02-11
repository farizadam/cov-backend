const axios = require("axios");

class MapService {
  /**
   * Get route between two points using OSRM (Open Source Routing Machine)
   * Free, no API key required.
   * @param {Object} origin { lat, lng }
   * @param {Object} destination { lat, lng }
   * @returns {Object} GeoJSON LineString { type: 'LineString', coordinates: [[lng, lat], ...] }
   */
  static async getRoute(origin, destination) {
    try {
      // OSRM requires coordinates in "lng,lat" format
      const url = `http://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
      
      console.log("🗺️ Fetching route from OSRM...");
      const response = await axios.get(url);

      if (response.data && response.data.routes && response.data.routes.length > 0) {
        // OSRM returns the geometry directly in GeoJSON format!
        return response.data.routes[0].geometry;
      }
      
      throw new Error("No route found from OSRM");
    } catch (error) {
      console.error("⚠️ MapService Error:", error.message);
      console.log("⚠️ Falling back to straight line calculation.");
      // Fallback to straight line if API fails
      return this.getStraightLine(origin, destination);
    }
  }

  static getStraightLine(origin, destination) {
    return {
      type: "LineString",
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
    };
  }
}

module.exports = MapService;
