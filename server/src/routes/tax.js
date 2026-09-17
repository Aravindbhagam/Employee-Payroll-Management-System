const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/taxController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('TAX_COMPLIANCE', 'VIEW'), ctrl.getTaxSettings);
router.put('/', authorize('TAX_COMPLIANCE', 'EDIT'), ctrl.updateTaxSettings);

module.exports = router;
