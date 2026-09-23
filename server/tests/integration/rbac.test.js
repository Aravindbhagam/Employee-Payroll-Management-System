import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { createFixtureSet } from '../helpers/fixtures.js';
import { bearer, loginAs } from '../helpers/api.js';

describe('RBAC enforcement (server-side, independent of any frontend hiding)', () => {
  const prefix = 'rbac-it';

  it('blocks an Employee from listing all users, with a 403 and an explanatory message', async () => {
    const fixtures = await createFixtureSet(`${prefix}-users`);
    const token = await loginAs(fixtures.employee.email);
    const res = await request(app).get('/api/users').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
    expect(res.body.message).toMatch(/don't have permission/i);
  });

  it('blocks an Employee from creating a new employee', async () => {
    const fixtures = await createFixtureSet(`${prefix}-create`);
    const token = await loginAs(fixtures.employee.email);
    const res = await request(app)
      .post('/api/employees')
      .set(bearer(token))
      .send({ email: 'nope@test.local', firstName: 'No', lastName: 'Body' });
    expect(res.status).toBe(403);
  });

  it('blocks a Manager from processing payroll', async () => {
    const fixtures = await createFixtureSet(`${prefix}-payroll`);
    const token = await loginAs(fixtures.manager.email);
    const res = await request(app).get('/api/payroll').set(bearer(token));
    expect(res.status).toBe(403);
  });

  it('blocks an Employee from approving leave, even their own request', async () => {
    const fixtures = await createFixtureSet(`${prefix}-leave-approve`);
    const employeeToken = await loginAs(fixtures.employee.email);
    const apply = await request(app)
      .post('/api/leave')
      .set(bearer(employeeToken))
      .send({ leaveType: 'ANNUAL', startDate: '2027-01-10', endDate: '2027-01-11', reason: 'trip' });
    expect(apply.status).toBe(201);

    const res = await request(app).post(`/api/leave/${apply.body.leaveRequest.id}/approve`).set(bearer(employeeToken));
    expect(res.status).toBe(403);
  });

  it("scopes an Employee's employee list to themself only", async () => {
    const fixtures = await createFixtureSet(`${prefix}-scope-emp`);
    const token = await loginAs(fixtures.employee.email);
    const res = await request(app).get('/api/employees').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.employees).toHaveLength(1);
    expect(res.body.employees[0].userId).toBe(fixtures.employee.id);
  });

  it("scopes a Manager's employee list to their own team plus themself, excluding other teams", async () => {
    const fixtures = await createFixtureSet(`${prefix}-scope-mgr`);
    const token = await loginAs(fixtures.manager.email);
    const res = await request(app).get('/api/employees').set(bearer(token));
    expect(res.status).toBe(200);
    const ids = res.body.employees.map((e) => e.userId);
    expect(ids).toContain(fixtures.manager.id);
    expect(ids).toContain(fixtures.employee.id);
    expect(ids).not.toContain(fixtures.otherEmployee.id);
    expect(ids).not.toContain(fixtures.otherManager.id);
  });

  it('gives HR Admin full visibility across all employees, including other teams', async () => {
    const fixtures = await createFixtureSet(`${prefix}-scope-hr`);
    const token = await loginAs(fixtures.hrAdmin.email);
    const res = await request(app).get('/api/employees').set(bearer(token));
    expect(res.status).toBe(200);
    const ids = res.body.employees.map((e) => e.userId);
    expect(ids).toContain(fixtures.employee.id);
    expect(ids).toContain(fixtures.otherEmployee.id);
  });

  it("blocks a Manager from approving leave for an employee outside their team", async () => {
    const fixtures = await createFixtureSet(`${prefix}-cross-team`);
    const otherEmployeeToken = await loginAs(fixtures.otherEmployee.email);
    const apply = await request(app)
      .post('/api/leave')
      .set(bearer(otherEmployeeToken))
      .send({ leaveType: 'SICK', startDate: '2027-02-01', endDate: '2027-02-01', reason: 'flu' });
    expect(apply.status).toBe(201);

    const managerToken = await loginAs(fixtures.manager.email);
    const res = await request(app).post(`/api/leave/${apply.body.leaveRequest.id}/approve`).set(bearer(managerToken));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own team/i);
  });

  it('lets a Manager approve leave for their own team member', async () => {
    const fixtures = await createFixtureSet(`${prefix}-same-team`);
    const employeeToken = await loginAs(fixtures.employee.email);
    const apply = await request(app)
      .post('/api/leave')
      .set(bearer(employeeToken))
      .send({ leaveType: 'CASUAL', startDate: '2027-03-01', endDate: '2027-03-01', reason: 'errand' });
    expect(apply.status).toBe(201);

    const managerToken = await loginAs(fixtures.manager.email);
    const res = await request(app).post(`/api/leave/${apply.body.leaveRequest.id}/approve`).set(bearer(managerToken));
    expect(res.status).toBe(200);
    expect(res.body.leaveRequest.status).toBe('APPROVED');
  });

  it('masks bank account details for a Manager viewing a team member, but not for HR viewing the same record', async () => {
    const fixtures = await createFixtureSet(`${prefix}-mask`);
    await prisma.employee.update({ where: { id: fixtures.employee.employeeId }, data: { bankAccountNumber: '000123456789' } });

    const managerToken = await loginAs(fixtures.manager.email);
    const asManager = await request(app).get(`/api/employees/${fixtures.employee.employeeId}`).set(bearer(managerToken));
    expect(asManager.status).toBe(200);
    expect(asManager.body.employee.bankAccountNumber).not.toBe('000123456789');
    expect(asManager.body.employee.bankAccountNumber).toMatch(/\*+6789$/);

    const hrToken = await loginAs(fixtures.hrAdmin.email);
    const asHr = await request(app).get(`/api/employees/${fixtures.employee.employeeId}`).set(bearer(hrToken));
    expect(asHr.status).toBe(200);
    expect(asHr.body.employee.bankAccountNumber).toBe('000123456789');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
