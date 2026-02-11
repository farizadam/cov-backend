const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { connectDB } = require("../config/database");
const Airport = require("../models/Airport");

/**
 * Seed airports with French airports data
 */
async function seedAirports() {
  try {
    await connectDB();
    console.log("🌱 Seeding airports...");

    const airports = [
      {
        name: "Paris Charles de Gaulle",
        iata_code: "CDG",
        city: "Paris",
        country: "France",
        latitude: 49.0097,
        longitude: 2.5479,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Paris Orly",
        iata_code: "ORY",
        city: "Paris",
        country: "France",
        latitude: 48.7262,
        longitude: 2.3652,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Nice Côte d'Azur",
        iata_code: "NCE",
        city: "Nice",
        country: "France",
        latitude: 43.6584,
        longitude: 7.2159,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Lyon Saint-Exupéry",
        iata_code: "LYS",
        city: "Lyon",
        country: "France",
        latitude: 45.7256,
        longitude: 5.0811,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Marseille Provence",
        iata_code: "MRS",
        city: "Marseille",
        country: "France",
        latitude: 43.4393,
        longitude: 5.2214,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Toulouse-Blagnac",
        iata_code: "TLS",
        city: "Toulouse",
        country: "France",
        latitude: 43.629,
        longitude: 1.3638,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Paris Beauvais-Tillé",
        iata_code: "BVA",
        city: "Beauvais",
        country: "France",
        latitude: 49.4544,
        longitude: 2.1128,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Bordeaux-Mérignac",
        iata_code: "BOD",
        city: "Bordeaux",
        country: "France",
        latitude: 44.8283,
        longitude: -0.7156,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Nantes Atlantique",
        iata_code: "NTE",
        city: "Nantes",
        country: "France",
        latitude: 47.1532,
        longitude: -1.6107,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Strasbourg",
        iata_code: "SXB",
        city: "Strasbourg",
        country: "France",
        latitude: 48.5383,
        longitude: 7.6282,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Lille-Lesquin",
        iata_code: "LIL",
        city: "Lille",
        country: "France",
        latitude: 50.5617,
        longitude: 3.0894,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Montpellier-Méditerranée",
        iata_code: "MPL",
        city: "Montpellier",
        country: "France",
        latitude: 43.5762,
        longitude: 3.963,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Rennes–Saint-Jacques",
        iata_code: "RNS",
        city: "Rennes",
        country: "France",
        latitude: 48.0695,
        longitude: -1.7348,
        timezone: "Europe/Paris",
        is_active: true,
      },
      {
        name: "Bâle-Mulhouse",
        iata_code: "BSL",
        city: "Mulhouse",
        country: "France",
        latitude: 47.599,
        longitude: 7.5291,
        timezone: "Europe/Paris",
        is_active: true,
      },
    ];

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const airportData of airports) {
      try {
        // Check if already exists
        const existing = await Airport.findOne({
          iata_code: airportData.iata_code,
        });

        if (existing) {
          // Update with coordinates if missing
          if (!existing.latitude || !existing.longitude) {
            await Airport.updateOne(
              { _id: existing._id },
              {
                latitude: airportData.latitude,
                longitude: airportData.longitude,
              }
            );
            console.log(
              `  🔄 Updated ${airportData.iata_code} with coordinates`
            );
            updated++;
          } else {
            console.log(
              `  ⏭️  ${airportData.iata_code} already exists, skipping...`
            );
            skipped++;
          }
        } else {
          await Airport.create(airportData);
          console.log(
            `  ✅ Created ${airportData.name} (${airportData.iata_code})`
          );
          created++;
        }
      } catch (error) {
        console.error(
          `  ❌ Error creating ${airportData.iata_code}:`,
          error.message
        );
      }
    }

    console.log(
      `\n✅ Seeding complete! Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedAirports();
