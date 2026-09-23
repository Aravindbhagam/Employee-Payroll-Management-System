import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/designationController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('DESIGNATIONS', 'VIEW'), ctrl.listDesignations);
router.post('/', authorize('DESIGNATIONS', 'CREATE'), ctrl.createDesignation);
router.put('/:id', authorize('DESIGNATIONS', 'EDIT'), ctrl.updateDesignation);
router.delete('/:id', authorize('DESIGNATIONS', 'DELETE'), ctrl.deleteDesignation);

export default router;
