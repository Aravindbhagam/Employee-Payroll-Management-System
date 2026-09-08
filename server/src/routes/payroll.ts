import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import * as ctrl from '../controllers/payrollController';

const router = Router();
router.use(authenticate);

router.get('/', authorize('PAYROLL', 'VIEW'), ctrl.listPayrollRuns);
router.get('/:id', authorize('PAYROLL', 'VIEW'), ctrl.getPayrollRun);
router.post('/', authorize('PAYROLL', 'CREATE'), ctrl.createPayrollRun);
router.post('/:id/calculate', authorize('PAYROLL', 'PROCESS'), ctrl.calculatePayroll);
router.post('/:id/submit', authorize('PAYROLL', 'PROCESS'), ctrl.submitForApproval);
router.post('/:id/approve', authorize('PAYROLL', 'APPROVE'), ctrl.approvePayroll);
router.post('/:id/reject', authorize('PAYROLL', 'APPROVE'), ctrl.rejectPayroll);
router.post('/:id/process', authorize('PAYROLL', 'PROCESS'), ctrl.processPayroll);

export default router;
