import type { ErrorCode } from './types.js';

export interface AppErrorOptions {
  retryable?: boolean;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: ErrorCode, options?: AppErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'CONFIG_ERROR', { ...options, retryable: false });
  }
}

export class UserError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'USER_ERROR', { ...options, retryable: false });
  }
}

export class BuildError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'BUILD_ERROR', { ...options, retryable: false });
  }
}

export class TestError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'TEST_ERROR', { ...options, retryable: false });
  }
}

export class SigningError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'SIGNING_ERROR', { ...options, retryable: false });
  }
}

export class NetworkError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'NETWORK_ERROR', { ...options, retryable: true });
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'TIMEOUT_ERROR', { ...options, retryable: true });
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'RATE_LIMIT_ERROR', { ...options, retryable: true });
  }
}

export class AuthError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'AUTH_ERROR', { ...options, retryable: false });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'CONFLICT_ERROR', { ...options, retryable: false });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'VALIDATION_ERROR', { ...options, retryable: false });
  }
}

export class GooglePlayError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(message, 'GOOGLE_ERROR', { retryable: false, ...options });
  }
}

export class AppStoreError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(message, 'APPLE_ERROR', { retryable: false, ...options });
  }
}

export class AIError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'AI_ERROR', { ...options, retryable: true });
  }
}

export class SecurityError extends AppError {
  constructor(message: string, options?: Omit<AppErrorOptions, 'retryable'>) {
    super(message, 'SECURITY_ERROR', { ...options, retryable: false });
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }
  return false;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR', { cause: error });
  }
  return new AppError(String(error), 'UNKNOWN_ERROR');
}
