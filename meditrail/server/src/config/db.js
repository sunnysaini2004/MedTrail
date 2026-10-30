
const mysql = require("mysql2/promise");
const { getMysqlSslOptions } = require("./mysql-ssl");

const connectionLimit = process.env.DB_CONNECTION_LIMIT
  ? Number(process.env.DB_CONNECTION_LIMIT)
  : 3;

if (!Number.isSafeInteger(connectionLimit) || connectionLimit < 1) {
  throw new Error("DB_CONNECTION_LIMIT must be a positive integer.");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "meditrail",
  ssl: getMysqlSslOptions(),
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
});

module.exports = pool;
