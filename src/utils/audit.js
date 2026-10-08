async function writeAudit(db, { actorId = null, action, objectType, objectId = null, oldValue = null, newValue = null, result = 'SUCCESS' }) {
  await db.query(
    `INSERT INTO audit_log(actor_id, action, object_type, object_id, old_value, new_value, result)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [actorId, action, objectType, objectId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, result]
  );
}

module.exports = { writeAudit };
