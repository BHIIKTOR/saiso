import { describe, expect, it } from 'bun:test';
import {
  resolveMcpCallPolicies,
  resolveWithPrecedence,
  type LoadedPolicies,
} from './policy.js';

function emptyPolicies(): LoadedPolicies {
  return {
    paymentPath: '/tmp/payment-policy.json',
    trustPath: '/tmp/trust-policy.json',
  };
}

describe('policy precedence resolver', () => {
  it('applies precedence in order: CLI > policy file > env > defaults', () => {
    const value = resolveWithPrecedence({
      cli: 'cli',
      policyFile: 'file',
      env: 'env',
      defaults: 'default',
    });
    expect(value).toBe('cli');
  });

  it('treats boolean false as an explicit value in precedence resolution', () => {
    const value = resolveWithPrecedence({
      policyFile: false,
      env: true,
      defaults: true,
    });
    expect(value).toBe(false);
  });
});

describe('resolveMcpCallPolicies', () => {
  it('prefers CLI overrides over policy file and env values', () => {
    const resolved = resolveMcpCallPolicies(
      {
        paid: true,
        paymentProtocol: 'auto',
        minTrustScore: 0.88,
        routingProfile: 'balanced',
      },
      {
        ...emptyPolicies(),
        payment: {
          enabled: false,
          preferredProtocol: 'x402',
          maxPerRequestUsd: 1.2,
        },
        trust: {
          enabled: true,
          minTrustScore: 0.7,
          routingProfile: 'cost-first',
        },
      },
      {
        payment: {
          enabled: true,
          preferredProtocol: 'mpp',
          maxPerRequestUsd: 3.5,
        },
        trust: {
          enabled: true,
          minTrustScore: 0.4,
          routingProfile: 'trust-first',
        },
      }
    );

    expect(resolved.paymentEnabled).toBe(true);
    expect(resolved.paymentConfig?.preferredProtocol).toBe('auto');
    expect(resolved.paymentConfig?.maxPerRequestUsd).toBe(1.2);
    expect(resolved.defaultMinTrustScore).toBe(0.88);
    expect(resolved.defaultRoutingProfile).toBe('balanced');
  });

  it('uses policy-file layer when CLI is absent', () => {
    const resolved = resolveMcpCallPolicies(
      {},
      {
        ...emptyPolicies(),
        payment: {
          enabled: true,
          preferredProtocol: 'x402',
        },
        trust: {
          enabled: true,
          minTrustScore: 0.72,
          routingProfile: 'cost-first',
        },
      },
      {
        payment: {
          enabled: false,
          preferredProtocol: 'mpp',
        },
        trust: {
          enabled: true,
          minTrustScore: 0.35,
          routingProfile: 'trust-first',
        },
      }
    );

    expect(resolved.paymentEnabled).toBe(true);
    expect(resolved.paymentConfig?.preferredProtocol).toBe('x402');
    expect(resolved.defaultMinTrustScore).toBe(0.72);
    expect(resolved.defaultRoutingProfile).toBe('cost-first');
  });

  it('falls back to env layer when policy files are absent', () => {
    const resolved = resolveMcpCallPolicies(
      {},
      emptyPolicies(),
      {
        payment: {
          enabled: true,
          preferredProtocol: 'mpp',
        },
        trust: {
          enabled: true,
          minTrustScore: 0.61,
          routingProfile: 'balanced',
        },
      }
    );

    expect(resolved.paymentEnabled).toBe(true);
    expect(resolved.paymentConfig?.preferredProtocol).toBe('mpp');
    expect(resolved.defaultMinTrustScore).toBe(0.61);
    expect(resolved.defaultRoutingProfile).toBe('balanced');
  });

  it('falls back to defaults when no layer provides values', () => {
    const resolved = resolveMcpCallPolicies({}, emptyPolicies(), {});

    expect(resolved.paymentEnabled).toBe(false);
    expect(resolved.paymentConfig).toBeUndefined();
    expect(resolved.defaultMinTrustScore).toBeUndefined();
    expect(resolved.defaultRoutingProfile).toBe('trust-first');
  });

  it('treats trust policy enabled=false as an explicit override over env trust thresholds', () => {
    const resolved = resolveMcpCallPolicies(
      {},
      {
        ...emptyPolicies(),
        trust: {
          enabled: false,
          minTrustScore: 0.9,
        },
      },
      {
        trust: {
          enabled: true,
          minTrustScore: 0.55,
          routingProfile: 'balanced',
        },
      }
    );

    expect(resolved.defaultMinTrustScore).toBeUndefined();
    expect(resolved.defaultRoutingProfile).toBe('balanced');
  });
});
