import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import config from '../config/AppConfig';
import { Request, Response } from 'express';
import logger from '../config/logger';

// Safe IP key generator that normalises IPv4-mapped IPv6 (::ffff:x.x.x.x)
// and delegates IPv6 subnet handling to ipKeyGenerator.
const getClientIp = (req: Request): string => {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  // Strip IPv4-mapped prefix so ipKeyGenerator receives a clean address
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return ipKeyGenerator(ip);
};

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
    validate: false,
    keyGenerator: options.keyGenerator || getClientIp,
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

// Refresh token rate limiter — keys on the user id encoded in the refresh
// token when present, falling back to IP. Limits token-refresh abuse per
// user (30 refreshes / hour) regardless of how many IPs they rotate through.
export const refreshLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.nodeEnv === 'production' ? 30 : 120,
  message: 'Too many token refresh attempts, please try again later.',
  keyGenerator: (req: Request): string => {
    const token = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (token) {
      try {
        const decoded = jwt.decode(token) as { id?: number } | null | string;
        if (decoded && typeof decoded === 'object' && decoded.id) {
          return `user:${decoded.id}:refresh`;
        }
      } catch {
        // Fall through to IP-based keying for malformed tokens.
      }
    }
    return `${getClientIp(req)}:refresh`;
  },
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
    return req.user ? `user:${req.user.id}` : `${req.ip}:admin`;
  },
});

// Demo tenant creation rate limiter (very strict: 3 per hour per IP)
export const demoLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.nodeEnv === 'production' ? 3 : 15,
  message: 'Too many demo tenant requests from this IP, please try again later.',
  keyGenerator: (req: Request) => `${req.ip}:demo`,
});

