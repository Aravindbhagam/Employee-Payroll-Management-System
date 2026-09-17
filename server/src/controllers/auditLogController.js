const { query } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');
const { AUDIT_LOG_COLS } = require('../dbColumns');

const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, entityType, userId, from, to } = req.query;

  const conditions = [];
  const params = [];
  function addParam(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (action) conditions.push(`action ILIKE ${addParam(`%${action}%`)}`);
  if (entityType) conditions.push(`entity_type = ${addParam(entityType)}`);
  if (userId) conditions.push(`user_id = ${addParam(userId)}`);
  if (from) conditions.push(`created_at >= ${addParam(new Date(from))}`);
  if (to) conditions.push(`created_at <= ${addParam(new Date(to))}`);

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pagination = parsePagination(req, { defaultPageSize: 50 });
  const limitOffsetSql = ` LIMIT ${addParam(pagination.take)} OFFSET ${addParam(pagination.skip)}`;

  const [logsRes, countRes] = await Promise.all([
    query(`SELECT ${AUDIT_LOG_COLS} FROM audit_logs ${whereSql} ORDER BY created_at DESC${limitOffsetSql}`, params),
    query(`SELECT COUNT(*) FROM audit_logs ${whereSql}`, params.slice(0, params.length - 2)),
  ]);

  const parsed = logsRes.rows.map((l) => ({
    ...l,
    previousValue: l.previousValue ? JSON.parse(l.previousValue) : null,
    newValue: l.newValue ? JSON.parse(l.newValue) : null,
  }));

  res.json({ logs: parsed, total: parseInt(countRes.rows[0].count, 10), page: pagination.page, pageSize: pagination.pageSize });
});

module.exports = { listAuditLogs };
