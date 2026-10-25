const pool = require("../../config/db");
const { writeAudit } = require("../audit/audit.service");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return (typeof value === "string" || typeof value === "number") &&
    /^\d{1,20}$/.test(String(value)) && BigInt(value) > 0n;
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

async function findDoctorId(connection, userId) {
  const [rows] = await connection.execute(
    "SELECT id FROM doctors WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return rows.length ? rows[0].id : null;
}

async function findAccessiblePatientId(connection, patientCode, doctorId) {
  const [rows] = await connection.execute(
    "SELECT p.id FROM patients p JOIN doctor_patient_access a ON a.patient_id = p.id WHERE p.patient_code = ? AND a.doctor_id = ? AND a.status = 'ACTIVE' LIMIT 1",
    [patientCode, doctorId]
  );
  return rows.length ? rows[0].id : null;
}

async function getDoctorProfile(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT d.id AS doctorId, u.id AS userId, u.full_name AS fullName, u.email, d.specialty, d.registration_number AS registrationNumber FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.id = ? LIMIT 1",
      [req.authUser.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Doctor profile was not found." });
    }
    return res.status(200).json({ success: true, doctor: rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load the doctor profile right now." });
  }
}

async function getAssignedPatients(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT p.patient_code AS patientCode, u.full_name AS fullName, p.blood_group AS bloodGroup, a.granted_at AS accessGrantedAt FROM doctor_patient_access a JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = p.user_id JOIN doctors d ON d.id = a.doctor_id WHERE d.user_id = ? AND a.status = 'ACTIVE' AND u.is_active = TRUE ORDER BY u.full_name LIMIT 500",
      [req.authUser.id]
    );
    return res.status(200).json({ success: true, patients: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load assigned patients right now." });
  }
}

async function getPatientConsultations(req, res) {
  const patientCode = cleanText(req.params.patientCode, 30);
  if (!patientCode) {
    return res.status(400).json({ success: false, message: "Enter a valid patient code." });
  }

  try {
    const doctorId = await findDoctorId(pool, req.authUser.id);
    if (!doctorId) {
      return res.status(404).json({ success: false, message: "Doctor profile was not found." });
    }
    const patientId = await findAccessiblePatientId(pool, patientCode, doctorId);
    if (!patientId) {
      return res.status(404).json({ success: false, message: "Patient not found or access has not been granted." });
    }
    const [rows] = await pool.execute(
      "SELECT c.id, c.consultation_date AS consultationDate, c.symptoms, c.diagnosis, c.notes, u.full_name AS doctorName FROM consultations c JOIN doctors d ON d.id = c.doctor_id JOIN users u ON u.id = d.user_id WHERE c.patient_id = ? ORDER BY c.consultation_date DESC LIMIT 100",
      [patientId]
    );
    return res.status(200).json({ success: true, consultations: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load consultations right now." });
  }
}

async function createConsultation(req, res) {
  const body = req.body;
  if (!isPlainObject(body) || typeof body.patientCode !== "string" || body.patientCode.trim().length < 3 || body.patientCode.trim().length > 30) {
    return res.status(400).json({ success: false, message: "Enter a valid patient code." });
  }
  const symptoms = body.symptoms == null || body.symptoms === "" ? null : cleanText(body.symptoms, 5000);
  const diagnosis = body.diagnosis == null || body.diagnosis === "" ? null : cleanText(body.diagnosis, 5000);
  const notes = body.notes == null || body.notes === "" ? null : cleanText(body.notes, 5000);
  if ((body.symptoms && !symptoms) || (body.diagnosis && !diagnosis) || (body.notes && !notes) || (!symptoms && !diagnosis && !notes)) {
    return res.status(400).json({ success: false, message: "Add at least one consultation detail, up to 5,000 characters each." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const doctorId = await findDoctorId(connection, req.authUser.id);
    const patientId = doctorId
      ? await findAccessiblePatientId(connection, body.patientCode.trim(), doctorId)
      : null;
    if (!patientId) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Patient not found or access has not been granted." });
    }

    const [result] = await connection.execute(
      "INSERT INTO consultations (patient_id, doctor_id, symptoms, diagnosis, notes) VALUES (?, ?, ?, ?, ?)",
      [patientId, doctorId, symptoms, diagnosis, notes]
    );
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "CONSULTATION_CREATED",
      entityType: "CONSULTATION",
      entityId: result.insertId,
      details: { patientCode: body.patientCode.trim() },
    });
    await connection.commit();
    return res.status(201).json({ success: true, consultation: { id: String(result.insertId) } });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to create the consultation right now." });
  } finally {
    if (connection) connection.release();
  }
}

function validatePrescriptionItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) return null;
  const normalized = [];
  for (const item of items) {
    if (!isPlainObject(item)) return null;
    const medicineName = cleanText(item.medicineName, 200);
    const dosage = cleanText(item.dosage, 100);
    const frequency = item.frequency == null || item.frequency === "" ? null : cleanText(item.frequency, 100);
    const duration = item.duration == null || item.duration === "" ? null : cleanText(item.duration, 100);
    const instructions = item.instructions == null || item.instructions === "" ? null : cleanText(item.instructions, 5000);
    if (!medicineName || !dosage || (item.frequency && !frequency) || (item.duration && !duration) || (item.instructions && !instructions)) return null;
    normalized.push({ medicineName, dosage, frequency, duration, instructions });
  }
  return normalized;
}

async function createPrescription(req, res) {
  if (!validId(req.params.consultationId) || !isPlainObject(req.body)) {
    return res.status(400).json({ success: false, message: "Enter a valid consultation and prescription." });
  }
  const instructions = req.body.instructions == null || req.body.instructions === "" ? null : cleanText(req.body.instructions, 5000);
  const items = validatePrescriptionItems(req.body.items);
  if (!items || (req.body.instructions && !instructions)) {
    return res.status(400).json({ success: false, message: "Add 1–20 medicines with a name and dosage." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const doctorId = await findDoctorId(connection, req.authUser.id);
    const [consultations] = doctorId
      ? await connection.execute(
          "SELECT c.id FROM consultations c JOIN doctor_patient_access a ON a.patient_id = c.patient_id WHERE c.id = ? AND a.doctor_id = ? AND a.status = 'ACTIVE' LIMIT 1 FOR UPDATE",
          [String(req.params.consultationId), doctorId]
        )
      : [[]];
    if (consultations.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Consultation not found or access has not been granted." });
    }

    const [prescription] = await connection.execute(
      "INSERT INTO prescriptions (consultation_id, prescribed_by, instructions) VALUES (?, ?, ?)",
      [String(req.params.consultationId), doctorId, instructions]
    );
    for (const item of items) {
      await connection.execute(
        "INSERT INTO prescription_items (prescription_id, medicine_name, dosage, frequency, duration, instructions) VALUES (?, ?, ?, ?, ?, ?)",
        [prescription.insertId, item.medicineName, item.dosage, item.frequency, item.duration, item.instructions]
      );
    }
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "PRESCRIPTION_CREATED",
      entityType: "PRESCRIPTION",
      entityId: prescription.insertId,
      details: { consultationId: String(req.params.consultationId), itemCount: items.length },
    });
    await connection.commit();
    return res.status(201).json({ success: true, prescriptionId: String(prescription.insertId) });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to create the prescription right now." });
  } finally {
    if (connection) connection.release();
  }
}

async function createReferral(req, res) {
  const body = req.body;
  const reason = isPlainObject(body) ? cleanText(body.reason, 5000) : null;
  if (!isPlainObject(body) || typeof body.patientCode !== "string" || body.patientCode.trim().length < 3 || body.patientCode.trim().length > 30 || !validId(body.receivingDoctorUserId) || !reason || (body.consultationId != null && !validId(body.consultationId))) {
    return res.status(400).json({ success: false, message: "Enter a patient, receiving doctor, and referral reason." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const referringDoctorId = await findDoctorId(connection, req.authUser.id);
    const patientId = referringDoctorId
      ? await findAccessiblePatientId(connection, body.patientCode.trim(), referringDoctorId)
      : null;
    const [receivers] = await connection.execute(
      "SELECT id FROM doctors WHERE user_id = ? LIMIT 1",
      [String(body.receivingDoctorUserId)]
    );
    if (!patientId || receivers.length === 0 || receivers[0].id === referringDoctorId) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Patient or receiving doctor was not found, or access is unavailable." });
    }

    const consultationId = body.consultationId == null ? null : String(body.consultationId);
    if (consultationId) {
      const [consultations] = await connection.execute(
        "SELECT id FROM consultations WHERE id = ? AND patient_id = ? LIMIT 1",
        [consultationId, patientId]
      );
      if (consultations.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: "Consultation was not found for this patient." });
      }
    }

    const [result] = await connection.execute(
      "INSERT INTO referrals (patient_id, referring_doctor_id, receiving_doctor_id, consultation_id, reason) VALUES (?, ?, ?, ?, ?)",
      [patientId, referringDoctorId, receivers[0].id, consultationId, reason]
    );
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "REFERRAL_CREATED",
      entityType: "REFERRAL",
      entityId: result.insertId,
      details: { patientCode: body.patientCode.trim(), receivingDoctorUserId: String(body.receivingDoctorUserId) },
    });
    await connection.commit();
    return res.status(201).json({ success: true, referralId: String(result.insertId), status: "PENDING" });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to create the referral right now." });
  } finally {
    if (connection) connection.release();
  }
}

async function getReferralInbox(req, res) {
  try {
    const doctorId = await findDoctorId(pool, req.authUser.id);
    if (!doctorId) {
      return res.status(404).json({ success: false, message: "Doctor profile was not found." });
    }
    const [rows] = await pool.execute(
      "SELECT r.id AS referralId, p.patient_code AS patientCode, patient_user.full_name AS patientName, referring_user.full_name AS referringDoctor, r.reason, r.status, r.referred_at AS referredAt FROM referrals r JOIN patients p ON p.id = r.patient_id JOIN users patient_user ON patient_user.id = p.user_id JOIN doctors referring_doctor ON referring_doctor.id = r.referring_doctor_id JOIN users referring_user ON referring_user.id = referring_doctor.user_id WHERE r.receiving_doctor_id = ? AND r.status IN ('PENDING', 'ACCEPTED') ORDER BY r.referred_at DESC LIMIT 100",
      [doctorId]
    );
    return res.status(200).json({ success: true, referrals: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load referrals right now." });
  }
}

async function getReferralDoctors(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT u.id AS userId, u.full_name AS fullName, d.specialty FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.is_active = TRUE AND u.id <> ? ORDER BY u.full_name LIMIT 500",
      [req.authUser.id]
    );
    return res.status(200).json({ success: true, doctors: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load referral doctors right now." });
  }
}

async function updateReferralStatus(req, res) {
  if (!validId(req.params.referralId) || !isPlainObject(req.body) || !["ACCEPTED", "COMPLETED", "CANCELLED"].includes(req.body.status)) {
    return res.status(400).json({ success: false, message: "Enter a valid referral status." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const doctorId = await findDoctorId(connection, req.authUser.id);
    const [rows] = doctorId
      ? await connection.execute(
          "SELECT id, patient_id AS patientId, referring_doctor_id AS referringDoctorId, receiving_doctor_id AS receivingDoctorId, status FROM referrals WHERE id = ? LIMIT 1 FOR UPDATE",
          [String(req.params.referralId)]
        )
      : [[]];
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Referral was not found." });
    }

    const referral = rows[0];
    const nextStatus = req.body.status;
    const isReceiver = String(referral.receivingDoctorId) === String(doctorId);
    const isReferrer = String(referral.referringDoctorId) === String(doctorId);
    const allowed =
      (isReceiver && referral.status === "PENDING" && ["ACCEPTED", "CANCELLED"].includes(nextStatus)) ||
      (isReceiver && referral.status === "ACCEPTED" && ["COMPLETED", "CANCELLED"].includes(nextStatus)) ||
      (isReferrer && referral.status === "PENDING" && nextStatus === "CANCELLED");
    if (!allowed) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "You cannot make that referral status change." });
    }

    await connection.execute(
      "UPDATE referrals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [nextStatus, referral.id]
    );
    if (nextStatus === "ACCEPTED") {
      await connection.execute(
        "INSERT INTO doctor_patient_access (patient_id, doctor_id, granted_by, status) VALUES (?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE granted_by = ?, status = 'ACTIVE', granted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP",
        [referral.patientId, referral.receivingDoctorId, req.authUser.id, req.authUser.id]
      );
    }
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "REFERRAL_STATUS_UPDATED",
      entityType: "REFERRAL",
      entityId: referral.id,
      details: { fromStatus: referral.status, toStatus: nextStatus },
    });
    await connection.commit();
    return res.status(200).json({ success: true, referralId: String(referral.id), status: nextStatus });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to update the referral right now." });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getDoctorProfile,
  getAssignedPatients,
  getPatientConsultations,
  createConsultation,
  createPrescription,
  createReferral,
  getReferralInbox,
  getReferralDoctors,
  updateReferralStatus,
};
