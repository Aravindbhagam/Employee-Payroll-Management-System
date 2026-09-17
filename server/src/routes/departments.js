const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/departmentController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('DEPARTMENTS', 'VIEW'), ctrl.listDepartments);
router.post('/', authorize('DEPARTMENTS', 'CREATE'), ctrl.createDepartment);
router.put('/:id', authorize('DEPARTMENTS', 'EDIT'), ctrl.updateDepartment);
router.delete('/:id', authorize('DEPARTMENTS', 'DELETE'), ctrl.deleteDepartment);

module.exports = router;
