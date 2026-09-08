import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import * as ctrl from '../controllers/payslipController';

const router = Router();
router.use(authenticate);

router.get('/', authorize('PAYSLIPS', 'VIEW'), ctrl.listPayslips);
router.get('/:id', authorize('PAYSLIPS', 'VIEW'), ctrl.getPayslip);

export default router;
