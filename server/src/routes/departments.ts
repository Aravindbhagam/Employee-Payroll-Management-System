import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import * as ctrl from '../controllers/departmentController';

const router = Router();
router.use(authenticate);

router.get('/', authorize('DEPARTMENTS', 'VIEW'), ctrl.listDepartments);
router.post('/', authorize('DEPARTMENTS', 'CREATE'), ctrl.createDepartment);
router.put('/:id', authorize('DEPARTMENTS', 'EDIT'), ctrl.updateDepartment);
router.delete('/:id', authorize('DEPARTMENTS', 'DELETE'), ctrl.deleteDepartment);

export default router;
