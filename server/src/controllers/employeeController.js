import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { recordAudit } from '../utils/audit.js';
import { employeeScopeFilter } from '../utils/scope.js';
import { hashPassword, maskSensitive, randomToken } from '../utils/password.js';
import { ROLE_NAMES } from '../enums.js';
import { parsePagination } from '../utils/pagination.js';

function canSeeUnmaskedSensitive(role, isSelf) {
  return isSelf || role === 'SUPER_ADMIN' || role === 'PAYROLL_ADMIN' || role === 'HR_ADMIN';
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

const employeeInclude = {
  user: true,
  department: true,
  designation: true,
};

const userWithEmployeeInclude = {
  employee: true,
  department: true,
};

export const listEmployees = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const departmentId = req.query.departmentId;
  const status = req.query.status;
  const search = req.query.search?.trim();

  const where = {};
  if (scope) where.id = scope;
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { user: { email: { contains: search } } },
      { user: { employeeCode: { contains: search } } },
    ];
  }

  const pagination = parsePagination(req, { optIn: true });
  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: employeeInclude,
      orderBy: { createdAt: 'desc' },
      ...(pagination ? { take: pagination.take, skip: pagination.skip } : {}),
    }),
    pagination ? prisma.employee.count({ where }) : Promise.resolve(undefined),
  ]);
  res.json({
    employees: employees.map((e) => serializeEmployee(e, user.role, user.id)),
    ...(pagination ? { total, page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const user = req.user;
  const emp = await prisma.employee.findUnique({ where: { id: req.params.id }, include: employeeInclude });
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

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
  const count = await prisma.user.count();
  return `EMP${String(count + 1001).padStart(5, '0')}`;
}

export const createEmployee = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  const tempPassword = randomToken(6);
  const passwordHash = await hashPassword(tempPassword);
  const employeeCode = await nextEmployeeCode();

  const user = await prisma.user.create({
    data: {
      employeeCode,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
      departmentId: data.departmentId || null,
      managerId: data.managerId || null,
      mustChangePassword: true,
      employee: {
        create: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          address: data.address,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : undefined,
          departmentId: data.departmentId || null,
          designationId: data.designationId || null,
          employmentType: data.employmentType || 'Full-Time',
          bankAccountNumber: data.bankAccountNumber,
          bankName: data.bankName,
          taxId: data.taxId,
        },
      },
    },
    include: userWithEmployeeInclude,
  });

  await recordAudit({
    req,
    userId: req.user.id,
    userName: req.user.email,
    action: 'EMPLOYEE_CREATED',
    entityType: 'Employee',
    entityId: user.employee.id,
    newValue: { email: data.email, firstName: data.firstName, lastName: data.lastName, role: data.role },
  });

  const emp = await prisma.employee.findUnique({ where: { userId: user.id }, include: employeeInclude });
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

export const updateEmployee = asyncHandler(async (req, res) => {
  const user = req.user;
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id }, include: employeeInclude });
  if (!existing) return res.status(404).json({ error: 'Employee not found.' });

  const isSelf = existing.userId === user.id;
  let data = updateSchema.parse(req.body);

  if (isSelf && user.role === 'EMPLOYEE') {
    data = Object.fromEntries(Object.entries(data).filter(([key]) => SELF_EDITABLE_FIELDS.includes(key)));
  } else if (!isSelf) {
    const scope = await employeeScopeFilter(user);
    if (scope && !scope.in.includes(existing.id)) throw new ApiError(403, "You don't have permission to edit this employee.");
    if (user.role === 'MANAGER') throw new ApiError(403, "Managers cannot edit employee profiles.");
  }

  const { departmentId, designationId, managerId, status, ...employeeData } = data;

  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: { ...employeeData, departmentId, designationId, status },
    include: employeeInclude,
  });

  if (departmentId !== undefined || managerId !== undefined) {
    await prisma.user.update({
      where: { id: existing.userId },
      data: {
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(managerId !== undefined ? { managerId } : {}),
      },
    });
  }

  await recordAudit({
    req,
    userId: user.id,
    userName: user.email,
    action: 'EMPLOYEE_UPDATED',
    entityType: 'Employee',
    entityId: employee.id,
    previousValue: { firstName: existing.firstName, lastName: existing.lastName, status: existing.status },
    newValue: data,
  });

  const refreshed = await prisma.employee.findUnique({ where: { id: employee.id }, include: employeeInclude });
  res.json({ employee: serializeEmployee(refreshed, user.role, user.id) });
});

export const deleteEmployee = asyncHandler(async (req, res) => {
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Employee not found.' });

  await prisma.user.update({ where: { id: existing.userId }, data: { status: 'INACTIVE' } });

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

export const listDocuments = asyncHandler(async (req, res) => {
  const user = req.user;
  const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const scope = await employeeScopeFilter(user);
  if (scope && !scope.in.includes(employee.id)) throw new ApiError(403, "You don't have permission to view these documents.");

  const documents = await prisma.document.findMany({ where: { employeeId: employee.id }, orderBy: { uploadedAt: 'desc' } });
  res.json({ documents });
});

const docSchema = z.object({ name: z.string().min(1), type: z.string().min(1), fileName: z.string().min(1) });

export const addDocument = asyncHandler(async (req, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const data = docSchema.parse(req.body);
  const document = await prisma.document.create({ data: { ...data, employeeId: employee.id } });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DOCUMENT_UPLOADED', entityType: 'Document', entityId: document.id, newValue: data });
  res.status(201).json({ document });
});

export const deleteDocument = asyncHandler(async (req, res) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.docId } });
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  await prisma.document.delete({ where: { id: document.id } });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DOCUMENT_DELETED', entityType: 'Document', entityId: document.id, previousValue: document });
  res.json({ success: true });
});
