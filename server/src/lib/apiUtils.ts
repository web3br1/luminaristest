import type { Response } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { AppError, ValidationError } from './errors';
import { logger } from './logger';

/**
 * Interface for a standardized API error response.
 */
interface StandardApiErrorResponse {
  code: string;
  message: string;
  details?: { [key: string]: string[] | undefined } | Record<string, unknown> | ZodIssue[];
}

/**
 * Centralized API error handler. Maps known error shapes to a standardized JSON envelope and status.
 * Used both by controllers (in their catch) and by the global Express error handler in `app.ts`.
 */
export function handleApiError(error: unknown, res: Response): void {
  logger.error('[API Error Handler]', { error });

  let statusCode: number;
  let responseBody: StandardApiErrorResponse;

  // Duck-typed Prisma error code, mapped here so it is not coupled to the ORM type.
  const prismaCode = (error as { code?: string })?.code;

  if (error instanceof ZodError) {
    statusCode = 400;
    responseBody = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed. Check the details for more information.',
      details: error.issues,
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
  } else if (prismaCode === 'P2002') {
    // Unique constraint violation.
    statusCode = 409;
    const target = (error as { meta?: { target?: unknown } })?.meta?.target;
    responseBody = {
      code: 'CONFLICT',
      message: 'A record with this value already exists.',
      details: target ? { fields: target } : undefined,
    };
  } else if (prismaCode === 'P2025') {
    // Record required for the operation was not found (e.g. update/delete of a since-deleted row).
    // Mapped centrally so features that don't catch it locally still return 404, not 500.
    statusCode = 404;
    responseBody = {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    };
  } else {
    statusCode = 500;
    responseBody = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    };
    // Include error details only in development (never leak internals in production).
    if (process.env.NODE_ENV === 'development' && error instanceof Error) {
      responseBody.details = { rawError: error.message, stack: error.stack?.split('\n') };
    }
  }

  res.status(statusCode).json(responseBody);
}
