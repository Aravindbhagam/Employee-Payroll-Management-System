const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { employeeIdForUser, employeeScopeFilter, teamEmployeeIds } = require('../utils/scope');
const { parsePagination } = require('../utils/pagination');
const { newId } = require('../utils/id');
const { LEAVE_REQUEST_COLS } = require('../dbColumns');

const LEAVE_JOIN_SELECT = `
  SELECT l.id, l.employee_id AS "employeeId", l.leave_type AS "leaveType", l.start_date AS "startDate",
    l.end_date AS "endDate", l.days, l.reason, l.status, l.approver_id AS "approverId",
    l.approved_at AS "approvedAt", l.reject_reason AS "rejectReason", l.created_at AS "createdAt",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName", d.name AS "d_name"
  FROM leave_requests l
  JOIN employees e ON e.id = l.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
`;

function mapLeaveRow(row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    days: row.days,
    reason: row.reason,
    status: row.status,
    approverId: row.approverId,
    approvedAt: row.approvedAt,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
    employee: { firstName: row.e_firstName, lastName: row.e_lastName, id: row.employeeId, department: row.d_name ? { name: row.d_name } : null },
  };
}

const listLeaveRequests = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const { status, employeeId } = req.query;

  const conditions = [];
  const params = [];
  function addParam(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (scope) {
    if (employeeId) {
      if (!scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's leave.");
      conditions.push(`l.employee_id = ${addParam(employeeId)}`);
    } else if (scope.in.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(`l.employee_id = ANY(${addParam(scope.in)})`);
    }
  } else if (employeeId) {
    conditions.push(`l.employee_id = ${addParam(employeeId)}`);
  }
  if (status) conditions.push(`l.status = ${addParam(status)}`);

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pagination = parsePagination(req, { optIn: true });
  const limitOffsetSql = pagination ? ` LIMIT ${addParam(pagination.take)} OFFSET ${addParam(pagination.skip)}` : '';

  const [requestsRes, countRes] = await Promise.all([
    query(`${LEAVE_JOIN_SELECT} ${whereSql} ORDER BY l.created_at DESC${limitOffsetSql}`, params),
    pagination ? query(`SELECT COUNT(*) FROM leave_requests l ${whereSql}`, params.slice(0, params.length - 2)) : Promise.resolve(null),
  ]);

  res.json({
    leaveRequests: requestsRes.rows.map(mapLeaveRow),
    ...(pagination ? { total: parseInt(countRes.rows[0].count, 10), page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

const listLeaveBalances = asyncHandler(async (req, res) => {
  const user = req.user;
  const employeeId = req.query.employeeId || (await employeeIdForUser(user.id));
  if (!employeeId) return res.json({ balances: [] });

  const scope = await employeeScopeFilter(user);
  if (scope && !scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's leave balance.");

  const year = new Date().getFullYear();
  const { rows } = await query('SELECT id, employee_id AS "employeeId", leave_type AS "leaveType", year, allocated, used FROM leave_balances WHERE employee_id = $1 AND year = $2', [
    employeeId,
    year,
  ]);
  res.json({ balances: rows });
});

const applySchema = z.object({
  leaveType: z.enum(['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER']),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

const applyLeave = asyncHandler(async (req, res) => {
  const employeeId = await employeeIdForUser(req.user.id);
  if (!employeeId) throw new ApiError(400, 'No employee profile linked to this account.');
  const data = applySchema.parse(req.body);
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  if (endDate < startDate) throw new ApiError(400, 'End date cannot be before start date.');
  const days = daysBetween(startDate, endDate);

  const id = newId();
  await query(
    `INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
    [id, employeeId, data.leaveType, startDate, endDate, days, data.reason || null]
  );
  const { rows } = await query(`SELECT ${LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = $1`, [id]);
  const request = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'LEAVE_APPLIED', entityType: 'LeaveRequest', entityId: request.id, newValue: data });
  res.status(201).json({ leaveRequest: request });
});

const cancelLeave = asyncHandler(async (req, res) => {
  const employeeId = await employeeIdForUser(req.user.id);
  const requestRes = await query(`SELECT ${LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = $1`, [req.params.id]);
  const request = requestRes.rows[0];
  if (!request) return res.status(404).json({ error: 'Leave request not found.' });
  if (request.employeeId !== employeeId) throw new ApiError(403, 'You can only cancel your own leave requests.');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only pending requests can be cancelled.');

  const { rows } = await query(`UPDATE leave_requests SET status = 'CANCELLED' WHERE id = $1 RETURNING ${LEAVE_REQUEST_COLS}`, [request.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'LEAVE_CANCELLED', entityType: 'LeaveRequest', entityId: request.id });
  res.json({ leaveRequest: rows[0] });
});

async function assertApproverScope(req, request) {
  const user = req.user;
  if (user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN') return;
  if (user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user.id);
    if (!ids.includes(request.employeeId)) throw new ApiError(403, 'You can only approve leave for your own team.');
    return;
  }
  throw new ApiError(403, "You don't have permission to approve leave requests.");
}

const approveLeave = asyncHandler(async (req, res) => {
  const requestRes = await query(`SELECT ${LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = $1`, [req.params.id]);
  const request = requestRes.rows[0];
  if (!request) return res.status(404).json({ error: 'Leave request not found.' });
  await assertApproverScope(req, request);
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only pending requests can be approved.');

  const { rows } = await query(
    `UPDATE leave_requests SET status = 'APPROVED', approver_id = $1, approved_at = $2 WHERE id = $3 RETURNING ${LEAVE_REQUEST_COLS}`,
    [req.user.id, new Date(), request.id]
  );

  const year = new Date(request.startDate).getFullYear();
  await query(
    `INSERT INTO leave_balances (id, employee_id, leave_type, year, allocated, used)
     VALUES ($1, $2, $3, $4, 0, $5)
     ON CONFLICT (employee_id, leave_type, year) DO UPDATE SET used = leave_balances.used + EXCLUDED.used`,
    [newId(), request.employeeId, request.leaveType, year, request.days]
  );

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'LEAVE_APPROVED', entityType: 'LeaveRequest', entityId: request.id });
  res.json({ leaveRequest: rows[0] });
});

const rejectSchema = z.object({ reason: z.string().optional() });

const rejectLeave = asyncHandler(async (req, res) => {
  const requestRes = await query(`SELECT ${LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = $1`, [req.params.id]);
  const request = requestRes.rows[0];
  if (!request) return res.status(404).json({ error: 'Leave request not found.' });
  await assertApproverScope(req, request);
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only pending requests can be rejected.');

  const { reason } = rejectSchema.parse(req.body ?? {});
  const { rows } = await query(
    `UPDATE leave_requests SET status = 'REJECTED', approver_id = $1, approved_at = $2, reject_reason = $3 WHERE id = $4 RETURNING ${LEAVE_REQUEST_COLS}`,
    [req.user.id, new Date(), reason || null, request.id]
  );
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'LEAVE_REJECTED', entityType: 'LeaveRequest', entityId: request.id, newValue: { reason } });
  res.json({ leaveRequest: rows[0] });
});

module.exports = { listLeaveRequests, listLeaveBalances, applyLeave, cancelLeave, approveLeave, rejectLeave };
