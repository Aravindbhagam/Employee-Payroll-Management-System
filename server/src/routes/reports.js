const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { runReport } = require('../controllers/reportController');

const router = Router();
router.use(authenticate);
router.get('/', authorize('REPORTS', 'VIEW'), runReport);

module.exports = router;
