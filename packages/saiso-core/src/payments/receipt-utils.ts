import type { PaymentReceipt } from './types.js';

const SENSITIVE_KEY_PATTERNS = [
  'authorization',
  'payment',
  'x-payment',
  'token',
  'signature',
  'credential',
  'proof',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern.replace(/[^a-z0-9]/g, '')));
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return '[REDACTED]';
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return value.map(() => '[REDACTED]');
  }
  return '[REDACTED]';
}

function sanitizeUnknown(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeUnknown(item));
  }

  if (!input || typeof input !== 'object') {
    return input;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      out[key] = redactValue(value);
      continue;
    }
    out[key] = sanitizeUnknown(value);
  }
  return out;
}

export function classifyPaymentOutcome(receipt: PaymentReceipt): string {
  if (receipt.outcomeClass && receipt.outcomeClass.trim()) {
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

export function sanitizePaymentReceipt(receipt: PaymentReceipt): PaymentReceipt {
  return {
    ...receipt,
    outcomeClass: classifyPaymentOutcome(receipt),
    raw: sanitizeUnknown(receipt.raw) as Record<string, unknown>,
  };
}
