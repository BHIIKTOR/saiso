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
  if (!config.appId || !config.appSecret) throw new Error('Privy app ID and secret are required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0
    || !Number.isSafeInteger(retryMaxAttempts) || retryMaxAttempts <= 0
    || !Number.isFinite(retryBaseDelayMs) || retryBaseDelayMs < 0) {
    throw new Error('Invalid Privy timeout or retry configuration');
  }

  return {
    async request<TResponse = unknown>(path: string, options: PrivyRequestOptions = {}): Promise<TResponse> {
      const method = options.method || 'GET';
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...options.headers,
      };

      const authHeader = createPrivyAuthHeader(config.appId, config.appSecret);
      headers.authorization = authHeader;
      headers['privy-app-id'] = config.appId;

      if (options.idempotencyKey) {
        headers['privy-idempotency-key'] = options.idempotencyKey;
      }

      if (options.expiresAt) {
        const expiryMs = Date.parse(options.expiresAt);
        if (!Number.isFinite(expiryMs)) throw new Error('expiresAt must be a valid ISO timestamp');
        headers['privy-request-expiry'] = String(expiryMs);
      }

      const execute = async () => {
        if (options.expiresAt && Date.parse(options.expiresAt) <= Date.now()) {
          throw new PrivyClientError('Privy request has expired', 0);
        }
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
              `Privy ${method} ${path} failed with HTTP ${response.status}`,
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
          try {
            return (text ? JSON.parse(text) : {}) as TResponse;
          } catch {
            throw new PrivyClientError('Privy returned invalid JSON', response.status, { path, method });
          }
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
        // Write endpoints differ in idempotency support; a lost response must not replay a mutation.
        maxAttempts: method === 'GET' ? retryMaxAttempts : 1,
        baseDelayMs: retryBaseDelayMs,
      });
    },
  };
}
