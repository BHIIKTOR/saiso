export type PaymentProtocol = 'x402' | 'mpp';

export interface PaymentRequirement {
  protocol: PaymentProtocol;
  amount: string;
  asset?: string;
  network?: string;
  payTo?: string;
  description?: string;
  raw: Record<string, unknown>;
}

export interface PaymentChallenge {
  protocol: PaymentProtocol;
  requirements: PaymentRequirement[];
  requestId?: string;
  raw: Record<string, unknown>;
}

export interface PaymentCredential {
  protocol: PaymentProtocol;
  payload: Record<string, unknown>;
}

export interface PaymentReceipt {
  protocol: PaymentProtocol;
  success: boolean;
  outcomeClass?: string;
  reference?: string;
  network?: string;
  amount?: string;
  payer?: string;
  timestamp: string;
  raw: Record<string, unknown>;
}

export interface PaymentRequestContext {
  resource: string;
  amountUsd?: number;
  recipient?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface PaymentDecision {
  allowed: boolean;
  reason?: string;
}
