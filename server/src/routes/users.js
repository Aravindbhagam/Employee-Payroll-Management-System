import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/userController.js';
import * as roleCtrl from '../controllers/roleController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('USERS', 'VIEW'), ctrl.listUsers);
router.get('/roles/permission-matrix', authorize('USERS', 'MANAGE'), roleCtrl.getRolePermissionMatrix);
router.put('/roles/permission-matrix', authorize('USERS', 'MANAGE'), roleCtrl.updateRolePermissionMatrix);
router.get('/:id', authorize('USERS', 'VIEW'), ctrl.getUser);
router.post('/', authorize('USERS', 'CREATE'), ctrl.createUser);
router.put('/:id', authorize('USERS', 'EDIT'), ctrl.updateUser);
router.post('/:id/activate', authorize('USERS', 'MANAGE'), ctrl.activateUser);
router.post('/:id/deactivate', authorize('USERS', 'MANAGE'), ctrl.deactivateUser);
router.post('/:id/lock', authorize('USERS', 'MANAGE'), ctrl.lockUser);
router.post('/:id/unlock', authorize('USERS', 'MANAGE'), ctrl.unlockUser);
router.post('/:id/reset-password', authorize('USERS', 'MANAGE'), ctrl.adminResetPassword);
router.get('/:id/permissions', authorize('USERS', 'MANAGE'), ctrl.getUserPermissions);
router.put('/:id/permissions', authorize('USERS', 'MANAGE'), ctrl.setUserPermissions);

export default router;
