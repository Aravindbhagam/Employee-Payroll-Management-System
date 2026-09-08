import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { runReport } from '../controllers/reportController';

const router = Router();
router.use(authenticate);
router.get('/', authorize('REPORTS', 'VIEW'), runReport);

export default router;
