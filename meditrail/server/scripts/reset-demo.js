require("dotenv").config();

const readline = require("node:readline/promises");
const pool = require("../src/config/db");
const { seedDemoData } = require("./demo-users");

const DATABASE_NAME = "meditrail";
const CONFIRMATION = "RESET MEDTRAIL PATIENTS";
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
  if ((process.env.DB_NAME || DATABASE_NAME) !== DATABASE_NAME) {
    throw new Error("For safety, patient reset is allowed only when DB_NAME is exactly meditrail.");
  }

  const [[database]] = await connection.query("SELECT DATABASE() AS databaseName");
  if (!database || database.databaseName !== DATABASE_NAME) {
    throw new Error("The connected database is not meditrail. No data was changed.");
  }

  const [tableRows] = await connection.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()"
  );
  const tables = new Set(tableRows.map((table) => table.tableName));
  const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
  if (missing.length) {
    throw new Error("MediTrail tables are missing. Run npm run db:init first. No data was changed.");
  }

  // Confirm this script is operating on the expected patient relationships.
  const [foreignKeys] = await connection.query(
    "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, REFERENCED_TABLE_NAME AS referencedTable FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"
  );
  const requiredLinks = [
    ["patients", "user_id", "users"],
    ["consultations", "patient_id", "patients"],
    ["prescriptions", "consultation_id", "consultations"],
    ["prescription_items", "prescription_id", "prescriptions"],
    ["referrals", "patient_id", "patients"],
    ["doctor_patient_access", "patient_id", "patients"],
  ];
  for (const [table, column, referencedTable] of requiredLinks) {
    if (!foreignKeys.some((key) => key.tableName === table && key.columnName === column && key.referencedTable === referencedTable)) {
      throw new Error("Expected MediTrail foreign-key relationships were not found. No data was changed.");
    }
  }
}

async function confirmReset() {
  if (!process.stdin.isTTY) {
    throw new Error("Run demo:reset in an interactive PowerShell terminal so you can confirm. No data was changed.");
  }

  console.log("WARNING: This deletes every PATIENT-role account and its patient profile from the meditrail database.");
  console.log("It also deletes consultations, prescriptions and items, referrals, and doctor-access grants linked to those patients.");
  console.log("Admin and doctor rows are preserved. The fixed prior demo Admin/Doctor rows may be updated to the documented demo login; unrelated accounts stay unchanged. Audit history is retained. No database is dropped or changed.");
  console.log("One synthetic demo patient, sample visit, and assignment will be created after the reset.");
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question("Type " + CONFIRMATION + " to continue: ");
    if (answer.trim() !== CONFIRMATION) {
      throw new Error("Confirmation did not match. No data was changed.");
    }
  } finally {
    prompt.close();
  }
}

function marksFor(rows) {
  return rows.map(() => "?").join(",");
}

async function deletePatientDemoData(connection) {
  const [patientUsers] = await connection.execute(
    "SELECT id FROM users WHERE role = 'PATIENT' FOR UPDATE"
  );
  const patientUserIds = patientUsers.map((row) => row.id);
  if (!patientUserIds.length) return { patients: 0, consultations: 0 };

  const userMarks = marksFor(patientUserIds);
  const [patientRows] = await connection.execute(
    "SELECT id FROM patients WHERE user_id IN (" + userMarks + ") FOR UPDATE",
    patientUserIds
  );
  const patientIds = patientRows.map((row) => row.id);
  let consultationIds = [];
  let prescriptionIds = [];

  if (patientIds.length) {
    const patientMarks = marksFor(patientIds);
    const [consultations] = await connection.execute(
      "SELECT id FROM consultations WHERE patient_id IN (" + patientMarks + ") FOR UPDATE",
      patientIds
    );
    consultationIds = consultations.map((row) => row.id);

    if (consultationIds.length) {
      const consultationMarks = marksFor(consultationIds);
      const [prescriptions] = await connection.execute(
        "SELECT id FROM prescriptions WHERE consultation_id IN (" + consultationMarks + ") FOR UPDATE",
        consultationIds
      );
      prescriptionIds = prescriptions.map((row) => row.id);
      if (prescriptionIds.length) {
        const prescriptionMarks = marksFor(prescriptionIds);
        await connection.execute(
          "DELETE FROM prescription_items WHERE prescription_id IN (" + prescriptionMarks + ")",
          prescriptionIds
        );
        await connection.execute(
          "DELETE FROM prescriptions WHERE id IN (" + prescriptionMarks + ")",
          prescriptionIds
        );
      }
      const consultationMarksAgain = marksFor(consultationIds);
      await connection.execute(
        "DELETE FROM referrals WHERE patient_id IN (" + patientMarks + ") OR consultation_id IN (" + consultationMarksAgain + ")",
        [...patientIds, ...consultationIds]
      );
    } else {
      await connection.execute(
        "DELETE FROM referrals WHERE patient_id IN (" + patientMarks + ")",
        patientIds
      );
    }

    await connection.execute(
      "DELETE FROM doctor_patient_access WHERE patient_id IN (" + patientMarks + ")",
      patientIds
    );
    await connection.execute(
      "DELETE FROM consultations WHERE patient_id IN (" + patientMarks + ")",
      patientIds
    );
    await connection.execute(
      "DELETE FROM patients WHERE id IN (" + patientMarks + ")",
      patientIds
    );
  }

  await connection.execute(
    "DELETE FROM users WHERE id IN (" + userMarks + ")",
    patientUserIds
  );
  return { patients: patientIds.length, consultations: consultationIds.length };
}

async function resetDemoData() {
  let connection;
  try {
    connection = await pool.getConnection();
    await verifyDatabase(connection);
    await confirmReset();

    await connection.beginTransaction();
    const removed = await deletePatientDemoData(connection);
    const seeded = await seedDemoData(connection);
    await connection.commit();
    console.log("Patient demo data was reset successfully in meditrail.");
    console.log("Removed patient profiles:", removed.patients);
    console.log("Removed consultations:", removed.consultations);
    console.log("Created demo patient code:", seeded.patientCode);
    console.log("The demo admin login is sunnysaini@gmail.com. The password is listed in README.md.");
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error("Patient demo reset stopped:", error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

resetDemoData();
