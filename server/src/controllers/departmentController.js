const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { newId } = require('../utils/id');
const { DEPARTMENT_COLS } = require('../dbColumns');

const listDepartments = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT d.id, d.name, d.description, d.manager_id AS "managerId", d.created_at AS "createdAt",
      m.id AS "m_id", me.first_name AS "me_firstName", me.last_name AS "me_lastName",
      (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS "employeeCount"
    FROM departments d
    LEFT JOIN users m ON m.id = d.manager_id
    LEFT JOIN employees me ON me.user_id = m.id
    ORDER BY d.name ASC
  `);
  const departments = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    managerId: r.managerId,
    createdAt: r.createdAt,
    manager: r.m_id ? { id: r.m_id, employee: r.me_firstName ? { firstName: r.me_firstName, lastName: r.me_lastName } : null } : null,
    _count: { employees: parseInt(r.employeeCount, 10) },
  }));
  res.json({ departments });
});

const upsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  managerId: z.string().optional().nullable(),
});

const createDepartment = asyncHandler(async (req, res) => {
  const data = upsertSchema.parse(req.body);
  const id = newId();
  await query('INSERT INTO departments (id, name, description, manager_id) VALUES ($1, $2, $3, $4)', [id, data.name, data.description || null, data.managerId || null]);
  const { rows } = await query(`SELECT ${DEPARTMENT_COLS} FROM departments WHERE id = $1`, [id]);
  const dept = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DEPARTMENT_CREATED', entityType: 'Department', entityId: dept.id, newValue: data });
  res.status(201).json({ department: dept });
});

const updateDepartment = asyncHandler(async (req, res) => {
  const existingRes = await query(`SELECT ${DEPARTMENT_COLS} FROM departments WHERE id = $1`, [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'Department not found.' });
  const data = upsertSchema.partial().parse(req.body);

  const setClauses = [];
  const params = [];
  if (data.name !== undefined) {
    params.push(data.name);
    setClauses.push(`name = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description);
    setClauses.push(`description = $${params.length}`);
  }
  if (data.managerId !== undefined) {
    params.push(data.managerId);
    setClauses.push(`manager_id = $${params.length}`);
  }
  if (setClauses.length > 0) {
    params.push(req.params.id);
    await query(`UPDATE departments SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);
  }

  const { rows } = await query(`SELECT ${DEPARTMENT_COLS} FROM departments WHERE id = $1`, [req.params.id]);
  const dept = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DEPARTMENT_UPDATED', entityType: 'Department', entityId: dept.id, previousValue: existing, newValue: data });
  res.json({ department: dept });
});

const deleteDepartment = asyncHandler(async (req, res) => {
  const existingRes = await query(`SELECT ${DEPARTMENT_COLS} FROM departments WHERE id = $1`, [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'Department not found.' });
  await query('DELETE FROM departments WHERE id = $1', [req.params.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DEPARTMENT_DELETED', entityType: 'Department', entityId: req.params.id, previousValue: existing });
  res.json({ success: true });
});

module.exports = { listDepartments, createDepartment, updateDepartment, deleteDepartment };
