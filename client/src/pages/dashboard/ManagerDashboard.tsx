import { Users, UserCheck, UserX, CalendarClock } from 'lucide-react';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';
import { formatDate } from '../../utils/format';

export function ManagerDashboard({ data }: { data: any }) {
  return (
    <div>
      <PageHeader title="Manager Dashboard" subtitle="Your team's attendance and leave at a glance." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Team Size" value={data.teamSize} icon={Users} tone="brand" />
        <StatCard label="Present Today" value={data.presentToday} icon={UserCheck} tone="emerald" />
        <StatCard label="Absent Today" value={data.absentToday} icon={UserX} tone="red" />
        <StatCard label="Pending Leave Requests" value={data.pendingLeaveRequests?.length ?? 0} icon={CalendarClock} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Pending Leave Requests</h3>
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
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Upcoming Team Leave</h3>
          <ul className="space-y-3">
            {(data.upcomingTeamLeave ?? []).map((r: any) => (
              <li key={r.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span className="font-medium text-slate-700">
                  {r.employee.firstName} {r.employee.lastName}
                </span>
                <span className="text-xs text-slate-400">{formatDate(r.startDate)}</span>
              </li>
            ))}
            {(data.upcomingTeamLeave ?? []).length === 0 && <p className="text-sm text-slate-400">No upcoming leave.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
