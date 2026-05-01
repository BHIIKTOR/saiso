import { describe, it, expect, mock } from 'bun:test';
import { preflightRiskChecksAction } from './action';

describe('preflight_risk_checks action', () => {
  it('approves when policy and simulation pass', async () => {
    const runtime = {
      getSetting: mock((key: string) => {
        if (key === 'PAYMENT_MAX_PER_REQUEST_USD') return '5';
        if (key === 'TRUST_MIN_SCORE') return '0.7';
        return undefined;
      }),
    } as any;

    const result = await preflightRiskChecksAction.handler(
      runtime,
      { content: { chainFamily: 'evm', amountUsd: 2, trustScore: 0.9, simulation: { success: true, gasUsed: '21000' } } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe('preflight_risk_checks');
    expect(result.data.decision).toBe('approved');
  });

  it('blocks when simulation reports an error', async () => {
    const runtime = { getSetting: mock(() => undefined) } as any;

    const result = await preflightRiskChecksAction.handler(
      runtime,
      { content: { amountUsd: 0, trustScore: 1, simulation: { success: false, error: 'revert' } } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.data.decision).toBe('blocked');
    expect(result.data.simulation.error).toBe('revert');
  });

  it('blocks when policy rejects the recipient', async () => {
    const runtime = {
      getSetting: mock((key: string) => key === 'PAYMENT_BLOCKED_RECIPIENTS' ? '0xblocked' : undefined),
    } as any;

    const result = await preflightRiskChecksAction.handler(
      runtime,
      { content: { amountUsd: 0, trustScore: 1, recipient: '0xBlocked', simulation: { success: true } } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.data.policy.violations.map((violation: any) => violation.code)).toContain('recipient_blocked');
  });
});
