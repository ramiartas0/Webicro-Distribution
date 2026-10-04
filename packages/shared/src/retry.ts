import type { RetryConfig } from './types.js';
import { isRetryableError } from './errors.js';
import { logger } from './logger.js';

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 5000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * delay * 0.1;
  return Math.min(delay + jitter, config.maxDelayMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let attempt = 1;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = finalConfig.retryableCheck
        ? finalConfig.retryableCheck(error)
        : isRetryableError(error);

      if (!isRetryable || attempt >= finalConfig.maxAttempts) {
        throw error;
      }

      const delayMs = calculateDelay(attempt, finalConfig);
      logger.warn(
        `Operation failed, retrying in ${Math.round(delayMs)}ms (attempt ${attempt} of ${finalConfig.maxAttempts})`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      await sleep(delayMs);
      attempt++;
    }
  }
}
