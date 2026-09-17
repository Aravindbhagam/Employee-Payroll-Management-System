import bcrypt from 'bcryptjs';
import { prisma } from '../../src/config/prisma';
import { flattenDefaults } from '../../src/permissions';

export const PASSWORD = 'Password123!';

let permissionsSeeded = false;

/** Seeds the default role -> permission matrix (idempotent, safe to call from every test file). */
export async function ensureRolePermissionsSeeded() {
  if (permissionsSeeded) return;
  const rows = flattenDefaults();
  await prisma.$transaction(
    rows.map((r) =>
      prisma.rolePermission.upsert({
        where: { role_resource_action: { role: r.role, resource: r.resource, action: r.action } },
        update: { allowed: r.allowed },
        create: r,
      })
    )
  );
  permissionsSeeded = true;
}

interface FixtureUser {
  id: string;
  employeeId: string;
  email: string;
  role: string;
}

export interface FixtureSet {
  departmentId: string;
  superAdmin: FixtureUser;
  hrAdmin: FixtureUser;
  payrollAdmin: FixtureUser;
  manager: FixtureUser;
  employee: FixtureUser;
  /** A second, unrelated manager+employee pair, useful for cross-team scoping tests. */
  otherManager: FixtureUser;
  otherEmployee: FixtureUser;
}

async function createUser(prefix: string, opts: { name: string; role: string; departmentId: string; managerId?: string }): Promise<FixtureUser> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const email = `${prefix}-${opts.name}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      employeeCode: `${prefix.toUpperCase()}-${opts.name.toUpperCase()}`,
      passwordHash,
      role: opts.role,
      status: 'ACTIVE',
      departmentId: opts.departmentId,
      managerId: opts.managerId,
      employee: {
        create: {
          firstName: opts.name,
          lastName: 'Test',
          departmentId: opts.departmentId,
          status: 'ACTIVE',
        },
      },
    },
    include: { employee: true },
  });
  return { id: user.id, employeeId: user.employee!.id, email: user.email, role: user.role };
}

/**
 * Creates a fully independent set of fixture users (one per role, plus an
 * unrelated manager/employee pair for cross-team scoping tests) under a
 * unique prefix, so multiple test files -- or even multiple calls in the
 * same file -- can share the same test database without colliding on
 * unique email/employeeCode/department-name constraints. The prefix is
 * combined with a random suffix rather than trusted alone, since Vitest
 * may schedule test files across worker processes that don't share the
 * in-memory de-duplication this module would otherwise rely on.
 */
export async function createFixtureSet(prefix: string): Promise<FixtureSet> {
  await ensureRolePermissionsSeeded();

  const unique = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const department = await prisma.department.create({ data: { name: `${unique}-dept` } });

  const superAdmin = await createUser(unique, { name: 'superadmin', role: 'SUPER_ADMIN', departmentId: department.id });
  const hrAdmin = await createUser(unique, { name: 'hradmin', role: 'HR_ADMIN', departmentId: department.id });
  const payrollAdmin = await createUser(unique, { name: 'payrolladmin', role: 'PAYROLL_ADMIN', departmentId: department.id });
  const manager = await createUser(unique, { name: 'manager', role: 'MANAGER', departmentId: department.id });
  const employee = await createUser(unique, { name: 'employee', role: 'EMPLOYEE', departmentId: department.id, managerId: manager.id });
  const otherManager = await createUser(unique, { name: 'othermanager', role: 'MANAGER', departmentId: department.id });
  const otherEmployee = await createUser(unique, { name: 'otheremployee', role: 'EMPLOYEE', departmentId: department.id, managerId: otherManager.id });

  return { departmentId: department.id, superAdmin, hrAdmin, payrollAdmin, manager, employee, otherManager, otherEmployee };
}
