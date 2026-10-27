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
    patient: "meditrail-patient-" + id + "@gmail.com",
    admin: "meditrail-admin-" + id + "@gmail.com",
    doctorOne: "meditrail-doctor-one-" + id + "@gmail.com",
    doctorTwo: "meditrail-doctor-two-" + id + "@gmail.com",
    adminCreatedPatient: "meditrail-managed-patient-" + id + "@gmail.com",
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
      role: "ADMIN",
    });
    assert.equal(patientRegistration.response.status, 201);
    const patientCode = patientRegistration.body.user.patientCode;
    const patientCookie = sessionCookie(patientRegistration);

    const patientCannotAdmin = await request("/api/v1/admin/doctors", "GET", undefined, patientCookie);
    assert.equal(patientCannotAdmin.response.status, 403, "patient role should not access admin resources");
    const patientCannotDoctor = await request("/api/v1/doctor/me", "GET", undefined, patientCookie);
    assert.equal(patientCannotDoctor.response.status, 403, "patient role should not access doctor resources");

    const adminLogin = await request("/api/v1/auth/login", "POST", {
      email: emails.admin,
      password: passwords.admin,
      role: "ADMIN",
    });
    assert.equal(adminLogin.response.status, 200);
    const adminCookie = sessionCookie(adminLogin);
    assert.equal(adminLogin.body.user.role, "ADMIN", "admin login should return the database role");
    const adminCannotDoctor = await request("/api/v1/doctor/me", "GET", undefined, adminCookie);
    assert.equal(adminCannotDoctor.response.status, 403, "admin role should not access doctor resources");

    const firstDoctor = await request("/api/v1/admin/doctors", "POST", {
      fullName: "Synthetic Workflow Doctor One",
      email: emails.doctorOne,
      password: passwords.doctorOne,
      role: "DOCTOR",
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
      role: "DOCTOR",
    });
    assert.equal(doctorOneLogin.response.status, 200);
    const doctorOneCookie = sessionCookie(doctorOneLogin);
    assert.equal(doctorOneLogin.body.user.role, "DOCTOR", "doctor login should return the database role");
    const doctorCannotAdmin = await request("/api/v1/admin/doctors", "GET", undefined, doctorOneCookie);
    assert.equal(doctorCannotAdmin.response.status, 403, "doctor role should not access admin resources");
    const doctorProfile = await request("/api/v1/doctor/me", "GET", undefined, doctorOneCookie);
    assert.equal(doctorProfile.response.status, 200);
    const referralOptions = await request("/api/v1/doctor/referrals/doctors", "GET", undefined, doctorOneCookie);
    assert.equal(referralOptions.body.doctors.some((entry) => String(entry.userId) === String(secondDoctor.body.doctor.userId)), true, "another active doctor should be a referral option");
    assert.equal(referralOptions.body.doctors.some((entry) => String(entry.userId) === String(firstDoctor.body.doctor.userId)), false, "a doctor should not see themself as a referral option");
    const noGrantPatients = await request("/api/v1/doctor/patients", "GET", undefined, doctorOneCookie);
    assert.deepEqual(noGrantPatients.body.patients, [], "doctor must not see unassigned patients");

    const managedPatient = await request("/api/v1/admin/patients", "POST", {
      fullName: "Synthetic Admin-Created Patient",
      email: emails.adminCreatedPatient,
      password: "demo1234",
      role: "DOCTOR",
    }, adminCookie);
    assert.equal(managedPatient.response.status, 201);
    assert.equal(managedPatient.body.patient.role, "PATIENT", "admin patient form must not accept a requested role");
    const managedPatientCode = managedPatient.body.patient.patientCode;

    const firstManagedAssignment = await request("/api/v1/admin/patient-assignment", "PUT", {
      patientCode: managedPatientCode,
      doctorUserId: firstDoctor.body.doctor.userId,
    }, adminCookie);
    assert.equal(firstManagedAssignment.response.status, 200);
    const firstDoctorManagedPatients = await request("/api/v1/doctor/patients", "GET", undefined, doctorOneCookie);
    assert.equal(firstDoctorManagedPatients.body.patients.some((entry) => entry.patientCode === managedPatientCode), true);

    const changedManagedAssignment = await request("/api/v1/admin/patient-assignment", "PUT", {
      patientCode: managedPatientCode,
      doctorUserId: secondDoctor.body.doctor.userId,
    }, adminCookie);
    assert.equal(changedManagedAssignment.response.status, 200);
    const revokedManagedPatient = await request("/api/v1/doctor/patients/" + managedPatientCode + "/consultations", "GET", undefined, doctorOneCookie);
    assert.equal(revokedManagedPatient.response.status, 404, "changing assignment removes the previous doctor's access");

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
      role: "DOCTOR",
    });
    assert.equal(doctorTwoLogin.response.status, 200);
    const doctorTwoCookie = sessionCookie(doctorTwoLogin);
    const secondDoctorManagedPatients = await request("/api/v1/doctor/patients", "GET", undefined, doctorTwoCookie);
    assert.equal(secondDoctorManagedPatients.body.patients.some((entry) => entry.patientCode === managedPatientCode), true);

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

    const deletedManagedPatient = await request("/api/v1/admin/patients/" + managedPatientCode, "DELETE", undefined, adminCookie);
    assert.equal(deletedManagedPatient.response.status, 200, "admin should delete a patient and its linked records safely");
    const remainingPatients = await request("/api/v1/admin/patients", "GET", undefined, adminCookie);
    assert.equal(remainingPatients.body.patients.some((entry) => entry.patientCode === managedPatientCode), false);

    const deletedDoctor = await request("/api/v1/admin/doctors/" + secondDoctor.body.doctor.userId, "DELETE", undefined, adminCookie);
    assert.equal(deletedDoctor.response.status, 200, "admin should delete a doctor and linked referrals safely");
    const remainingDoctors = await request("/api/v1/admin/doctors", "GET", undefined, adminCookie);
    assert.equal(remainingDoctors.body.doctors.some((entry) => entry.userId === secondDoctor.body.doctor.userId), false);
    const patientAfterDoctorDelete = await request("/api/v1/patient/dashboard", "GET", undefined, patientCookie);
    assert.equal(patientAfterDoctorDelete.response.status, 200, "deleting one doctor should keep other patients");

    const adminAccounts = await request("/api/v1/admin/accounts?search=" + encodeURIComponent(emails.patient), "GET", undefined, adminCookie);
    assert.equal(adminAccounts.response.status, 200);
    assert.equal(adminAccounts.body.accounts.some((account) => account.email === emails.patient && account.role === "PATIENT"), true);
    assert.equal(JSON.stringify(adminAccounts.body).includes("password_hash"), false, "account lookup must never return password hashes");
    assert.equal(JSON.stringify(adminAccounts.body).includes("temporaryPassword"), false, "account lookup must never return temporary passwords");

    const patientCannotSearchAccounts = await request("/api/v1/admin/accounts", "GET", undefined, patientCookie);
    assert.equal(patientCannotSearchAccounts.response.status, 403, "patients cannot use administrator account management");
    const doctorCannotSearchAccounts = await request("/api/v1/admin/accounts", "GET", undefined, doctorOneCookie);
    assert.equal(doctorCannotSearchAccounts.response.status, 403, "doctors cannot use administrator account management");
    const doctorCannotReset = await request("/api/v1/admin/accounts/1/reset-password", "POST", {}, doctorOneCookie);
    assert.equal(doctorCannotReset.response.status, 403, "doctors cannot reset passwords");
    const patientCannotReset = await request("/api/v1/admin/accounts/1/reset-password", "POST", {}, patientCookie);
    assert.equal(patientCannotReset.response.status, 403, "patients cannot reset passwords");

    const reset = await request("/api/v1/admin/accounts/" + patientRegistration.body.user.id + "/reset-password", "POST", {}, adminCookie);
    assert.equal(reset.response.status, 200, "admin can issue a temporary password for a patient account");
    assert.equal(typeof reset.body.temporaryPassword, "string");
    assert.ok(reset.body.temporaryPassword.length >= 20);
    const temporaryPassword = reset.body.temporaryPassword;
    const [resetAccountRows] = await pool.execute(
      "SELECT password_hash, must_change_password, session_version FROM users WHERE id = ?",
      [patientRegistration.body.user.id]
    );
    assert.notEqual(resetAccountRows[0].password_hash, temporaryPassword, "temporary password must not be stored in plain text");
    assert.equal(await bcrypt.compare(temporaryPassword, resetAccountRows[0].password_hash), true, "temporary password must be stored as a bcrypt hash");
    assert.equal(Boolean(resetAccountRows[0].must_change_password), true);

    const temporaryLogin = await request("/api/v1/auth/login", "POST", {
      email: emails.patient,
      password: temporaryPassword,
      role: "PATIENT",
    });
    assert.equal(temporaryLogin.response.status, 200);
    assert.equal(temporaryLogin.body.user.mustChangePassword, true);
    const temporaryCookie = sessionCookie(temporaryLogin);
    const forcedDashboard = await request("/api/v1/patient/dashboard", "GET", undefined, temporaryCookie);
    assert.equal(forcedDashboard.response.status, 403, "temporary-password accounts must change the password before dashboard use");
    const currentTemporaryUser = await request("/api/v1/auth/me", "GET", undefined, temporaryCookie);
    assert.equal(currentTemporaryUser.response.status, 200, "the forced-password screen can restore the session");
    const samePassword = await request("/api/v1/auth/change-password", "POST", {
      password: temporaryPassword,
      confirmPassword: temporaryPassword,
    }, temporaryCookie);
    assert.equal(samePassword.response.status, 400, "a temporary password cannot be reused as the new password");

    const nextPassword = randomBytes(18).toString("base64url") + "B2!";
    const changedPassword = await request("/api/v1/auth/change-password", "POST", {
      password: nextPassword,
      confirmPassword: nextPassword,
    }, temporaryCookie);
    assert.equal(changedPassword.response.status, 200);
    assert.equal(changedPassword.body.user.fullName, "Synthetic Workflow Patient");
    assert.equal(changedPassword.body.user.mustChangePassword, false);
    const changedCookie = sessionCookie(changedPassword);
    const dashboardAfterChange = await request("/api/v1/patient/dashboard", "GET", undefined, changedCookie);
    assert.equal(dashboardAfterChange.response.status, 200, "the user can use the patient dashboard after changing the temporary password");
    const oldPasswordLogin = await request("/api/v1/auth/login", "POST", {
      email: emails.patient,
      password: temporaryPassword,
      role: "PATIENT",
    });
    assert.equal(oldPasswordLogin.response.status, 401, "the temporary password is invalidated after password change");
    const changedPasswordLogin = await request("/api/v1/auth/login", "POST", {
      email: emails.patient,
      password: nextPassword,
      role: "PATIENT",
    });
    assert.equal(changedPasswordLogin.response.status, 200);

    const [resetAuditRows] = await pool.execute(
      "SELECT action, details FROM audit_logs WHERE user_id = ? AND action = 'ACCOUNT_TEMP_PASSWORD_ISSUED' ORDER BY id DESC LIMIT 1",
      [adminLogin.body.user.id]
    );
    assert.equal(resetAuditRows.length, 1, "administrator password resets must be audited");
    assert.equal(JSON.stringify(resetAuditRows[0].details).includes(temporaryPassword), false, "audit logs must never contain a temporary password");

    console.log("Workflow smoke checks passed: role login, protected account recovery, forced password change, admin patient/doctor provisioning, assignments, consultation, prescription, referral, safe deletes, and patient timeline.");
  } finally {
    const placeholders = emails.patient ? Object.values(emails).map(() => "?").join(",") : "?";
    const [users] = await pool.execute(
      "SELECT id, email, role FROM users WHERE email IN (" + placeholders + ")",
      Object.values(emails)
    );
    const patientEmails = new Set([emails.patient, emails.adminCreatedPatient]);
    const patientUsers = users
      .filter((user) => patientEmails.has(user.email) && user.role === "PATIENT")
      .map((user) => user.id);
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
  console.error("Workflow smoke checks failed:", error.stack || error.message);
  process.exitCode = 1;
});
