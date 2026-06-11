type NextApiRequest = any;
type NextApiResponse = any;
import { ZodError, ZodIssue } from 'zod';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from './errors';

/**
 * Interface for a standardized API error response.
 */
interface StandardApiErrorResponse {
  code: string;
  message: string;
  details?: { [key: string]: string[] | undefined } | Record<string, any> | ZodIssue[];
}

/**
 * Centralized API error handler.
 * Sends a standardized JSON error response.
 */
export function handleApiError(error: unknown, res: NextApiResponse): void {
  console.error('[API Error Handler]:', error);

  let statusCode: number;
  let responseBody: StandardApiErrorResponse;

  if (error instanceof ZodError) {
    statusCode = 400;
    responseBody = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed. Check the details for more information.',
      details: error.issues, // Pass the raw issues for better error handling
    };
  } else if (error instanceof AppError) {
    statusCode = error.statusCode;
    responseBody = {
      code: error.errorCode,
      message: error.message,
    };
    if (error instanceof ValidationError && error.details) {
      responseBody.details = error.details;
    }
  } else {
    statusCode = 500;
    responseBody = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    };
    // Optionally, include error details in development
    if (process.env.NODE_ENV === 'development' && error instanceof Error) {
      responseBody.details = { rawError: error.message, stack: error.stack?.split('\n') };
    }
  }

  res.status(statusCode).json(responseBody);
}

/**
 * Higher-order function to wrap API route handlers with common logic,
 * including method checking and error handling.
 */
export function createApiHandler(handlers: {
  [method: string]: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void;
}) {
  return async function (req: NextApiRequest, res: NextApiResponse) {
    const method = req.method?.toUpperCase();

    if (!method || !handlers[method]) {
      return handleApiError(new AppError(
        `Method ${req.method || '[unknown]'} Not Allowed for this resource.`,
        405,
        'METHOD_NOT_ALLOWED'
      ), res);
    }

    try {
      await handlers[method](req, res);
    } catch (error) {
      handleApiError(error, res);
    }
  };
}

// Utility functions for specific errors, ensuring they use the AppError base with proper codes.

export function sendMethodNotAllowedError(req: NextApiRequest, res: NextApiResponse, allowedMethods: string[] = []) {
  const message = `Method ${req.method} Not Allowed.`;
  if (allowedMethods.length > 0) {
    res.setHeader('Allow', allowedMethods.join(', '));
  }
  handleApiError(new AppError(message, 405, 'METHOD_NOT_ALLOWED'), res);
}

export function sendBadRequestError(res: NextApiResponse, message: string = 'Bad Request', details?: any) {
  const error = new ValidationError(message, details);
  // Even though it's a ValidationError, its code is already 'VALIDATION_ERROR'. 
  // If a more generic BAD_REQUEST is needed, a new error class or direct AppError could be used.
  handleApiError(error, res);
} 

export function sendUnauthorizedError(res: NextApiResponse, message: string = 'Unauthorized') {
  handleApiError(new UnauthorizedError(message), res);
}

export function sendForbiddenError(res: NextApiResponse, message: string = 'Forbidden') {
  handleApiError(new ForbiddenError(message), res);
}

export function sendNotFoundError(res: NextApiResponse, message: string = 'Resource not found') {
  handleApiError(new NotFoundError(message), res);
}

export function sendInternalServerError(res: NextApiResponse, error: any, message: string = 'Internal Server Error') {
   console.error("Internal Server Error (explicit call):", error); // Log the original error
   handleApiError(new AppError(message, 500, 'INTERNAL_SERVER_ERROR'), res);
} 