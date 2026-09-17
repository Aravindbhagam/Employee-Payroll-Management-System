const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/attendanceController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('ATTENDANCE', 'VIEW'), ctrl.listAttendance);
router.post('/check-in', ctrl.checkIn);
router.post('/check-out', ctrl.checkOut);
router.post('/manual', authorize('ATTENDANCE', 'EDIT'), ctrl.upsertManualAttendance);

module.exports = router;
