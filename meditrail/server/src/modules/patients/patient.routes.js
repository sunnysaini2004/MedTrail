const express = require("express");
const { requireAuth, requireRole } = require("../auth/auth.middleware");
const { getDashboard } = require("./patient.controller");

const router = express.Router();

router.get("/dashboard", requireAuth, requireRole("PATIENT"), getDashboard);

module.exports = router;
