import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimit.js';

import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import departmentRoutes from './routes/departments.js';
import designationRoutes from './routes/designations.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leave.js';
import salaryRoutes from './routes/salary.js';
import payrollRoutes from './routes/payroll.js';
import payslipRoutes from './routes/payslips.js';
import userRoutes from './routes/users.js';
import auditLogRoutes from './routes/auditLogs.js';
import announcementRoutes from './routes/announcements.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import taxRoutes from './routes/tax.js';

export const app = express();

// Render (and most PaaS hosts) terminate TLS at a reverse proxy in front of
// this process, so Express needs to trust the X-Forwarded-* headers -- this
// is required for secure cookies and accurate req.ip (rate limiting, audit
// log IPs) to work correctly in production.
if (env.isProduction) app.set('trust proxy', 1);

app.use(helmet());
app.use(pinoHttp({ logger, autoLogging: env.nodeEnv !== 'test' }));
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (no Origin header, e.g. health checks) and
      // any origin explicitly listed in CLIENT_ORIGIN.
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
  })
);
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
