const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/leaveController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('LEAVE', 'VIEW'), ctrl.listLeaveRequests);
router.get('/balances', authorize('LEAVE', 'VIEW'), ctrl.listLeaveBalances);
router.post('/', authorize('LEAVE', 'CREATE'), ctrl.applyLeave);
router.post('/:id/cancel', ctrl.cancelLeave);
router.post('/:id/approve', authorize('LEAVE', 'APPROVE'), ctrl.approveLeave);
router.post('/:id/reject', authorize('LEAVE', 'APPROVE'), ctrl.rejectLeave);

module.exports = router;
