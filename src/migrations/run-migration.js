const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

async function runMigration() {
  try {
    console.log("🔄 Starting database migration...");

    const migrationFile = path.join(__dirname, "001_create_tables.sql");
    const sql = fs.readFileSync(migrationFile, "utf8");

    await pool.query(sql);

    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
