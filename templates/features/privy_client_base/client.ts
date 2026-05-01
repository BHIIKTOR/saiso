import { createPrivyAuthHeader } from './auth';
import { PrivyClientError } from './errors';
import { retryWithBackoff } from './retry';
import type { PrivyClientConfig, PrivyRequestOptions } from './types';

function redactAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const cloned = { ...headers };
  for (const key of Object.keys(cloned)) {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('secret') || lower.includes('token')) {
      cloned[key] = '[REDACTED]';
    }
  }
  return cloned;
}

export function createPrivyClient(config: PrivyClientConfig) {
  const baseUrl = config.baseUrl || 'https://api.privy.io/v1';
  const timeoutMs = config.timeoutMs ?? 30000;
  const retryMaxAttempts = config.retryMaxAttempts ?? 3;
  const retryBaseDelayMs = config.retryBaseDelayMs ?? 200;

  return {
    async request<TResponse = unknown>(path: string, options: PrivyRequestOptions = {}): Promise<TResponse> {
      const method = options.method || 'GET';
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...options.headers,
      };

      const authHeader = createPrivyAuthHeader(config.appId, config.appSecret);
      headers.authorization = authHeader;

      if (options.idempotencyKey) {
        headers['x-idempotency-key'] = options.idempotencyKey;
      }

      if (options.expiresAt) {
        headers['x-request-expiry'] = options.expiresAt;
      }

      const execute = async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(baseUrl + path, {
            method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new PrivyClientError(
              'Privy request failed',
              response.status,
              {
                path,
                method,
                headers: redactAuthHeaders(headers),
              },
              response.status >= 500 || response.status === 429
            );
          }

          const text = await response.text();
          return (text ? JSON.parse(text) : {}) as TResponse;
        } catch (error) {
          if (error instanceof PrivyClientError) {
            throw error;
          }
          throw new PrivyClientError(
            error instanceof Error ? error.message : 'Unknown Privy client error',
            0,
            {
              path,
              method,
              headers: redactAuthHeaders(headers),
            },
            true
          );
        } finally {
          clearTimeout(timeout);
        }
      };

      return retryWithBackoff(execute, {
        maxAttempts: retryMaxAttempts,
        baseDelayMs: retryBaseDelayMs,
      });
    },
  };
}
