/**
 * Standard API response format for all endpoints
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * Helper functions to create standardized API responses
 */
export class ResponseBuilder {
  /**
   * Success response with data
   */
  static success<T>(data: T, meta?: ApiResponse['meta']): ApiResponse<T> {
    return {
      success: true,
      data,
      ...(meta && { meta })
    };
  }

  /**
   * Success response without data (for operations like DELETE)
   */
  static successNoData(message?: string): ApiResponse<void> {
    return {
      success: true,
      ...(message && { data: { message } as any })
    };
  }

  /**
   * Error response
   */
  static error(code: string, message: string, details?: any): ApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        ...(details && { details })
      }
    };
  }

  /**
   * Validation error response
   */
  static validationError(message: string, details?: any): ApiResponse {
    return this.error('VALIDATION_ERROR', message, details);
  }

  /**
   * Not found error
   */
  static notFound(resource: string = 'Resource'): ApiResponse {
    return this.error('NOT_FOUND', `${resource} not found`);
  }

  /**
   * Unauthorized error
   */
  static unauthorized(message: string = 'Unauthorized'): ApiResponse {
    return this.error('UNAUTHORIZED', message);
  }

  /**
   * Forbidden error
   */
  static forbidden(message: string = 'Forbidden'): ApiResponse {
    return this.error('FORBIDDEN', message);
  }

  /**
   * Server error
   */
  static serverError(message: string = 'Internal server error'): ApiResponse {
    return this.error('SERVER_ERROR', message);
  }
}

export default ResponseBuilder;
