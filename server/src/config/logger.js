const pino = require('pino');
const { env } = require('./env');

const logger = pino({
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

module.exports = { logger };
