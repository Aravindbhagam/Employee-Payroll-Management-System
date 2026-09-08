import { Users, Wallet, Building2, CalendarCheck, CalendarClock, Activity } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency, formatDateTime } from '../../utils/format';

export function SuperAdminDashboard({ data }: { data: any }) {
  return (
    <div>
      <PageHeader title="Super Admin Dashboard" subtitle="Company-wide overview of people, payroll, and system activity." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Employees" value={data.totalEmployees} icon={Users} tone="brand" hint={`${data.activeEmployees} active`} />
        <StatCard label="Latest Payroll (Net)" value={formatCurrency(data.totalPayroll)} icon={Wallet} tone="emerald" />
        <StatCard label="Payroll Status" value={<StatusBadge status={data.payrollStatus} />} icon={Activity} tone="amber" />
        <StatCard label="Pending Leave Requests" value={data.leaveOverview?.pending ?? 0} icon={CalendarClock} tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Department Statistics</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.departmentStats}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="employees" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Payroll Trends</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.payrollTrends}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="gross" stroke="#a5b4fc" strokeWidth={2} dot={false} name="Gross" />
              <Line type="monotone" dataKey="net" stroke="#4f46e5" strokeWidth={2} dot={false} name="Net" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="card lg:col-span-1">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-brand-600" /> Attendance Overview (today)
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Present</span>
              <span className="font-medium text-emerald-600">{data.attendanceOverview?.present ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Absent</span>
              <span className="font-medium text-red-600">{data.attendanceOverview?.absent ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">On Leave</span>
              <span className="font-medium text-blue-600">{data.attendanceOverview?.onLeave ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-brand-600" /> Recent System Activity
          </h3>
          <ul className="space-y-3 max-h-64 overflow-y-auto">
            {(data.systemActivity ?? []).map((log: any) => (
              <li key={log.id} className="flex items-start justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <div>
                  <p className="font-medium text-slate-700">{log.action.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-slate-400">{log.userName}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{formatDateTime(log.createdAt)}</span>
              </li>
            ))}
            {(data.systemActivity ?? []).length === 0 && <p className="text-sm text-slate-400">No recent activity.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
