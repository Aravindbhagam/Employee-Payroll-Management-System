const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { getDashboard } = require('../controllers/dashboardController');

const router = Router();
router.use(authenticate);
router.get('/', authorize('DASHBOARD', 'VIEW'), getDashboard);

module.exports = router;
