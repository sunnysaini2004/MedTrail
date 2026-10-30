const assert = require("node:assert/strict");
const http = require("node:http");

const testSecret = "synthetic-db-health-test-secret";
process.env.DB_HEALTH_SECRET = testSecret;

const app = require("./src/app");
const pool = require("./src/config/db");

async function runDbHealthTest() {
  const originalQuery = pool.query;
  const queries = [];
  let simulateDatabaseFailure = false;
  pool.query = async (sql) => {
    queries.push(sql);
    if (simulateDatabaseFailure) {
      throw new Error("synthetic hostname, SQL, and driver details must not be returned");
    }
    return [[{ 1: 1 }]];
  };

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  function request(headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path: "/api/db-health",
          method: "GET",
          headers,
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  try {
    const unauthorized = await request();
    assert.equal(unauthorized.status, 401);
    assert.equal(queries.length, 0, "unauthorized requests must not query MySQL");

    const wrongSecret = await request({ "x-health-check-secret": "incorrect-test-secret" });
    assert.equal(wrongSecret.status, 401);
    assert.equal(queries.length, 0, "incorrect secrets must not query MySQL");

    const success = await request({ "x-health-check-secret": testSecret });
    assert.equal(success.status, 200);
    assert.deepEqual(success.body, { success: true, database: "available" });
    assert.deepEqual(queries, ["SELECT 1"]);

    simulateDatabaseFailure = true;
    const failure = await request({ "x-health-check-secret": testSecret });
    assert.equal(failure.status, 503);
    assert.deepEqual(failure.body, { success: false, message: "Database check failed." });
    assert.equal(JSON.stringify(failure.body).includes("synthetic"), false);
    assert.equal(JSON.stringify(failure.body).includes(testSecret), false);

    console.log("DB health endpoint checks passed: secret required, SELECT 1 success, and generic database failure.");
  } finally {
    pool.query = originalQuery;
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

runDbHealthTest().catch((error) => {
  console.error("DB health endpoint test failed:", error.message);
  process.exitCode = 1;
});
