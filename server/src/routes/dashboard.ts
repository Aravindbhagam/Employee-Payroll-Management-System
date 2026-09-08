import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { getDashboard } from '../controllers/dashboardController';

const router = Router();
router.use(authenticate);
router.get('/', authorize('DASHBOARD', 'VIEW'), getDashboard);

export default router;
