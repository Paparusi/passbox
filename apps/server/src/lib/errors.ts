export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Authentication required'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'Insufficient permissions'),
  notFound: (resource: string) => new AppError(404, 'NOT_FOUND', `${resource} not found`),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  badRequest: (message: string) => new AppError(400, 'BAD_REQUEST', message),
  internal: (message = 'Internal server error') => new AppError(500, 'INTERNAL', message),
} as const;
