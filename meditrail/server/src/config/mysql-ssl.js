const net = require("node:net");

function getMysqlSslOptions(env = process.env) {
  const sslFlag = String(env.DB_SSL || "").trim().toLowerCase();
  if (sslFlag && sslFlag !== "true" && sslFlag !== "false") {
    throw new Error("DB_SSL must be set to true or false.");
  }

  const isProduction = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  if (isProduction && sslFlag !== "true") {
    throw new Error("DB_SSL=true is required for production database connections.");
  }
  if (sslFlag !== "true") return undefined;

  const host = String(env.DB_HOST || "").trim();
  if (!host || net.isIP(host)) {
    throw new Error("DB_HOST must be the database DNS hostname when TLS identity verification is enabled.");
  }

  const ca = String(env.DB_SSL_CA || "").replace(/\\n/g, "\n").trim();
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new Error("DB_SSL_CA must contain the database provider's PEM CA certificate.");
  }

  return {
    ca,
    rejectUnauthorized: true,
    verifyIdentity: true,
    minVersion: "TLSv1.2",
  };
}

module.exports = { getMysqlSslOptions };
