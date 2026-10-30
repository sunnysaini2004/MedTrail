require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./modules/auth/auth.routes");
const patientRoutes = require("./modules/patients/patient.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const doctorRoutes = require("./modules/doctors/doctor.routes");
const publicSettingsRoutes = require("./modules/settings/public-settings.routes");
const pool = require("./config/db");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "MediTrail backend is running!",
  });
});

app.get("/api/health/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({ success: true, database: "available" });
  } catch {
    return res.status(503).json({ success: false, message: "The database is not ready." });
  }
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/patient", patientRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/doctor", doctorRoutes);
app.use("/api/v1/public", publicSettingsRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const isInvalidJson = error.type === "entity.parse.failed";
  res.status(isInvalidJson ? 400 : 500).json({
    success: false,
    message: isInvalidJson
      ? "Request body must contain valid JSON."
      : "An unexpected server error occurred.",
  });
});

module.exports = app;
