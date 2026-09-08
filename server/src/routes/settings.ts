import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import * as ctrl from '../controllers/settingsController';

const router = Router();
router.use(authenticate);

router.get('/', authorize('SETTINGS', 'VIEW'), ctrl.getSettings);
router.put('/', authorize('SETTINGS', 'MANAGE'), ctrl.updateSettings);

export default router;
