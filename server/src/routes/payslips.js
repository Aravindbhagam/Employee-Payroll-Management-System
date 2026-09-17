const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/payslipController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('PAYSLIPS', 'VIEW'), ctrl.listPayslips);
router.get('/:id', authorize('PAYSLIPS', 'VIEW'), ctrl.getPayslip);

module.exports = router;
