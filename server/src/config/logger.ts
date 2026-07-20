import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import config from './AppConfig';
import { getCorrelationContext } from '../shared/correlationStorage';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

/**
 * Format that injects the current correlation context (correlationId,
 * tenantId, userId) from AsyncLocalStorage into every log entry's meta.
 * No-op outside a request context.
 */
const correlationFormat = winston.format((info) => {
  const ctx = getCorrelationContext();
  if (ctx) {
    info.correlationId = ctx.correlationId;
    if (ctx.tenantId !== undefined) info.tenantId = ctx.tenantId;
    if (ctx.userId !== undefined) info.userId = ctx.userId;
  }
  return info;
});

// Custom format for development (colorized, readable)
const devFormat = combine(
  correlationFormat(),
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, correlationId, ...meta }) => {
    const cid = correlationId ? `[${correlationId}] ` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return stack
      ? `${timestamp} ${level}: ${cid}${message}\n${stack}${metaStr}`
      : `${timestamp} ${level}: ${cid}${message}${metaStr}`;
  })
);

// Structured JSON format for production
const prodFormat = combine(
  correlationFormat(),
  timestamp(),
  errors({ stack: true }),
  json()
);

// Log directory
const logDir = path.join(config.dbPath, 'logs');

// Daily rotate transport for combined logs
const fileTransport = new DailyRotateFile({
  dirname: logDir,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '30d',
  level: 'info',
});

// Daily rotate transport for error logs
const errorFileTransport = new DailyRotateFile({
  dirname: logDir,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '60d',
  level: 'error',
});

const isProduction = config.nodeEnv === 'production';

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'visitor-system' },
  transports: [
    new winston.transports.Console(),
    fileTransport,
    errorFileTransport,
  ],
  // Don't exit on uncaught exceptions — let the process handler deal with them
  exitOnError: false,
});

export default logger;
