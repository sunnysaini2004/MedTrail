require("dotenv").config();

const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
}

const app = require("./src/app");
const pool = require("./src/config/db");

async function runAuthSmokeTest() {
  const testEmail = "meditrail-" + randomUUID() + "@gmail.com";
  const testPassword = randomBytes(18).toString("base64url") + "Aa1!";
  const testAccount = {
    fullName: "Synthetic MediTrail Test",
    email: testEmail,
    phone: "+91 90000 00000",
    password: testPassword,
    confirmPassword: testPassword,
    role: "ADMIN",
  };

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const baseUrl = "http://127.0.0.1:" + server.address().port;
  async function request(path, options) {
    const response = await fetch(baseUrl + path, options);
    let body = {};
    try {
      body = await response.json();
    } catch {
      // Some successful responses, such as CORS preflight, have no body.
    }
    return { response, body };
  }

  try {
    const health = await request("/api/health");
    assert.equal(health.response.status, 200, "health endpoint should remain available");

    const preflight = await request("/api/v1/auth/register", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(preflight.response.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(preflight.response.headers.get("access-control-allow-credentials"), "true");

    const invalid = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...testAccount, password: "abc", confirmPassword: "abc" }),
    });
    assert.equal(invalid.response.status, 400, "short passwords should be rejected");

    const invalidDomain = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...testAccount, email: testEmail.replace("@gmail.com", "@example.com") }),
    });
    assert.equal(invalidDomain.response.status, 400, "registration should only accept Gmail addresses");

    const registered = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testAccount),
    });
    assert.equal(registered.response.status, 201, "valid synthetic patient registration should succeed");
    assert.equal(registered.body.user.role, "PATIENT", "public registration must not grant a requested role");
    assert.match(registered.body.user.patientCode, /^MT-[A-F0-9]{24}$/);
    assert.match(registered.response.headers.get("set-cookie") || "", /HttpOnly/i);
    const userId = registered.body.user.id;

    const [savedRows] = await pool.execute(
      "SELECT u.password_hash, u.role, p.patient_code FROM users u JOIN patients p ON p.user_id = u.id WHERE u.id = ?",
      [userId]
    );
    assert.equal(savedRows.length, 1, "registration should create both account and patient profile");
    assert.notEqual(savedRows[0].password_hash, testPassword, "password must not be stored as plain text");
    assert.equal(savedRows[0].role, "PATIENT");

    const duplicate = await request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testAccount),
    });
    assert.equal(duplicate.response.status, 409, "duplicate email should be rejected");

    const badLogin = await request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "incorrect-password", role: "PATIENT" }),
    });
    assert.equal(badLogin.response.status, 401, "incorrect password should not authenticate");

    const wrongRole = await request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword, role: "ADMIN" }),
    });
    assert.equal(wrongRole.response.status, 401, "a patient must not log in through another role option");

    const loggedIn = await request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword, role: "PATIENT" }),
    });
    assert.equal(loggedIn.response.status, 200, "valid credentials should authenticate");
    const cookie = (loggedIn.response.headers.get("set-cookie") || "").split(";")[0];
    assert.match(cookie, /^meditrail_token=/);

    const currentUser = await request("/api/v1/auth/me", { headers: { Cookie: cookie } });
    assert.equal(currentUser.response.status, 200, "the signed cookie should authorize /me");
    assert.equal(currentUser.body.user.id, String(userId));

    const dashboard = await request("/api/v1/patient/dashboard", { headers: { Cookie: cookie } });
    assert.equal(dashboard.response.status, 200, "a patient should load their own dashboard");
    assert.equal(dashboard.body.patient.patientCode, registered.body.user.patientCode);
    assert.deepEqual(dashboard.body.summary, {
      consultationCount: 0,
      prescriptionCount: 0,
      referralCount: 0,
      pendingReferralCount: 0,
    });

    const anonymous = await request("/api/v1/auth/me");
    assert.equal(anonymous.response.status, 401, "private account route should reject anonymous requests");
    const anonymousDashboard = await request("/api/v1/patient/dashboard");
    assert.equal(anonymousDashboard.response.status, 401, "patient dashboard should reject anonymous requests");

    console.log("Auth and dashboard smoke checks passed: registration, validation, duplicate email, role restriction, password hash, login, cookie session, /me access, dashboard data, and anonymous access rejection.");
  } finally {
    const [testUsers] = await pool.execute("SELECT id FROM users WHERE email = ?", [testEmail]);
    if (testUsers.length > 0) {
      const testUserId = testUsers[0].id;
      await pool.execute("DELETE FROM patients WHERE user_id = ?", [testUserId]);
      await pool.execute("DELETE FROM audit_logs WHERE user_id = ?", [testUserId]);
      await pool.execute("DELETE FROM users WHERE id = ?", [testUserId]);
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

runAuthSmokeTest().catch((error) => {
  console.error("Auth smoke checks failed:", error.message);
  process.exitCode = 1;
});
