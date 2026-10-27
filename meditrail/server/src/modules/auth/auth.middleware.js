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
      "SELECT id, full_name, email, role, must_change_password, session_version FROM users WHERE id = ? AND is_active = TRUE LIMIT 1",
      [claims.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Your session is invalid or has expired. Please log in again.",
      });
    }

    const user = rows[0];
    const tokenVersion = claims.ver === undefined ? 0 : Number(claims.ver);
    if (!Number.isSafeInteger(tokenVersion) || tokenVersion !== Number(user.session_version)) {
      return res.status(401).json({
        success: false,
        message: "Your session is no longer valid. Please log in again.",
      });
    }

    req.authUser = {
      ...user,
      mustChangePassword: Boolean(user.must_change_password),
    };
    const allowedDuringPasswordChange = new Set([
      "/api/v1/auth/me",
      "/api/v1/auth/logout",
      "/api/v1/auth/change-password",
    ]);
    const requestPath = req.originalUrl.split("?")[0];
    if (req.authUser.mustChangePassword && !allowedDuringPasswordChange.has(requestPath)) {
      return res.status(403).json({
        success: false,
        passwordChangeRequired: true,
        message: "Change your temporary password before using MediTrail.",
      });
    }
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
