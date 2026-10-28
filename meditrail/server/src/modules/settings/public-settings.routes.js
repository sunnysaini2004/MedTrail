const express = require("express");
const { getPublicHospitalSettings } = require("./hospital-settings.controller");

const router = express.Router();
router.get("/hospital-settings", getPublicHospitalSettings);

module.exports = router;
