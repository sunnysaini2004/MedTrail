const pool = require("../../config/db");

async function getDashboard(req, res) {
  try {
    const [profiles] = await pool.execute(
      "SELECT p.id, p.patient_code AS patientCode, p.blood_group AS bloodGroup, (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id) AS consultationCount, (SELECT COUNT(*) FROM prescriptions pr JOIN consultations c ON c.id = pr.consultation_id WHERE c.patient_id = p.id) AS prescriptionCount, (SELECT COUNT(*) FROM referrals r WHERE r.patient_id = p.id) AS referralCount, (SELECT COUNT(*) FROM referrals r WHERE r.patient_id = p.id AND r.status = 'PENDING') AS pendingReferralCount FROM patients p WHERE p.user_id = ? LIMIT 1",
      [req.authUser.id]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Patient profile was not found.",
      });
    }

    const patient = profiles[0];
    const [assignedDoctors] = await pool.execute(
      "SELECT u.full_name AS fullName, d.specialty, d.user_id AS userId FROM doctor_patient_access a JOIN doctors d ON d.id = a.doctor_id JOIN users u ON u.id = d.user_id WHERE a.patient_id = ? AND a.status = 'ACTIVE' AND u.is_active = TRUE ORDER BY a.granted_at DESC LIMIT 1",
      [patient.id]
    );
    const [activities] = await pool.execute(
      "SELECT activityType, recordId, activityDate, title, description, status FROM (SELECT 'Consultation' AS activityType, c.id AS recordId, c.consultation_date AS activityDate, COALESCE(NULLIF(c.diagnosis, ''), 'Consultation recorded') AS title, COALESCE(NULLIF(c.notes, ''), NULLIF(c.symptoms, ''), 'Consultation record') AS description, 'Recorded' AS status FROM consultations c WHERE c.patient_id = ? UNION ALL SELECT 'Prescription' AS activityType, pr.id AS recordId, pr.prescribed_at AS activityDate, 'Prescription recorded' AS title, COALESCE(GROUP_CONCAT(DISTINCT pi.medicine_name ORDER BY pi.medicine_name SEPARATOR ', '), 'Prescription details recorded') AS description, 'Recorded' AS status FROM prescriptions pr JOIN consultations c ON c.id = pr.consultation_id LEFT JOIN prescription_items pi ON pi.prescription_id = pr.id WHERE c.patient_id = ? GROUP BY pr.id, pr.prescribed_at UNION ALL SELECT 'Referral' AS activityType, r.id AS recordId, r.referred_at AS activityDate, CONCAT('Referral to ', receiving_user.full_name) AS title, r.reason AS description, r.status AS status FROM referrals r JOIN doctors receiving_doctor ON receiving_doctor.id = r.receiving_doctor_id JOIN users receiving_user ON receiving_user.id = receiving_doctor.user_id WHERE r.patient_id = ?) AS activity ORDER BY activityDate DESC LIMIT 20",
      [patient.id, patient.id, patient.id]
    );

    return res.status(200).json({
      success: true,
      patient: {
        patientCode: patient.patientCode,
        bloodGroup: patient.bloodGroup,
      },
      assignedDoctor: assignedDoctors[0] || null,
      summary: {
        consultationCount: Number(patient.consultationCount),
        prescriptionCount: Number(patient.prescriptionCount),
        referralCount: Number(patient.referralCount),
        pendingReferralCount: Number(patient.pendingReferralCount),
      },
      activities: activities.map((activity) => ({
        ...activity,
        recordId: String(activity.recordId),
      })),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load the patient dashboard right now.",
    });
  }
}

module.exports = { getDashboard };
