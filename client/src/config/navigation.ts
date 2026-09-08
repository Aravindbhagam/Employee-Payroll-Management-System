import {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarCheck,
  CalendarClock,
  Receipt,
  FileBarChart,
  Landmark,
  ShieldCheck,
  ScrollText,
  Bell,
  Settings,
  UserCircle,
  FolderOpen,
  Building2,
  BadgeCheck,
  UsersRound,
} from 'lucide-react';
import { RoleName } from '../types';

export interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}

export const NAV_BY_ROLE: Record<RoleName, NavItem[]> = {
  SUPER_ADMIN: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Employees', path: '/employees', icon: Users },
    { label: 'Payroll', path: '/payroll', icon: Wallet },
    { label: 'Attendance', path: '/attendance', icon: CalendarCheck },
    { label: 'Leave', path: '/leave', icon: CalendarClock },
    { label: 'Salary Structure', path: '/salary-structure', icon: BadgeCheck },
    { label: 'Payslips', path: '/payslips', icon: Receipt },
    { label: 'Reports', path: '/reports', icon: FileBarChart },
    { label: 'Tax & Compliance', path: '/tax-compliance', icon: Landmark },
    { label: 'Users & Roles', path: '/users', icon: ShieldCheck },
    { label: 'Audit Logs', path: '/audit-logs', icon: ScrollText },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Settings', path: '/settings', icon: Settings },
  ],
  HR_ADMIN: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Employees', path: '/employees', icon: Users },
    { label: 'Attendance', path: '/attendance', icon: CalendarCheck },
    { label: 'Leave', path: '/leave', icon: CalendarClock },
    { label: 'Employee Documents', path: '/documents', icon: FolderOpen },
    { label: 'Reports', path: '/reports', icon: FileBarChart },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Settings', path: '/settings', icon: Settings },
  ],
  PAYROLL_ADMIN: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Employees', path: '/employees', icon: Users },
    { label: 'Payroll', path: '/payroll', icon: Wallet },
    { label: 'Salary Structure', path: '/salary-structure', icon: BadgeCheck },
    { label: 'Payslips', path: '/payslips', icon: Receipt },
    { label: 'Tax & Compliance', path: '/tax-compliance', icon: Landmark },
    { label: 'Payroll Reports', path: '/reports', icon: FileBarChart },
    { label: 'Notifications', path: '/notifications', icon: Bell },
  ],
  MANAGER: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'My Team', path: '/my-team', icon: UsersRound },
    { label: 'Attendance', path: '/attendance', icon: CalendarCheck },
    { label: 'Leave Requests', path: '/leave', icon: CalendarClock },
    { label: 'Team Reports', path: '/reports', icon: FileBarChart },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Profile', path: '/profile', icon: UserCircle },
  ],
  EMPLOYEE: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'My Profile', path: '/profile', icon: UserCircle },
    { label: 'My Attendance', path: '/attendance', icon: CalendarCheck },
    { label: 'My Leave', path: '/leave', icon: CalendarClock },
    { label: 'My Payslips', path: '/payslips', icon: Receipt },
    { label: 'My Payroll', path: '/payroll', icon: Wallet },
    { label: 'Documents', path: '/documents', icon: FolderOpen },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Settings', path: '/settings', icon: Settings },
  ],
};

export const COMPANY_ICON = Building2;
