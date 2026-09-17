const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/salaryController');

const router = Router();
router.use(authenticate);

router.get('/', authorize('SALARY_STRUCTURE', 'VIEW'), ctrl.listSalaryStructures);
router.post('/', authorize('SALARY_STRUCTURE', 'CREATE'), ctrl.createSalaryStructure);
router.put('/:id', authorize('SALARY_STRUCTURE', 'EDIT'), ctrl.updateSalaryStructure);

module.exports = router;
