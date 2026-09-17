import { describe, expect, it } from 'vitest';
import { can, canAny } from '../../src/utils/permissions';
import { AuthUser } from '../../src/types';

function makeUser(permissions: AuthUser['permissions']): AuthUser {
  return {
    id: 'u1',
    employeeCode: 'EMP1',
    email: 'test@nimbuscorp.com',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    department: null,
    managerId: null,
    twoFactorEnabled: false,
    mustChangePassword: false,
    lastLoginAt: null,
    profile: null,
    permissions,
  };
}

describe('can()', () => {
  it('returns false when there is no user at all', () => {
    expect(can(null, 'EMPLOYEES', 'VIEW')).toBe(false);
  });

  it('returns true only when the specific action is present for that resource', () => {
    const user = makeUser({ EMPLOYEES: ['VIEW', 'EDIT'] });
    expect(can(user, 'EMPLOYEES', 'VIEW')).toBe(true);
    expect(can(user, 'EMPLOYEES', 'EDIT')).toBe(true);
    expect(can(user, 'EMPLOYEES', 'DELETE')).toBe(false);
  });

  it('returns false for a resource the user has no entry for at all', () => {
    const user = makeUser({ EMPLOYEES: ['VIEW'] });
    expect(can(user, 'PAYROLL', 'VIEW')).toBe(false);
  });
});

describe('canAny()', () => {
  it('returns true if at least one of the listed actions is allowed', () => {
    const user = makeUser({ LEAVE: ['VIEW'] });
    expect(canAny(user, 'LEAVE', ['CREATE', 'VIEW'])).toBe(true);
  });

  it('returns false if none of the listed actions are allowed', () => {
    const user = makeUser({ LEAVE: ['VIEW'] });
    expect(canAny(user, 'LEAVE', ['CREATE', 'APPROVE'])).toBe(false);
  });

  it('returns false for a null user regardless of the actions list', () => {
    expect(canAny(null, 'LEAVE', ['VIEW'])).toBe(false);
  });
});
