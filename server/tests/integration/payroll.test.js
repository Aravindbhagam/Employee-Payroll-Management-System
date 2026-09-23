import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { createFixtureSet } from '../helpers/fixtures.js';
import { bearer, loginAs } from '../helpers/api.js';

async function setUpSalary(fixtures, payrollAdminToken) {
  const res = await request(app)
    .post('/api/salary-structures')
    .set(bearer(payrollAdminToken))
    .send({ employeeId: fixtures.employee.employeeId, basic: 5000, hra: 2000, conveyance: 500, medical: 500, specialAllowance: 500, providentFund: 600, professionalTax: 200, incomeTax: 400 });
  expect(res.status).toBe(201);
}

// PayrollRun.period is globally unique. The API only requires it to be a
// non-empty string (no YYYY-MM format is enforced), so a random token per
// call is the simplest way to guarantee no collision with any other test
// or any stale data left in a shared test database.
function uniquePeriod() {
  return `test-period-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

describe('payroll approval workflow', () => {
  const prefix = 'payroll-it';

  it('walks a run through the full lifecycle: Draft -> Calculating -> Pending Review -> Pending Approval -> Approved -> Processing -> Completed, generating payslips', async () => {
    const fixtures = await createFixtureSet(`${prefix}-full`);
    const payrollAdminToken = await loginAs(fixtures.payrollAdmin.email);
    const superAdminToken = await loginAs(fixtures.superAdmin.email);
    await setUpSalary(fixtures, payrollAdminToken);

    const create = await request(app).post('/api/payroll').set(bearer(payrollAdminToken)).send({ period: uniquePeriod() });
    expect(create.status).toBe(201);
    expect(create.body.payrollRun.status).toBe('DRAFT');
    const runId = create.body.payrollRun.id;

    const calculate = await request(app).post(`/api/payroll/${runId}/calculate`).set(bearer(payrollAdminToken));
    expect(calculate.status).toBe(200);
    expect(calculate.body.payrollRun.status).toBe('PENDING_REVIEW');
    // Calculation is company-wide by design (a real payroll run pays every
    // active employee), and this shared test database may have other active
    // salaried employees from other tests running around the same time --
    // so assert on this employee's own payslip rather than the run-wide
    // total, which legitimately includes everyone else too.
    expect(calculate.body.payrollRun.totalNet).toBeGreaterThanOrEqual(7300);

    const submit = await request(app).post(`/api/payroll/${runId}/submit`).set(bearer(payrollAdminToken));
    expect(submit.status).toBe(200);
    expect(submit.body.payrollRun.status).toBe('PENDING_APPROVAL');

    // Payroll Admin does not have PAYROLL:APPROVE by default -- only an
    // explicitly granted approver (Super Admin, by default) can approve.
    const deniedApproval = await request(app).post(`/api/payroll/${runId}/approve`).set(bearer(payrollAdminToken));
    expect(deniedApproval.status).toBe(403);

    const approve = await request(app).post(`/api/payroll/${runId}/approve`).set(bearer(superAdminToken));
    expect(approve.status).toBe(200);
    expect(approve.body.payrollRun.status).toBe('APPROVED');

    const process = await request(app).post(`/api/payroll/${runId}/process`).set(bearer(payrollAdminToken));
    expect(process.status).toBe(200);
    expect(process.body.payrollRun.status).toBe('COMPLETED');

    const detail = await request(app).get(`/api/payroll/${runId}`).set(bearer(superAdminToken));
    // Same reasoning as the totalNet assertion above: the run pays every
    // active salaried employee system-wide, so assert this employee's own
    // payslip exists and is correct rather than assuming they're the only one.
    const ownPayslip = detail.body.payrollRun.payslips.find((p) => p.employeeId === fixtures.employee.employeeId);
    expect(ownPayslip).toBeTruthy();
    expect(ownPayslip.net).toBe(5000 + 2000 + 500 + 500 + 500 - 600 - 200 - 400);
  });

  it('rejects invalid state transitions (e.g. approving a Draft run that was never calculated)', async () => {
    const fixtures = await createFixtureSet(`${prefix}-invalid`);
    const payrollAdminToken = await loginAs(fixtures.payrollAdmin.email);
    const superAdminToken = await loginAs(fixtures.superAdmin.email);

    const create = await request(app).post('/api/payroll').set(bearer(payrollAdminToken)).send({ period: uniquePeriod() });
    const runId = create.body.payrollRun.id;

    const approve = await request(app).post(`/api/payroll/${runId}/approve`).set(bearer(superAdminToken));
    expect(approve.status).toBe(400);

    const process = await request(app).post(`/api/payroll/${runId}/process`).set(bearer(payrollAdminToken));
    expect(process.status).toBe(400);
  });

  it('refuses to create two payroll runs for the same period', async () => {
    const fixtures = await createFixtureSet(`${prefix}-dup`);
    const token = await loginAs(fixtures.payrollAdmin.email);
    const period = uniquePeriod();
    const first = await request(app).post('/api/payroll').set(bearer(token)).send({ period });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/payroll').set(bearer(token)).send({ period });
    expect(second.status).toBe(409);
  });

  it('supports rejection with a reason, and a rejected run cannot be approved afterward', async () => {
    const fixtures = await createFixtureSet(`${prefix}-reject`);
    const payrollAdminToken = await loginAs(fixtures.payrollAdmin.email);
    const superAdminToken = await loginAs(fixtures.superAdmin.email);
    await setUpSalary(fixtures, payrollAdminToken);

    const create = await request(app).post('/api/payroll').set(bearer(payrollAdminToken)).send({ period: uniquePeriod() });
    const runId = create.body.payrollRun.id;
    await request(app).post(`/api/payroll/${runId}/calculate`).set(bearer(payrollAdminToken));
    await request(app).post(`/api/payroll/${runId}/submit`).set(bearer(payrollAdminToken));

    const reject = await request(app).post(`/api/payroll/${runId}/reject`).set(bearer(superAdminToken)).send({ reason: 'Numbers look off, please recheck deductions.' });
    expect(reject.status).toBe(200);
    expect(reject.body.payrollRun.status).toBe('REJECTED');
    expect(reject.body.payrollRun.rejectionReason).toMatch(/recheck deductions/);

    const approveAfterReject = await request(app).post(`/api/payroll/${runId}/approve`).set(bearer(superAdminToken));
    expect(approveAfterReject.status).toBe(400);
  });

  it("employees cannot view the administrative payroll run list", async () => {
    const fixtures = await createFixtureSet(`${prefix}-employee-block`);
    const token = await loginAs(fixtures.employee.email);
    const res = await request(app).get('/api/payroll').set(bearer(token));
    expect(res.status).toBe(403);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
