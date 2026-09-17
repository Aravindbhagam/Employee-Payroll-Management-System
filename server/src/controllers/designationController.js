const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { newId } = require('../utils/id');
const { DESIGNATION_COLS } = require('../dbColumns');

const listDesignations = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT de.id, de.title, de.department_id AS "departmentId",
      d.id AS "d_id", d.name AS "d_name"
    FROM designations de
    JOIN departments d ON d.id = de.department_id
    ORDER BY de.title ASC
  `);
  const designations = rows.map((r) => ({ id: r.id, title: r.title, departmentId: r.departmentId, department: { id: r.d_id, name: r.d_name } }));
  res.json({ designations });
});

const upsertSchema = z.object({ title: z.string().min(1), departmentId: z.string().min(1) });

const createDesignation = asyncHandler(async (req, res) => {
  const data = upsertSchema.parse(req.body);
  const id = newId();
  await query('INSERT INTO designations (id, title, department_id) VALUES ($1, $2, $3)', [id, data.title, data.departmentId]);
  const { rows } = await query(`SELECT ${DESIGNATION_COLS} FROM designations WHERE id = $1`, [id]);
  const designation = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DESIGNATION_CREATED', entityType: 'Designation', entityId: designation.id, newValue: data });
  res.status(201).json({ designation });
});

const updateDesignation = asyncHandler(async (req, res) => {
  const existingRes = await query(`SELECT ${DESIGNATION_COLS} FROM designations WHERE id = $1`, [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'Designation not found.' });
  const data = upsertSchema.partial().parse(req.body);

  const setClauses = [];
  const params = [];
  if (data.title !== undefined) {
    params.push(data.title);
    setClauses.push(`title = $${params.length}`);
  }
  if (data.departmentId !== undefined) {
    params.push(data.departmentId);
    setClauses.push(`department_id = $${params.length}`);
  }
  if (setClauses.length > 0) {
    params.push(req.params.id);
    await query(`UPDATE designations SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);
  }

  const { rows } = await query(`SELECT ${DESIGNATION_COLS} FROM designations WHERE id = $1`, [req.params.id]);
  const designation = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DESIGNATION_UPDATED', entityType: 'Designation', entityId: designation.id, previousValue: existing, newValue: data });
  res.json({ designation });
});

const deleteDesignation = asyncHandler(async (req, res) => {
  const existingRes = await query(`SELECT ${DESIGNATION_COLS} FROM designations WHERE id = $1`, [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'Designation not found.' });
  await query('DELETE FROM designations WHERE id = $1', [req.params.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DESIGNATION_DELETED', entityType: 'Designation', entityId: req.params.id, previousValue: existing });
  res.json({ success: true });
});

module.exports = { listDesignations, createDesignation, updateDesignation, deleteDesignation };
