require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/db");

async function applyMigration() {
  const migrationPath = path.resolve(
    __dirname,
    "../../database/migrations/001_doctor_patient_access.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  try {
    await pool.query(sql);
    console.log("Applied additive migration 001_doctor_patient_access.sql.");
  } catch (error) {
    console.error("Migration failed:", error.code || "database error");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

applyMigration();
