const bcrypt = require("bcryptjs");

const DEMO_ACCOUNTS = Object.freeze({
  patient: Object.freeze({
    fullName: "MediTrail Demo Patient",
    email: "patient123@gmail.com",
    password: "patient123",
  }),
  doctor: Object.freeze({
    fullName: "MediTrail Demo Doctor",
    email: "doctor123@gmail.com",
    password: "doctor123",
    specialty: "General Medicine",
    registrationNumber: "DEMO-DOCTOR-001",
  }),
  admin: Object.freeze({
    fullName: "MediTrail Demo Admin",
    email: "sunnysaini@gmail.com",
    password: "sunny123",
  }),
});

const DEMO_PATIENT_CODE = "MT-DEMO-0001";
const BCRYPT_ROUNDS = 12;

async function seedDemoData(connection) {
  const [patientHash, doctorHash, adminHash] = await Promise.all(
    [DEMO_ACCOUNTS.patient, DEMO_ACCOUNTS.doctor, DEMO_ACCOUNTS.admin]
      .map((account) => bcrypt.hash(account.password, BCRYPT_ROUNDS))
  );

  // Keep exactly one administrator. Reuse the existing admin row so the
  // demonstration login is predictable without creating duplicate admins.
  const [admins] = await connection.execute(
    "SELECT id, email FROM users WHERE role = 'ADMIN' FOR UPDATE"
  );
  const [adminEmailRows] = await connection.execute(
    "SELECT id, role FROM users WHERE email = ? LIMIT 1 FOR UPDATE",
    [DEMO_ACCOUNTS.admin.email]
  );
  if (adminEmailRows.length && adminEmailRows[0].role !== "ADMIN") {
    throw new Error("The demo admin email is already used by a non-admin account.");
  }

  let adminUserId;
  let adminToConfigure = adminEmailRows[0]?.role === "ADMIN" ? adminEmailRows[0] : null;
  if (!adminToConfigure && admins.length === 1) {
    adminToConfigure = admins[0];
  } else if (!adminToConfigure && admins.length > 1) {
    // Older project versions used this fixed local demo admin. Reuse it if it
    // is present; otherwise stop instead of taking over an arbitrary account.
    const [legacyDemoAdmins] = await connection.execute(
      "SELECT id FROM users WHERE email = ? AND role = 'ADMIN' LIMIT 2 FOR UPDATE",
      ["admin@meditrail.test"]
    );
    if (legacyDemoAdmins.length === 1) {
      adminToConfigure = legacyDemoAdmins[0];
    } else {
      throw new Error("More than one administrator exists and no unique previous demo admin was found. Keep the accounts you need, then rerun the demo setup.");
    }
  }

  if (adminToConfigure) {
    adminUserId = adminToConfigure.id;
    await connection.execute(
      "UPDATE users SET full_name = ?, email = ?, password_hash = ?, is_active = TRUE WHERE id = ?",
      [DEMO_ACCOUNTS.admin.fullName, DEMO_ACCOUNTS.admin.email, adminHash, adminUserId]
    );
  } else {
    const [adminResult] = await connection.execute(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'ADMIN')",
      [DEMO_ACCOUNTS.admin.fullName, DEMO_ACCOUNTS.admin.email, adminHash]
    );
    adminUserId = adminResult.insertId;
  }

  // Create the demo patient only if it is not already present. The seed never
  // deletes or overwrites other patient accounts.
  const [patientUsers] = await connection.execute(
    "SELECT id, role FROM users WHERE email = ? LIMIT 1 FOR UPDATE",
    [DEMO_ACCOUNTS.patient.email]
  );
  let patientUserId;
  let patientId;
  let patientCreated = false;
  if (patientUsers.length) {
    if (patientUsers[0].role !== "PATIENT") {
      throw new Error("The demo patient email is already used by a non-patient account.");
    }
    patientUserId = patientUsers[0].id;
    const [profiles] = await connection.execute(
      "SELECT id, patient_code AS patientCode FROM patients WHERE user_id = ? LIMIT 1 FOR UPDATE",
      [patientUserId]
    );
    if (!profiles.length) throw new Error("The demo patient account has no patient profile.");
    if (profiles[0].patientCode !== DEMO_PATIENT_CODE) {
      throw new Error("The demo patient email is attached to a different patient profile. Use demo:reset to rebuild the synthetic patient demo.");
    }
    patientId = profiles[0].id;
    await connection.execute(
      "UPDATE users SET full_name = ?, password_hash = ?, is_active = TRUE WHERE id = ?",
      [DEMO_ACCOUNTS.patient.fullName, patientHash, patientUserId]
    );
  } else {
    const [legacyPatients] = await connection.execute(
      "SELECT p.id AS patientId, p.user_id AS userId, u.role FROM patients p JOIN users u ON u.id = p.user_id WHERE p.patient_code = ? LIMIT 2 FOR UPDATE",
      [DEMO_PATIENT_CODE]
    );
    if (legacyPatients.length > 1) throw new Error("The fixed demo patient code is not unique. Resolve the duplicate profiles before seeding.");
    if (legacyPatients.length === 1) {
      if (legacyPatients[0].role !== "PATIENT") throw new Error("The fixed demo patient code belongs to a non-patient account.");
      patientUserId = legacyPatients[0].userId;
      patientId = legacyPatients[0].patientId;
      await connection.execute(
        "UPDATE users SET full_name = ?, email = ?, password_hash = ?, is_active = TRUE WHERE id = ?",
        [DEMO_ACCOUNTS.patient.fullName, DEMO_ACCOUNTS.patient.email, patientHash, patientUserId]
      );
    } else {
      const [patientUserResult] = await connection.execute(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'PATIENT')",
        [DEMO_ACCOUNTS.patient.fullName, DEMO_ACCOUNTS.patient.email, patientHash]
      );
      patientUserId = patientUserResult.insertId;
      const [patientResult] = await connection.execute(
        "INSERT INTO patients (user_id, patient_code, phone, blood_group) VALUES (?, ?, ?, ?)",
        [patientUserId, DEMO_PATIENT_CODE, "+91 90000 00001", "O+"]
      );
      patientId = patientResult.insertId;
      patientCreated = true;
    }
  }

  const [doctorUsers] = await connection.execute(
    "SELECT id, role FROM users WHERE email = ? LIMIT 1 FOR UPDATE",
    [DEMO_ACCOUNTS.doctor.email]
  );
  let doctorUserId;
  let doctorId;
  let doctorCreated = false;
  if (doctorUsers.length) {
    if (doctorUsers[0].role !== "DOCTOR") {
      throw new Error("The demo doctor email is already used by a non-doctor account.");
    }
    doctorUserId = doctorUsers[0].id;
    await connection.execute(
      "UPDATE users SET full_name = ?, password_hash = ?, is_active = TRUE WHERE id = ?",
      [DEMO_ACCOUNTS.doctor.fullName, doctorHash, doctorUserId]
    );
    const [profiles] = await connection.execute(
      "SELECT id FROM doctors WHERE user_id = ? LIMIT 1 FOR UPDATE",
      [doctorUserId]
    );
    if (!profiles.length) throw new Error("The demo doctor account has no doctor profile.");
    doctorId = profiles[0].id;
    await connection.execute(
      "UPDATE doctors SET specialty = ?, registration_number = ? WHERE id = ?",
      [DEMO_ACCOUNTS.doctor.specialty, DEMO_ACCOUNTS.doctor.registrationNumber, doctorId]
    );
  } else {
    const [legacyDoctors] = await connection.execute(
      "SELECT d.id AS doctorId, u.id AS userId FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.registration_number = ? LIMIT 2 FOR UPDATE",
      [DEMO_ACCOUNTS.doctor.registrationNumber]
    );
    if (legacyDoctors.length > 1) throw new Error("The fixed demo doctor registration number is not unique. Resolve the duplicate profiles before seeding.");
    if (legacyDoctors.length === 1) {
      doctorUserId = legacyDoctors[0].userId;
      doctorId = legacyDoctors[0].doctorId;
      await connection.execute(
        "UPDATE users SET full_name = ?, email = ?, password_hash = ?, is_active = TRUE WHERE id = ?",
        [DEMO_ACCOUNTS.doctor.fullName, DEMO_ACCOUNTS.doctor.email, doctorHash, doctorUserId]
      );
      await connection.execute(
        "UPDATE doctors SET specialty = ? WHERE id = ?",
        [DEMO_ACCOUNTS.doctor.specialty, doctorId]
      );
    } else {
      const [doctorUserResult] = await connection.execute(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'DOCTOR')",
        [DEMO_ACCOUNTS.doctor.fullName, DEMO_ACCOUNTS.doctor.email, doctorHash]
      );
      doctorUserId = doctorUserResult.insertId;
      const [doctorResult] = await connection.execute(
        "INSERT INTO doctors (user_id, specialty, registration_number) VALUES (?, ?, ?)",
        [doctorUserId, DEMO_ACCOUNTS.doctor.specialty, DEMO_ACCOUNTS.doctor.registrationNumber]
      );
      doctorId = doctorResult.insertId;
      doctorCreated = true;
    }
  }

  await connection.execute(
    "INSERT INTO doctor_patient_access (patient_id, doctor_id, granted_by, status) VALUES (?, ?, ?, 'ACTIVE') ON DUPLICATE KEY UPDATE granted_by = ?, status = 'ACTIVE', granted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP",
    [patientId, doctorId, adminUserId, adminUserId]
  );

  // Ensure the fixed demo patient has one sample visit and prescription.
  // Re-running demo:seed does not duplicate these synthetic records.
  const [sampleConsultations] = await connection.execute(
    "SELECT id FROM consultations WHERE patient_id = ? AND doctor_id = ? AND symptoms = ? AND diagnosis = ? LIMIT 1",
    [patientId, doctorId, "Routine demo visit", "Synthetic demo entry"]
  );
  let sampleConsultationId;
  if (sampleConsultations.length) {
    sampleConsultationId = sampleConsultations[0].id;
  } else {
    const [consultationResult] = await connection.execute(
      "INSERT INTO consultations (patient_id, doctor_id, symptoms, diagnosis, notes) VALUES (?, ?, ?, ?, ?)",
      [patientId, doctorId, "Routine demo visit", "Synthetic demo entry", "Sample record created by the MediTrail demo setup."]
    );
    sampleConsultationId = consultationResult.insertId;
  }

  const [samplePrescriptions] = await connection.execute(
    "SELECT id FROM prescriptions WHERE consultation_id = ? AND prescribed_by = ? AND instructions = ? LIMIT 1",
    [sampleConsultationId, doctorId, "Demonstration only."]
  );
  if (samplePrescriptions.length) {
    const [sampleItems] = await connection.execute(
      "SELECT id FROM prescription_items WHERE prescription_id = ? AND medicine_name = ? LIMIT 1",
      [samplePrescriptions[0].id, "Demo medicine"]
    );
    if (!sampleItems.length) {
      await connection.execute(
        "INSERT INTO prescription_items (prescription_id, medicine_name, dosage, frequency, duration, instructions) VALUES (?, ?, ?, ?, ?, ?)",
        [samplePrescriptions[0].id, "Demo medicine", "1 tablet", "Once daily", "1 day", "Synthetic example only."]
      );
    }
  } else {
    const [prescriptionResult] = await connection.execute(
      "INSERT INTO prescriptions (consultation_id, prescribed_by, instructions) VALUES (?, ?, ?)",
      [sampleConsultationId, doctorId, "Demonstration only."]
    );
    await connection.execute(
      "INSERT INTO prescription_items (prescription_id, medicine_name, dosage, frequency, duration, instructions) VALUES (?, ?, ?, ?, ?, ?)",
      [prescriptionResult.insertId, "Demo medicine", "1 tablet", "Once daily", "1 day", "Synthetic example only."]
    );
  }

  return {
    patientCode: DEMO_PATIENT_CODE,
    patientCreated,
    doctorCreated,
    adminUserId: String(adminUserId),
  };
}

module.exports = { DEMO_ACCOUNTS, DEMO_PATIENT_CODE, seedDemoData };
