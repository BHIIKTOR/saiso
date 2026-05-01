import type { PaymentChallenge, PaymentCredential, PaymentReceipt } from '../types.js';

export interface X402FacilitatorOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

export class X402FacilitatorClient {
  constructor(private readonly options: X402FacilitatorOptions) {}

  async verify(paymentPayload: Record<string, unknown>, paymentRequirements: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.options.baseUrl}/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.options.headers,
      },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });
    if (!response.ok) {
      throw new Error(`x402 verify failed (${response.status})`);
    }
    return await response.json() as Record<string, unknown>;
  }

  async settle(paymentPayload: Record<string, unknown>, paymentRequirements: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.options.baseUrl}/settle`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.options.headers,
      },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });
    if (!response.ok) {
      throw new Error(`x402 settle failed (${response.status})`);
    }
    return await response.json() as Record<string, unknown>;
  }
}

export interface X402CredentialSigner {
  sign(challenge: PaymentChallenge): Promise<PaymentCredential>;
}

export class X402Adapter {
  constructor(private readonly signer: X402CredentialSigner) {}

  async fulfillChallenge(challenge: PaymentChallenge): Promise<PaymentCredential> {
    return this.signer.sign(challenge);
  }

  toReceipt(raw: Record<string, unknown>): PaymentReceipt {
    const success = Boolean(raw.success);
    return {
      protocol: 'x402',
      success,
      outcomeClass: success ? 'settled' : 'settlement-failed',
      reference: typeof raw.transaction === 'string' ? raw.transaction : undefined,
      network: typeof raw.network === 'string' ? raw.network : undefined,
      amount: typeof raw.amount === 'string' ? raw.amount : undefined,
      payer: typeof raw.payer === 'string' ? raw.payer : undefined,
      timestamp: new Date().toISOString(),
      raw,
    };
  }
}
