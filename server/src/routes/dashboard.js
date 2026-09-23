import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { getDashboard } from '../controllers/dashboardController.js';

const router = Router();
router.use(authenticate);
router.get('/', authorize('DASHBOARD', 'VIEW'), getDashboard);

export default router;
