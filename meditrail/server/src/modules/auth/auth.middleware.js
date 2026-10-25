const jwt = require("jsonwebtoken");
const pool = require("../../config/db");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  return secret && Buffer.byteLength(secret, "utf8") >= 32 ? secret : null;
}

async function requireAuth(req, res, next) {
  const secret = getJwtSecret();
  if (!secret) {
    return res.status(503).json({
      success: false,
      message: "Authentication is not configured on the server.",
    });
  }

  const token = req.cookies && req.cookies.meditrail_token;
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue.",
    });
  }

  let claims;
  try {
    claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Your session is invalid or has expired. Please log in again.",
    });
  }

  if (!claims.sub || !/^\d+$/.test(String(claims.sub))) {
    return res.status(401).json({
      success: false,
      message: "Your session is invalid or has expired. Please log in again.",
    });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT id, full_name, email, role FROM users WHERE id = ? AND is_active = TRUE LIMIT 1",
      [claims.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Your session is invalid or has expired. Please log in again.",
      });
    }

    req.authUser = rows[0];
    return next();
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to verify your session right now.",
    });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.authUser || !allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    return next();
  };
}

module.exports = { getJwtSecret, requireAuth, requireRole };
