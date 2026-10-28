const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../../config/db");
const { getJwtSecret } = require("./auth.middleware");
const { isGmailAddress } = require("./email-validation");
const { createPatientAccount } = require("../patients/patient.service");

const COOKIE_NAME = "meditrail_token";
const TOKEN_TTL_SECONDS = 15 * 60;
const LOGIN_ROLES = new Set(["PATIENT", "DOCTOR", "ADMIN"]);
const BLOOD_GROUPS = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"]);

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function createToken(userId, secret, sessionVersion = 0) {
  return jwt.sign({ ver: Number(sessionVersion) || 0 }, secret, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

function publicUser(row) {
  return {
    id: String(row.id),
    fullName: row.full_name ?? row.fullName,
    email: row.email,
    role: row.role,
    patientCode: row.patient_code || null,
    mustChangePassword: Boolean(row.mustChangePassword ?? row.must_change_password),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRegistration(body) {
  if (!isPlainObject(body)) {
    return "Please submit registration details.";
  }

  if (typeof body.fullName !== "string" || body.fullName.trim().length < 2 || body.fullName.trim().length > 120) {
    return "Full name must be between 2 and 120 characters.";
  }

  if (!isGmailAddress(body.email)) {
    return "Enter a valid Gmail address ending in @gmail.com.";
  }

  if (typeof body.phone !== "string") {
    return "Enter a phone number.";
  }

  const phone = body.phone.trim();
  if (phone.length > 20 || !/^[+\d][\d\s().-]*$/.test(phone) || phone.replace(/\D/g, "").length < 7) {
    return "Enter a valid phone number.";
  }

  if (typeof body.password !== "string" || body.password.length < 4 || Buffer.byteLength(body.password, "utf8") > 72) {
    return "Password must be at least 4 characters and no more than 72 bytes.";
  }

  if (body.confirmPassword !== body.password) {
    return "Passwords do not match.";
  }

  if (body.bloodGroup != null && body.bloodGroup !== "" && (typeof body.bloodGroup !== "string" || !BLOOD_GROUPS.has(body.bloodGroup))) {
    return "Choose a valid blood group or leave the field blank.";
  }

  return null;
}

function validateLogin(body) {
  if (!isPlainObject(body) || !isGmailAddress(body.email) || typeof body.password !== "string" || !LOGIN_ROLES.has(body.role)) {
    return false;
  }

  const email = body.email.trim();
  return email.length > 0 && body.password.length > 0 && Buffer.byteLength(body.password, "utf8") <= 72;
}

function sendAuthConfigurationError(res) {
  return res.status(503).json({
    success: false,
    message: "Authentication is not configured on the server.",
  });
}

async function register(req, res) {
  const validationError = validateRegistration(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const secret = getJwtSecret();
  if (!secret) {
    return sendAuthConfigurationError(res);
  }

  const fullName = req.body.fullName.trim();
  const email = req.body.email.trim().toLowerCase();
  const phone = req.body.phone.trim();

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const user = await createPatientAccount(connection, {
      fullName,
      email,
      password: req.body.password,
      phone,
      bloodGroup: req.body.bloodGroup || null,
    });
    await connection.commit();
    setAuthCookie(res, createToken(user.id, secret, user.sessionVersion));
    return res.status(201).json({ success: true, user });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create your account right now.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function login(req, res) {
  if (!validateLogin(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Enter a Gmail address, password, and choose the matching account type.",
    });
  }

  const secret = getJwtSecret();
  if (!secret) {
    return sendAuthConfigurationError(res);
  }

  const email = req.body.email.trim().toLowerCase();
  try {
    const [rows] = await pool.execute(
      "SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.is_active, u.must_change_password AS mustChangePassword, u.session_version AS sessionVersion, p.patient_code FROM users u LEFT JOIN patients p ON p.user_id = u.id WHERE u.email = ? LIMIT 1",
      [email]
    );

    const user = rows[0];
    const passwordMatches = user ? await bcrypt.compare(req.body.password, user.password_hash) : false;
    if (!user || !passwordMatches || !user.is_active || user.role !== req.body.role) {
      return res.status(401).json({
        success: false,
        message: "Email or password is incorrect.",
      });
    }

    setAuthCookie(res, createToken(user.id, secret, user.sessionVersion));
    return res.status(200).json({ success: true, user: publicUser(user) });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to log in right now.",
    });
  }
}

function logout(req, res) {
  clearAuthCookie(res);
  return res.status(200).json({ success: true, message: "You have been logged out." });
}

async function getCurrentUser(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT u.id, u.full_name, u.email, u.role, u.must_change_password AS mustChangePassword, p.patient_code FROM users u LEFT JOIN patients p ON p.user_id = u.id WHERE u.id = ? LIMIT 1",
      [req.authUser.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Please log in to continue." });
    }

    return res.status(200).json({ success: true, user: publicUser(rows[0]) });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load your account right now.",
    });
  }
}

async function changePassword(req, res) {
  const body = req.body;
  if (
    !isPlainObject(body) ||
    typeof body.password !== "string" || body.password.length < 8 ||
    Buffer.byteLength(body.password, "utf8") > 72 ||
    body.confirmPassword !== body.password
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter matching passwords that are at least 8 characters and no more than 72 bytes.",
    });
  }

  const secret = getJwtSecret();
  if (!secret) return sendAuthConfigurationError(res);

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT id, full_name AS fullName, email, role, password_hash AS passwordHash, must_change_password AS mustChangePassword, session_version AS sessionVersion, (SELECT patient_code FROM patients WHERE user_id = users.id LIMIT 1) AS patientCode FROM users WHERE id = ? AND is_active = TRUE LIMIT 1 FOR UPDATE",
      [req.authUser.id]
    );
    const user = rows[0];
    if (!user || !user.mustChangePassword) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "A temporary-password change is not pending for this account." });
    }

    if (await bcrypt.compare(body.password, user.passwordHash)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Choose a new password different from the temporary password." });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const nextSessionVersion = Number(user.sessionVersion) + 1;
    await connection.execute(
      "UPDATE users SET password_hash = ?, must_change_password = FALSE, session_version = ? WHERE id = ?",
      [passwordHash, nextSessionVersion, user.id]
    );
    await connection.commit();

    setAuthCookie(res, createToken(user.id, secret, nextSessionVersion));
    return res.status(200).json({
      success: true,
      user: publicUser({ ...user, mustChangePassword: false }),
      message: "Your password has been changed.",
    });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to change the password right now." });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { register, login, logout, getCurrentUser, changePassword };
