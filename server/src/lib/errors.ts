/**
 * Base application error class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(message: string, statusCode: number = 500, errorCode: string = 'INTERNAL_SERVER_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    // Set the prototype explicitly to ensure instanceof works correctly
    Object.setPrototypeOf(this, AppError.prototype);
    // Capture stack trace, excluding constructor call from it
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error for resource not found (404).
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error for forbidden access (403).
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Error for unauthorized access (401).
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Error for validation failures (400 - Bad Request).
 */
export class ValidationError extends AppError {
  // Holds the flattened Zod error details
  public readonly details: { [key: string]: string[] | undefined } | Record<string, any> | null; // Broader type for details

  constructor(
    message: string = 'Validation failed',
    details: { [key: string]: string[] | undefined } | Record<string, any> | null = null // Broader type for details
  ) {
    super(message, 400, 'VALIDATION_ERROR'); // Use 400 Bad Request for validation errors
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// You can add more specific error classes as needed
// e.g., DatabaseError, ServiceUnavailableError, etc.

/**
 * Specific error class for issues within service layer operations.
 */
export class ServiceError extends AppError {
  constructor(message: string = 'A service error occurred', errorCode: string = 'SERVICE_ERROR') {
    super(message, 500, errorCode);
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
} 