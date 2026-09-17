const { z } = require('zod');
const { query } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { newId } = require('../utils/id');
const { ANNOUNCEMENT_COLS } = require('../dbColumns');

const listAnnouncements = asyncHandler(async (req, res) => {
  const user = req.user;
  const conditions = [`a.audience = 'ALL'`];
  const params = [];
  if (user.departmentId) {
    params.push(user.departmentId);
    conditions.push(`(a.audience = 'DEPARTMENT' AND a.department_id = $${params.length})`);
  }

  const { rows } = await query(
    `SELECT a.id, a.title, a.body, a.created_by_id AS "createdById", a.audience,
       a.department_id AS "departmentId", a.created_at AS "createdAt",
       u.email AS "cb_email"
     FROM announcements a
     LEFT JOIN users u ON u.id = a.created_by_id
     WHERE ${conditions.join(' OR ')}
     ORDER BY a.created_at DESC
     LIMIT 20`,
    params
  );

  const announcements = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    createdById: r.createdById,
    audience: r.audience,
    departmentId: r.departmentId,
    createdAt: r.createdAt,
    createdBy: r.cb_email ? { email: r.cb_email } : null,
  }));
  res.json({ announcements });
});

const createSchema = z.object({ title: z.string().min(1), body: z.string().min(1), audience: z.enum(['ALL', 'DEPARTMENT']).default('ALL'), departmentId: z.string().optional() });

const createAnnouncement = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const id = newId();
  await query('INSERT INTO announcements (id, title, body, audience, department_id, created_by_id) VALUES ($1, $2, $3, $4, $5, $6)', [
    id,
    data.title,
    data.body,
    data.audience,
    data.departmentId || null,
    req.user.id,
  ]);
  const { rows } = await query(`SELECT ${ANNOUNCEMENT_COLS} FROM announcements WHERE id = $1`, [id]);
  const announcement = rows[0];
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'ANNOUNCEMENT_CREATED', entityType: 'Announcement', entityId: announcement.id, newValue: data });
  res.status(201).json({ announcement });
});

module.exports = { listAnnouncements, createAnnouncement };
