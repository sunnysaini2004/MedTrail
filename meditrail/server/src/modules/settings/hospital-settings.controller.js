const pool = require("../../config/db");
const { writeAudit } = require("../audit/audit.service");

const FIELD_DEFINITIONS = [
  ["hospitalName", "hospital_name", 160],
  ["officialEmail", "official_email", 254],
  ["contactPhone", "contact_phone", 30],
  ["address", "address", 500],
  ["workingHours", "working_hours", 250],
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanFields(body) {
  if (!isPlainObject(body)) return { error: "Submit hospital settings as an object." };
  const values = {};

  for (const [field, , maxLength] of FIELD_DEFINITIONS) {
    const value = body[field] == null ? "" : body[field];
    if (typeof value !== "string") return { error: "Hospital contact fields must be text." };
    const trimmed = value.trim();
    if (trimmed.length > maxLength) return { error: field + " must be no longer than " + maxLength + " characters." };
    values[field] = trimmed || null;
  }

  if (values.officialEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.officialEmail)) {
    return { error: "Enter a valid hospital email address." };
  }
  if (values.contactPhone && (!/^[+\d][\d\s().-]*$/.test(values.contactPhone) || values.contactPhone.replace(/\D/g, "").length < 7)) {
    return { error: "Enter a valid hospital phone number." };
  }
  return { values };
}

function publicShape(row) {
  if (!row) return null;
  return {
    hospitalName: row.hospitalName || null,
    officialEmail: row.officialEmail || null,
    contactPhone: row.contactPhone || null,
    address: row.address || null,
    workingHours: row.workingHours || null,
  };
}

async function readSettings(connection = pool) {
  const [rows] = await connection.execute(
    "SELECT hospital_name AS hospitalName, official_email AS officialEmail, contact_phone AS contactPhone, address, working_hours AS workingHours FROM hospital_settings WHERE id = 1 LIMIT 1"
  );
  return rows[0] || null;
}

async function getPublicHospitalSettings(req, res) {
  try {
    return res.status(200).json({ success: true, settings: publicShape(await readSettings()) });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load hospital contact details right now." });
  }
}

async function getAdminHospitalSettings(req, res) {
  try {
    const row = publicShape(await readSettings());
    const settings = Object.fromEntries(FIELD_DEFINITIONS.map(([field]) => [field, row?.[field] || ""]));
    return res.status(200).json({ success: true, settings });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load hospital settings right now." });
  }
}

async function updateAdminHospitalSettings(req, res) {
  const validated = cleanFields(req.body);
  if (validated.error) return res.status(400).json({ success: false, message: validated.error });

  const fields = FIELD_DEFINITIONS.map(([field]) => field);
  const values = fields.map((field) => validated.values[field]);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.execute(
      "INSERT INTO hospital_settings (id, hospital_name, official_email, contact_phone, address, working_hours) VALUES (1, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE hospital_name = VALUES(hospital_name), official_email = VALUES(official_email), contact_phone = VALUES(contact_phone), address = VALUES(address), working_hours = VALUES(working_hours)",
      values
    );
    await writeAudit(connection, {
      userId: req.authUser.id,
      action: "HOSPITAL_SETTINGS_UPDATED",
      entityType: "HOSPITAL_SETTINGS",
      entityId: 1,
      details: { updatedFields: fields },
    });
    await connection.commit();
    return res.status(200).json({ success: true, settings: publicShape(await readSettings()) });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    return res.status(500).json({ success: false, message: "Unable to save hospital settings right now." });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { getPublicHospitalSettings, getAdminHospitalSettings, updateAdminHospitalSettings };
