const { query } = require('../db');
const { logger } = require('../config/logger');
const { newId } = require('./id');

async function recordAudit(params) {
  const { req, userId, userName, action, entityType, entityId, previousValue, newValue } = params;
  try {
    await query(
      `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newId(),
        userId ?? null,
        userName,
        action,
        entityType,
        entityId ?? null,
        previousValue !== undefined ? JSON.stringify(previousValue) : null,
        newValue !== undefined ? JSON.stringify(newValue) : null,
        req?.ip ?? null,
        req?.headers['user-agent'] ?? null,
      ]
    );
  } catch (err) {
    // Auditing must never break the primary request flow.
    logger.error({ err, action, entityType }, 'Failed to write audit log');
  }
}

module.exports = { recordAudit };
