import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.error('[Error]', err.message, err.stack);

  const statusCode = err.statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    res.status(409).json({
      error: 'Conflict',
      message: 'A record with this value already exists.',
    });
    return;
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested record was not found.',
    });
    return;
  }

  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal Server Error' : 'Error',
    message,
  });
}

export function createError(message: string, statusCode: number): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  return error;
}
