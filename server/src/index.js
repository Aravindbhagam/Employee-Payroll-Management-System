const { app } = require('./app');
const { env } = require('./config/env');
const { logger } = require('./config/logger');

app.listen(env.port, () => {
  logger.info(`Payroll API listening on http://localhost:${env.port}`);
});
