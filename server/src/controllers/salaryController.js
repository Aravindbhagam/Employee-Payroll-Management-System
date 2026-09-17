const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { employeeScopeFilter } = require('../utils/scope');
const { newId } = require('../utils/id');
const { SALARY_STRUCTURE_COLS } = require('../dbColumns');

const SALARY_JOIN_SELECT = `
  SELECT s.id, s.employee_id AS "employeeId", s.basic, s.hra, s.conveyance, s.medical,
    s.special_allowance AS "specialAllowance", s.other_allowances AS "otherAllowances",
    s.provident_fund AS "providentFund", s.professional_tax AS "professionalTax",
    s.income_tax AS "incomeTax", s.other_deductions AS "otherDeductions", s.ctc,
    s.effective_from AS "effectiveFrom", s.is_active AS "isActive", s.created_at AS "createdAt",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName"
  FROM salary_structures s
  JOIN employees e ON e.id = s.employee_id
`;

function mapSalaryRow(row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    basic: row.basic,
    hra: row.hra,
    conveyance: row.conveyance,
    medical: row.medical,
    specialAllowance: row.specialAllowance,
    otherAllowances: row.otherAllowances,
    providentFund: row.providentFund,
    professionalTax: row.professionalTax,
    incomeTax: row.incomeTax,
    otherDeductions: row.otherDeductions,
    ctc: row.ctc,
    effectiveFrom: row.effectiveFrom,
    isActive: row.isActive,
    createdAt: row.createdAt,
    employee: { firstName: row.e_firstName, lastName: row.e_lastName, id: row.employeeId },
  };
}

const listSalaryStructures = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const employeeId = req.query.employeeId;

  const conditions = [];
  const params = [];
  function addParam(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (scope) {
    if (employeeId) {
      if (!scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's salary.");
      conditions.push(`s.employee_id = ${addParam(employeeId)}`);
    } else if (scope.in.length === 0) {
      conditions.push('FALSE');
    } else {
      conditions.push(`s.employee_id = ANY(${addParam(scope.in)})`);
    }
  } else if (employeeId) {
    conditions.push(`s.employee_id = ${addParam(employeeId)}`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${SALARY_JOIN_SELECT} ${whereSql} ORDER BY s.effective_from DESC`, params);
  res.json({ salaryStructures: rows.map(mapSalaryRow) });
});

const upsertSchema = z.object({
  employeeId: z.string(),
  basic: z.number().nonnegative(),
  hra: z.number().nonnegative().default(0),
  conveyance: z.number().nonnegative().default(0),
  medical: z.number().nonnegative().default(0),
  specialAllowance: z.number().nonnegative().default(0),
  otherAllowances: z.number().nonnegative().default(0),
  providentFund: z.number().nonnegative().default(0),
  professionalTax: z.number().nonnegative().default(0),
  incomeTax: z.number().nonnegative().default(0),
  otherDeductions: z.number().nonnegative().default(0),
  effectiveFrom: z.string().optional(),
});

function computeCtc(d) {
  return d.basic + d.hra + d.conveyance + d.medical + d.specialAllowance + d.otherAllowances;
}

const createSalaryStructure = asyncHandler(async (req, res) => {
  const data = upsertSchema.parse(req.body);
  const ctc = computeCtc(data);

  await query('UPDATE salary_structures SET is_active = false WHERE employee_id = $1 AND is_active = true', [data.employeeId]);

  const id = newId();
  await query(
    `INSERT INTO salary_structures (id, employee_id, basic, hra, conveyance, medical, special_allowance, other_allowances, provident_fund, professional_tax, income_tax, other_deductions, ctc, effective_from, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)`,
    [
      id,
      data.employeeId,
      data.basic,
      data.hra,
      data.conveyance,
      data.medical,
      data.specialAllowance,
      data.otherAllowances,
      data.providentFund,
      data.professionalTax,
      data.incomeTax,
      data.otherDeductions,
      ctc,
      data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
    ]
  );

  const { rows } = await query(`SELECT ${SALARY_STRUCTURE_COLS} FROM salary_structures WHERE id = $1`, [id]);
  const structure = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'SALARY_STRUCTURE_CREATED', entityType: 'SalaryStructure', entityId: structure.id, newValue: data });
  res.status(201).json({ salaryStructure: structure });
});

const SALARY_FIELD_TO_COLUMN = {
  basic: 'basic',
  hra: 'hra',
  conveyance: 'conveyance',
  medical: 'medical',
  specialAllowance: 'special_allowance',
  otherAllowances: 'other_allowances',
  providentFund: 'provident_fund',
  professionalTax: 'professional_tax',
  incomeTax: 'income_tax',
  otherDeductions: 'other_deductions',
};

const updateSalaryStructure = asyncHandler(async (req, res) => {
  const existingRes = await query(`SELECT ${SALARY_STRUCTURE_COLS} FROM salary_structures WHERE id = $1`, [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'Salary structure not found.' });
  const data = upsertSchema.partial().parse(req.body);
  const merged = { ...existing, ...data };
  const ctc = computeCtc(merged);

  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    const column = SALARY_FIELD_TO_COLUMN[key];
    if (!column) continue;
    params.push(value);
    setClauses.push(`${column} = $${params.length}`);
  }
  params.push(ctc);
  setClauses.push(`ctc = $${params.length}`);
  params.push(req.params.id);

  const { rows } = await query(`UPDATE salary_structures SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${SALARY_STRUCTURE_COLS}`, params);
  const structure = rows[0];
  await recordAudit({
    req,
    userId: req.user.id,
    userName: req.user.email,
    action: 'SALARY_STRUCTURE_UPDATED',
    entityType: 'SalaryStructure',
    entityId: structure.id,
    previousValue: existing,
    newValue: data,
  });
  res.json({ salaryStructure: structure });
});

module.exports = { listSalaryStructures, createSalaryStructure, updateSalaryStructure };
