import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../../logs');

// Ensure logs directory exists
import fs from 'fs';
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    
    if (stack) {
      log += `\nStack: ${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      log += `\nMeta: ${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Create main logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'notemind-server' },
  transports: [
    // Console output with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    
    // All logs
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10
    }),
    
    // Error logs only
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 10
    }),
    
    // Request logs
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'requests.log'),
      maxsize: 5242880,
      maxFiles: 10
    })
  ]
});

/**
 * Express middleware for request logging
 */
export function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };
    
    const userId = req.user?.id;
    if (userId) {
      logData.userId = userId;
    }
    
    // Log using Winston
    if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.path} ${res.statusCode}`, logData);
    } else {
      logger.info(`${req.method} ${req.path} ${res.statusCode}`, logData);
    }
  });
  
  next();
}

/**
 * Log API errors with context
 */
export function logError(error, context = {}) {
  logger.error(error.message, {
    error: error,
    context: context,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log database operations
 */
export function logDatabase(operation, tableName, duration, success = true) {
  const level = success ? 'debug' : 'warn';
  logger[level](`Database ${operation} on ${tableName}`, {
    operation,
    table: tableName,
    duration: `${duration}ms`
  });
}

/**
 * Log authentication events
 */
export function logAuth(event, userId, details = {}) {
  logger.info(`Auth: ${event}`, {
    userId,
    event,
    ...details
  });
}

/**
 * Log file operations
 */
export function logFile(operation, fileName, size, success = true) {
  const level = success ? 'info' : 'error';
  logger[level](`File ${operation}`, {
    operation,
    fileName,
    size: `${(size / 1024 / 1024).toFixed(2)}MB`,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log user analytics events
 * @param {string} userId - User ID
 * @param {string} action - Action performed (e.g., 'chat', 'flashcard_review', 'upload')
 * @param {string} entityId - Document or entity ID
 * @param {object} metadata - Additional data
 */
export function logAnalytic(userId, action, entityId = null, metadata = {}) {
  logger.info(`User Action: ${action}`, {
    userId,
    action,
    entityId,
    ...metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Initialize Sentry for error tracking (optional)
 * Uncomment and configure when ready for production
 */
export function initSentry(app) {
  // Uncomment when ready:
  /*
  import * as Sentry from "@sentry/node";
  
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1, // 10% of transactions
    attachStacktrace: true
  });
  
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.errorHandler());
  
  logger.info('Sentry error tracking initialized');
  */
}

export default {
  logger,
  requestLoggerMiddleware,
  logError,
  logDatabase,
  logAuth,
  logFile,
  logAnalytic,
  initSentry
};
