const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { employeeScopeFilter } = require('../utils/scope');
const { hashPassword, maskSensitive, randomToken } = require('../utils/password');
const { ROLE_NAMES } = require('../enums');
const { parsePagination } = require('../utils/pagination');
const { newId } = require('../utils/id');
const { DOCUMENT_COLS } = require('../dbColumns');

function canSeeUnmaskedSensitive(role, isSelf) {
  return isSelf || role === 'SUPER_ADMIN' || role === 'PAYROLL_ADMIN' || role === 'HR_ADMIN';
}

// Row shape produced by EMPLOYEE_JOIN_SELECT: flat columns prefixed per table,
// assembled into { ...employee, user, department, designation } by mapEmployeeRow.
const EMPLOYEE_JOIN_SELECT = `
  SELECT
    e.id, e.user_id AS "userId", e.first_name AS "firstName", e.last_name AS "lastName",
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
`;

function mapEmployeeRow(row) {
  return {
    id: row.id,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    address: row.address,
    dateOfBirth: row.dateOfBirth,
    dateOfJoining: row.dateOfJoining,
    departmentId: row.departmentId,
    designationId: row.designationId,
    employmentType: row.employmentType,
    status: row.status,
    photoUrl: row.photoUrl,
    bankAccountNumber: row.bankAccountNumber,
    bankName: row.bankName,
    taxId: row.taxId,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: { id: row.u_id, employeeCode: row.u_employeeCode, email: row.u_email, role: row.u_role, status: row.u_status, managerId: row.u_managerId },
    department: row.d_id ? { id: row.d_id, name: row.d_name } : null,
    designation: row.de_id ? { id: row.de_id, title: row.de_title } : null,
  };
}

function serializeEmployee(emp, viewerRole, viewerId) {
  const isSelf = emp.user?.id === viewerId;
  const unmasked = canSeeUnmaskedSensitive(viewerRole, isSelf);
  return {
    id: emp.id,
    userId: emp.userId,
    employeeCode: emp.user?.employeeCode,
    email: emp.user?.email,
    firstName: emp.firstName,
    lastName: emp.lastName,
    phone: emp.phone,
    address: emp.address,
    dateOfBirth: emp.dateOfBirth,
    dateOfJoining: emp.dateOfJoining,
    department: emp.department ? { id: emp.department.id, name: emp.department.name } : null,
    designation: emp.designation ? { id: emp.designation.id, title: emp.designation.title } : null,
    employmentType: emp.employmentType,
    status: emp.status,
    photoUrl: emp.photoUrl,
    managerId: emp.user?.managerId ?? null,
    role: emp.user?.role,
    userStatus: emp.user?.status,
    bankAccountNumber: unmasked ? emp.bankAccountNumber : maskSensitive(emp.bankAccountNumber),
    bankName: emp.bankName,
    taxId: unmasked ? emp.taxId : maskSensitive(emp.taxId),
    emergencyContactName: emp.emergencyContactName,
    emergencyContactPhone: emp.emergencyContactPhone,
  };
}

const listEmployees = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const departmentId = req.query.departmentId;
  const status = req.query.status;
  const search = req.query.search?.trim();

  const conditions = [];
  const params = [];
  function addParam(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (scope) {
    if (scope.in.length === 0) conditions.push('FALSE');
    else conditions.push(`e.id = ANY(${addParam(scope.in)})`);
  }
  if (departmentId) conditions.push(`e.department_id = ${addParam(departmentId)}`);
  if (status) conditions.push(`e.status = ${addParam(status)}`);
  if (search) {
    const like = `%${search}%`;
    const p1 = addParam(like);
    const p2 = addParam(like);
    const p3 = addParam(like);
    const p4 = addParam(like);
    conditions.push(`(e.first_name ILIKE ${p1} OR e.last_name ILIKE ${p2} OR u.email ILIKE ${p3} OR u.employee_code ILIKE ${p4})`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pagination = parsePagination(req, { optIn: true });
  const limitOffsetSql = pagination ? ` LIMIT ${addParam(pagination.take)} OFFSET ${addParam(pagination.skip)}` : '';

  const [employeesRes, countRes] = await Promise.all([
    query(`${EMPLOYEE_JOIN_SELECT} ${whereSql} ORDER BY e.created_at DESC${limitOffsetSql}`, params),
    pagination ? query(`SELECT COUNT(*) FROM employees e JOIN users u ON u.id = e.user_id ${whereSql}`, params.slice(0, params.length - 2)) : Promise.resolve(null),
  ]);

  const employees = employeesRes.rows.map(mapEmployeeRow);
  res.json({
    employees: employees.map((e) => serializeEmployee(e, user.role, user.id)),
    ...(pagination ? { total: parseInt(countRes.rows[0].count, 10), page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

const getEmployee = asyncHandler(async (req, res) => {
  const user = req.user;
  const result = await query(`${EMPLOYEE_JOIN_SELECT} WHERE e.id = $1`, [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found.' });
  const emp = mapEmployeeRow(result.rows[0]);

  const scope = await employeeScopeFilter(user);
  if (scope && !scope.in.includes(emp.id)) {
    throw new ApiError(403, "You don't have permission to view this employee.");
  }
  res.json({ employee: serializeEmployee(emp, user.role, user.id) });
});

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  dateOfJoining: z.string().optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  managerId: z.string().optional(),
  employmentType: z.string().optional(),
  role: z.enum(ROLE_NAMES).optional().default('EMPLOYEE'),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  taxId: z.string().optional(),
});

async function nextEmployeeCode() {
  const { rows } = await query('SELECT COUNT(*) FROM users');
  const count = parseInt(rows[0].count, 10);
  return `EMP${String(count + 1001).padStart(5, '0')}`;
}

const createEmployee = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const existingRes = await query('SELECT id FROM users WHERE email = $1', [data.email.toLowerCase()]);
  if (existingRes.rows.length > 0) throw new ApiError(409, 'A user with this email already exists.');

  const tempPassword = randomToken(6);
  const passwordHash = await hashPassword(tempPassword);
  const employeeCode = await nextEmployeeCode();
  const userId = newId();
  const employeeId = newId();

  await query(
    `INSERT INTO users (id, employee_code, email, password_hash, role, department_id, manager_id, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
    [userId, employeeCode, data.email.toLowerCase(), passwordHash, data.role, data.departmentId || null, data.managerId || null]
  );

  await query(
    `INSERT INTO employees (id, user_id, first_name, last_name, phone, address, date_of_birth, date_of_joining, department_id, designation_id, employment_type, bank_account_number, bank_name, tax_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      employeeId,
      userId,
      data.firstName,
      data.lastName,
      data.phone || null,
      data.address || null,
      data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      data.dateOfJoining ? new Date(data.dateOfJoining) : new Date(),
      data.departmentId || null,
      data.designationId || null,
      data.employmentType || 'Full-Time',
      data.bankAccountNumber || null,
      data.bankName || null,
      data.taxId || null,
    ]
  );

  await recordAudit({
    req,
    userId: req.user.id,
    userName: req.user.email,
    action: 'EMPLOYEE_CREATED',
    entityType: 'Employee',
    entityId: employeeId,
    newValue: { email: data.email, firstName: data.firstName, lastName: data.lastName, role: data.role },
  });

  const result = await query(`${EMPLOYEE_JOIN_SELECT} WHERE e.id = $1`, [employeeId]);
  const emp = mapEmployeeRow(result.rows[0]);
  res.status(201).json({ employee: serializeEmployee(emp, req.user.role, req.user.id), temporaryPassword: tempPassword, employeeCode });
});

const updateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  employmentType: z.string().optional(),
  status: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  taxId: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

// Fields an EMPLOYEE is permitted to self-update (limited personal info only).
const SELF_EDITABLE_FIELDS = ['phone', 'address', 'emergencyContactName', 'emergencyContactPhone'];

const EMPLOYEE_FIELD_TO_COLUMN = {
  firstName: 'first_name',
  lastName: 'last_name',
  phone: 'phone',
  address: 'address',
  dateOfBirth: 'date_of_birth',
  departmentId: 'department_id',
  designationId: 'designation_id',
  employmentType: 'employment_type',
  status: 'status',
  bankAccountNumber: 'bank_account_number',
  bankName: 'bank_name',
  taxId: 'tax_id',
  emergencyContactName: 'emergency_contact_name',
  emergencyContactPhone: 'emergency_contact_phone',
};

const updateEmployee = asyncHandler(async (req, res) => {
  const user = req.user;
  const existingRes = await query(`${EMPLOYEE_JOIN_SELECT} WHERE e.id = $1`, [req.params.id]);
  if (existingRes.rows.length === 0) return res.status(404).json({ error: 'Employee not found.' });
  const existing = mapEmployeeRow(existingRes.rows[0]);

  const isSelf = existing.userId === user.id;
  let data = updateSchema.parse(req.body);

  if (isSelf && user.role === 'EMPLOYEE') {
    data = Object.fromEntries(Object.entries(data).filter(([key]) => SELF_EDITABLE_FIELDS.includes(key)));
  } else if (!isSelf) {
    const scope = await employeeScopeFilter(user);
    if (scope && !scope.in.includes(existing.id)) throw new ApiError(403, "You don't have permission to edit this employee.");
    if (user.role === 'MANAGER') throw new ApiError(403, 'Managers cannot edit employee profiles.');
  }

  const { departmentId, designationId, managerId } = data;

  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    const column = EMPLOYEE_FIELD_TO_COLUMN[key];
    if (!column) continue;
    params.push(key === 'dateOfBirth' && value ? new Date(value) : value);
    setClauses.push(`${column} = $${params.length}`);
  }
  if (setClauses.length > 0) {
    setClauses.push(`updated_at = $${params.length + 1}`);
    params.push(new Date());
    params.push(req.params.id);
    await query(`UPDATE employees SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);
  }

  if (departmentId !== undefined || managerId !== undefined) {
    const userSetClauses = [];
    const userParams = [];
    if (departmentId !== undefined) {
      userParams.push(departmentId);
      userSetClauses.push(`department_id = $${userParams.length}`);
    }
    if (managerId !== undefined) {
      userParams.push(managerId);
      userSetClauses.push(`manager_id = $${userParams.length}`);
    }
    userParams.push(existing.userId);
    await query(`UPDATE users SET ${userSetClauses.join(', ')} WHERE id = $${userParams.length}`, userParams);
  }

  await recordAudit({
    req,
    userId: user.id,
    userName: user.email,
    action: 'EMPLOYEE_UPDATED',
    entityType: 'Employee',
    entityId: existing.id,
    previousValue: { firstName: existing.firstName, lastName: existing.lastName, status: existing.status },
    newValue: data,
  });

  const refreshedRes = await query(`${EMPLOYEE_JOIN_SELECT} WHERE e.id = $1`, [existing.id]);
  const refreshed = mapEmployeeRow(refreshedRes.rows[0]);
  res.json({ employee: serializeEmployee(refreshed, user.role, user.id) });
});

const deleteEmployee = asyncHandler(async (req, res) => {
  const existingRes = await query('SELECT id, user_id AS "userId", status FROM employees WHERE id = $1', [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'Employee not found.' });

  await query('UPDATE users SET status = $1 WHERE id = $2', ['INACTIVE', existing.userId]);

  await recordAudit({
    req,
    userId: req.user.id,
    userName: req.user.email,
    action: 'EMPLOYEE_OFFBOARDED',
    entityType: 'Employee',
    entityId: existing.id,
    previousValue: { status: existing.status },
  });
  res.json({ success: true, message: 'Employee has been deactivated (offboarded).' });
});

// ---- Documents ----

const listDocuments = asyncHandler(async (req, res) => {
  const user = req.user;
  const employeeRes = await query('SELECT id FROM employees WHERE id = $1', [req.params.id]);
  if (employeeRes.rows.length === 0) return res.status(404).json({ error: 'Employee not found.' });
  const employee = employeeRes.rows[0];
  const scope = await employeeScopeFilter(user);
  if (scope && !scope.in.includes(employee.id)) throw new ApiError(403, "You don't have permission to view these documents.");

  const { rows } = await query(`SELECT ${DOCUMENT_COLS} FROM documents WHERE employee_id = $1 ORDER BY uploaded_at DESC`, [employee.id]);
  res.json({ documents: rows });
});

const docSchema = z.object({ name: z.string().min(1), type: z.string().min(1), fileName: z.string().min(1) });

const addDocument = asyncHandler(async (req, res) => {
  const employeeRes = await query('SELECT id FROM employees WHERE id = $1', [req.params.id]);
  if (employeeRes.rows.length === 0) return res.status(404).json({ error: 'Employee not found.' });
  const employee = employeeRes.rows[0];
  const data = docSchema.parse(req.body);
  const id = newId();
  await query('INSERT INTO documents (id, employee_id, name, type, file_name) VALUES ($1, $2, $3, $4, $5)', [id, employee.id, data.name, data.type, data.fileName]);
  const { rows } = await query(`SELECT ${DOCUMENT_COLS} FROM documents WHERE id = $1`, [id]);
  const document = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DOCUMENT_UPLOADED', entityType: 'Document', entityId: document.id, newValue: data });
  res.status(201).json({ document });
});

const deleteDocument = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT ${DOCUMENT_COLS} FROM documents WHERE id = $1`, [req.params.docId]);
  const document = rows[0];
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  await query('DELETE FROM documents WHERE id = $1', [document.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DOCUMENT_DELETED', entityType: 'Document', entityId: document.id, previousValue: document });
  res.json({ success: true });
});

module.exports = {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listDocuments,
  addDocument,
  deleteDocument,
};
