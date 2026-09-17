import { describe, expect, it } from 'vitest';
import { flattenDefaults, RESOURCES, ROLE_LABELS } from '../../src/permissions';

describe('default permission matrix', () => {
  const rows = flattenDefaults();

  function allowed(role: string, resource: string, action: string) {
    return rows.find((r) => r.role === role && r.resource === resource && r.action === action)?.allowed ?? false;
  }

  it('covers every role x resource x action combination exactly once', () => {
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.role}:${r.resource}:${r.action}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(rows.length).toBe(5 * 16 * 8); // 5 roles x 16 resources x 8 actions
  });

  it('grants Super Admin VIEW access to every resource', () => {
    for (const resource of RESOURCES) {
      expect(allowed('SUPER_ADMIN', resource, 'VIEW')).toBe(true);
    }
  });

  it('grants Super Admin full CRUD+manage access to the core administrative resources', () => {
    for (const resource of ['EMPLOYEES', 'PAYROLL', 'SALARY_STRUCTURE', 'USERS', 'SETTINGS', 'TAX_COMPLIANCE', 'DEPARTMENTS', 'DESIGNATIONS', 'DOCUMENTS', 'ANNOUNCEMENTS']) {
      for (const action of ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE']) {
        expect(allowed('SUPER_ADMIN', resource, action)).toBe(true);
      }
    }
  });

  it('never grants Employee access to Users management', () => {
    for (const action of ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'MANAGE']) {
      expect(allowed('EMPLOYEE', 'USERS', action)).toBe(false);
    }
  });

  it('never grants Manager the ability to process or approve payroll', () => {
    expect(allowed('MANAGER', 'PAYROLL', 'PROCESS')).toBe(false);
    expect(allowed('MANAGER', 'PAYROLL', 'APPROVE')).toBe(false);
    expect(allowed('MANAGER', 'PAYROLL', 'VIEW')).toBe(false);
  });

  it('never grants HR Admin the ability to process payroll', () => {
    expect(allowed('HR_ADMIN', 'PAYROLL', 'PROCESS')).toBe(false);
  });

  it('grants Payroll Admin the ability to process payroll but not approve it by default', () => {
    expect(allowed('PAYROLL_ADMIN', 'PAYROLL', 'PROCESS')).toBe(true);
    expect(allowed('PAYROLL_ADMIN', 'PAYROLL', 'APPROVE')).toBe(false);
  });

  it('lets Manager approve leave but never lets Employee approve leave', () => {
    expect(allowed('MANAGER', 'LEAVE', 'APPROVE')).toBe(true);
    expect(allowed('EMPLOYEE', 'LEAVE', 'APPROVE')).toBe(false);
  });

  it('lets every role apply for their own leave', () => {
    for (const role of ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE']) {
      expect(allowed(role, 'LEAVE', 'CREATE')).toBe(true);
    }
  });

  it('has a human-readable label for every role', () => {
    for (const role of ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE']) {
      expect(ROLE_LABELS[role as keyof typeof ROLE_LABELS]).toBeTruthy();
    }
  });
});
