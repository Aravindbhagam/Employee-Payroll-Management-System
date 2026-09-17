const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/announcementController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('ANNOUNCEMENTS', 'VIEW'), ctrl.listAnnouncements);
router.post('/', authorize('ANNOUNCEMENTS', 'CREATE'), ctrl.createAnnouncement);

module.exports = router;
