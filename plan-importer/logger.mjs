import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      ignore: 'pid,hostname'
    }
  }
});

export { logger };

