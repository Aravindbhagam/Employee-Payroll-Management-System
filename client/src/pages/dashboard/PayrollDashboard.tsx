import { Link } from 'react-router-dom';
import { Wallet, TrendingDown, TrendingUp, ClipboardCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';

export function PayrollDashboard({ data }: { data: any }) {
  return (
    <div>
      <PageHeader
        title="Payroll Admin Dashboard"
        subtitle={`Current period: ${data.currentPeriod ?? '—'}`}
        actions={
          <Link to="/payroll" className="btn-primary">
            Go to Payroll
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Gross Salary" value={formatCurrency(data.totalGross)} icon={TrendingUp} tone="brand" />
        <StatCard label="Total Deductions" value={formatCurrency(data.totalDeductions)} icon={TrendingDown} tone="amber" />
        <StatCard label="Total Net Salary" value={formatCurrency(data.totalNet)} icon={Wallet} tone="emerald" />
        <StatCard label="Pending Approvals" value={data.pendingApprovals} icon={ClipboardCheck} tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Payroll Cost Trends</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.payrollCostTrends}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="gross" fill="#c7d2fe" radius={[4, 4, 0, 0]} name="Gross" />
              <Bar dataKey="net" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Net" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card space-y-4">
          <div>
            <p className="text-sm text-slate-500 mb-1">Processing Status</p>
            <StatusBadge status={data.processingStatus} />
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">Payment Status</p>
            <StatusBadge status={data.paymentStatus} />
          </div>
        </div>
      </div>
    </div>
  );
}
