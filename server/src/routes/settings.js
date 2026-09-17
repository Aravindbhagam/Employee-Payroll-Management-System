const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/settingsController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('SETTINGS', 'VIEW'), ctrl.getSettings);
router.put('/', authorize('SETTINGS', 'MANAGE'), ctrl.updateSettings);

module.exports = router;
