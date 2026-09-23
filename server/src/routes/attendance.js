import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/attendanceController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('ATTENDANCE', 'VIEW'), ctrl.listAttendance);
router.post('/check-in', ctrl.checkIn);
router.post('/check-out', ctrl.checkOut);
router.post('/manual', authorize('ATTENDANCE', 'EDIT'), ctrl.upsertManualAttendance);

export default router;
