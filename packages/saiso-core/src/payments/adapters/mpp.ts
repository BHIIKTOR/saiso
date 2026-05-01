import type { PaymentChallenge, PaymentCredential, PaymentReceipt } from '../types.js';

export interface MppCredentialProvider {
  createCredential(challenge: PaymentChallenge): Promise<PaymentCredential>;
}

export class MppAdapter {
  constructor(private readonly credentialProvider: MppCredentialProvider) {}

  async fulfillChallenge(challenge: PaymentChallenge): Promise<PaymentCredential> {
    return this.credentialProvider.createCredential(challenge);
  }

  toReceipt(raw: Record<string, unknown>): PaymentReceipt {
    const success = raw.status === 'success' || raw.success === true;
    return {
      protocol: 'mpp',
      success,
      outcomeClass: success ? 'settled' : 'settlement-failed',
      reference: typeof raw.reference === 'string' ? raw.reference : undefined,
      network: typeof raw.network === 'string' ? raw.network : undefined,
      amount: typeof raw.amount === 'string' ? raw.amount : undefined,
      payer: typeof raw.payer === 'string' ? raw.payer : undefined,
      timestamp: new Date().toISOString(),
      raw,
    };
  }
}
