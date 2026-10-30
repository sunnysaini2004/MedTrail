const net = require("node:net");
const mysql = require("mysql2/promise");
const { getMysqlSslOptions } = require("../src/config/mysql-ssl");

const env = process.env;

function validateConfiguration() {
  const required = [
    "DB_HOST",
    "DB_PORT",
    "DB_USER",
    "DB_PASSWORD",
    "DB_SSL",
    "DB_SSL_CA",
  ];
  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    throw new Error("Missing required environment variable(s): " + missing.join(", "));
  }

  const host = env.DB_HOST.trim().toLowerCase();
  if (
    !host.endsWith(".aivencloud.com") ||
    net.isIP(host) ||
    ["localhost", "127.0.0.1", "::1"].includes(host)
  ) {
    throw new Error("DB_HOST must be the Aiven MySQL DNS hostname; refusing other hosts.");
  }

  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port number.");
  }
  if (env.DB_NAME !== "meditrail") {
    throw new Error("DB_NAME must be meditrail; refusing to connect to another database.");
  }
  if (String(env.DB_SSL).trim().toLowerCase() !== "true") {
    throw new Error("DB_SSL must be true; refusing an unencrypted connection.");
  }
  if (
    !env.DB_SSL_CA.includes("-----BEGIN CERTIFICATE-----") ||
    !env.DB_SSL_CA.includes("-----END CERTIFICATE-----")
  ) {
    throw new Error("DB_SSL_CA must contain the Aiven CA certificate in PEM format.");
  }

  return { host: env.DB_HOST.trim(), port };
}

async function runReadOnlyPreflight() {
  let connection;
  try {
    const { host, port } = validateConfiguration();
    const ssl = getMysqlSslOptions({ ...env, NODE_ENV: "production" });
    if (!ssl || ssl.rejectUnauthorized !== true || ssl.verifyIdentity !== true) {
      throw new Error("Verified MySQL TLS could not be enabled; refusing to connect.");
    }

    connection = await mysql.createConnection({
      host,
      port,
      database: "meditrail",
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl,
      connectTimeout: 10000,
    });

    const [[identity]] = await connection.query(
      "SELECT DATABASE() AS databaseName, @@hostname AS mysqlHostname, VERSION() AS mysqlVersion, CURRENT_USER() AS connectedUser"
    );
    if (!identity || identity.databaseName !== "meditrail") {
      throw new Error("The connected database was not meditrail; stopping.");
    }

    const [tables] = await connection.query(
      "SELECT TABLE_NAME AS tableName, TABLE_TYPE AS tableType FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
    );

    console.log(JSON.stringify({
      configuredAivenHost: host,
      databaseName: identity.databaseName,
      mysqlHostname: identity.mysqlHostname,
      mysqlVersion: identity.mysqlVersion,
      connectedUser: identity.connectedUser,
      verifiedTlsAndHostname: true,
      empty: tables.length === 0,
      tables,
    }, null, 2));
  } finally {
    if (connection) await connection.end();
  }
}

runReadOnlyPreflight().catch((error) => {
  console.error("Read-only preflight failed:", error.code || error.message || error.name);
  process.exitCode = 1;
});
