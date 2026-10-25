
require("dotenv").config();

const pool = require("./src/config/db");

async function testDatabaseConnection() {
  try {
    const [rows] = await pool.query(
      "SELECT DATABASE() AS databaseName, VERSION() AS mysqlVersion"
    );

    console.log("MySQL connection successful!");
    console.log("Database:", rows[0].databaseName);
    console.log("MySQL version:", rows[0].mysqlVersion);
  } catch (error) {
    console.error("MySQL connection failed:", error.code || error.name);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testDatabaseConnection();
