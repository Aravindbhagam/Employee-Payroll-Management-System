const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiRateLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const departmentRoutes = require('./routes/departments');
const designationRoutes = require('./routes/designations');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leave');
const salaryRoutes = require('./routes/salary');
const payrollRoutes = require('./routes/payroll');
const payslipRoutes = require('./routes/payslips');
const userRoutes = require('./routes/users');
const auditLogRoutes = require('./routes/auditLogs');
const announcementRoutes = require('./routes/announcements');
const settingsRoutes = require('./routes/settings');
const dashboardRoutes = require('./routes/dashboard');
const reportRoutes = require('./routes/reports');
const taxRoutes = require('./routes/tax');

const app = express();

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

module.exports = { app };
