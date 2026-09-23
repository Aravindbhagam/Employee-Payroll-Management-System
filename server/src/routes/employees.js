import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import * as ctrl from '../controllers/employeeController.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { prisma } from '../config/prisma.js';

const router = Router();
router.use(authenticate);

// Allows EMPLOYEES:EDIT holders (HR/Super Admin) through, and also lets any
// authenticated user edit their OWN employee record (self-service profile
// update) even without the blanket EDIT permission -- the controller further
// restricts which fields a self-editing Employee may change.
const authorizeEmployeeEdit = asyncHandler(async (req, res, next) => {
  const user = req.user;
  if (user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN') return next();
  const employee = await prisma.employee.findUnique({ where: { id: req.params.id }, select: { userId: true } });
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

export default router;
