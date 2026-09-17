const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/designationController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('DESIGNATIONS', 'VIEW'), ctrl.listDesignations);
router.post('/', authorize('DESIGNATIONS', 'CREATE'), ctrl.createDesignation);
router.put('/:id', authorize('DESIGNATIONS', 'EDIT'), ctrl.updateDesignation);
router.delete('/:id', authorize('DESIGNATIONS', 'DELETE'), ctrl.deleteDesignation);

module.exports = router;
