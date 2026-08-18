/** Error with an HTTP status attached, thrown from anywhere and rendered by the error middleware. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'No autenticado'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'No tiene permiso para realizar esta acción'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'Recurso no encontrado'): ApiError {
    return new ApiError(404, message, 'NOT_FOUND');
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, 'CONFLICT', details);
  }
  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, message, 'UNPROCESSABLE', details);
  }
  static notConfigured(message: string): ApiError {
    return new ApiError(503, message, 'NOT_CONFIGURED');
  }
}
