import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';

import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import departmentRoutes from './routes/departments';
import designationRoutes from './routes/designations';
import attendanceRoutes from './routes/attendance';
import leaveRoutes from './routes/leave';
import salaryRoutes from './routes/salary';
import payrollRoutes from './routes/payroll';
import payslipRoutes from './routes/payslips';
import userRoutes from './routes/users';
import auditLogRoutes from './routes/auditLogs';
import announcementRoutes from './routes/announcements';
import settingsRoutes from './routes/settings';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/reports';
import taxRoutes from './routes/tax';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(apiRateLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/designations', designationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/salary-structures', salaryRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/payslips', payslipRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tax-compliance', taxRoutes);

app.use(notFound);
app.use(errorHandler);
