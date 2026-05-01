import { describe, it, expect, mock } from 'bun:test';
import { policyGuardrailsRuntimeAction } from './action';

describe('policy_guardrails_runtime action', () => {
  it('approves requests inside cost, recipient, and trust policy', async () => {
    const runtime = {
      getSetting: mock((key: string) => {
        if (key === 'PAYMENT_MAX_PER_REQUEST_USD') return '5';
        if (key === 'TRUST_MIN_SCORE') return '0.7';
        if (key === 'PAYMENT_ALLOWED_RECIPIENTS') return '0xabc';
        return undefined;
      }),
    } as any;

    const result = await policyGuardrailsRuntimeAction.handler(
      runtime,
      { content: { chainFamily: 'evm', amountUsd: 2, trustScore: 0.9, recipient: '0xAbC' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe('policy_guardrails_runtime');
    expect(result.data.allowed).toBe(true);
    expect(result.data.violations).toHaveLength(0);
  });

  it('blocks requests over the max cost', async () => {
    const runtime = {
      getSetting: mock((key: string) => key === 'PAYMENT_MAX_PER_REQUEST_USD' ? '1' : undefined),
    } as any;

    const result = await policyGuardrailsRuntimeAction.handler(
      runtime,
      { content: { amountUsd: 2, trustScore: 1 } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.data.allowed).toBe(false);
    expect(result.data.violations[0].code).toBe('max_cost_exceeded');
  });

  it('blocks explicitly denied recipients', async () => {
    const runtime = {
      getSetting: mock((key: string) => key === 'PAYMENT_BLOCKED_RECIPIENTS' ? '0xblocked' : undefined),
    } as any;

    const result = await policyGuardrailsRuntimeAction.handler(
      runtime,
      { content: { amountUsd: 0, trustScore: 1, recipient: '0xBlocked' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.data.violations.map((violation: any) => violation.code)).toContain('recipient_blocked');
  });
});
