import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

app.listen(env.port, () => {
  logger.info(`Payroll API listening on http://localhost:${env.port}`);
});
