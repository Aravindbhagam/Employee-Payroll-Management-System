const { query } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { employeeScopeFilter } = require('../utils/scope');

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
  }
  return lines.join('\n');
}

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

const runReport = asyncHandler(async (req, res) => {
  const user = req.user;
  const type = req.query.type || 'employees';
  const format = req.query.format || 'json';
  const scope = await employeeScopeFilter(user);

  let rows = [];

  if (type === 'employees') {
    const conditions = [];
    const params = [];
    if (scope) {
      if (scope.in.length === 0) conditions.push('FALSE');
      else {
        params.push(scope.in);
        conditions.push(`e.id = ANY($${params.length})`);
      }
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: employees } = await query(
      `SELECT e.first_name AS "firstName", e.last_name AS "lastName", e.date_of_joining AS "dateOfJoining", e.status,
         d.name AS "departmentName", de.title AS "designationTitle",
         u.email AS "userEmail", u.role AS "userRole"
       FROM employees e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN designations de ON de.id = e.designation_id
       ${whereSql}`,
      params
    );
    rows = employees.map((e) => ({
      employee: `${e.firstName} ${e.lastName}`,
      email: e.userEmail,
      department: e.departmentName ?? '',
      designation: e.designationTitle ?? '',
      role: e.userRole,
      status: e.status,
      dateOfJoining: isoDate(e.dateOfJoining),
    }));
  } else if (type === 'attendance') {
    if (user.role === 'PAYROLL_ADMIN') throw new ApiError(403, "You don't have permission to run attendance reports.");
    const conditions = [];
    const params = [];
    if (scope) {
      if (scope.in.length === 0) conditions.push('FALSE');
      else {
        params.push(scope.in);
        conditions.push(`a.employee_id = ANY($${params.length})`);
      }
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: records } = await query(
      `SELECT a.date, a.status, a.hours_worked AS "hoursWorked", e.first_name AS "firstName", e.last_name AS "lastName"
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       ${whereSql}
       ORDER BY a.date DESC
       LIMIT 500`,
      params
    );
    rows = records.map((r) => ({ employee: `${r.firstName} ${r.lastName}`, date: isoDate(r.date), status: r.status, hoursWorked: r.hoursWorked }));
  } else if (type === 'leave') {
    const conditions = [];
    const params = [];
    if (scope) {
      if (scope.in.length === 0) conditions.push('FALSE');
      else {
        params.push(scope.in);
        conditions.push(`l.employee_id = ANY($${params.length})`);
      }
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows: records } = await query(
      `SELECT l.leave_type AS "leaveType", l.start_date AS "startDate", l.end_date AS "endDate", l.days, l.status,
         e.first_name AS "firstName", e.last_name AS "lastName"
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT 500`,
      params
    );
    rows = records.map((r) => ({ employee: `${r.firstName} ${r.lastName}`, type: r.leaveType, from: isoDate(r.startDate), to: isoDate(r.endDate), days: r.days, status: r.status }));
  } else if (type === 'payroll') {
    if (user.role === 'HR_ADMIN' || user.role === 'MANAGER' || user.role === 'EMPLOYEE') {
      throw new ApiError(403, "You don't have permission to run payroll reports.");
    }
    const { rows: runs } = await query(
      `SELECT period, status, total_gross AS "totalGross", total_deductions AS "totalDeductions",
         total_net AS "totalNet", employee_count AS "employeeCount"
       FROM payroll_runs ORDER BY created_at DESC LIMIT 24`
    );
    rows = runs.map((r) => ({ period: r.period, status: r.status, gross: r.totalGross, deductions: r.totalDeductions, net: r.totalNet, employees: r.employeeCount }));
  } else {
    throw new ApiError(400, `Unknown report type: ${type}`);
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
    return res.send(toCsv(rows));
  }

  res.json({ type, rows });
});

module.exports = { runReport };
