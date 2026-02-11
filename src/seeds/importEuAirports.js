const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Airport = require('../models/Airport');
const { connectDB } = require('../config/database');

// Configuration
const OURAIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const JSON_OUTPUT_FILE = path.join(__dirname, 'eu_airports.json');

// European ISO Country Codes (Broad definition including EU, EFTA, UK, etc.)
const EU_COUNTRIES = new Set([
  'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 
  'DK', 'EE', 'FO', 'FI', 'FR', 'DE', 'GI', 'GR', 'HU', 'IS', 
  'IE', 'IM', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MK', 'MT', 
  'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 
  'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA'
]);

// Airport Types to Keep
const ALLOWED_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport']);

// Helper: Simple CSV Line Parser (Handles quotes)
function parseCSVLine(text) {
  const re_valid = /^\s*(?:'[^']*'|"[^^"]*"|[^,'"]*|(?<=,)\s*)*$/;
  const re_value = /(?!\s*$)\s*(?:'([^']*)'|"([^"]*)"|([^,']*))\s*(?:,|$)/g;
  const a = [];
  text.replace(re_value, (m0, m1, m2, m3) => {
    if (m1 !== undefined) a.push(m1.replace(/\'/g, "'"));
    else if (m2 !== undefined) a.push(m2.replace(/\"/g, '"'));
    else if (m3 !== undefined) a.push(m3);
    return '';
  });
  if (/,\s*$/.test(text)) a.push('');
  return a;
}

async function downloadAndProcessAirports() {
  console.log('🌍 Connecting to database...');
  await connectDB();

  console.log('📥 Downloading airport data from OurAirports...');
  
  try {
    const response = await axios({
      method: 'get',
      url: OURAIRPORTS_URL,
      responseType: 'stream'
    });

    const airportsToSave = [];
    let lineBuffer = '';
    let isHeader = true;
    let headers = [];
    let count = 0;

    // Process stream line by line
    response.data.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // Keep the last partial line

      for (const line of lines) {
        if (!line.trim()) continue;

        const columns = parseCSVLine(line);

        if (isHeader) {
          console.log('CSV Headers:', columns);
          headers = columns.map(h => h.replace(/"/g, '').trim()); // Clean headers
          isHeader = false;
          continue;
        }

        if (count < 1) {
             console.log('First Raw Line:', line);
             console.log('First Parsed Columns:', columns);
        }

        // Map columns (standard OurOurAirports structure)
        // id, ident, type, name, latitude_deg, longitude_deg, elevation_ft, continent, iso_country, iso_region, municipality, scheduled_service, gps_code, iata_code, local_code, home_link, wikipedia_link, keywords
        const data = {};
        headers.forEach((h, i) => data[h] = columns[i]);

        // FILTER 1: Must be in Europe (iso_country)
        if (!EU_COUNTRIES.has(data.iso_country)) {
            if (count < 5) console.log(`Skipping country: ${data.iso_country}`);
            continue;
        }

        // FILTER 2: Must be Large, Medium, or Small
        if (!ALLOWED_TYPES.has(data.type)) {
            if (count < 5) console.log(`Skipping type: ${data.type} for ${data.iso_country}`);
            continue;
        }

        // FILTER 3: Must have an IATA code (we need it for booking)
        if (!data.iata_code || data.iata_code.length !== 3) {
             if (count < 5) console.log(`Skipping no IATA: ${data.name}`);
             continue;
        }
        
        // FILTER 4: Exclude Military/Air Bases
        const nameLower = data.name.toLowerCase();
        if (nameLower.includes('air base') || nameLower.includes('airbase') || nameLower.includes('military')) {
             // console.log(`Skipping military: ${data.name}`);
             continue;
        }

        // Build our Airport Object
        const airportObj = {
          name: data.name,
          iata_code: data.iata_code,
          icao_code: data.gps_code || data.ident,
          type: data.type,
          city: data.municipality || data.name,
          country_code: data.iso_country,
          country: getCountryName(data.iso_country), // Simple helper or just code
          latitude: parseFloat(data.latitude_deg),
          longitude: parseFloat(data.longitude_deg),
          location: {
            type: 'Point',
            coordinates: [parseFloat(data.longitude_deg), parseFloat(data.latitude_deg)]
          },
          aliases: data.keywords ? data.keywords.split(',').map(s => s.trim()) : [],
          timezone: 'Europe/Paris', // Default, difficult to get from CSV perfectly without another mapping
          is_active: true
        };

        airportsToSave.push(airportObj);
        count++;
      }
    });

    response.data.on('end', async () => {
      console.log(`✅ Processed stream. Found ${count} matching European airports.`);
      
      // Save to JSON file for user inspection
      fs.writeFileSync(JSON_OUTPUT_FILE, JSON.stringify(airportsToSave, null, 2));
      console.log(`📂 Saved raw list to: ${JSON_OUTPUT_FILE}`);

      // Save to MongoDB
      console.log('💾 Seeding database...');
      
      // Batch insert/update
      let upsertCount = 0;
      for (const airport of airportsToSave) {
        await Airport.findOneAndUpdate(
          { iata_code: airport.iata_code },
          airport,
          { upsert: true, new: true }
        );
        upsertCount++;
        if (upsertCount % 100 === 0) process.stdout.write('.');
      }
      
      console.log(`\n✨ Successfully seeded ${upsertCount} airports into MongoDB.`);
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Simple country code map (can be expanded)
function getCountryName(code) {
  const map = {
    'FR': 'France', 'DE': 'Germany', 'GB': 'United Kingdom', 'ES': 'Spain',
    'IT': 'Italy', 'PT': 'Portugal', 'NL': 'Netherlands', 'BE': 'Belgium',
    'CH': 'Switzerland', 'AT': 'Austria', 'GR': 'Greece', 'IE': 'Ireland',
    'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark', 'FI': 'Finland',
    'PL': 'Poland', 'CZ': 'Czech Republic', 'HU': 'Hungary', 'RO': 'Romania',
    'HR': 'Croatia', 'TR': 'Turkey', 'MA': 'Morocco'
  };
  return map[code] || code;
}

// Run
downloadAndProcessAirports();
