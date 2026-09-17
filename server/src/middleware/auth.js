const { verifyAccessToken } = require('../utils/jwt');
const { query } = require('../db');
const { SESSION_COLS, USER_COLS } = require('../dbColumns');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);

    const sessionRes = await query(`SELECT ${SESSION_COLS} FROM sessions WHERE id = $1`, [payload.sessionId]);
    const session = sessionRes.rows[0];
    if (!session || session.revoked || new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const userRes = await query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [payload.sub]);
    const user = userRes.rows[0];
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account is not active.' });
    }

    req.user = {
      id: user.id,
      role: user.role,
      employeeCode: user.employeeCode,
      email: user.email,
      departmentId: user.departmentId,
      managerId: user.managerId,
      sessionId: session.id,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { authenticate };
