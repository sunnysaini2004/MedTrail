require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../src/config/db");

const DATABASE_NAME = "meditrail";

async function applyHospitalSettingsMigration() {
  if ((process.env.DB_NAME || DATABASE_NAME) !== DATABASE_NAME) {
    throw new Error("For safety, this migration only runs when DB_NAME is meditrail.");
  }

  const [[database]] = await pool.query("SELECT DATABASE() AS databaseName");
  if (!database || database.databaseName !== DATABASE_NAME) {
    throw new Error("The connected database is not meditrail. No changes were made.");
  }

  const [tables] = await pool.execute(
    "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    ["patients"]
  );
  if (!tables.length) {
    throw new Error("The patients table was not found. Run npm run db:init first.");
  }

  const [columns] = await pool.execute(
    "SELECT DATA_TYPE AS dataType, CHARACTER_MAXIMUM_LENGTH AS maxLength FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'blood_group'"
  );
  if (!columns.length) {
    await pool.query("ALTER TABLE patients ADD COLUMN blood_group VARCHAR(20) NULL");
    console.log("Added nullable blood_group column to meditrail.patients.");
  } else if (["varchar", "char"].includes(String(columns[0].dataType).toLowerCase()) && Number(columns[0].maxLength) < 20) {
    await pool.query("ALTER TABLE patients MODIFY COLUMN blood_group VARCHAR(20) NULL");
    console.log("Widened meditrail.patients.blood_group to nullable VARCHAR(20); existing values were preserved.");
  } else if (!["varchar", "char"].includes(String(columns[0].dataType).toLowerCase())) {
    throw new Error("patients.blood_group has an unexpected data type. No column changes were made.");
  }

  const sqlPath = path.join(__dirname, "../../database/migrations/002_hospital_settings.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  console.log("Hospital settings table is ready in meditrail.");
}

applyHospitalSettingsMigration()
  .catch((error) => {
    console.error("Hospital-settings migration stopped:", error.code || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
