import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../shared/ApiResponse';
import { AppError } from '../shared/errors';
import logger from '../config/logger';
import config from '../config/AppConfig';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log full error details server-side
  if (err instanceof AppError && err.isOperational) {
    logger.warn(`${err.code} [${err.statusCode}]: ${err.message}`, {
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error('Unhandled error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  // Determine response values
  const isProduction = config.nodeEnv === 'production';

  if (err instanceof AppError) {
    const errorBody: ApiResponse<null>['error'] = {
      code: err.code,
      message: err.message,
    };
    if (err.details && !isProduction) {
      errorBody!.details = err.details;
    }
    res.status(err.statusCode).json({ success: false, error: errorBody } as ApiResponse<null>);
    return;
  }

  // Unknown/unhandled errors — never leak internals in production
  const statusCode = err.statusCode || 500;
  const message = isProduction ? 'Internal Server Error' : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message,
    },
  } as ApiResponse<null>);
};
