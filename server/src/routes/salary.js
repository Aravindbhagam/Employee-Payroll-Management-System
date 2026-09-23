import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/salaryController.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('SALARY_STRUCTURE', 'VIEW'), ctrl.listSalaryStructures);
router.post('/', authorize('SALARY_STRUCTURE', 'CREATE'), ctrl.createSalaryStructure);
router.put('/:id', authorize('SALARY_STRUCTURE', 'EDIT'), ctrl.updateSalaryStructure);

export default router;
