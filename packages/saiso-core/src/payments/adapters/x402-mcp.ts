import type { PaymentCredential } from '../types.js';

export const X402_MCP_PAYMENT_KEY = 'x402/payment';
export const X402_MCP_PAYMENT_RESPONSE_KEY = 'x402/payment-response';

export function attachX402PaymentMeta<T extends Record<string, unknown>>(params: T, credential: PaymentCredential): T {
  const existingMeta = (params._meta as Record<string, unknown> | undefined) || {};
  return {
    ...params,
    _meta: {
      ...existingMeta,
      [X402_MCP_PAYMENT_KEY]: credential.payload,
    },
  };
}

export function readX402PaymentResponseMeta(payload: Record<string, unknown>): Record<string, unknown> | null {
  const meta = payload._meta;
  if (typeof meta !== 'object' || meta === null) {
    return null;
  }
  const result = (meta as Record<string, unknown>)[X402_MCP_PAYMENT_RESPONSE_KEY];
  if (typeof result !== 'object' || result === null) {
    return null;
  }
  return result as Record<string, unknown>;
}
