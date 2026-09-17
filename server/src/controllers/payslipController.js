const { query } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { employeeScopeFilter } = require('../utils/scope');

const PAYSLIP_LIST_SELECT = `
  SELECT p.id, p.payroll_run_id AS "payrollRunId", p.employee_id AS "employeeId", p.period,
    p.gross, p.deductions, p.net, p.breakdown, p.generated_at AS "generatedAt",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName",
    r.status AS "r_status", r.period AS "r_period"
  FROM payslips p
  JOIN employees e ON e.id = p.employee_id
  JOIN payroll_runs r ON r.id = p.payroll_run_id
`;

function mapPayslipListRow(row) {
  return {
    id: row.id,
    payrollRunId: row.payrollRunId,
    employeeId: row.employeeId,
    period: row.period,
    gross: row.gross,
    deductions: row.deductions,
    net: row.net,
    breakdown: row.breakdown,
    generatedAt: row.generatedAt,
    employee: { firstName: row.e_firstName, lastName: row.e_lastName, id: row.employeeId },
    payrollRun: { status: row.r_status, period: row.r_period },
  };
}

const listPayslips = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const { employeeId } = req.query;

  const conditions = [];
  const params = [];
  function addParam(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (scope) {
    if (employeeId) {
      if (!scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's payslips.");
      conditions.push(`p.employee_id = ${addParam(employeeId)}`);
    } else if (scope.in.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(`p.employee_id = ANY(${addParam(scope.in)})`);
    }
  } else if (employeeId) {
    conditions.push(`p.employee_id = ${addParam(employeeId)}`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${PAYSLIP_LIST_SELECT} ${whereSql} ORDER BY p.generated_at DESC`, params);
  res.json({ payslips: rows.map(mapPayslipListRow) });
});

const getPayslip = asyncHandler(async (req, res) => {
  const user = req.user;
  const payslipRes = await query(
    `SELECT id, payroll_run_id AS "payrollRunId", employee_id AS "employeeId", period,
       gross, deductions, net, breakdown, generated_at AS "generatedAt"
     FROM payslips WHERE id = $1`,
    [req.params.id]
  );
  const payslip = payslipRes.rows[0];
  if (!payslip) return res.status(404).json({ error: 'Payslip not found.' });

  const scope = await employeeScopeFilter(user);
  if (scope && !scope.in.includes(payslip.employeeId)) throw new ApiError(403, "You don't have permission to view this payslip.");

  const empRes = await query(
    `SELECT e.id, e.user_id AS "userId", e.first_name AS "firstName", e.last_name AS "lastName",
       e.phone, e.address, e.date_of_birth AS "dateOfBirth", e.date_of_joining AS "dateOfJoining",
       e.department_id AS "departmentId", e.designation_id AS "designationId",
       e.employment_type AS "employmentType", e.status, e.photo_url AS "photoUrl",
       e.bank_account_number AS "bankAccountNumber", e.bank_name AS "bankName", e.tax_id AS "taxId",
       e.emergency_contact_name AS "emergencyContactName", e.emergency_contact_phone AS "emergencyContactPhone",
       e.created_at AS "createdAt", e.updated_at AS "updatedAt",
       u.id AS "u_id", u.employee_code AS "u_employeeCode", u.email AS "u_email", u.role AS "u_role",
       u.status AS "u_status", u.manager_id AS "u_managerId",
       d.id AS "d_id", d.name AS "d_name",
       de.id AS "de_id", de.title AS "de_title"
     FROM employees e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN designations de ON de.id = e.designation_id
     WHERE e.id = $1`,
    [payslip.employeeId]
  );
  const e = empRes.rows[0];
  const employee = e && {
    id: e.id,
    userId: e.userId,
    firstName: e.firstName,
    lastName: e.lastName,
    phone: e.phone,
    address: e.address,
    dateOfBirth: e.dateOfBirth,
    dateOfJoining: e.dateOfJoining,
    departmentId: e.departmentId,
    designationId: e.designationId,
    employmentType: e.employmentType,
    status: e.status,
    photoUrl: e.photoUrl,
    bankAccountNumber: e.bankAccountNumber,
    bankName: e.bankName,
    taxId: e.taxId,
    emergencyContactName: e.emergencyContactName,
    emergencyContactPhone: e.emergencyContactPhone,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    user: { id: e.u_id, employeeCode: e.u_employeeCode, email: e.u_email, role: e.u_role, status: e.u_status, managerId: e.u_managerId },
    department: e.d_id ? { id: e.d_id, name: e.d_name } : null,
    designation: e.de_id ? { id: e.de_id, title: e.de_title } : null,
  };

  const runRes = await query(
    `SELECT id, period, status, total_gross AS "totalGross", total_deductions AS "totalDeductions",
       total_net AS "totalNet", employee_count AS "employeeCount",
       created_by_id AS "createdById", submitted_at AS "submittedAt",
       reviewed_by_id AS "reviewedById", reviewed_at AS "reviewedAt",
       approved_by_id AS "approvedById", approved_at AS "approvedAt",
       processed_at AS "processedAt", rejection_reason AS "rejectionReason",
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM payroll_runs WHERE id = $1`,
    [payslip.payrollRunId]
  );
  const payrollRun = runRes.rows[0] || null;

  res.json({
    payslip: {
      ...payslip,
      breakdown: JSON.parse(payslip.breakdown),
      employee,
      payrollRun,
    },
  });
});

module.exports = { listPayslips, getPayslip };
