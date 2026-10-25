const { randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../../config/db");
const { getJwtSecret } = require("./auth.middleware");
const { writeAudit } = require("../audit/audit.service");

const COOKIE_NAME = "meditrail_token";
const TOKEN_TTL_SECONDS = 15 * 60;
const BCRYPT_ROUNDS = 12;

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

function createToken(userId, secret) {
  return jwt.sign({}, secret, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

function publicUser(row) {
  return {
    id: String(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    patientCode: row.patient_code || null,
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

  if (typeof body.email !== "string" || body.email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return "Enter a valid email address.";
  }

  if (typeof body.phone !== "string") {
    return "Enter a phone number.";
  }

  const phone = body.phone.trim();
  if (phone.length > 20 || !/^[+\d][\d\s().-]*$/.test(phone) || phone.replace(/\D/g, "").length < 7) {
    return "Enter a valid phone number.";
  }

  if (typeof body.password !== "string" || body.password.length < 8 || Buffer.byteLength(body.password, "utf8") > 72) {
    return "Password must be at least 8 characters and no more than 72 bytes.";
  }

  if (body.confirmPassword !== body.password) {
    return "Passwords do not match.";
  }

  return null;
}

function validateLogin(body) {
  if (!isPlainObject(body) || typeof body.email !== "string" || typeof body.password !== "string") {
    return false;
  }

  const email = body.email.trim();
  return email.length > 0 && email.length <= 255 && body.password.length > 0 && Buffer.byteLength(body.password, "utf8") <= 72;
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
    const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'PATIENT')",
      [fullName, email, passwordHash]
    );

    const patientCode = "MT-" + randomBytes(12).toString("hex").toUpperCase();
    await connection.execute(
      "INSERT INTO patients (user_id, patient_code, phone) VALUES (?, ?, ?)",
      [userResult.insertId, patientCode, phone]
    );

    await writeAudit(connection, {
      userId: userResult.insertId,
      action: "PATIENT_REGISTERED",
      entityType: "PATIENT",
      details: { patientCode },
    });

    await connection.commit();

    const user = {
      id: String(userResult.insertId),
      fullName,
      email,
      role: "PATIENT",
      patientCode,
    };

    setAuthCookie(res, createToken(user.id, secret));
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
      message: "Enter a valid email address and password.",
    });
  }

  const secret = getJwtSecret();
  if (!secret) {
    return sendAuthConfigurationError(res);
  }

  const email = req.body.email.trim().toLowerCase();
  try {
    const [rows] = await pool.execute(
      "SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.is_active, p.patient_code FROM users u LEFT JOIN patients p ON p.user_id = u.id WHERE u.email = ? LIMIT 1",
      [email]
    );

    const user = rows[0];
    const passwordMatches = user ? await bcrypt.compare(req.body.password, user.password_hash) : false;
    if (!user || !passwordMatches || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: "Email or password is incorrect.",
      });
    }

    setAuthCookie(res, createToken(user.id, secret));
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
      "SELECT u.id, u.full_name, u.email, u.role, p.patient_code FROM users u LEFT JOIN patients p ON p.user_id = u.id WHERE u.id = ? LIMIT 1",
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

module.exports = { register, login, logout, getCurrentUser };
