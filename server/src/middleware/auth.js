import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../config/prisma.js';

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);

    const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revoked || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
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
