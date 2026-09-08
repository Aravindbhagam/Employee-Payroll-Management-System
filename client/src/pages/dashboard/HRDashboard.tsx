import { Users, UserPlus, CalendarClock, CalendarCheck, Cake, Clock } from 'lucide-react';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';
import { formatDate } from '../../utils/format';

export function HRDashboard({ data }: { data: any }) {
  return (
    <div>
      <PageHeader title="HR Admin Dashboard" subtitle="Employee lifecycle, attendance, and leave at a glance." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Employees" value={data.totalEmployees} icon={Users} tone="brand" />
        <StatCard label="New Employees (30d)" value={data.newEmployees} icon={UserPlus} tone="emerald" />
        <StatCard label="On Leave Today" value={data.employeesOnLeave} icon={CalendarClock} tone="amber" />
        <StatCard
          label="Attendance Today"
          value={`${data.attendanceSummary?.present ?? 0}/${data.attendanceSummary?.total ?? 0}`}
          icon={CalendarCheck}
          tone="slate"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" /> Pending Leave Requests
          </h3>
          <ul className="space-y-3">
            {(data.pendingLeaveRequests ?? []).map((r: any) => (
              <li key={r.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span className="font-medium text-slate-700">
                  {r.employee.firstName} {r.employee.lastName}
                </span>
                <span className="text-xs text-slate-400">
                  {r.leaveType} &middot; {r.days}d
                </span>
              </li>
            ))}
            {(data.pendingLeaveRequests ?? []).length === 0 && <p className="text-sm text-slate-400">No pending requests.</p>}
          </ul>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Cake className="h-4 w-4 text-violet-600" /> Upcoming Birthdays &amp; Anniversaries
          </h3>
          <ul className="space-y-3">
            {(data.upcomingEvents ?? []).map((e: any, i: number) => (
              <li key={i} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span className="font-medium text-slate-700">{e.name}</span>
                <span className="text-xs text-slate-400 capitalize">
                  {e.type} &middot; {formatDate(e.date)}
                </span>
              </li>
            ))}
            {(data.upcomingEvents ?? []).length === 0 && <p className="text-sm text-slate-400">Nothing upcoming.</p>}
          </ul>
        </div>
      </div>

      <div className="card mt-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Employee Status Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(data.employeeStatusOverview ?? []).map((s: any) => (
            <div key={s.status} className="rounded-lg bg-slate-50 p-4 text-center">
              <p className="text-2xl font-semibold text-slate-900">{s.count}</p>
              <p className="text-xs text-slate-500 mt-1">{s.status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
