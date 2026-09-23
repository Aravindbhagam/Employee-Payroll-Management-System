import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/leaveController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('LEAVE', 'VIEW'), ctrl.listLeaveRequests);
router.get('/balances', authorize('LEAVE', 'VIEW'), ctrl.listLeaveBalances);
router.post('/', authorize('LEAVE', 'CREATE'), ctrl.applyLeave);
router.post('/:id/cancel', ctrl.cancelLeave);
router.post('/:id/approve', authorize('LEAVE', 'APPROVE'), ctrl.approveLeave);
router.post('/:id/reject', authorize('LEAVE', 'APPROVE'), ctrl.rejectLeave);

export default router;
