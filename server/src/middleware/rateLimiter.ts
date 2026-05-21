import rateLimit from 'express-rate-limit';
import config from '../config/AppConfig';
import { Request, Response } from 'express';
import logger from '../config/logger';

// In-memory rate limiter (sufficient for single-server deployment)
const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || ((req) => req.ip || 'unknown'),
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT',
        message: options.message,
      },
    },
    handler: (req: Request, res: Response) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}, User-Agent: ${req.get('User-Agent')}`);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: options.message,
          retryAfter: Math.ceil(options.windowMs / 1000),
        },
      });
    },
  });
};

// Global API rate limiter
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.nodeEnv === 'production' ? 1000 : 5000,
  message: 'Too many requests from this IP, please try again later.',
});

// Strict rate limiter for sensitive operations
export const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: config.nodeEnv === 'production' ? 60 : 300,
  message: 'Too many requests, please slow down.',
});

// Authentication rate limiter (very strict)
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.nodeEnv === 'production' ? 5 : 20,
  message: 'Too many authentication attempts, please try again later.',
  keyGenerator: (req: Request) => `${req.ip}:${req.path}`,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Password reset rate limiter
export const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.nodeEnv === 'production' ? 3 : 10,
  message: 'Too many password reset attempts, please try again later.',
  keyGenerator: (req: Request) => `${req.ip}:password-reset`,
});

// File upload rate limiter
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.nodeEnv === 'production' ? 50 : 200,
  message: 'Too many file uploads, please try again later.',
  keyGenerator: (req: Request) => `${req.ip}:upload`,
});

// Report generation rate limiter
export const reportLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.nodeEnv === 'production' ? 20 : 100,
  message: 'Too many report generation requests, please try again later.',
  keyGenerator: (req: Request) => `${req.ip}:report`,
});

// Admin operations rate limiter
export const adminLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: config.nodeEnv === 'production' ? 30 : 150,
  message: 'Too many admin operations, please try again later.',
  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    return user ? `user:${user.id}` : `${req.ip}:admin`;
  },
});

