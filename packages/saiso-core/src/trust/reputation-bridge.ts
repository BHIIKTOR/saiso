import type { PaymentReceipt } from '../payments/types.js';

export interface ReputationDelta {
  delta: number;
  reason: string;
}

export function deriveReputationDeltaFromReceipt(receipt: PaymentReceipt): ReputationDelta {
  if (receipt.success) {
    return { delta: 0.02, reason: 'Successful payment settlement' };
  }
  return { delta: -0.05, reason: 'Failed payment settlement' };
}
