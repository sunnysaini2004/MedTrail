const { randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { writeAudit } = require("../audit/audit.service");

async function createPatientAccount(connection, {
  fullName,
  email,
  password,
  phone,
  bloodGroup = null,
  actorUserId,
  auditAction = "PATIENT_REGISTERED",
}) {
  const passwordHash = await bcrypt.hash(password, 12);
  const [userResult] = await connection.execute(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'PATIENT')",
    [fullName, email, passwordHash]
  );
  const patientCode = "MT-" + randomBytes(12).toString("hex").toUpperCase();
  const [patientResult] = await connection.execute(
    "INSERT INTO patients (user_id, patient_code, phone, blood_group) VALUES (?, ?, ?, ?)",
    [userResult.insertId, patientCode, phone || null, bloodGroup || null]
  );

  await writeAudit(connection, {
    userId: actorUserId || userResult.insertId,
    action: auditAction,
    entityType: "PATIENT",
    entityId: patientResult.insertId,
    details: { patientCode },
  });

  return {
    id: String(userResult.insertId),
    fullName,
    email,
    role: "PATIENT",
    patientCode,
    bloodGroup: bloodGroup || null,
  };
}

module.exports = { createPatientAccount };
