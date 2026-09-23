import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { employeeIdForUser, teamEmployeeIds } from '../utils/scope.js';

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
  const [totalEmployees, departments, payrollRuns, attendanceToday, pendingLeave, recentAudit, activeEmployees] = await Promise.all([
    prisma.employee.count(),
    prisma.department.findMany({ include: { _count: { select: { employees: true } } } }),
    prisma.payrollRun.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.attendance.findMany({ where: { date: { gte: startOfToday(), lte: endOfToday() } } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
  ]);

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
    departmentStats: departments.map((d) => ({ name: d.name, employees: d._count.employees })),
    attendanceOverview: { present: presentToday, absent: absentToday, onLeave: onLeaveToday, total: totalEmployees },
    leaveOverview: { pending: pendingLeave },
    payrollTrends: payrollRuns.map((r) => ({ period: r.period, net: r.totalNet, gross: r.totalGross, status: r.status })).reverse(),
    systemActivity: recentAudit,
  };
}

async function hrDashboard() {
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [totalEmployees, newEmployees, onLeaveToday, attendanceToday, pendingLeave, employees, statusGroups] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { dateOfJoining: { gte: monthAgo } } }),
    prisma.leaveRequest.count({ where: { status: 'APPROVED', startDate: { lte: endOfToday() }, endDate: { gte: startOfToday() } } }),
    prisma.attendance.findMany({ where: { date: { gte: startOfToday(), lte: endOfToday() } } }),
    prisma.leaveRequest.findMany({ where: { status: 'PENDING' }, include: { employee: { select: { firstName: true, lastName: true } } }, take: 10, orderBy: { createdAt: 'desc' } }),
    prisma.employee.findMany({ select: { firstName: true, lastName: true, dateOfBirth: true, dateOfJoining: true } }),
    prisma.employee.groupBy({ by: ['status'], _count: { status: true } }),
  ]);

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
    employeeStatusOverview: statusGroups.map((g) => ({ status: g.status, count: g._count.status })),
  };
}

async function payrollDashboard() {
  const [latestRun, runs, pendingApproval] = await Promise.all([
    prisma.payrollRun.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.payrollRun.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.payrollRun.count({ where: { status: 'PENDING_APPROVAL' } }),
  ]);

  return {
    role: 'PAYROLL_ADMIN',
    currentPeriod: latestRun?.period ?? null,
    totalGross: latestRun?.totalGross ?? 0,
    totalDeductions: latestRun?.totalDeductions ?? 0,
    totalNet: latestRun?.totalNet ?? 0,
    processingStatus: latestRun?.status ?? 'DRAFT',
    pendingApprovals: pendingApproval,
    paymentStatus: latestRun?.status === 'COMPLETED' ? 'PAID' : 'UNPAID',
    payrollCostTrends: runs.map((r) => ({ period: r.period, net: r.totalNet, gross: r.totalGross, status: r.status })).reverse(),
  };
}

async function managerDashboard(userId) {
  const ids = await teamEmployeeIds(userId);
  const [team, attendanceToday, pendingLeave, upcomingLeave] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: ids } } }),
    prisma.attendance.findMany({ where: { employeeId: { in: ids }, date: { gte: startOfToday(), lte: endOfToday() } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: 'PENDING' }, include: { employee: { select: { firstName: true, lastName: true } } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: 'APPROVED', startDate: { gte: new Date() } }, include: { employee: { select: { firstName: true, lastName: true } } }, take: 5, orderBy: { startDate: 'asc' } }),
  ]);

  const present = attendanceToday.filter((a) => a.status === 'PRESENT').length;
  const absent = attendanceToday.filter((a) => a.status === 'ABSENT').length;

  return {
    role: 'MANAGER',
    teamSize: team.length,
    presentToday: present,
    absentToday: absent,
    pendingLeaveRequests: pendingLeave,
    teamAttendance: attendanceToday.map((a) => ({ employeeId: a.employeeId, status: a.status })),
    upcomingTeamLeave: upcomingLeave,
  };
}

async function employeeDashboard(userId) {
  const employeeId = await employeeIdForUser(userId);
  if (!employeeId) return { role: 'EMPLOYEE' };

  const [salaryStructure, latestPayslip, leaveBalances, attendanceThisMonth, pendingLeave, payrollHistory, announcements] = await Promise.all([
    prisma.salaryStructure.findFirst({ where: { employeeId, isActive: true } }),
    prisma.payslip.findFirst({ where: { employeeId }, orderBy: { generatedAt: 'desc' } }),
    prisma.leaveBalance.findMany({ where: { employeeId, year: new Date().getFullYear() } }),
    prisma.attendance.findMany({ where: { employeeId, date: { gte: startOfMonth() } } }),
    prisma.leaveRequest.findMany({ where: { employeeId, status: 'PENDING' } }),
    prisma.payslip.findMany({ where: { employeeId }, orderBy: { generatedAt: 'desc' }, take: 6 }),
    prisma.announcement.findMany({ where: { audience: 'ALL' }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  const present = attendanceThisMonth.filter((a) => a.status === 'PRESENT').length;

  return {
    role: 'EMPLOYEE',
    currentSalary: salaryStructure ? { ctc: salaryStructure.ctc, basic: salaryStructure.basic } : null,
    latestPayslip,
    nextPaymentDate: nextPayDate(),
    leaveBalances,
    attendanceSummary: { present, total: attendanceThisMonth.length },
    payrollHistory,
    pendingLeaveRequests: pendingLeave,
    announcements,
  };
}

function nextPayDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export const getDashboard = asyncHandler(async (req, res) => {
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
