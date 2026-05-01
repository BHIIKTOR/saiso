import { describe, expect, it } from 'bun:test';
import { PaymentPolicyEngine } from '../src/payments/policy.js';

describe('PaymentPolicyEngine protocol-aware enforcement', () => {
  it('allows x402 recipient when protocol allowlist is satisfied', () => {
    const engine = new PaymentPolicyEngine({
      enabled: true,
      preferredProtocol: 'x402',
      protocolAllowedRecipients: {
        x402: ['merchant.example'],
      },
    });

    const decision = engine.evaluate(
      {
        resource: 'tool://premium-simulate',
        amountUsd: 0.3,
        recipient: 'merchant.example',
      },
      {
        protocol: 'x402',
      }
    );

    expect(decision.allowed).toBe(true);
  });

  it('denies x402 recipient when protocol blocklist matches', () => {
    const engine = new PaymentPolicyEngine({
      enabled: true,
      preferredProtocol: 'x402',
      protocolBlockedRecipients: {
        x402: ['blocked.example'],
      },
    });

    const decision = engine.evaluate(
      {
        resource: 'tool://premium-simulate',
        amountUsd: 0.3,
        recipient: 'blocked.example',
      },
      {
        protocol: 'x402',
      }
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('blocked for protocol x402');
  });

  it('denies mpp request when tool-level cap is exceeded', () => {
    const engine = new PaymentPolicyEngine({
      enabled: true,
      preferredProtocol: 'mpp',
      toolMaxPerRequestUsd: {
        'premium-route': 0.2,
      },
    });

    const decision = engine.evaluate(
      {
        resource: 'tool://premium-route',
        amountUsd: 0.5,
        recipient: 'tempo.xyz',
        metadata: {
          toolName: 'premium-route',
        },
      },
      {
        protocol: 'mpp',
      }
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('tool limit');
  });

  it('allows mpp high-risk operation when trust floor is met', () => {
    const engine = new PaymentPolicyEngine({
      enabled: true,
      preferredProtocol: 'mpp',
      operationClassMinTrustScore: {
        'high-risk': 0.8,
      },
      protocolAllowedRecipients: {
        mpp: ['tempo.xyz'],
      },
    });

    const decision = engine.evaluate(
      {
        resource: 'tool://premium-route',
        amountUsd: 0.2,
        recipient: 'tempo.xyz',
        metadata: {
          operationClass: 'high-risk',
        },
      },
      {
        protocol: 'mpp',
        trustScore: 0.91,
      }
    );

    expect(decision.allowed).toBe(true);
  });

  it('allows request when cumulative daily spend equals budget', () => {
    const engine = new PaymentPolicyEngine({
      enabled: true,
      preferredProtocol: 'x402',
      dailyBudgetUsd: 5,
    });

    const decision = engine.evaluate(
      {
        resource: 'tool://premium-simulate',
        amountUsd: 2,
        recipient: 'merchant.example',
      },
      {
        protocol: 'x402',
        dailySpentUsd: 3,
      }
    );

    expect(decision.allowed).toBe(true);
  });

  it('denies request when cumulative daily spend exceeds budget', () => {
    const engine = new PaymentPolicyEngine({
      enabled: true,
      preferredProtocol: 'mpp',
      dailyBudgetUsd: 5,
    });

    const decision = engine.evaluate(
      {
        resource: 'tool://premium-route',
        amountUsd: 2.1,
        recipient: 'tempo.xyz',
      },
      {
        protocol: 'mpp',
        dailySpentUsd: 3,
      }
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('daily budget');
  });
});
