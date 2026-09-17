const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const ctrl = require('../controllers/employeeController');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { query } = require('../db');

const router = Router();
router.use(authenticate);

// Allows EMPLOYEES:EDIT holders (HR/Super Admin) through, and also lets any
// authenticated user edit their OWN employee record (self-service profile
// update) even without the blanket EDIT permission -- the controller further
// restricts which fields a self-editing Employee may change.
const authorizeEmployeeEdit = asyncHandler(async (req, res, next) => {
  const user = req.user;
  if (user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN') return next();
  const { rows } = await query('SELECT user_id AS "userId" FROM employees WHERE id = $1', [req.params.id]);
  const employee = rows[0];
  if (employee && employee.userId === user.id) return next();
  throw new ApiError(403, "You don't have permission to edit this employee.");
});

router.get('/', authorize('EMPLOYEES', 'VIEW'), ctrl.listEmployees);
router.get('/:id', authorize('EMPLOYEES', 'VIEW'), ctrl.getEmployee);
router.post('/', authorize('EMPLOYEES', 'CREATE'), ctrl.createEmployee);
router.put('/:id', authorizeEmployeeEdit, ctrl.updateEmployee);
router.delete('/:id', authorize('EMPLOYEES', 'DELETE'), ctrl.deleteEmployee);

router.get('/:id/documents', authorize('DOCUMENTS', 'VIEW'), ctrl.listDocuments);
router.post('/:id/documents', authorize('DOCUMENTS', 'CREATE'), ctrl.addDocument);
router.delete('/:id/documents/:docId', authorize('DOCUMENTS', 'DELETE'), ctrl.deleteDocument);

module.exports = router;
