require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { getMysqlSslOptions } = require("../src/config/mysql-ssl");

const DATABASE_NAME = "meditrail";

async function initializeDatabase() {
  const configuredDatabase = process.env.DB_NAME || DATABASE_NAME;
  if (configuredDatabase !== DATABASE_NAME) {
    throw new Error("For safety, db:init only creates the MediTrail database named meditrail. Set DB_NAME=meditrail in server/.env.");
  }

  const schemaPath = path.resolve(__dirname, "../../database/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    ssl: getMysqlSslOptions(),
    multipleStatements: true,
  });

  try {
    await connection.query(schema);
    const [[row]] = await connection.query("SELECT DATABASE() AS databaseName");
    if (!row || row.databaseName !== DATABASE_NAME) {
      throw new Error("Schema initialization did not finish in the meditrail database.");
    }
    console.log("MediTrail database and tables are ready. Existing rows were preserved.");
  } finally {
    await connection.end();
  }
}

initializeDatabase().catch((error) => {
  console.error("Database setup failed:", error.code || error.message);
  console.error("Check that MySQL is running and server/.env has the correct local DB_HOST, DB_PORT, DB_USER, and DB_PASSWORD.");
  process.exitCode = 1;
});
