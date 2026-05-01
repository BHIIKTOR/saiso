export interface MppChargeConfig {
  amount: string;
  currency: string;
  recipient: string;
}

/**
 * Minimal helper for attaching payment requirements to JSON responses.
 * Applications can use this shape to return deterministic 402 challenge payloads.
 */
export function buildMppPaymentRequired(config: MppChargeConfig): Record<string, unknown> {
  return {
    status: 402,
    error: 'Payment required',
    challenges: [
      {
        method: 'tempo',
        intent: 'charge',
        request: {
          amount: config.amount,
          currency: config.currency,
          payTo: config.recipient,
        },
      },
    ],
  };
}
