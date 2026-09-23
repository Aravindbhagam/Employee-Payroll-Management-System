import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/settingsController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('SETTINGS', 'VIEW'), ctrl.getSettings);
router.put('/', authorize('SETTINGS', 'MANAGE'), ctrl.updateSettings);

export default router;
