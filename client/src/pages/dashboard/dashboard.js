import { icon, renderIcons } from '../../icons.js';
import { api } from '../../api.js';
import { getState } from '../../auth.js';
import { formatCurrency, formatDate, formatDateTime, esc } from '../../format.js';
import { statCard } from '../../ui/statCard.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { fullPageSpinner } from '../../ui/spinner.js';
import { barChart, lineChart } from '../../ui/charts.js';

export async function render(container) {
  container.innerHTML = fullPageSpinner();
  let data;
  try {
    const res = await api.get('/dashboard');
    data = res.data.dashboard;
  } catch {
    container.innerHTML = '<p class="text-sm text-red-600">Failed to load dashboard.</p>';
    return;
  }

  const role = getState().user.role;
  let html;
  if (role === 'SUPER_ADMIN') html = superAdmin(data);
  else if (role === 'HR_ADMIN') html = hrAdmin(data);
  else if (role === 'PAYROLL_ADMIN') html = payrollAdmin(data);
  else if (role === 'MANAGER') html = manager(data);
  else html = employee(data);

  container.innerHTML = html;
  renderIcons();
}

function superAdmin(d) {
  return `
    <div>
      ${pageHeader({ title: 'Super Admin Dashboard', subtitle: 'Company-wide overview of people, payroll, and system activity.' })}

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${statCard({ label: 'Total Employees', value: d.totalEmployees, iconName: 'users', tone: 'brand', hint: `${d.activeEmployees} active` })}
        ${statCard({ label: 'Latest Payroll (Net)', value: formatCurrency(d.totalPayroll), iconName: 'wallet', tone: 'emerald' })}
        ${statCard({ label: 'Payroll Status', value: statusBadge(d.payrollStatus), iconName: 'activity', tone: 'amber' })}
        ${statCard({ label: 'Pending Leave Requests', value: d.leaveOverview?.pending ?? 0, iconName: 'calendar-clock', tone: 'slate' })}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Department Statistics</h3>
          ${barChart(d.departmentStats || [], { xKey: 'name', series: [{ key: 'employees', color: '#4f46e5', label: 'Employees' }] })}
        </div>
        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Payroll Trends</h3>
          ${lineChart(d.payrollTrends || [], {
            xKey: 'period',
            series: [
              { key: 'gross', color: '#a5b4fc', label: 'Gross' },
              { key: 'net', color: '#4f46e5', label: 'Net' },
            ],
          })}
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div class="card lg:col-span-1">
          <h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            ${icon('calendar-check', 'h-4 w-4 text-brand-600')} Attendance Overview (today)
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-slate-500">Present</span><span class="font-medium text-emerald-600">${d.attendanceOverview?.present ?? 0}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Absent</span><span class="font-medium text-red-600">${d.attendanceOverview?.absent ?? 0}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">On Leave</span><span class="font-medium text-blue-600">${d.attendanceOverview?.onLeave ?? 0}</span></div>
          </div>
        </div>

        <div class="card lg:col-span-2">
          <h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            ${icon('building-2', 'h-4 w-4 text-brand-600')} Recent System Activity
          </h3>
          <ul class="space-y-3 max-h-64 overflow-y-auto">
            ${(d.systemActivity || [])
              .map(
                (log) => `
              <li class="flex items-start justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <div>
                  <p class="font-medium text-slate-700">${esc(log.action.replaceAll('_', ' '))}</p>
                  <p class="text-xs text-slate-400">${esc(log.userName)}</p>
                </div>
                <span class="text-xs text-slate-400 whitespace-nowrap">${formatDateTime(log.createdAt)}</span>
              </li>`
              )
              .join('')}
            ${(d.systemActivity || []).length === 0 ? '<p class="text-sm text-slate-400">No recent activity.</p>' : ''}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function hrAdmin(d) {
  return `
    <div>
      ${pageHeader({ title: 'HR Admin Dashboard', subtitle: 'Employee lifecycle, attendance, and leave at a glance.' })}

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${statCard({ label: 'Total Employees', value: d.totalEmployees, iconName: 'users', tone: 'brand' })}
        ${statCard({ label: 'New Employees (30d)', value: d.newEmployees, iconName: 'user-plus', tone: 'emerald' })}
        ${statCard({ label: 'On Leave Today', value: d.employeesOnLeave, iconName: 'calendar-clock', tone: 'amber' })}
        ${statCard({ label: 'Attendance Today', value: `${d.attendanceSummary?.present ?? 0}/${d.attendanceSummary?.total ?? 0}`, iconName: 'calendar-check', tone: 'slate' })}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">${icon('clock', 'h-4 w-4 text-amber-600')} Pending Leave Requests</h3>
          <ul class="space-y-3">
            ${(d.pendingLeaveRequests || [])
              .map(
                (r) => `
              <li class="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span class="font-medium text-slate-700">${esc(r.employee.firstName)} ${esc(r.employee.lastName)}</span>
                <span class="text-xs text-slate-400">${esc(r.leaveType)} &middot; ${r.days}d</span>
              </li>`
              )
              .join('')}
            ${(d.pendingLeaveRequests || []).length === 0 ? '<p class="text-sm text-slate-400">No pending requests.</p>' : ''}
          </ul>
        </div>

        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">${icon('cake', 'h-4 w-4 text-violet-600')} Upcoming Birthdays &amp; Anniversaries</h3>
          <ul class="space-y-3">
            ${(d.upcomingEvents || [])
              .map(
                (e) => `
              <li class="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span class="font-medium text-slate-700">${esc(e.name)}</span>
                <span class="text-xs text-slate-400 capitalize">${esc(e.type)} &middot; ${formatDate(e.date)}</span>
              </li>`
              )
              .join('')}
            ${(d.upcomingEvents || []).length === 0 ? '<p class="text-sm text-slate-400">Nothing upcoming.</p>' : ''}
          </ul>
        </div>
      </div>

      <div class="card mt-6">
        <h3 class="text-sm font-semibold text-slate-900 mb-4">Employee Status Overview</h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          ${(d.employeeStatusOverview || [])
            .map(
              (s) => `
            <div class="rounded-lg bg-slate-50 p-4 text-center">
              <p class="text-2xl font-semibold text-slate-900">${s.count}</p>
              <p class="text-xs text-slate-500 mt-1">${esc(s.status)}</p>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

function payrollAdmin(d) {
  return `
    <div>
      ${pageHeader({
        title: 'Payroll Admin Dashboard',
        subtitle: `Current period: ${esc(d.currentPeriod ?? '—')}`,
        actionsHtml: `<a href="#/payroll" class="btn-primary">Go to Payroll</a>`,
      })}

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${statCard({ label: 'Total Gross Salary', value: formatCurrency(d.totalGross), iconName: 'trending-up', tone: 'brand' })}
        ${statCard({ label: 'Total Deductions', value: formatCurrency(d.totalDeductions), iconName: 'trending-down', tone: 'amber' })}
        ${statCard({ label: 'Total Net Salary', value: formatCurrency(d.totalNet), iconName: 'wallet', tone: 'emerald' })}
        ${statCard({ label: 'Pending Approvals', value: d.pendingApprovals, iconName: 'clipboard-check', tone: 'slate' })}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div class="card lg:col-span-2">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Payroll Cost Trends</h3>
          ${barChart(d.payrollCostTrends || [], {
            xKey: 'period',
            height: 260,
            formatValue: (v) => formatCurrency(v),
            series: [
              { key: 'gross', color: '#c7d2fe', label: 'Gross' },
              { key: 'net', color: '#4f46e5', label: 'Net' },
            ],
          })}
        </div>

        <div class="card space-y-4">
          <div>
            <p class="text-sm text-slate-500 mb-1">Processing Status</p>
            ${statusBadge(d.processingStatus)}
          </div>
          <div>
            <p class="text-sm text-slate-500 mb-1">Payment Status</p>
            ${statusBadge(d.paymentStatus)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function manager(d) {
  return `
    <div>
      ${pageHeader({ title: 'Manager Dashboard', subtitle: "Your team's attendance and leave at a glance." })}

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${statCard({ label: 'Team Size', value: d.teamSize, iconName: 'users', tone: 'brand' })}
        ${statCard({ label: 'Present Today', value: d.presentToday, iconName: 'user-check', tone: 'emerald' })}
        ${statCard({ label: 'Absent Today', value: d.absentToday, iconName: 'user-x', tone: 'red' })}
        ${statCard({ label: 'Pending Leave Requests', value: (d.pendingLeaveRequests || []).length, iconName: 'calendar-clock', tone: 'amber' })}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Pending Leave Requests</h3>
          <ul class="space-y-3">
            ${(d.pendingLeaveRequests || [])
              .map(
                (r) => `
              <li class="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span class="font-medium text-slate-700">${esc(r.employee.firstName)} ${esc(r.employee.lastName)}</span>
                <span class="text-xs text-slate-400">${esc(r.leaveType)} &middot; ${r.days}d</span>
              </li>`
              )
              .join('')}
            ${(d.pendingLeaveRequests || []).length === 0 ? '<p class="text-sm text-slate-400">No pending requests.</p>' : ''}
          </ul>
        </div>

        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Upcoming Team Leave</h3>
          <ul class="space-y-3">
            ${(d.upcomingTeamLeave || [])
              .map(
                (r) => `
              <li class="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span class="font-medium text-slate-700">${esc(r.employee.firstName)} ${esc(r.employee.lastName)}</span>
                <span class="text-xs text-slate-400">${formatDate(r.startDate)}</span>
              </li>`
              )
              .join('')}
            ${(d.upcomingTeamLeave || []).length === 0 ? '<p class="text-sm text-slate-400">No upcoming leave.</p>' : ''}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function employee(d) {
  return `
    <div>
      ${pageHeader({ title: 'My Dashboard', subtitle: 'Your pay, attendance, and leave — all in one place.' })}

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${statCard({ label: 'Current Salary (CTC)', value: formatCurrency(d.currentSalary?.ctc), iconName: 'wallet', tone: 'brand' })}
        ${statCard({ label: 'Latest Payslip (Net)', value: formatCurrency(d.latestPayslip?.net), iconName: 'receipt', tone: 'emerald' })}
        ${statCard({ label: 'Next Payment Date', value: formatDate(d.nextPaymentDate), iconName: 'calendar-clock', tone: 'amber' })}
        ${statCard({ label: 'Attendance This Month', value: `${d.attendanceSummary?.present ?? 0}/${d.attendanceSummary?.total ?? 0}`, iconName: 'calendar-check', tone: 'slate' })}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Leave Balance</h3>
          <ul class="space-y-3">
            ${(d.leaveBalances || [])
              .map(
                (b) => `
              <li class="flex items-center justify-between text-sm">
                <span class="text-slate-600">${esc(b.leaveType)}</span>
                <span class="font-medium text-slate-800">${b.allocated - b.used} / ${b.allocated} left</span>
              </li>`
              )
              .join('')}
          </ul>
        </div>

        <div class="card lg:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-slate-900">Recent Payroll History</h3>
            <a href="#/payslips" class="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View all ${icon('arrow-right', 'h-3 w-3')}
            </a>
          </div>
          <ul class="space-y-3">
            ${(d.payrollHistory || [])
              .map(
                (p) => `
              <li class="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span class="font-medium text-slate-700">${esc(p.period)}</span>
                <span class="text-slate-500">${formatCurrency(p.net)}</span>
              </li>`
              )
              .join('')}
            ${(d.payrollHistory || []).length === 0 ? '<p class="text-sm text-slate-400">No payroll history yet.</p>' : ''}
          </ul>
        </div>
      </div>

      <div class="card mt-6">
        <h3 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">${icon('megaphone', 'h-4 w-4 text-brand-600')} Company Announcements</h3>
        <ul class="space-y-4">
          ${(d.announcements || [])
            .map(
              (a) => `
            <li class="border-b border-slate-50 pb-3 last:border-0">
              <p class="font-medium text-slate-800 text-sm">${esc(a.title)}</p>
              <p class="text-sm text-slate-500 mt-0.5">${esc(a.body)}</p>
            </li>`
            )
            .join('')}
          ${(d.announcements || []).length === 0 ? '<p class="text-sm text-slate-400">No announcements.</p>' : ''}
        </ul>
      </div>
    </div>
  `;
}
