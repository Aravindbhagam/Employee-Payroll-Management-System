import clsx from 'clsx';

const STYLES: Record<string, string> = {
  // Payroll workflow
  DRAFT: 'bg-slate-100 text-slate-600',
  CALCULATING: 'bg-blue-100 text-blue-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
  // Leave / generic
  PENDING: 'bg-amber-100 text-amber-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  // Attendance
  PRESENT: 'bg-emerald-100 text-emerald-700',
  ABSENT: 'bg-red-100 text-red-700',
  HALF_DAY: 'bg-amber-100 text-amber-700',
  ON_LEAVE: 'bg-blue-100 text-blue-700',
  HOLIDAY: 'bg-violet-100 text-violet-700',
  WEEKEND: 'bg-slate-100 text-slate-500',
  // User / employee status
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  LOCKED: 'bg-red-100 text-red-700',
  ONBOARDING: 'bg-blue-100 text-blue-700',
  OFFBOARDING: 'bg-amber-100 text-amber-700',
  OFFBOARDED: 'bg-slate-100 text-slate-600',
  PAID: 'bg-emerald-100 text-emerald-700',
  UNPAID: 'bg-slate-100 text-slate-600',
};

const DOT: Record<string, string> = {
  DRAFT: 'bg-slate-400', CALCULATING: 'bg-blue-500', PENDING_REVIEW: 'bg-amber-500', PENDING_APPROVAL: 'bg-amber-500',
  APPROVED: 'bg-emerald-500', PROCESSING: 'bg-blue-500', COMPLETED: 'bg-emerald-500', REJECTED: 'bg-red-500', FAILED: 'bg-red-500',
  PENDING: 'bg-amber-500', CANCELLED: 'bg-slate-400', PRESENT: 'bg-emerald-500', ABSENT: 'bg-red-500', HALF_DAY: 'bg-amber-500',
  ON_LEAVE: 'bg-blue-500', HOLIDAY: 'bg-violet-500', WEEKEND: 'bg-slate-400', ACTIVE: 'bg-emerald-500', INACTIVE: 'bg-slate-400',
  LOCKED: 'bg-red-500', ONBOARDING: 'bg-blue-500', OFFBOARDING: 'bg-amber-500', OFFBOARDED: 'bg-slate-400', PAID: 'bg-emerald-500', UNPAID: 'bg-slate-400',
};

function formatLabel(status: string) {
  return status
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STYLES[status] ?? 'bg-slate-100 text-slate-600';
  const dot = DOT[status] ?? 'bg-slate-400';
  return (
    <span className={clsx('badge', style)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} />
      {label ?? formatLabel(status)}
    </span>
  );
}
