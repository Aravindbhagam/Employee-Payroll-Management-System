import { RoleName } from './enums';

export interface AuthUser {
  id: string;
  role: RoleName;
  employeeCode: string;
  email: string;
  departmentId: string | null;
  managerId: string | null;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
