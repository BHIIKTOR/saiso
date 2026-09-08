import { describe, it, expect, mock } from 'bun:test';
import { crossChainIntentRouterAction } from './action';

describe('cross_chain_intent_router action scaffold', () => {
  it('returns normalized workflow envelope', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const message = {
      content: {
        chainFamily: 'evm',
        dryRun: true,
        payload: { foo: 'bar' },
      },
    } as any;

    const result = await crossChainIntentRouterAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('cross_chain_intent_router');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('cross_chain_intent_router regression checks', () => {

  it('uses default routing constraints and preserves explicit zero', async () => {
    const invoke = (settings: Record<string, string | number> = {}) => crossChainIntentRouterAction.handler({ getSetting: (key: string) => settings[key] } as any, { content: { amountUsd: 1 } } as any, undefined, {});
    const defaults = await invoke();
    expect(defaults.success).toBe(true);
    expect(defaults.data.policy).toEqual({ amountUsd: 1, maxCostUsd: 5, minTrustScore: 0.65 });
    expect(defaults.data.plan.steps.map((step: { status: string }) => step.status)).toEqual(['pending', 'pending', 'pending']);
    expect((await invoke({ PAYMENT_MAX_PER_REQUEST_USD: ' ' })).success).toBe(true);
    expect((await invoke({ PAYMENT_MAX_PER_REQUEST_USD: '0' })).success).toBe(false);
    expect((await invoke({ PAYMENT_MAX_PER_REQUEST_USD: 5, TRUST_MIN_SCORE: 0 })).data.policy.minTrustScore).toBe(0);
  });

  it('rejects invalid budgets and trust thresholds', async () => {
    for (const content of [{ maxCostUsd: -1 }, { maxCostUsd: Infinity }, { minTrustScore: -1 }, { minTrustScore: 1.1 }, { minTrustScore: NaN }]) {
      const result = await crossChainIntentRouterAction.handler({ getSetting: () => undefined } as any, { content } as any, undefined, {});
      expect(result.success).toBe(false);
    }
  });
});
