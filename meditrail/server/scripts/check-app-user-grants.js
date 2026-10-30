const net = require("node:net");
const mysql = require("mysql2/promise");
const { getMysqlSslOptions } = require("../src/config/mysql-ssl");

const env = process.env;
const GRANTS_SQL = "SHOW GRANTS FOR 'meditrail_app'@'%';";
const APP_DATABASE_PRIVILEGES = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
const ADMIN_PRIVILEGES = /\b(ALL PRIVILEGES|GRANT OPTION|CREATE USER|ROLE_ADMIN|SUPER|SYSTEM_USER|SESSION_ADMIN|SYSTEM_VARIABLES_ADMIN|PERSIST_RO_VARIABLES_ADMIN|CONNECTION_ADMIN|BACKUP_ADMIN|BINLOG_ADMIN|REPLICATION_SLAVE_ADMIN|RELOAD|SHUTDOWN|FILE)\b/i;

function failSafe(message) {
  const error = new Error(message);
  error.safeToDisplay = true;
  throw error;
}

function validateConfiguration() {
  const required = [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DB_SSL",
    "DB_SSL_CA",
  ];
  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    failSafe("Missing environment variable(s): " + missing.join(", "));
  }

  const host = env.DB_HOST.trim();
  const normalizedHost = host.toLowerCase();
  if (
    !normalizedHost.endsWith(".aivencloud.com") ||
    net.isIP(host) ||
    ["localhost", "127.0.0.1", "::1"].includes(normalizedHost)
  ) {
    failSafe("DB_HOST must be the Aiven MySQL DNS hostname; refusing other hosts.");
  }
  if (!Number.isInteger(Number(env.DB_PORT)) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535) {
    failSafe("DB_PORT must be a valid TCP port number.");
  }
  if (env.DB_NAME !== "meditrail") {
    failSafe("DB_NAME must be meditrail; refusing to connect to another database.");
  }
  if (env.DB_USER !== "avnadmin") {
    failSafe("DB_USER must be avnadmin for this grants inspection.");
  }
  if (String(env.DB_SSL).trim().toLowerCase() !== "true") {
    failSafe("DB_SSL must be true; refusing an unencrypted connection.");
  }
  if (
    !env.DB_SSL_CA.includes("-----BEGIN CERTIFICATE-----") ||
    !env.DB_SSL_CA.includes("-----END CERTIFICATE-----")
  ) {
    failSafe("DB_SSL_CA must contain the Aiven CA certificate in PEM format.");
  }

  return { host, port: Number(env.DB_PORT) };
}

function assessGrants(grantLines) {
  const usageOnly = /^\s*GRANT\s+USAGE\s+ON\s+\*\.\*/i;
  const effectiveGrants = grantLines.filter((line) => !usageOnly.test(line));
  const administrativePrivilegesDetected = grantLines.some((line) => ADMIN_PRIVILEGES.test(line));
  const globalPrivilegesDetected = effectiveGrants.some((line) => /\bON\s+\*\.\*/i.test(line));
  const parsedDatabaseGrants = [];
  const unrecognizedGrants = [];

  for (const line of effectiveGrants) {
    const match = line.match(/^\s*GRANT\s+(.+?)\s+ON\s+`?([A-Za-z0-9_]+)`?\.\*\s+TO\s+/i);
    if (!match) {
      unrecognizedGrants.push(line);
      continue;
    }

    const privileges = match[1]
      .split(",")
      .map((privilege) => privilege.trim().toUpperCase());
    parsedDatabaseGrants.push({ database: match[2], privileges });
  }

  const onlyMediatrailDml =
    !administrativePrivilegesDetected &&
    !globalPrivilegesDetected &&
    unrecognizedGrants.length === 0 &&
    parsedDatabaseGrants.length > 0 &&
    parsedDatabaseGrants.every((grant) =>
      grant.database.toLowerCase() === "meditrail" &&
      grant.privileges.every((privilege) => APP_DATABASE_PRIVILEGES.has(privilege))
    );

  let assessment;
  if (administrativePrivilegesDetected) {
    assessment = "Administrative privilege detected; this account is not restricted as intended.";
  } else if (globalPrivilegesDetected) {
    assessment = "Global privileges detected; this account is not limited to meditrail.";
  } else if (onlyMediatrailDml) {
    const granted = new Set(parsedDatabaseGrants.flatMap((grant) => grant.privileges));
    const missing = [...APP_DATABASE_PRIVILEGES].filter((privilege) => !granted.has(privilege));
    assessment = missing.length
      ? "Privileges are limited to meditrail, but expected DML privilege(s) are missing: " + missing.join(", ") + "."
      : "Only database-scoped SELECT, INSERT, UPDATE, and DELETE privileges on meditrail were found (plus baseline USAGE, if shown).";
  } else if (effectiveGrants.length === 0) {
    assessment = "No effective privileges beyond baseline USAGE were found.";
  } else {
    assessment = "Could not confirm database-only privileges; inspect the grants or any assigned roles manually.";
  }

  return {
    administrativePrivilegesDetected,
    globalPrivilegesDetected,
    onlyMediatrailDml,
    assessment,
    grants: grantLines,
  };
}

async function inspectAppUserGrants() {
  let connection;
  try {
    const { host, port } = validateConfiguration();
    const ssl = getMysqlSslOptions({ ...env, NODE_ENV: "production" });
    if (!ssl || ssl.rejectUnauthorized !== true || ssl.verifyIdentity !== true) {
      failSafe("Verified MySQL TLS could not be enabled; refusing to connect.");
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

    const [rows] = await connection.query(GRANTS_SQL);
    const grantLines = rows.map((row) => String(Object.values(row)[0]));
    if (!grantLines.length) {
      failSafe("SHOW GRANTS returned no rows for meditrail_app@%; the account host may differ.");
    }

    console.log(JSON.stringify({
      account: "meditrail_app@%",
      ...assessGrants(grantLines),
    }, null, 2));
  } catch (error) {
    if (error.safeToDisplay) {
      console.error(error.message);
    } else if (error.code === "ER_NONEXISTING_GRANT" || error.errno === 1141) {
      console.error("SHOW GRANTS found no meditrail_app@% account. The account may use a different host component.");
      console.error("Use the safe host-identification instructions provided with this script; no other query was run.");
    } else {
      console.error("Read-only grants inspection failed:", error.code || error.name || "database error");
    }
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

inspectAppUserGrants();
