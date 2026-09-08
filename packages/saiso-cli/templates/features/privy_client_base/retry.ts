import { PrivyClientError } from './errors';

interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PrivyClientError && !error.retryable) throw error;
      lastError = error;
      if (attempt >= options.maxAttempts) {
        break;
      }
      const delayMs = options.baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
