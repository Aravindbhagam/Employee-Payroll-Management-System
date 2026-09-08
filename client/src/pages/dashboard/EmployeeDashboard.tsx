import { Link } from 'react-router-dom';
import { Wallet, Receipt, CalendarClock, CalendarCheck, Megaphone, ArrowRight } from 'lucide-react';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency, formatDate } from '../../utils/format';

export function EmployeeDashboard({ data }: { data: any }) {
  return (
    <div>
      <PageHeader title="My Dashboard" subtitle="Your pay, attendance, and leave — all in one place." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Current Salary (CTC)" value={formatCurrency(data.currentSalary?.ctc)} icon={Wallet} tone="brand" />
        <StatCard label="Latest Payslip (Net)" value={formatCurrency(data.latestPayslip?.net)} icon={Receipt} tone="emerald" />
        <StatCard label="Next Payment Date" value={formatDate(data.nextPaymentDate)} icon={CalendarClock} tone="amber" />
        <StatCard
          label="Attendance This Month"
          value={`${data.attendanceSummary?.present ?? 0}/${data.attendanceSummary?.total ?? 0}`}
          icon={CalendarCheck}
          tone="slate"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Leave Balance</h3>
          <ul className="space-y-3">
            {(data.leaveBalances ?? []).map((b: any) => (
              <li key={b.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{b.leaveType}</span>
                <span className="font-medium text-slate-800">
                  {b.allocated - b.used} / {b.allocated} left
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent Payroll History</h3>
            <Link to="/payslips" className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="space-y-3">
            {(data.payrollHistory ?? []).map((p: any) => (
              <li key={p.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span className="font-medium text-slate-700">{p.period}</span>
                <span className="text-slate-500">{formatCurrency(p.net)}</span>
              </li>
            ))}
            {(data.payrollHistory ?? []).length === 0 && <p className="text-sm text-slate-400">No payroll history yet.</p>}
          </ul>
        </div>
      </div>

      <div className="card mt-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-brand-600" /> Company Announcements
        </h3>
        <ul className="space-y-4">
          {(data.announcements ?? []).map((a: any) => (
            <li key={a.id} className="border-b border-slate-50 pb-3 last:border-0">
              <p className="font-medium text-slate-800 text-sm">{a.title}</p>
              <p className="text-sm text-slate-500 mt-0.5">{a.body}</p>
            </li>
          ))}
          {(data.announcements ?? []).length === 0 && <p className="text-sm text-slate-400">No announcements.</p>}
        </ul>
      </div>
    </div>
  );
}
