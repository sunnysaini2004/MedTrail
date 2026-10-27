require("dotenv").config();

const pool = require("../src/config/db");

const DATABASE_NAME = "meditrail";
const NEW_COLUMNS = [
  ["must_change_password", "BOOLEAN NOT NULL DEFAULT FALSE"],
  ["session_version", "INT UNSIGNED NOT NULL DEFAULT 0"],
];

async function applyAccountRecoveryMigration() {
  if ((process.env.DB_NAME || DATABASE_NAME) !== DATABASE_NAME) {
    throw new Error("For safety, this migration only runs when DB_NAME is meditrail.");
  }

  const [[database]] = await pool.query("SELECT DATABASE() AS databaseName");
  if (!database || database.databaseName !== DATABASE_NAME) {
    throw new Error("The connected database is not meditrail. No changes were made.");
  }

  const [tables] = await pool.execute(
    "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    ["users"]
  );
  if (!tables.length) {
    throw new Error("The users table was not found. Run npm run db:init first.");
  }

  const [existingColumns] = await pool.execute(
    "SELECT COLUMN_NAME AS columnName FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    ["users"]
  );
  const columns = new Set(existingColumns.map((column) => column.columnName));
  const addedColumns = [];

  for (const [columnName, definition] of NEW_COLUMNS) {
    if (columns.has(columnName)) continue;
    // Identifiers and definitions come only from the constants above.
    await pool.query("ALTER TABLE users ADD COLUMN " + columnName + " " + definition);
    addedColumns.push(columnName);
  }

  console.log(
    addedColumns.length
      ? "Added account-recovery columns to meditrail.users: " + addedColumns.join(", ")
      : "Account-recovery columns already exist; no schema changes were needed."
  );
}

applyAccountRecoveryMigration()
  .catch((error) => {
    console.error("Account-recovery migration stopped:", error.code || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
