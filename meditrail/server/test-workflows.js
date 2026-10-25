require("dotenv").config();

const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = randomBytes(32).toString("hex");

const app = require("./src/app");
const pool = require("./src/config/db");

async function runWorkflowSmokeTest() {
  const id = randomUUID();
  const emails = {
    patient: "meditrail-patient-" + id + "@example.invalid",
    admin: "meditrail-admin-" + id + "@example.invalid",
    doctorOne: "meditrail-doctor-one-" + id + "@example.invalid",
    doctorTwo: "meditrail-doctor-two-" + id + "@example.invalid",
  };
  const passwords = {
    patient: randomBytes(18).toString("base64url") + "Aa1!",
    admin: randomBytes(18).toString("base64url") + "Aa1!",
    doctorOne: randomBytes(18).toString("base64url") + "Aa1!",
    doctorTwo: randomBytes(18).toString("base64url") + "Aa1!",
  };

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = "http://127.0.0.1:" + server.address().port;

  async function request(path, method = "GET", body, cookie) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // Retain the HTTP status when a response is not JSON.
    }
    return { response, body: payload };
  }

  function sessionCookie(result) {
    const cookie = (result.response.headers.get("set-cookie") || "").split(";")[0];
    assert.match(cookie, /^meditrail_token=/, "authentication should set the session cookie");
    return cookie;
  }

  try {
    const adminHash = await bcrypt.hash(passwords.admin, 12);
    await pool.execute(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'ADMIN')",
      ["Synthetic Workflow Admin", emails.admin, adminHash]
    );

    const patientRegistration = await request("/api/v1/auth/register", "POST", {
      fullName: "Synthetic Workflow Patient",
      email: emails.patient,
      phone: "+91 90000 00001",
      password: passwords.patient,
      confirmPassword: passwords.patient,
    });
    assert.equal(patientRegistration.response.status, 201);
    const patientCode = patientRegistration.body.user.patientCode;
    const patientCookie = sessionCookie(patientRegistration);

    const patientCannotAdmin = await request("/api/v1/admin/doctors", "GET", undefined, patientCookie);
    assert.equal(patientCannotAdmin.response.status, 403, "patient role should not access admin resources");

    const adminLogin = await request("/api/v1/auth/login", "POST", {
      email: emails.admin,
      password: passwords.admin,
    });
    assert.equal(adminLogin.response.status, 200);
    const adminCookie = sessionCookie(adminLogin);

    const firstDoctor = await request("/api/v1/admin/doctors", "POST", {
      fullName: "Synthetic Workflow Doctor One",
      email: emails.doctorOne,
      password: passwords.doctorOne,
      specialty: "General Medicine",
      role: "ADMIN",
    }, adminCookie);
    assert.equal(firstDoctor.response.status, 201);
    assert.equal(firstDoctor.body.doctor.role, "DOCTOR", "doctor role must be assigned by the server");

    const secondDoctor = await request("/api/v1/admin/doctors", "POST", {
      fullName: "Synthetic Workflow Doctor Two",
      email: emails.doctorTwo,
      password: passwords.doctorTwo,
      specialty: "Cardiology",
    }, adminCookie);
    assert.equal(secondDoctor.response.status, 201);

    const doctorOneLogin = await request("/api/v1/auth/login", "POST", {
      email: emails.doctorOne,
      password: passwords.doctorOne,
    });
    assert.equal(doctorOneLogin.response.status, 200);
    const doctorOneCookie = sessionCookie(doctorOneLogin);
    const doctorProfile = await request("/api/v1/doctor/me", "GET", undefined, doctorOneCookie);
    assert.equal(doctorProfile.response.status, 200);
    const referralOptions = await request("/api/v1/doctor/referrals/doctors", "GET", undefined, doctorOneCookie);
    assert.equal(referralOptions.body.doctors.length, 1, "doctors should only see other active doctors as referral options");
    const noGrantPatients = await request("/api/v1/doctor/patients", "GET", undefined, doctorOneCookie);
    assert.deepEqual(noGrantPatients.body.patients, [], "doctor must not see unassigned patients");

    const grant = await request("/api/v1/admin/patient-access", "POST", {
      patientCode,
      doctorUserId: firstDoctor.body.doctor.userId,
    }, adminCookie);
    assert.equal(grant.response.status, 200);
    const accessList = await request("/api/v1/admin/patient-access", "GET", undefined, adminCookie);
    assert.equal(accessList.body.accessGrants.some((entry) => entry.patientCode === patientCode && entry.status === "ACTIVE"), true);

    const patients = await request("/api/v1/doctor/patients", "GET", undefined, doctorOneCookie);
    assert.equal(patients.response.status, 200);
    assert.equal(patients.body.patients.length, 1);
    assert.equal(patients.body.patients[0].patientCode, patientCode);

    const consultation = await request("/api/v1/doctor/consultations", "POST", {
      patientCode,
      symptoms: "Synthetic cough for workflow test",
      diagnosis: "Synthetic test diagnosis",
      notes: "Synthetic record only",
    }, doctorOneCookie);
    assert.equal(consultation.response.status, 201);
    const consultationId = consultation.body.consultation.id;

    const prescription = await request("/api/v1/doctor/consultations/" + consultationId + "/prescriptions", "POST", {
      instructions: "Synthetic prescription for testing only",
      items: [{ medicineName: "Demo medicine", dosage: "1 tablet", frequency: "Once daily", duration: "1 day" }],
    }, doctorOneCookie);
    assert.equal(prescription.response.status, 201);

    const doctorTwoLogin = await request("/api/v1/auth/login", "POST", {
      email: emails.doctorTwo,
      password: passwords.doctorTwo,
    });
    assert.equal(doctorTwoLogin.response.status, 200);
    const doctorTwoCookie = sessionCookie(doctorTwoLogin);

    const deniedConsultation = await request("/api/v1/doctor/patients/" + patientCode + "/consultations", "GET", undefined, doctorTwoCookie);
    assert.equal(deniedConsultation.response.status, 404, "a doctor without a grant must not view patient history");

    const referral = await request("/api/v1/doctor/referrals", "POST", {
      patientCode,
      receivingDoctorUserId: secondDoctor.body.doctor.userId,
      consultationId,
      reason: "Synthetic specialist referral for workflow test",
    }, doctorOneCookie);
    assert.equal(referral.response.status, 201);

    const inbox = await request("/api/v1/doctor/referrals/inbox", "GET", undefined, doctorTwoCookie);
    assert.equal(inbox.response.status, 200);
    assert.equal(inbox.body.referrals.length, 1);

    const accept = await request("/api/v1/doctor/referrals/" + referral.body.referralId + "/status", "PATCH", { status: "ACCEPTED" }, doctorTwoCookie);
    assert.equal(accept.response.status, 200);
    const authorizedConsultations = await request("/api/v1/doctor/patients/" + patientCode + "/consultations", "GET", undefined, doctorTwoCookie);
    assert.equal(authorizedConsultations.response.status, 200, "accepting a referral grants the receiving doctor access");
    assert.equal(authorizedConsultations.body.consultations.length, 1);

    const wrongActor = await request("/api/v1/doctor/referrals/" + referral.body.referralId + "/status", "PATCH", { status: "COMPLETED" }, doctorOneCookie);
    assert.equal(wrongActor.response.status, 403, "only the receiving doctor may complete an accepted referral");
    const complete = await request("/api/v1/doctor/referrals/" + referral.body.referralId + "/status", "PATCH", { status: "COMPLETED" }, doctorTwoCookie);
    assert.equal(complete.response.status, 200);

    const dashboard = await request("/api/v1/patient/dashboard", "GET", undefined, patientCookie);
    assert.equal(dashboard.response.status, 200);
    assert.deepEqual(dashboard.body.summary, {
      consultationCount: 1,
      prescriptionCount: 1,
      referralCount: 1,
      pendingReferralCount: 0,
    });
    assert.equal(dashboard.body.activities.length, 3);

    const revoke = await request("/api/v1/admin/patient-access", "PATCH", {
      patientCode,
      doctorUserId: firstDoctor.body.doctor.userId,
    }, adminCookie);
    assert.equal(revoke.response.status, 200);
    const revokedDoctorRead = await request("/api/v1/doctor/patients/" + patientCode + "/consultations", "GET", undefined, doctorOneCookie);
    assert.equal(revokedDoctorRead.response.status, 404, "revoking a grant must remove doctor access immediately");

    console.log("Workflow smoke checks passed: admin provisioning, access grants, consultation, prescription, referral acceptance/completion, authorization, revocation, and patient timeline.");
  } finally {
    const placeholders = emails.patient ? Object.values(emails).map(() => "?").join(",") : "?";
    const [users] = await pool.execute(
      "SELECT id, email, role FROM users WHERE email IN (" + placeholders + ")",
      Object.values(emails)
    );
    const patientUsers = users.filter((user) => user.email === emails.patient).map((user) => user.id);
    const doctorUsers = users.filter((user) => user.email === emails.doctorOne || user.email === emails.doctorTwo).map((user) => user.id);
    const allUserIds = users.map((user) => user.id);
    const patientMarks = patientUsers.map(() => "?").join(",");
    const doctorMarks = doctorUsers.map(() => "?").join(",");

    let patientIds = [];
    let doctorIds = [];
    if (patientMarks) {
      const [rows] = await pool.execute("SELECT id FROM patients WHERE user_id IN (" + patientMarks + ")", patientUsers);
      patientIds = rows.map((row) => row.id);
    }
    if (doctorMarks) {
      const [rows] = await pool.execute("SELECT id FROM doctors WHERE user_id IN (" + doctorMarks + ")", doctorUsers);
      doctorIds = rows.map((row) => row.id);
    }

    if (patientIds.length) {
      const marks = patientIds.map(() => "?").join(",");
      await pool.execute("DELETE FROM referrals WHERE patient_id IN (" + marks + ")", patientIds);
      await pool.execute("DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE consultation_id IN (SELECT id FROM consultations WHERE patient_id IN (" + marks + ")))" , patientIds);
      await pool.execute("DELETE FROM prescriptions WHERE consultation_id IN (SELECT id FROM consultations WHERE patient_id IN (" + marks + "))", patientIds);
      await pool.execute("DELETE FROM consultations WHERE patient_id IN (" + marks + ")", patientIds);
      await pool.execute("DELETE FROM doctor_patient_access WHERE patient_id IN (" + marks + ")", patientIds);
      await pool.execute("DELETE FROM patients WHERE id IN (" + marks + ")", patientIds);
    }
    if (doctorIds.length) {
      const marks = doctorIds.map(() => "?").join(",");
      await pool.execute("DELETE FROM doctor_patient_access WHERE doctor_id IN (" + marks + ")", doctorIds);
      await pool.execute("DELETE FROM doctors WHERE id IN (" + marks + ")", doctorIds);
    }
    if (allUserIds.length) {
      const marks = allUserIds.map(() => "?").join(",");
      await pool.execute("DELETE FROM audit_logs WHERE user_id IN (" + marks + ")", allUserIds);
      await pool.execute("DELETE FROM users WHERE id IN (" + marks + ")", allUserIds);
    }

    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

runWorkflowSmokeTest().catch((error) => {
  console.error("Workflow smoke checks failed:", error.message);
  process.exitCode = 1;
});
