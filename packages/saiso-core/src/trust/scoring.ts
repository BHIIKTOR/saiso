export interface TrustSignal {
  reputation?: number;
  validation?: number;
  paymentReliability?: number;
}

export interface TrustWeights {
  reputation: number;
  validation: number;
  paymentReliability: number;
}

const DEFAULT_WEIGHTS: TrustWeights = {
  reputation: 0.4,
  validation: 0.4,
  paymentReliability: 0.2,
};

export function calculateTrustScore(signal: TrustSignal, weights: TrustWeights = DEFAULT_WEIGHTS): number {
  const reputation = signal.reputation ?? 0;
  const validation = signal.validation ?? 0;
  const paymentReliability = signal.paymentReliability ?? 0;

  const score =
    reputation * weights.reputation +
    validation * weights.validation +
    paymentReliability * weights.paymentReliability;

  return Math.max(0, Math.min(1, score));
}
