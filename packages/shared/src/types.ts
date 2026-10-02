export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableCheck?: (error: unknown) => boolean;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export type ErrorCode =
  | 'USER_ERROR'
  | 'CONFIG_ERROR'
  | 'BUILD_ERROR'
  | 'TEST_ERROR'
  | 'SIGNING_ERROR'
  | 'NETWORK_ERROR'
  | 'APPLE_ERROR'
  | 'GOOGLE_ERROR'
  | 'AI_ERROR'
  | 'SECURITY_ERROR'
  | 'UNKNOWN_ERROR'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'CONFLICT_ERROR'
  | 'AUTH_ERROR';
