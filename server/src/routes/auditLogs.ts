import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { listAuditLogs } from '../controllers/auditLogController';

const router = Router();
router.use(authenticate);
router.get('/', authorize('AUDIT_LOGS', 'VIEW'), listAuditLogs);

export default router;
