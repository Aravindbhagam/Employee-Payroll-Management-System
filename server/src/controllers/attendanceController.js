const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { employeeIdForUser, employeeScopeFilter } = require('../utils/scope');
const { parsePagination } = require('../utils/pagination');
const { newId } = require('../utils/id');

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const ATTENDANCE_JOIN_SELECT = `
  SELECT a.id, a.employee_id AS "employeeId", a.date, a.check_in AS "checkIn", a.check_out AS "checkOut",
    a.status, a.hours_worked AS "hoursWorked",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName",
    d.name AS "d_name"
  FROM attendance a
  JOIN employees e ON e.id = a.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
`;

function mapAttendanceRow(row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    status: row.status,
    hoursWorked: row.hoursWorked,
    employee: { firstName: row.e_firstName, lastName: row.e_lastName, id: row.employeeId, department: row.d_name ? { name: row.d_name } : null },
  };
}

const listAttendance = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const { employeeId, from, to, month } = req.query;

  const conditions = [];
  const params = [];
  function addParam(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (scope) {
    if (employeeId) {
      if (!scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's attendance.");
      conditions.push(`a.employee_id = ${addParam(employeeId)}`);
    } else if (scope.in.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(`a.employee_id = ANY(${addParam(scope.in)})`);
    }
  } else if (employeeId) {
    conditions.push(`a.employee_id = ${addParam(employeeId)}`);
  }

  if (from || to) {
    if (from) conditions.push(`a.date >= ${addParam(new Date(from))}`);
    if (to) conditions.push(`a.date <= ${addParam(new Date(to))}`);
  }
  if (month) {
    const [y, m] = month.split('-').map(Number);
    conditions.push(`a.date >= ${addParam(new Date(y, m - 1, 1))} AND a.date < ${addParam(new Date(y, m, 1))}`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pagination = parsePagination(req, { optIn: true });
  const limitOffsetSql = pagination ? ` LIMIT ${addParam(pagination.take)} OFFSET ${addParam(pagination.skip)}` : '';

  const [recordsRes, countRes] = await Promise.all([
    query(`${ATTENDANCE_JOIN_SELECT} ${whereSql} ORDER BY a.date DESC${limitOffsetSql}`, params),
    pagination ? query(`SELECT COUNT(*) FROM attendance a ${whereSql}`, params.slice(0, params.length - 2)) : Promise.resolve(null),
  ]);

  res.json({
    attendance: recordsRes.rows.map(mapAttendanceRow),
    ...(pagination ? { total: parseInt(countRes.rows[0].count, 10), page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

const checkIn = asyncHandler(async (req, res) => {
  const employeeId = await employeeIdForUser(req.user.id);
  if (!employeeId) throw new ApiError(400, 'No employee profile linked to this account.');
  const today = startOfDay(new Date());
  const { rows } = await query(
    `INSERT INTO attendance (id, employee_id, date, check_in, status)
     VALUES ($1, $2, $3, $4, 'PRESENT')
     ON CONFLICT (employee_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, status = 'PRESENT'
     RETURNING id, employee_id AS "employeeId", date, check_in AS "checkIn", check_out AS "checkOut", status, hours_worked AS "hoursWorked"`,
    [newId(), employeeId, today, new Date().toISOString()]
  );
  const record = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'ATTENDANCE_CHECK_IN', entityType: 'Attendance', entityId: record.id });
  res.json({ attendance: record });
});

const checkOut = asyncHandler(async (req, res) => {
  const employeeId = await employeeIdForUser(req.user.id);
  if (!employeeId) throw new ApiError(400, 'No employee profile linked to this account.');
  const today = startOfDay(new Date());
  const existingRes = await query('SELECT id, check_in AS "checkIn" FROM attendance WHERE employee_id = $1 AND date = $2', [employeeId, today]);
  const existing = existingRes.rows[0];
  if (!existing || !existing.checkIn) throw new ApiError(400, 'You must check in before checking out.');

  const checkOutTime = new Date();
  const hoursWorked = Math.max(0, (checkOutTime.getTime() - new Date(existing.checkIn).getTime()) / 3600000);
  const { rows } = await query(
    `UPDATE attendance SET check_out = $1, hours_worked = $2 WHERE id = $3
     RETURNING id, employee_id AS "employeeId", date, check_in AS "checkIn", check_out AS "checkOut", status, hours_worked AS "hoursWorked"`,
    [checkOutTime.toISOString(), Math.round(hoursWorked * 100) / 100, existing.id]
  );
  const record = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'ATTENDANCE_CHECK_OUT', entityType: 'Attendance', entityId: record.id });
  res.json({ attendance: record });
});

const manualSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND']),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  hoursWorked: z.number().optional(),
});

const upsertManualAttendance = asyncHandler(async (req, res) => {
  const data = manualSchema.parse(req.body);
  const date = startOfDay(new Date(data.date));
  const { rows } = await query(
    `INSERT INTO attendance (id, employee_id, date, status, check_in, check_out, hours_worked)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (employee_id, date) DO UPDATE SET status = EXCLUDED.status, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, hours_worked = EXCLUDED.hours_worked
     RETURNING id, employee_id AS "employeeId", date, check_in AS "checkIn", check_out AS "checkOut", status, hours_worked AS "hoursWorked"`,
    [newId(), data.employeeId, date, data.status, data.checkIn ?? null, data.checkOut ?? null, data.hoursWorked ?? 0]
  );
  const record = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'ATTENDANCE_UPDATED', entityType: 'Attendance', entityId: record.id, newValue: data });
  res.json({ attendance: record });
});

module.exports = { listAttendance, checkIn, checkOut, upsertManualAttendance };
