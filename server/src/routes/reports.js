import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { runReport } from '../controllers/reportController.js';

const router = Router();
router.use(authenticate);
router.get('/', authorize('REPORTS', 'VIEW'), runReport);

export default router;
