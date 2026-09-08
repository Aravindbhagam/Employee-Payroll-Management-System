import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import * as ctrl from '../controllers/announcementController';

const router = Router();
router.use(authenticate);

router.get('/', authorize('ANNOUNCEMENTS', 'VIEW'), ctrl.listAnnouncements);
router.post('/', authorize('ANNOUNCEMENTS', 'CREATE'), ctrl.createAnnouncement);

export default router;
