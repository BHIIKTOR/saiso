import { describe, expect, it } from 'bun:test';
import { calculateTrustScore } from '../src/trust/scoring.js';
import { isTrustScoreAccepted } from '../src/trust/policy.js';
import { deriveReputationDeltaFromReceipt } from '../src/trust/reputation-bridge.js';
import type { PaymentReceipt } from '../src/payments/types.js';

describe('calculateTrustScore', () => {
  it('computes weighted score with default weights', () => {
    const score = calculateTrustScore({ reputation: 1, validation: 0.5, paymentReliability: 0 });
    // 1*0.4 + 0.5*0.4 + 0*0.2 = 0.6
    expect(score).toBeCloseTo(0.6, 10);
  });

  it('treats missing signals as zero', () => {
    const score = calculateTrustScore({});
    expect(score).toBe(0);
  });

  it('applies custom weights', () => {
    const score = calculateTrustScore(
      { reputation: 1, validation: 0, paymentReliability: 0 },
      { reputation: 0.8, validation: 0.1, paymentReliability: 0.1 }
    );
    expect(score).toBeCloseTo(0.8, 10);
  });

  it('clamps scores above 1', () => {
    const score = calculateTrustScore({ reputation: 2, validation: 2, paymentReliability: 2 });
    expect(score).toBe(1);
  });

  it('clamps scores below 0', () => {
    const score = calculateTrustScore({ reputation: -1, validation: -1, paymentReliability: -1 });
    expect(score).toBe(0);
  });

  it('is deterministic for identical signals', () => {
    const a = calculateTrustScore({ reputation: 0.7, validation: 0.6, paymentReliability: 0.9 });
    const b = calculateTrustScore({ reputation: 0.7, validation: 0.6, paymentReliability: 0.9 });
    expect(a).toBe(b);
  });
});

describe('isTrustScoreAccepted', () => {
  it('accepts any score when trust is disabled', () => {
    expect(isTrustScoreAccepted(0, { enabled: false })).toBe(true);
    expect(isTrustScoreAccepted(0.1, { enabled: false, minTrustScore: 0.9 })).toBe(true);
  });

  it('accepts any score when no config is provided', () => {
    expect(isTrustScoreAccepted(0)).toBe(true);
  });

  it('accepts any score when minTrustScore is not a number', () => {
    expect(isTrustScoreAccepted(0, { enabled: true })).toBe(true);
  });

  it('accepts scores at or above the threshold', () => {
    expect(isTrustScoreAccepted(0.7, { enabled: true, minTrustScore: 0.7 })).toBe(true);
    expect(isTrustScoreAccepted(0.9, { enabled: true, minTrustScore: 0.7 })).toBe(true);
  });

  it('rejects scores below the threshold', () => {
    expect(isTrustScoreAccepted(0.6, { enabled: true, minTrustScore: 0.7 })).toBe(false);
  });
});

describe('deriveReputationDeltaFromReceipt', () => {
  const baseReceipt: PaymentReceipt = {
    id: 'receipt-1',
    protocol: 'x402',
    success: true,
    amountUsd: 1,
    recipient: '0xabc',
    timestamp: new Date().toISOString(),
  };

  it('returns positive delta for successful settlement', () => {
    const result = deriveReputationDeltaFromReceipt({ ...baseReceipt, success: true });
    expect(result.delta).toBe(0.02);
    expect(result.reason).toContain('Successful');
  });

  it('returns negative delta for failed settlement', () => {
    const result = deriveReputationDeltaFromReceipt({ ...baseReceipt, success: false });
    expect(result.delta).toBe(-0.05);
    expect(result.reason).toContain('Failed');
  });
});