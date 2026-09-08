import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Settings, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../types';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button className="lg:hidden text-slate-500 hover:text-slate-700" onClick={onMenuClick}>
          <Menu className="h-6 w-6" />
        </button>
        <div>
          <p className="text-sm text-slate-400">Welcome back,</p>
          <p className="text-sm font-semibold text-slate-900 -mt-0.5">
            {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex badge bg-brand-50 text-brand-700">{ROLE_LABELS[user.role]}</span>
        <button
          className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {user.profile ? user.profile.firstName[0] + user.profile.lastName[0] : user.email[0].toUpperCase()}
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-100 bg-white py-1 shadow-lg animate-fadeIn">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/profile');
                  }}
                >
                  <UserCircle className="h-4 w-4" /> My Profile
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/settings');
                  }}
                >
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
