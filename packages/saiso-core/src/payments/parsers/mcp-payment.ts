import type { PaymentChallenge, PaymentReceipt, PaymentRequirement } from '../types.js';

interface McpErrorResult {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type?: string; text?: string }>;
  _meta?: Record<string, unknown>;
}

function parseX402Requirement(input: Record<string, unknown>): PaymentRequirement {
  return {
    protocol: 'x402',
    amount: typeof input.amount === 'string' ? input.amount : '0',
    asset: typeof input.asset === 'string' ? input.asset : undefined,
    network: typeof input.network === 'string' ? input.network : undefined,
    payTo: typeof input.payTo === 'string' ? input.payTo : undefined,
    raw: input,
  };
}

function parseMppRequirement(input: Record<string, unknown>): PaymentRequirement {
  const request = (input.request ?? {}) as Record<string, unknown>;
  return {
    protocol: 'mpp',
    amount: typeof request.amount === 'string' ? request.amount : '0',
    asset: typeof request.asset === 'string' ? request.asset : undefined,
    network: typeof request.network === 'string' ? request.network : undefined,
    payTo: typeof request.payTo === 'string' ? request.payTo : undefined,
    raw: input,
  };
}

export function parseMcpPaymentChallenge(result: McpErrorResult): PaymentChallenge | null {
  if (!result.isError) {
    return null;
  }

  const structured = result.structuredContent;
  if (structured && structured.x402Version && Array.isArray(structured.accepts)) {
    return {
      protocol: 'x402',
      requirements: (structured.accepts as Record<string, unknown>[]).map(parseX402Requirement),
      raw: structured,
    };
  }

  if (structured && Array.isArray(structured.challenges)) {
    return {
      protocol: 'mpp',
      requirements: (structured.challenges as Record<string, unknown>[]).map(parseMppRequirement),
      raw: structured,
    };
  }

  const textPayload = result.content?.[0]?.text;
  if (!textPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(textPayload) as Record<string, unknown>;
    if (parsed.x402Version && Array.isArray(parsed.accepts)) {
      return {
        protocol: 'x402',
        requirements: (parsed.accepts as Record<string, unknown>[]).map(parseX402Requirement),
        raw: parsed,
      };
    }
    if (Array.isArray(parsed.challenges)) {
      return {
        protocol: 'mpp',
        requirements: (parsed.challenges as Record<string, unknown>[]).map(parseMppRequirement),
        raw: parsed,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function parseMcpPaymentReceipt(result: McpErrorResult): PaymentReceipt | null {
  const meta = result._meta ?? {};
  const x402 = meta['x402/payment-response'];
  if (typeof x402 === 'object' && x402 !== null) {
    const raw = x402 as Record<string, unknown>;
    return {
      protocol: 'x402',
      success: Boolean(raw.success),
      outcomeClass: Boolean(raw.success) ? 'settled' : 'settlement-failed',
      reference: typeof raw.transaction === 'string' ? raw.transaction : undefined,
      network: typeof raw.network === 'string' ? raw.network : undefined,
      payer: typeof raw.payer === 'string' ? raw.payer : undefined,
      timestamp: new Date().toISOString(),
      raw,
    };
  }

  const paymentAuth = meta['org.paymentauth/receipt'];
  if (typeof paymentAuth === 'object' && paymentAuth !== null) {
    const raw = paymentAuth as Record<string, unknown>;
    return {
      protocol: 'mpp',
      success: raw.status === 'success',
      outcomeClass: raw.status === 'success'
        ? 'settled'
        : (typeof raw.status === 'string' && raw.status.trim() ? `mpp-${raw.status}` : 'settlement-failed'),
      reference: typeof raw.reference === 'string' ? raw.reference : undefined,
      amount: typeof raw.amount === 'string' ? raw.amount : undefined,
      timestamp: new Date().toISOString(),
      raw,
    };
  }

  return null;
}
