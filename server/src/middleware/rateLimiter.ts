import rateLimit from 'express-rate-limit';
import config from '../config/AppConfig';

export const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.nodeEnv === 'production' ? config.rateLimitMaxRequests : 1000,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many requests, please try again later.'
    }
  }
});

export const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.nodeEnv === 'production' ? Math.min(config.rateLimitMaxRequests, 20) : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many login attempts, please try again later.'
    }
  }
});
