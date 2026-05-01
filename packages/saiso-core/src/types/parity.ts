export type ChainFamily = 'evm' | 'svm';

export const CANONICAL_PARITY_TOOL_NAMES = [
  'network.status',
  'wallet.address',
  'wallet.native_balance',
  'token.balance',
  'token.transfer',
  'tx.simulate',
  'tx.estimate_fee',
  'contract.read',
  'contract.write',
] as const;

export type CanonicalParityToolName = (typeof CANONICAL_PARITY_TOOL_NAMES)[number];

export interface CanonicalToolError {
  code: string;
  message: string;
}

export interface CanonicalToolResponse {
  success: boolean;
  network: string;
  chainFamily: ChainFamily;
  data?: Record<string, unknown>;
  error?: CanonicalToolError;
  txHash?: string;
  receipt?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}
