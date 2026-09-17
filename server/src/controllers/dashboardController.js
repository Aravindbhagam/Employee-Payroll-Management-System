const { query } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { employeeIdForUser, teamEmployeeIds } = require('../utils/scope');
const { PAYROLL_RUN_COLS, AUDIT_LOG_COLS, LEAVE_REQUEST_COLS, LEAVE_BALANCE_COLS, PAYSLIP_COLS, ANNOUNCEMENT_COLS } = require('../dbColumns');

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

async function superAdminDashboard() {
  const [totalEmployeesRes, departmentsRes, payrollRunsRes, attendanceTodayRes, pendingLeaveRes, recentAuditRes, activeEmployeesRes] = await Promise.all([
    query('SELECT COUNT(*) FROM employees'),
    query(`
      SELECT d.id, d.name, (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS "employeeCount"
      FROM departments d
    `),
    query(`SELECT ${PAYROLL_RUN_COLS} FROM payroll_runs ORDER BY created_at DESC LIMIT 6`),
    query('SELECT status FROM attendance WHERE date >= $1 AND date <= $2', [startOfToday(), endOfToday()]),
    query("SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING'"),
    query(`SELECT ${AUDIT_LOG_COLS} FROM audit_logs ORDER BY created_at DESC LIMIT 10`),
    query("SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE'"),
  ]);

  const totalEmployees = parseInt(totalEmployeesRes.rows[0].count, 10);
  const activeEmployees = parseInt(activeEmployeesRes.rows[0].count, 10);
  const departments = departmentsRes.rows;
  const payrollRuns = payrollRunsRes.rows;
  const attendanceToday = attendanceTodayRes.rows;
  const pendingLeave = parseInt(pendingLeaveRes.rows[0].count, 10);

  const latestRun = payrollRuns[0];
  const latestCompletedRun = payrollRuns.find((r) => r.status === 'COMPLETED') ?? latestRun;
  const presentToday = attendanceToday.filter((a) => a.status === 'PRESENT').length;
  const absentToday = attendanceToday.filter((a) => a.status === 'ABSENT').length;
  const onLeaveToday = attendanceToday.filter((a) => a.status === 'ON_LEAVE').length;

  return {
    role: 'SUPER_ADMIN',
    totalEmployees,
    activeEmployees,
    totalPayroll: latestCompletedRun?.totalNet ?? 0,
    payrollStatus: latestRun?.status ?? 'DRAFT',
    departmentStats: departments.map((d) => ({ name: d.name, employees: parseInt(d.employeeCount, 10) })),
    attendanceOverview: { present: presentToday, absent: absentToday, onLeave: onLeaveToday, total: totalEmployees },
    leaveOverview: { pending: pendingLeave },
    payrollTrends: payrollRuns.map((r) => ({ period: r.period, net: r.totalNet, gross: r.totalGross, status: r.status })).reverse(),
    systemActivity: recentAuditRes.rows,
  };
}

async function hrDashboard() {
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [totalEmployeesRes, newEmployeesRes, onLeaveTodayRes, attendanceTodayRes, pendingLeaveRes, employeesRes, statusGroupsRes] = await Promise.all([
    query('SELECT COUNT(*) FROM employees'),
    query('SELECT COUNT(*) FROM employees WHERE date_of_joining >= $1', [monthAgo]),
    query("SELECT COUNT(*) FROM leave_requests WHERE status = 'APPROVED' AND start_date <= $1 AND end_date >= $2", [endOfToday(), startOfToday()]),
    query('SELECT status FROM attendance WHERE date >= $1 AND date <= $2', [startOfToday(), endOfToday()]),
    query(
      `SELECT l.id, l.employee_id AS "employeeId", l.leave_type AS "leaveType", l.start_date AS "startDate",
         l.end_date AS "endDate", l.days, l.reason, l.status, l.approver_id AS "approverId",
         l.approved_at AS "approvedAt", l.reject_reason AS "rejectReason", l.created_at AS "createdAt",
         e.first_name AS "e_firstName", e.last_name AS "e_lastName"
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.status = 'PENDING'
       ORDER BY l.created_at DESC
       LIMIT 10`
    ),
    query('SELECT first_name AS "firstName", last_name AS "lastName", date_of_birth AS "dateOfBirth", date_of_joining AS "dateOfJoining" FROM employees'),
    query('SELECT status, COUNT(*) AS count FROM employees GROUP BY status'),
  ]);

  const totalEmployees = parseInt(totalEmployeesRes.rows[0].count, 10);
  const newEmployees = parseInt(newEmployeesRes.rows[0].count, 10);
  const onLeaveToday = parseInt(onLeaveTodayRes.rows[0].count, 10);
  const attendanceToday = attendanceTodayRes.rows;
  const employees = employeesRes.rows;

  const pendingLeave = pendingLeaveRes.rows.map((l) => ({
    id: l.id,
    employeeId: l.employeeId,
    leaveType: l.leaveType,
    startDate: l.startDate,
    endDate: l.endDate,
    days: l.days,
    reason: l.reason,
    status: l.status,
    approverId: l.approverId,
    approvedAt: l.approvedAt,
    rejectReason: l.rejectReason,
    createdAt: l.createdAt,
    employee: { firstName: l.e_firstName, lastName: l.e_lastName },
  }));

  const today = new Date();
  const upcoming = employees
    .flatMap((e) => {
      const items = [];
      if (e.dateOfBirth) {
        const bday = new Date(e.dateOfBirth);
        bday.setFullYear(today.getFullYear());
        if (bday < today) bday.setFullYear(today.getFullYear() + 1);
        items.push({ name: `${e.firstName} ${e.lastName}`, type: 'birthday', date: bday });
      }
      const anniv = new Date(e.dateOfJoining);
      anniv.setFullYear(today.getFullYear());
      if (anniv < today) anniv.setFullYear(today.getFullYear() + 1);
      items.push({ name: `${e.firstName} ${e.lastName}`, type: 'anniversary', date: anniv });
      return items;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 8);

  const presentToday = attendanceToday.filter((a) => a.status === 'PRESENT').length;

  return {
    role: 'HR_ADMIN',
    totalEmployees,
    newEmployees,
    employeesOnLeave: onLeaveToday,
    attendanceSummary: { present: presentToday, total: totalEmployees },
    pendingLeaveRequests: pendingLeave,
    upcomingEvents: upcoming,
    employeeStatusOverview: statusGroupsRes.rows.map((g) => ({ status: g.status, count: parseInt(g.count, 10) })),
  };
}

async function payrollDashboard() {
  const [latestRunRes, runsRes, pendingApprovalRes] = await Promise.all([
    query(`SELECT ${PAYROLL_RUN_COLS} FROM payroll_runs ORDER BY created_at DESC LIMIT 1`),
    query(`SELECT ${PAYROLL_RUN_COLS} FROM payroll_runs ORDER BY created_at DESC LIMIT 6`),
    query("SELECT COUNT(*) FROM payroll_runs WHERE status = 'PENDING_APPROVAL'"),
  ]);

  const latestRun = latestRunRes.rows[0];
  const runs = runsRes.rows;

  return {
    role: 'PAYROLL_ADMIN',
    currentPeriod: latestRun?.period ?? null,
    totalGross: latestRun?.totalGross ?? 0,
    totalDeductions: latestRun?.totalDeductions ?? 0,
    totalNet: latestRun?.totalNet ?? 0,
    processingStatus: latestRun?.status ?? 'DRAFT',
    pendingApprovals: parseInt(pendingApprovalRes.rows[0].count, 10),
    paymentStatus: latestRun?.status === 'COMPLETED' ? 'PAID' : 'UNPAID',
    payrollCostTrends: runs.map((r) => ({ period: r.period, net: r.totalNet, gross: r.totalGross, status: r.status })).reverse(),
  };
}

async function managerDashboard(userId) {
  const ids = await teamEmployeeIds(userId);
  const [teamRes, attendanceTodayRes, pendingLeaveRes, upcomingLeaveRes] = await Promise.all([
    query('SELECT id FROM employees WHERE id = ANY($1)', [ids]),
    query('SELECT employee_id AS "employeeId", status FROM attendance WHERE employee_id = ANY($1) AND date >= $2 AND date <= $3', [ids, startOfToday(), endOfToday()]),
    query(
      `SELECT l.id, l.employee_id AS "employeeId", l.leave_type AS "leaveType", l.start_date AS "startDate",
         l.end_date AS "endDate", l.days, l.reason, l.status, l.approver_id AS "approverId",
         l.approved_at AS "approvedAt", l.reject_reason AS "rejectReason", l.created_at AS "createdAt",
         e.first_name AS "e_firstName", e.last_name AS "e_lastName"
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.employee_id = ANY($1) AND l.status = 'PENDING'`,
      [ids]
    ),
    query(
      `SELECT l.id, l.employee_id AS "employeeId", l.leave_type AS "leaveType", l.start_date AS "startDate",
         l.end_date AS "endDate", l.days, l.reason, l.status, l.approver_id AS "approverId",
         l.approved_at AS "approvedAt", l.reject_reason AS "rejectReason", l.created_at AS "createdAt",
         e.first_name AS "e_firstName", e.last_name AS "e_lastName"
       FROM leave_requests l
       JOIN employees e ON e.id = l.employee_id
       WHERE l.employee_id = ANY($1) AND l.status = 'APPROVED' AND l.start_date >= $2
       ORDER BY l.start_date ASC
       LIMIT 5`,
      [ids, new Date()]
    ),
  ]);

  function mapLeave(l) {
    return {
      id: l.id,
      employeeId: l.employeeId,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
      days: l.days,
      reason: l.reason,
      status: l.status,
      approverId: l.approverId,
      approvedAt: l.approvedAt,
      rejectReason: l.rejectReason,
      createdAt: l.createdAt,
      employee: { firstName: l.e_firstName, lastName: l.e_lastName },
    };
  }

  const attendanceToday = attendanceTodayRes.rows;
  const present = attendanceToday.filter((a) => a.status === 'PRESENT').length;
  const absent = attendanceToday.filter((a) => a.status === 'ABSENT').length;

  return {
    role: 'MANAGER',
    teamSize: teamRes.rows.length,
    presentToday: present,
    absentToday: absent,
    pendingLeaveRequests: pendingLeaveRes.rows.map(mapLeave),
    teamAttendance: attendanceToday.map((a) => ({ employeeId: a.employeeId, status: a.status })),
    upcomingTeamLeave: upcomingLeaveRes.rows.map(mapLeave),
  };
}

function nextPayDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

async function employeeDashboard(userId) {
  const employeeId = await employeeIdForUser(userId);
  if (!employeeId) return { role: 'EMPLOYEE' };

  const [salaryStructureRes, latestPayslipRes, leaveBalancesRes, attendanceThisMonthRes, pendingLeaveRes, payrollHistoryRes, announcementsRes] = await Promise.all([
    query('SELECT ctc, basic FROM salary_structures WHERE employee_id = $1 AND is_active = true LIMIT 1', [employeeId]),
    query(`SELECT ${PAYSLIP_COLS} FROM payslips WHERE employee_id = $1 ORDER BY generated_at DESC LIMIT 1`, [employeeId]),
    query(`SELECT ${LEAVE_BALANCE_COLS} FROM leave_balances WHERE employee_id = $1 AND year = $2`, [employeeId, new Date().getFullYear()]),
    query('SELECT status FROM attendance WHERE employee_id = $1 AND date >= $2', [employeeId, startOfMonth()]),
    query(`SELECT ${LEAVE_REQUEST_COLS} FROM leave_requests WHERE employee_id = $1 AND status = 'PENDING'`, [employeeId]),
    query(`SELECT ${PAYSLIP_COLS} FROM payslips WHERE employee_id = $1 ORDER BY generated_at DESC LIMIT 6`, [employeeId]),
    query(`SELECT ${ANNOUNCEMENT_COLS} FROM announcements WHERE audience = 'ALL' ORDER BY created_at DESC LIMIT 5`),
  ]);

  const salaryStructure = salaryStructureRes.rows[0];
  const attendanceThisMonth = attendanceThisMonthRes.rows;
  const present = attendanceThisMonth.filter((a) => a.status === 'PRESENT').length;

  return {
    role: 'EMPLOYEE',
    currentSalary: salaryStructure ? { ctc: salaryStructure.ctc, basic: salaryStructure.basic } : null,
    latestPayslip: latestPayslipRes.rows[0] || null,
    nextPaymentDate: nextPayDate(),
    leaveBalances: leaveBalancesRes.rows,
    attendanceSummary: { present, total: attendanceThisMonth.length },
    payrollHistory: payrollHistoryRes.rows,
    pendingLeaveRequests: pendingLeaveRes.rows,
    announcements: announcementsRes.rows,
  };
}

const getDashboard = asyncHandler(async (req, res) => {
  const user = req.user;
  let data;
  switch (user.role) {
    case 'SUPER_ADMIN':
      data = await superAdminDashboard();
      break;
    case 'HR_ADMIN':
      data = await hrDashboard();
      break;
    case 'PAYROLL_ADMIN':
      data = await payrollDashboard();
      break;
    case 'MANAGER':
      data = await managerDashboard(user.id);
      break;
    default:
      data = await employeeDashboard(user.id);
  }
  res.json({ dashboard: data });
});

module.exports = { getDashboard };
