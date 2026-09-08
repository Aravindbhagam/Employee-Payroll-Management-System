import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import * as ctrl from '../controllers/taxController';

const router = Router();
router.use(authenticate);

router.get('/', authorize('TAX_COMPLIANCE', 'VIEW'), ctrl.getTaxSettings);
router.put('/', authorize('TAX_COMPLIANCE', 'EDIT'), ctrl.updateTaxSettings);

export default router;
