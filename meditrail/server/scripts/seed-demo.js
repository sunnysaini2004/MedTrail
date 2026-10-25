require("dotenv").config();

const pool = require("../src/config/db");
const { seedDemoData } = require("./demo-users");

const DATABASE_NAME = "meditrail";
const REQUIRED_TABLES = [
  "users",
  "patients",
  "doctors",
  "consultations",
  "prescriptions",
  "prescription_items",
  "referrals",
  "doctor_patient_access",
  "audit_logs",
];

async function verifyDatabase(connection) {
  const configuredDatabase = process.env.DB_NAME || DATABASE_NAME;
  if (configuredDatabase !== DATABASE_NAME) {
    throw new Error("For safety, demo data can only be added to the database named meditrail. Set DB_NAME=meditrail.");
  }

  const [[row]] = await connection.query("SELECT DATABASE() AS databaseName");
  if (!row || row.databaseName !== DATABASE_NAME) {
    throw new Error("The connected database is not meditrail. No demo data was changed.");
  }

  const [tableRows] = await connection.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()"
  );
  const tables = new Set(tableRows.map((table) => table.tableName));
  const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
  if (missing.length) {
    throw new Error("MediTrail tables are missing. Run npm run db:init first.");
  }
}

async function run() {
  let connection;
  try {
    connection = await pool.getConnection();
    await verifyDatabase(connection);
    await connection.beginTransaction();
    const result = await seedDemoData(connection);
    await connection.commit();
    console.log("Synthetic demo accounts and sample records were added to meditrail.");
    console.log("Patient code:", result.patientCode);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error("Demo seed failed:", error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

run();
