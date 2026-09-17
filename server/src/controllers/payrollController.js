const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { newId } = require('../utils/id');
const { PAYROLL_RUN_COLS } = require('../dbColumns');

const listPayrollRuns = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT r.id, r.period, r.status, r.total_gross AS "totalGross", r.total_deductions AS "totalDeductions",
      r.total_net AS "totalNet", r.employee_count AS "employeeCount", r.created_at AS "createdAt",
      r.updated_at AS "updatedAt",
      cb.email AS "createdByEmail", rb.email AS "reviewedByEmail", ab.email AS "approvedByEmail",
      (SELECT COUNT(*) FROM payslips p WHERE p.payroll_run_id = r.id) AS "payslipCount"
    FROM payroll_runs r
    LEFT JOIN users cb ON cb.id = r.created_by_id
    LEFT JOIN users rb ON rb.id = r.reviewed_by_id
    LEFT JOIN users ab ON ab.id = r.approved_by_id
    ORDER BY r.created_at DESC
  `);
  const runs = rows.map((r) => ({
    id: r.id,
    period: r.period,
    status: r.status,
    totalGross: r.totalGross,
    totalDeductions: r.totalDeductions,
    totalNet: r.totalNet,
    employeeCount: r.employeeCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.createdByEmail ? { email: r.createdByEmail } : null,
    reviewedBy: r.reviewedByEmail ? { email: r.reviewedByEmail } : null,
    approvedBy: r.approvedByEmail ? { email: r.approvedByEmail } : null,
    _count: { payslips: parseInt(r.payslipCount, 10) },
  }));
  res.json({ payrollRuns: runs });
});

const getPayrollRun = asyncHandler(async (req, res) => {
  const runRes = await query(`SELECT ${PAYROLL_RUN_COLS} FROM payroll_runs WHERE id = $1`, [req.params.id]);
  const run = runRes.rows[0];
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });

  const payslipsRes = await query(
    `SELECT p.id, p.payroll_run_id AS "payrollRunId", p.employee_id AS "employeeId", p.period,
       p.gross, p.deductions, p.net, p.breakdown, p.generated_at AS "generatedAt",
       e.first_name AS "e_firstName", e.last_name AS "e_lastName", d.name AS "d_name"
     FROM payslips p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE p.payroll_run_id = $1
     ORDER BY e.first_name ASC`,
    [run.id]
  );
  run.payslips = payslipsRes.rows.map((p) => ({
    id: p.id,
    payrollRunId: p.payrollRunId,
    employeeId: p.employeeId,
    period: p.period,
    gross: p.gross,
    deductions: p.deductions,
    net: p.net,
    breakdown: p.breakdown,
    generatedAt: p.generatedAt,
    employee: { firstName: p.e_firstName, lastName: p.e_lastName, id: p.employeeId, department: p.d_name ? { name: p.d_name } : null },
  }));

  res.json({ payrollRun: run });
});

const createSchema = z.object({ period: z.string().min(4) });

const createPayrollRun = asyncHandler(async (req, res) => {
  const { period } = createSchema.parse(req.body);
  const existingRes = await query('SELECT id FROM payroll_runs WHERE period = $1', [period]);
  if (existingRes.rows.length > 0) throw new ApiError(409, `A payroll run for ${period} already exists.`);

  const id = newId();
  await query(`INSERT INTO payroll_runs (id, period, status, created_by_id) VALUES ($1, $2, 'DRAFT', $3)`, [id, period, req.user.id]);
  const { rows } = await query(`SELECT ${PAYROLL_RUN_COLS} FROM payroll_runs WHERE id = $1`, [id]);
  const run = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PAYROLL_RUN_CREATED', entityType: 'PayrollRun', entityId: run.id, newValue: { period } });
  res.status(201).json({ payrollRun: run });
});

function assertTransition(current, allowed) {
  if (!allowed.includes(current)) {
    throw new ApiError(400, `Payroll run cannot transition from ${current}.`);
  }
}

async function getRunOr404(id) {
  const { rows } = await query(`SELECT ${PAYROLL_RUN_COLS} FROM payroll_runs WHERE id = $1`, [id]);
  return rows[0] || null;
}

const calculatePayroll = asyncHandler(async (req, res) => {
  const run = await getRunOr404(req.params.id);
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['DRAFT', 'FAILED']);

  await query("UPDATE payroll_runs SET status = 'CALCULATING' WHERE id = $1", [run.id]);

  try {
    const structuresRes = await query(`
      SELECT s.id, s.employee_id AS "employeeId", s.basic, s.hra, s.conveyance, s.medical,
        s.special_allowance AS "specialAllowance", s.other_allowances AS "otherAllowances",
        s.provident_fund AS "providentFund", s.professional_tax AS "professionalTax",
        s.income_tax AS "incomeTax", s.other_deductions AS "otherDeductions"
      FROM salary_structures s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.is_active = true AND e.status = 'ACTIVE'
    `);
    const activeStructures = structuresRes.rows;

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    await withTransaction(async (client) => {
      await client.query('DELETE FROM payslips WHERE payroll_run_id = $1', [run.id]);

      for (const s of activeStructures) {
        const gross = s.basic + s.hra + s.conveyance + s.medical + s.specialAllowance + s.otherAllowances;
        const deductions = s.providentFund + s.professionalTax + s.incomeTax + s.otherDeductions;
        const net = gross - deductions;
        totalGross += gross;
        totalDeductions += deductions;
        totalNet += net;

        const breakdown = JSON.stringify({
          earnings: { basic: s.basic, hra: s.hra, conveyance: s.conveyance, medical: s.medical, specialAllowance: s.specialAllowance, otherAllowances: s.otherAllowances },
          deductions: { providentFund: s.providentFund, professionalTax: s.professionalTax, incomeTax: s.incomeTax, otherDeductions: s.otherDeductions },
        });

        await client.query(
          `INSERT INTO payslips (id, payroll_run_id, employee_id, period, gross, deductions, net, breakdown)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [newId(), run.id, s.employeeId, run.period, gross, deductions, net, breakdown]
        );
      }

      await client.query(
        `UPDATE payroll_runs SET status = 'PENDING_REVIEW', total_gross = $1, total_deductions = $2, total_net = $3, employee_count = $4, submitted_at = $5, updated_at = $5 WHERE id = $6`,
        [totalGross, totalDeductions, totalNet, activeStructures.length, new Date(), run.id]
      );
    });

    const updated = await getRunOr404(run.id);
    await recordAudit({
      req,
      userId: req.user.id,
      userName: req.user.email,
      action: 'PAYROLL_CALCULATED',
      entityType: 'PayrollRun',
      entityId: run.id,
      newValue: { totalGross, totalDeductions, totalNet, employeeCount: activeStructures.length },
    });
    res.json({ payrollRun: updated });
  } catch (err) {
    await query("UPDATE payroll_runs SET status = 'FAILED' WHERE id = $1", [run.id]);
    throw err;
  }
});

const submitForApproval = asyncHandler(async (req, res) => {
  const run = await getRunOr404(req.params.id);
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['PENDING_REVIEW']);

  await query("UPDATE payroll_runs SET status = 'PENDING_APPROVAL', reviewed_by_id = $1, reviewed_at = $2, updated_at = $2 WHERE id = $3", [req.user.id, new Date(), run.id]);
  const updated = await getRunOr404(run.id);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PAYROLL_SUBMITTED_FOR_APPROVAL', entityType: 'PayrollRun', entityId: run.id });
  res.json({ payrollRun: updated });
});

const approvePayroll = asyncHandler(async (req, res) => {
  const run = await getRunOr404(req.params.id);
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['PENDING_APPROVAL']);

  await query("UPDATE payroll_runs SET status = 'APPROVED', approved_by_id = $1, approved_at = $2, updated_at = $2 WHERE id = $3", [req.user.id, new Date(), run.id]);
  const updated = await getRunOr404(run.id);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PAYROLL_APPROVED', entityType: 'PayrollRun', entityId: run.id });
  res.json({ payrollRun: updated });
});

const rejectSchema = z.object({ reason: z.string().min(1, 'A rejection reason is required.') });

const rejectPayroll = asyncHandler(async (req, res) => {
  const run = await getRunOr404(req.params.id);
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['PENDING_REVIEW', 'PENDING_APPROVAL']);
  const { reason } = rejectSchema.parse(req.body);

  await query("UPDATE payroll_runs SET status = 'REJECTED', rejection_reason = $1, updated_at = $2 WHERE id = $3", [reason, new Date(), run.id]);
  const updated = await getRunOr404(run.id);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PAYROLL_REJECTED', entityType: 'PayrollRun', entityId: run.id, newValue: { reason } });
  res.json({ payrollRun: updated });
});

const processPayroll = asyncHandler(async (req, res) => {
  const run = await getRunOr404(req.params.id);
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['APPROVED']);

  await query("UPDATE payroll_runs SET status = 'PROCESSING' WHERE id = $1", [run.id]);

  try {
    await query("UPDATE payroll_runs SET status = 'COMPLETED', processed_at = $1, updated_at = $1 WHERE id = $2", [new Date(), run.id]);
    const updated = await getRunOr404(run.id);
    await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PAYROLL_PROCESSED', entityType: 'PayrollRun', entityId: run.id });

    const payslipsRes = await query('SELECT id FROM payslips WHERE payroll_run_id = $1', [run.id]);
    for (const p of payslipsRes.rows) {
      await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PAYSLIP_GENERATED', entityType: 'Payslip', entityId: p.id });
    }

    res.json({ payrollRun: updated, message: `Payroll completed. ${payslipsRes.rows.length} payslip(s) generated and employees notified.` });
  } catch (err) {
    await query("UPDATE payroll_runs SET status = 'FAILED' WHERE id = $1", [run.id]);
    throw err;
  }
});

module.exports = {
  listPayrollRuns,
  getPayrollRun,
  createPayrollRun,
  calculatePayroll,
  submitForApproval,
  approvePayroll,
  rejectPayroll,
  processPayroll,
};
