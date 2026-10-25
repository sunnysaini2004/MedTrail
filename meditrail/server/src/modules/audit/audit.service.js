async function writeAudit(connection, event) {
  await connection.execute(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
    [
      event.userId || null,
      event.action,
      event.entityType,
      event.entityId || null,
      event.details ? JSON.stringify(event.details) : null,
    ]
  );
}

module.exports = { writeAudit };
