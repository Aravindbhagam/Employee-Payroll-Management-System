import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/announcementController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('ANNOUNCEMENTS', 'VIEW'), ctrl.listAnnouncements);
router.post('/', authorize('ANNOUNCEMENTS', 'CREATE'), ctrl.createAnnouncement);

export default router;
