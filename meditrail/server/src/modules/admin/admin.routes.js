const express = require("express");
const { requireAuth, requireRole } = require("../auth/auth.middleware");
const {
  createDoctor,
  createPatient,
  getAccounts,
  resetAccountPassword,
  deleteDoctor,
  deletePatient,
  assignPatientDoctor,
  getDoctors,
  getPatients,
  getPatientAccess,
  grantPatientAccess,
  revokePatientAccess,
} = require("./admin.controller");
const { getAdminHospitalSettings, updateAdminHospitalSettings } = require("../settings/hospital-settings.controller");

const router = express.Router();

router.use(requireAuth, requireRole("ADMIN"));
router.get("/hospital-settings", getAdminHospitalSettings);
router.put("/hospital-settings", updateAdminHospitalSettings);
router.get("/doctors", getDoctors);
router.get("/patients", getPatients);
router.get("/patient-access", getPatientAccess);
router.get("/accounts", getAccounts);
router.post("/accounts/:userId/reset-password", resetAccountPassword);
router.post("/doctors", createDoctor);
router.post("/patients", createPatient);
router.delete("/doctors/:doctorUserId", deleteDoctor);
router.delete("/patients/:patientCode", deletePatient);
router.put("/patient-assignment", assignPatientDoctor);
router.post("/patient-access", grantPatientAccess);
router.patch("/patient-access", revokePatientAccess);

module.exports = router;
