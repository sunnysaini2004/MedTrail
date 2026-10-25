const express = require("express");
const { requireAuth, requireRole } = require("../auth/auth.middleware");
const {
  getDoctorProfile,
  getAssignedPatients,
  getPatientConsultations,
  createConsultation,
  createPrescription,
  createReferral,
  getReferralInbox,
  getReferralDoctors,
  updateReferralStatus,
} = require("./doctor.controller");

const router = express.Router();

router.use(requireAuth, requireRole("DOCTOR"));
router.get("/me", getDoctorProfile);
router.get("/patients", getAssignedPatients);
router.get("/patients/:patientCode/consultations", getPatientConsultations);
router.post("/consultations", createConsultation);
router.post("/consultations/:consultationId/prescriptions", createPrescription);
router.post("/referrals", createReferral);
router.get("/referrals/inbox", getReferralInbox);
router.get("/referrals/doctors", getReferralDoctors);
router.patch("/referrals/:referralId/status", updateReferralStatus);

module.exports = router;
