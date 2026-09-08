import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: 'brand' | 'emerald' | 'amber' | 'red' | 'slate';
  hint?: string;
}

const TONE_STYLES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
};

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint }: StatCardProps) {
  return (
    <div className="card flex items-start justify-between animate-fadeIn">
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
      {Icon && (
        <div className={clsx('rounded-lg p-2.5', TONE_STYLES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
