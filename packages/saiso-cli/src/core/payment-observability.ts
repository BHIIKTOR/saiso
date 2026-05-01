import type { PaymentReceipt } from '@saiso/core';

export interface PaymentEventView {
  protocol: 'x402' | 'mpp';
  success: boolean;
  outcomeClass: string;
  reference: string | null;
  timestamp: string;
  amount: string | null;
  network: string | null;
}

export interface PaymentProtocolSummary {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  latestSuccessReference?: string;
  latestFailureReference?: string;
  outcomeClasses: Record<string, number>;
}

export interface PaymentObservabilitySummary {
  total: number;
  successful: number;
  failed: number;
  byProtocol: Record<'x402' | 'mpp', PaymentProtocolSummary>;
  recent: PaymentEventView[];
}

function classifyOutcome(receipt: PaymentReceipt & { outcomeClass?: string }): string {
  if (typeof receipt.outcomeClass === 'string' && receipt.outcomeClass.trim()) {
    return receipt.outcomeClass;
  }

  if (receipt.success) {
    return 'settled';
  }

  const raw = receipt.raw as Record<string, unknown>;
  const reason = typeof raw.reason === 'string' ? raw.reason.toLowerCase() : '';
  const status = typeof raw.status === 'number'
    ? raw.status
    : typeof raw.status === 'string'
      ? Number.parseInt(raw.status, 10)
      : undefined;

  if (status === 402 || reason.includes('payment required')) {
    return 'payment-required';
  }
  if (reason.includes('policy')) {
    return 'policy-denied';
  }
  if (reason.includes('credential') || reason.includes('token') || reason.includes('signature')) {
    return 'credential-error';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'upstream-error';
  }

  return 'unknown-failure';
}

function initProtocolSummary(): PaymentProtocolSummary {
  return {
    total: 0,
    success: 0,
    failed: 0,
    successRate: 0,
    outcomeClasses: {},
  };
}

export function toPaymentEventView(receipt: PaymentReceipt): PaymentEventView {
  return {
    protocol: receipt.protocol,
    success: receipt.success,
    outcomeClass: classifyOutcome(receipt),
    reference: receipt.reference || null,
    timestamp: receipt.timestamp,
    amount: receipt.amount || null,
    network: receipt.network || null,
  };
}

export function summarizePaymentReceipts(
  receipts: PaymentReceipt[],
  recentLimit = 5
): PaymentObservabilitySummary {
  const byProtocol: Record<'x402' | 'mpp', PaymentProtocolSummary> = {
    x402: initProtocolSummary(),
    mpp: initProtocolSummary(),
  };

  let successful = 0;
  for (const receipt of receipts) {
    const bucket = byProtocol[receipt.protocol];
    const outcomeClass = classifyOutcome(receipt);
    bucket.total += 1;
    bucket.outcomeClasses[outcomeClass] = (bucket.outcomeClasses[outcomeClass] || 0) + 1;

    if (receipt.success) {
      successful += 1;
      bucket.success += 1;
      if (receipt.reference) {
        bucket.latestSuccessReference = receipt.reference;
      }
    } else {
      bucket.failed += 1;
      if (receipt.reference) {
        bucket.latestFailureReference = receipt.reference;
      }
    }
  }

  for (const key of Object.keys(byProtocol) as Array<'x402' | 'mpp'>) {
    const bucket = byProtocol[key];
    bucket.successRate = bucket.total === 0 ? 0 : Number((bucket.success / bucket.total).toFixed(4));
  }

  return {
    total: receipts.length,
    successful,
    failed: receipts.length - successful,
    byProtocol,
    recent: receipts.slice(-recentLimit).map(toPaymentEventView),
  };
}
