import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import config from './AppConfig';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Custom format for development (colorized, readable)
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return stack
      ? `${timestamp} ${level}: ${message}\n${stack}${metaStr}`
      : `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Structured JSON format for production
const prodFormat = combine(
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
