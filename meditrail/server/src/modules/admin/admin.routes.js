const express = require("express");
const { requireAuth, requireRole } = require("../auth/auth.middleware");
const {
  createDoctor,
  getDoctors,
  getPatients,
  getPatientAccess,
  grantPatientAccess,
  revokePatientAccess,
} = require("./admin.controller");

const router = express.Router();

router.use(requireAuth, requireRole("ADMIN"));
router.get("/doctors", getDoctors);
router.get("/patients", getPatients);
router.get("/patient-access", getPatientAccess);
router.post("/doctors", createDoctor);
router.post("/patient-access", grantPatientAccess);
router.patch("/patient-access", revokePatientAccess);

module.exports = router;
