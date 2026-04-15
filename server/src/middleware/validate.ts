import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Middleware factory that validates req.body against a Zod schema.
 * Returns 400 with field-level errors if validation fails.
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
    const errors = result.error.issues.map((e) => ({
      field: e.path.map(String).join('.'),
      message: e.message,
    }));

      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors,
        },
      });
      return;
    }

    // Attach validated data to body
    req.body = result.data;
    next();
  };
};

/**
 * Middleware factory that validates req.query against a Zod schema.
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.map(String).join('.'),
        message: e.message,
      }));

      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: errors,
        },
      });
      return;
    }

    // Attach validated data back to query (overwriting string values with parsed values if applicable)
    req.query = result.data as any;
    next();
  };
};
