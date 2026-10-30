const assert = require("node:assert/strict");
const { getMysqlSslOptions } = require("./src/config/mysql-ssl");

const certificate = "-----BEGIN CERTIFICATE-----\nexample-ca-data\n-----END CERTIFICATE-----";

assert.equal(
  getMysqlSslOptions({ NODE_ENV: "development", DB_SSL: "false" }),
  undefined,
  "local MySQL TLS remains optional by default"
);

assert.throws(
  () => getMysqlSslOptions({ NODE_ENV: "production", DB_SSL: "false" }),
  /DB_SSL=true is required/,
  "production must not start without database TLS"
);

assert.throws(
  () => getMysqlSslOptions({ NODE_ENV: "production", DB_SSL: "true", DB_HOST: "mysql.example.test" }),
  /DB_SSL_CA must contain/,
  "TLS must fail closed if its trusted CA is missing"
);

const ssl = getMysqlSslOptions({
  NODE_ENV: "production",
  DB_SSL: "true",
  DB_HOST: "mysql.example.test",
  DB_SSL_CA: certificate.replace(/\n/g, "\\n"),
});
assert.equal(ssl.ca, certificate, "escaped PEM newlines should be restored");
assert.equal(ssl.rejectUnauthorized, true, "certificate-chain verification must stay enabled");
assert.equal(ssl.verifyIdentity, true, "database hostname verification must stay enabled");
assert.equal(ssl.minVersion, "TLSv1.2");

assert.throws(
  () => getMysqlSslOptions({ NODE_ENV: "production", DB_SSL: "true", DB_HOST: "192.0.2.1", DB_SSL_CA: certificate }),
  /DNS hostname/,
  "TLS identity verification requires a hostname instead of a raw IP"
);

console.log("Database TLS configuration checks passed: local opt-out, production fail-closed, CA validation, hostname verification, and TLS 1.2 minimum.");
