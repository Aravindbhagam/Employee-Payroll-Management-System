import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { listAuditLogs } from '../controllers/auditLogController.js';

const router = Router();
router.use(authenticate);
router.get('/', authorize('AUDIT_LOGS', 'VIEW'), listAuditLogs);

export default router;
