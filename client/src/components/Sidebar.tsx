import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Landmark, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NAV_BY_ROLE } from '../config/navigation';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const items = NAV_BY_ROLE[user.role];

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} />}
      <aside
        className={clsx(
          'fixed z-40 inset-y-0 left-0 w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-none">PayrollPro</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Nimbus Corporation</p>
            </div>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-slate-600" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )
              }
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-400">Signed in as</p>
          <p className="text-sm font-medium text-slate-700 truncate">
            {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email}
          </p>
        </div>
      </aside>
    </>
  );
}
