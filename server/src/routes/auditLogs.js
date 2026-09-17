const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { listAuditLogs } = require('../controllers/auditLogController');

const router = Router();
router.use(authenticate);
router.get('/', authorize('AUDIT_LOGS', 'VIEW'), listAuditLogs);

module.exports = router;
