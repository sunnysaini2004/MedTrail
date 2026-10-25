const bcrypt = require("bcryptjs");
const pool = require("../../config/db");
const { writeAudit } = require("../audit/audit.service");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return typeof value === "number" || typeof value === "string"
    ? /^\d{1,20}$/.test(String(value)) && BigInt(value) > 0n
    : false;
}

function validEmail(value) {
  return typeof value === "string" && value.trim().length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function getDoctors(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT d.user_id AS userId, u.full_name AS fullName, u.email, d.specialty, d.registration_number AS registrationNumber FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.is_active = TRUE ORDER BY u.full_name LIMIT 500"
    );
    return res.status(200).json({ success: true, doctors: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load doctors right now." });
  }
}

async function getPatients(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT p.patient_code AS patientCode, u.full_name AS fullName, p.blood_group AS bloodGroup FROM patients p JOIN users u ON u.id = p.user_id WHERE u.is_active = TRUE ORDER BY u.full_name LIMIT 500"
    );
    return res.status(200).json({ success: true, patients: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load patients right now." });
  }
}

async function getPatientAccess(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT p.patient_code AS patientCode, patient_user.full_name AS patientName, d.user_id AS doctorUserId, doctor_user.full_name AS doctorName, d.specialty, a.status, a.granted_at AS grantedAt FROM doctor_patient_access a JOIN patients p ON p.id = a.patient_id JOIN users patient_user ON patient_user.id = p.user_id JOIN doctors d ON d.id = a.doctor_id JOIN users doctor_user ON doctor_user.id = d.user_id ORDER BY a.updated_at DESC LIMIT 1000"
    );
    return res.status(200).json({ success: true, accessGrants: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load access grants right now." });
  }
}

async function createDoctor(req, res) {
  const body = req.body;
  if (
    !isPlainObject(body) ||
    typeof body.fullName !== "string" || body.fullName.trim().length < 2 || body.fullName.trim().length > 120 ||
    !validEmail(body.email) ||
    typeof body.password !== "string" || body.password.length < 8 || Buffer.byteLength(body.password, "utf8") > 72 ||
    typeof body.specialty !== "string" || body.specialty.trim().length < 2 || body.specialty.trim().length > 120 ||
    (body.registrationNumber != null && (typeof body.registrationNumber !== "string" || body.registrationNumber.trim().length > 100))
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a name, valid email, 8–72 byte password, and specialty. Registration number is optional.",
    });
  }

  let connection;
  try {
    const passwordHash = await bcrypt.hash(body.password, 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'DOCTOR')",
      [body.fullName.trim(), body.email.trim().toLowerCase(), passwordHash]
    );
    const registrationNumber = body.registrationNumber ? body.registrationNumber.trim() || null : null;
    const [doctorResult] = await connection.execute(
      "INSERT INTO doctors (user_id, specialty, registration_number) VALUES (?, ?, ?)",
      [userResult.insertId, body.specialty.trim(), registrationNumber]
    );
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "DOCTOR_CREATED",
      entityType: "DOCTOR",
      entityId: doctorResult.insertId,
      details: { doctorUserId: String(userResult.insertId) },
    });
    await connection.commit();

    return res.status(201).json({
      success: true,
      doctor: {
        userId: String(userResult.insertId),
        doctorId: String(doctorResult.insertId),
        fullName: body.fullName.trim(),
        email: body.email.trim().toLowerCase(),
        specialty: body.specialty.trim(),
        registrationNumber,
        role: "DOCTOR",
      },
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "An account or registration number already exists." });
    }
    return res.status(500).json({ success: false, message: "Unable to create the doctor account right now." });
  } finally {
    if (connection) connection.release();
  }
}

async function grantPatientAccess(req, res) {
  const { patientCode, doctorUserId } = isPlainObject(req.body) ? req.body : {};
  if (typeof patientCode !== "string" || patientCode.trim().length < 3 || patientCode.trim().length > 30 || !validId(doctorUserId)) {
    return res.status(400).json({ success: false, message: "Enter a patient code and doctor user ID." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [patients] = await connection.execute(
      "SELECT id FROM patients WHERE patient_code = ? LIMIT 1 FOR UPDATE",
      [patientCode.trim()]
    );
    const [doctors] = await connection.execute(
      "SELECT id FROM doctors WHERE user_id = ? LIMIT 1",
      [String(doctorUserId)]
    );
    if (patients.length === 0 || doctors.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Patient or doctor profile was not found." });
    }

    await connection.execute(
      "INSERT INTO doctor_patient_access (patient_id, doctor_id, granted_by, status) VALUES (?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE granted_by = ?, status = 'ACTIVE', granted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP",
      [patients[0].id, doctors[0].id, req.authUser.id, req.authUser.id]
    );
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "PATIENT_ACCESS_GRANTED",
      entityType: "PATIENT",
      details: { patientCode: patientCode.trim(), doctorUserId: String(doctorUserId) },
    });
    await connection.commit();
    return res.status(200).json({ success: true, message: "Doctor access granted." });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to grant patient access right now." });
  } finally {
    if (connection) connection.release();
  }
}

async function revokePatientAccess(req, res) {
  const { patientCode, doctorUserId } = isPlainObject(req.body) ? req.body : {};
  if (typeof patientCode !== "string" || patientCode.trim().length < 3 || patientCode.trim().length > 30 || !validId(doctorUserId)) {
    return res.status(400).json({ success: false, message: "Enter a patient code and doctor user ID." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT a.id, a.status FROM doctor_patient_access a JOIN patients p ON p.id = a.patient_id JOIN doctors d ON d.id = a.doctor_id WHERE p.patient_code = ? AND d.user_id = ? LIMIT 1 FOR UPDATE",
      [patientCode.trim(), String(doctorUserId)]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Patient access grant was not found." });
    }
    if (rows[0].status !== "REVOKED") {
      await connection.execute(
        "UPDATE doctor_patient_access SET status = 'REVOKED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [rows[0].id]
      );
      await writeAudit(connection, {
        userId: req.authUser.id,
        action: "PATIENT_ACCESS_REVOKED",
        entityType: "PATIENT",
        details: { patientCode: patientCode.trim(), doctorUserId: String(doctorUserId) },
      });
    }
    await connection.commit();
    return res.status(200).json({ success: true, message: "Doctor access is revoked." });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to revoke patient access right now." });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { createDoctor, getDoctors, getPatients, getPatientAccess, grantPatientAccess, revokePatientAccess };
