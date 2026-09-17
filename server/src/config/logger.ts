import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.nodeEnv === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
  ...(env.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
