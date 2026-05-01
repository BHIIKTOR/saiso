export interface PrivyClientConfig {
  appId: string;
  appSecret: string;
  baseUrl?: string;
  timeoutMs?: number;
  retryMaxAttempts?: number;
  retryBaseDelayMs?: number;
}

export interface PrivyRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  idempotencyKey?: string;
  expiresAt?: string;
}
