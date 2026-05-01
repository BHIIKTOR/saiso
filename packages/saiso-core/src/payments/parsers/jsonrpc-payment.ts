import type { PaymentChallenge } from '../types.js';

interface JsonRpcError {
  code?: number;
  data?: Record<string, unknown>;
  message?: string;
}

interface JsonRpcResponse {
  error?: JsonRpcError;
}

export function parseJsonRpcPaymentChallenge(response: JsonRpcResponse): PaymentChallenge | null {
  const error = response.error;
  if (!error) {
    return null;
  }

  // paymentauth draft style
  if (error.code === -32042 || error.code === -32043) {
    const data = error.data ?? {};
    const challenges = Array.isArray(data.challenges) ? data.challenges : [];
    const requirements = challenges.map((challenge) => {
      const item = challenge as Record<string, unknown>;
      const request = (item.request ?? {}) as Record<string, unknown>;
      return {
        protocol: 'mpp' as const,
        amount: typeof request.amount === 'string' ? request.amount : '0',
        network: typeof request.network === 'string' ? request.network : undefined,
        payTo: typeof request.payTo === 'string' ? request.payTo : undefined,
        raw: item,
      };
    });

    return {
      protocol: 'mpp',
      requirements,
      raw: data,
    };
  }

  // x402 HTTP-style body mapped into JSON-RPC error data
  if (error.data && error.data.x402Version && Array.isArray(error.data.accepts)) {
    return {
      protocol: 'x402',
      requirements: (error.data.accepts as Record<string, unknown>[]).map((accepts) => ({
        protocol: 'x402',
        amount: typeof accepts.amount === 'string' ? accepts.amount : '0',
        asset: typeof accepts.asset === 'string' ? accepts.asset : undefined,
        network: typeof accepts.network === 'string' ? accepts.network : undefined,
        payTo: typeof accepts.payTo === 'string' ? accepts.payTo : undefined,
        raw: accepts,
      })),
      raw: error.data,
    };
  }

  return null;
}
