import type { PaymentCredential } from '../types.js';

export interface MppHttpHandlerOptions {
  credentialHeader?: string;
}

/**
 * Minimal HTTP 402 retry helper for MPP-like flows.
 * This wrapper is transport-agnostic and allows pluggable credential generation.
 */
export async function mppFetch(
  input: RequestInfo | URL,
  init: RequestInit,
  createCredential: (challenge: Record<string, unknown>) => Promise<PaymentCredential>,
  options: MppHttpHandlerOptions = {}
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 402) {
    return response;
  }

  const challenge = await response.json() as Record<string, unknown>;
  const credential = await createCredential(challenge);
  const headerName = options.credentialHeader || 'Payment';

  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set(headerName, JSON.stringify(credential.payload));

  return fetch(input, {
    ...init,
    headers: retryHeaders,
  });
}
