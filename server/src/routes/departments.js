import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/departmentController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('DEPARTMENTS', 'VIEW'), ctrl.listDepartments);
router.post('/', authorize('DEPARTMENTS', 'CREATE'), ctrl.createDepartment);
router.put('/:id', authorize('DEPARTMENTS', 'EDIT'), ctrl.updateDepartment);
router.delete('/:id', authorize('DEPARTMENTS', 'DELETE'), ctrl.deleteDepartment);

export default router;
