const bcrypt = require("bcryptjs");
const pool = require("../../config/db");
const { writeAudit } = require("../audit/audit.service");
const { isGmailAddress } = require("../auth/email-validation");
const { createPatientAccount } = require("../patients/patient.service");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return typeof value === "number" || typeof value === "string"
    ? /^\d{1,20}$/.test(String(value)) && BigInt(value) > 0n
    : false;
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
      "SELECT p.patient_code AS patientCode, u.full_name AS fullName, u.email, p.phone, p.blood_group AS bloodGroup, (SELECT assigned_user.full_name FROM doctor_patient_access a JOIN doctors d ON d.id = a.doctor_id JOIN users assigned_user ON assigned_user.id = d.user_id WHERE a.patient_id = p.id AND a.status = 'ACTIVE' ORDER BY a.granted_at DESC LIMIT 1) AS assignedDoctorName, (SELECT d.user_id FROM doctor_patient_access a JOIN doctors d ON d.id = a.doctor_id WHERE a.patient_id = p.id AND a.status = 'ACTIVE' ORDER BY a.granted_at DESC LIMIT 1) AS assignedDoctorUserId FROM patients p JOIN users u ON u.id = p.user_id WHERE u.is_active = TRUE ORDER BY u.full_name LIMIT 500"
    );
    return res.status(200).json({ success: true, patients: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load patients right now." });
  }
}

async function createPatient(req, res) {
  const body = req.body;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (
    !isPlainObject(body) ||
    typeof body.fullName !== "string" || body.fullName.trim().length < 2 || body.fullName.trim().length > 120 ||
    !isGmailAddress(body.email) ||
    typeof body.password !== "string" || body.password.length < 4 || Buffer.byteLength(body.password, "utf8") > 72 ||
    (phone && (phone.length > 20 || !/^[+\d][\d\s().-]*$/.test(phone) || phone.replace(/\D/g, "").length < 7))
  ) {
    return res.status(400).json({ success: false, message: "Enter a name, Gmail address, password of at least 4 characters, and an optional valid phone number." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const patient = await createPatientAccount(connection, {
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      password: body.password,
      phone: phone || null,
      actorUserId: req.authUser.id,
      auditAction: "PATIENT_CREATED_BY_ADMIN",
    });
    await connection.commit();
    return res.status(201).json({ success: true, patient });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    return res.status(500).json({ success: false, message: "Unable to create the patient account right now." });
  } finally {
    if (connection) connection.release();
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
    !isGmailAddress(body.email) ||
    typeof body.password !== "string" || body.password.length < 8 || Buffer.byteLength(body.password, "utf8") > 72 ||
    typeof body.specialty !== "string" || body.specialty.trim().length < 2 || body.specialty.trim().length > 120 ||
    (body.registrationNumber != null && (typeof body.registrationNumber !== "string" || body.registrationNumber.trim().length > 100))
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a name, Gmail address, 8–72 byte password, and specialty. Registration number is optional.",
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

async function assignPatientDoctor(req, res) {
  const { patientCode, doctorUserId } = isPlainObject(req.body) ? req.body : {};
  if (typeof patientCode !== "string" || patientCode.trim().length < 3 || patientCode.trim().length > 30 || !validId(doctorUserId)) {
    return res.status(400).json({ success: false, message: "Choose a patient and doctor." });
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
      "SELECT d.id FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.user_id = ? AND u.is_active = TRUE LIMIT 1",
      [String(doctorUserId)]
    );
    if (!patients.length || !doctors.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Patient or active doctor was not found." });
    }

    await connection.execute(
      "UPDATE doctor_patient_access SET status = 'REVOKED', updated_at = CURRENT_TIMESTAMP WHERE patient_id = ? AND status = 'ACTIVE'",
      [patients[0].id]
    );
    await connection.execute(
      "INSERT INTO doctor_patient_access (patient_id, doctor_id, granted_by, status) VALUES (?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE granted_by = ?, status = 'ACTIVE', granted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP",
      [patients[0].id, doctors[0].id, req.authUser.id, req.authUser.id]
    );
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "PATIENT_DOCTOR_ASSIGNED",
      entityType: "PATIENT",
      details: { patientCode: patientCode.trim(), doctorUserId: String(doctorUserId) },
    });
    await connection.commit();
    return res.status(200).json({ success: true, message: "Patient assigned to the selected doctor." });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to assign the doctor right now." });
  } finally {
    if (connection) connection.release();
  }
}

function placeholders(ids) {
  return ids.map(() => "?").join(",");
}

async function deletePatient(req, res) {
  const patientCode = typeof req.params.patientCode === "string" ? req.params.patientCode.trim() : "";
  if (patientCode.length < 3 || patientCode.length > 30) {
    return res.status(400).json({ success: false, message: "Enter a valid patient code." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [patients] = await connection.execute(
      "SELECT id, user_id AS userId FROM patients WHERE patient_code = ? LIMIT 1 FOR UPDATE",
      [patientCode]
    );
    if (!patients.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Patient was not found." });
    }

    const patientId = patients[0].id;
    const [consultations] = await connection.execute(
      "SELECT id FROM consultations WHERE patient_id = ?",
      [patientId]
    );
    const consultationIds = consultations.map((row) => row.id);
    if (consultationIds.length) {
      const marks = placeholders(consultationIds);
      const [prescriptions] = await connection.execute(
        "SELECT id FROM prescriptions WHERE consultation_id IN (" + marks + ")",
        consultationIds
      );
      const prescriptionIds = prescriptions.map((row) => row.id);
      if (prescriptionIds.length) {
        const prescriptionMarks = placeholders(prescriptionIds);
        await connection.execute(
          "DELETE FROM prescription_items WHERE prescription_id IN (" + prescriptionMarks + ")",
          prescriptionIds
        );
        await connection.execute(
          "DELETE FROM prescriptions WHERE id IN (" + prescriptionMarks + ")",
          prescriptionIds
        );
      }
      await connection.execute(
        "DELETE FROM referrals WHERE patient_id = ? OR consultation_id IN (" + marks + ")",
        [patientId, ...consultationIds]
      );
    } else {
      await connection.execute("DELETE FROM referrals WHERE patient_id = ?", [patientId]);
    }
    await connection.execute("DELETE FROM doctor_patient_access WHERE patient_id = ?", [patientId]);
    await connection.execute("DELETE FROM consultations WHERE patient_id = ?", [patientId]);
    await connection.execute("DELETE FROM patients WHERE id = ?", [patientId]);
    await connection.execute("DELETE FROM users WHERE id = ?", [patients[0].userId]);
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "PATIENT_DELETED",
      entityType: "PATIENT",
      details: { patientCode, relatedClinicalRecordsRemoved: true },
    });
    await connection.commit();
    return res.status(200).json({ success: true, message: "Patient and linked consultations, prescriptions, referrals, and access grants were deleted. Audit history is retained." });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to delete the patient and linked records." });
  } finally {
    if (connection) connection.release();
  }
}

async function deleteDoctor(req, res) {
  if (!validId(req.params.doctorUserId)) {
    return res.status(400).json({ success: false, message: "Enter a valid doctor account." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [doctors] = await connection.execute(
      "SELECT id, user_id AS userId FROM doctors WHERE user_id = ? LIMIT 1 FOR UPDATE",
      [String(req.params.doctorUserId)]
    );
    if (!doctors.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Doctor was not found." });
    }

    const doctorId = doctors[0].id;
    const doctorUserId = doctors[0].userId;
    const [consultations] = await connection.execute("SELECT id FROM consultations WHERE doctor_id = ?", [doctorId]);
    const consultationIds = consultations.map((row) => row.id);
    const doctorPrescriptionsSql = consultationIds.length
      ? "SELECT id FROM prescriptions WHERE prescribed_by = ? OR consultation_id IN (" + placeholders(consultationIds) + ")"
      : "SELECT id FROM prescriptions WHERE prescribed_by = ?";
    const [prescriptions] = await connection.execute(doctorPrescriptionsSql, [doctorId, ...consultationIds]);
    const prescriptionIds = prescriptions.map((row) => row.id);
    if (prescriptionIds.length) {
      const marks = placeholders(prescriptionIds);
      await connection.execute("DELETE FROM prescription_items WHERE prescription_id IN (" + marks + ")", prescriptionIds);
      await connection.execute("DELETE FROM prescriptions WHERE id IN (" + marks + ")", prescriptionIds);
    }

    const referralSql = consultationIds.length
      ? "DELETE FROM referrals WHERE referring_doctor_id = ? OR receiving_doctor_id = ? OR consultation_id IN (" + placeholders(consultationIds) + ")"
      : "DELETE FROM referrals WHERE referring_doctor_id = ? OR receiving_doctor_id = ?";
    await connection.execute(referralSql, [doctorId, doctorId, ...consultationIds]);
    await connection.execute("DELETE FROM doctor_patient_access WHERE doctor_id = ?", [doctorId]);
    await connection.execute("DELETE FROM consultations WHERE doctor_id = ?", [doctorId]);
    await connection.execute("DELETE FROM doctors WHERE id = ?", [doctorId]);
    await connection.execute("DELETE FROM users WHERE id = ?", [doctorUserId]);
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "DOCTOR_DELETED",
      entityType: "DOCTOR",
      details: { doctorUserId: String(doctorUserId), relatedClinicalRecordsRemoved: true },
    });
    await connection.commit();
    return res.status(200).json({ success: true, message: "Doctor account and linked consultations, prescriptions, referrals, and access grants were deleted. Other patients and doctors were kept." });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to delete the doctor and linked records." });
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

module.exports = {
  createDoctor,
  createPatient,
  deleteDoctor,
  deletePatient,
  assignPatientDoctor,
  getDoctors,
  getPatients,
  getPatientAccess,
  grantPatientAccess,
  revokePatientAccess,
};
