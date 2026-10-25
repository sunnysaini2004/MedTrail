const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const {
  DEMO_ACCOUNTS,
  DEMO_PATIENT_CODE,
  seedDemoData,
} = require("./scripts/demo-users");
const { isGmailAddress } = require("./src/modules/auth/email-validation");

async function runDemoSeedChecks() {
  function makeConnection(adminRows = [], { legacyDemoRecords = false } = {}) {
    const calls = [];
    let nextId = 10;
    return {
      calls,
      async execute(sql, values = []) {
        calls.push({ sql, values });
        if (sql.includes("WHERE email = ? AND role = 'ADMIN'")) {
          return [adminRows.filter((row) => row.email === values[0])];
        }
        if (sql.includes("WHERE role = 'ADMIN'")) return [adminRows];
        if (legacyDemoRecords && sql.includes("WHERE p.patient_code = ?")) {
          return [[{ patientId: 78, userId: 79, role: "PATIENT" }]];
        }
        if (legacyDemoRecords && sql.includes("WHERE d.registration_number = ?")) {
          return [[{ doctorId: 80, userId: 81 }]];
        }
        if (sql.startsWith("SELECT")) return [[]];
        return [{ insertId: ++nextId }];
      },
    };
  }

  const connection = makeConnection();
  const calls = connection.calls;

  const result = await seedDemoData(connection);
  assert.equal(result.patientCode, DEMO_PATIENT_CODE);

  const userInserts = calls.filter(({ sql }) => sql.startsWith("INSERT INTO users"));
  assert.equal(userInserts.length, 3, "the seed should create one account for each role");
  const expectedByRole = {
    ADMIN: DEMO_ACCOUNTS.admin,
    PATIENT: DEMO_ACCOUNTS.patient,
    DOCTOR: DEMO_ACCOUNTS.doctor,
  };

  for (const { sql, values } of userInserts) {
    const role = sql.match(/'([A-Z]+)'\)$/)?.[1];
    assert.ok(expectedByRole[role], "the seed should use an expected role");
    const account = expectedByRole[role];
    assert.equal(values[1], account.email);
    assert.notEqual(values[2], account.password, "the seed must not store a plain-text password");
    assert.equal(await bcrypt.compare(account.password, values[2]), true);
  }

  assert.equal(DEMO_ACCOUNTS.admin.email, "sunnysaini@gmail.com");
  assert.equal(DEMO_ACCOUNTS.admin.password, "sunny123");
  assert.equal(isGmailAddress("sunny@gmail.com"), true);
  assert.equal(isGmailAddress("doctor123@gmail.com"), true);
  assert.equal(isGmailAddress("sunny@example.com"), false);
  assert.equal(isGmailAddress("@gmail.com"), false);
  assert.equal(isGmailAddress("sunny..saini@gmail.com"), false);

  for (const table of ["patients", "doctors", "doctor_patient_access", "consultations", "prescriptions", "prescription_items"]) {
    assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO " + table)), "the seed should add demo data to " + table);
  }

  const existingAdminConnection = makeConnection([{ id: 77 }]);
  await seedDemoData(existingAdminConnection);
  assert.equal(existingAdminConnection.calls.filter(({ sql }) => sql.startsWith("INSERT INTO users") && sql.includes("'ADMIN'")).length, 0, "an existing admin row should be reused");
  const adminUpdate = existingAdminConnection.calls.find(({ sql }) => sql.startsWith("UPDATE users SET full_name = ?, email = ?"));
  assert.ok(adminUpdate, "the existing admin should be configured for the local demo");
  assert.equal(adminUpdate.values[1], "sunnysaini@gmail.com");
  assert.equal(await bcrypt.compare("sunny123", adminUpdate.values[2]), true, "the configured admin password should be hashed");

  const legacyAdminConnection = makeConnection([
    { id: 76, email: "admin@meditrail.test" },
    { id: 77, email: "existing-admin@gmail.com" },
  ], { legacyDemoRecords: true });
  await seedDemoData(legacyAdminConnection);
  const legacyAdminUpdate = legacyAdminConnection.calls.find(({ sql }) => sql.startsWith("UPDATE users SET full_name = ?, email = ?"));
  assert.equal(legacyAdminUpdate.values[3], 76, "multiple admins should reuse the unique known legacy demo admin instead of taking over an unrelated account");
  assert.equal(legacyAdminConnection.calls.filter(({ sql }) => sql.startsWith("INSERT INTO users") && sql.includes("'ADMIN'")).length, 0);
  assert.equal(legacyAdminConnection.calls.some(({ sql, values }) => sql.startsWith("UPDATE users SET full_name = ?, email = ?, password_hash = ?, is_active = TRUE WHERE id = ?") && values[1] === DEMO_ACCOUNTS.patient.email), true, "the prior demo patient should be reused and configured");
  assert.equal(legacyAdminConnection.calls.some(({ sql, values }) => sql.startsWith("UPDATE users SET full_name = ?, email = ?, password_hash = ?, is_active = TRUE WHERE id = ?") && values[1] === DEMO_ACCOUNTS.doctor.email), true, "the prior demo doctor should be reused and configured");
  assert.equal(legacyAdminConnection.calls.some(({ sql }) => sql.startsWith("INSERT INTO patients") || sql.startsWith("INSERT INTO doctors")), false, "legacy demo profiles should not be duplicated");

  await assert.rejects(
    () => seedDemoData(makeConnection([{ id: 1, email: "first@gmail.com" }, { id: 2, email: "second@gmail.com" }])),
    /More than one administrator exists/,
    "the seed should refuse to take over an arbitrary existing administrator"
  );

  const { getRoleHomePath, getRoleLoginPath, canRoleAccessPath } = await import("../client/src/lib/roleRoutes.js");
  for (const [role, path] of [["PATIENT", "/dashboard"], ["DOCTOR", "/doctor"], ["ADMIN", "/admin"]]) {
    assert.equal(getRoleHomePath(role), path, role + " should land on its own dashboard");
    assert.equal(getRoleLoginPath(role), "/login/" + role.toLowerCase(), role + " should have its own login option");
    assert.equal(canRoleAccessPath(role, path), true);
    assert.equal(canRoleAccessPath(role, "/admin"), role === "ADMIN", role + " must not be redirected to another role's dashboard");
  }

  console.log("Demo checks passed: Gmail validation, admin setup without duplicates, bcrypt hashes, assigned patient, sample visit, and role destinations.");
}

runDemoSeedChecks().catch((error) => {
  console.error("Demo seed checks failed:", error.message);
  process.exitCode = 1;
});
