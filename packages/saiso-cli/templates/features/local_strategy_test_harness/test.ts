import { describe, it, expect, mock } from 'bun:test';
import { localStrategyTestHarnessAction } from './action';

describe('local_strategy_test_harness action scaffold', () => {
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

    const result = await localStrategyTestHarnessAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('local_strategy_test_harness');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('local_strategy_test_harness behavior', () => {

  it('runs a buy/sell scenario on either supported chain', async () => {
    for (const chainFamily of ['evm', 'svm']) {
      const result = await localStrategyTestHarnessAction.handler({ getSetting: () => undefined } as any, { content: { chainFamily, scenario: { steps: [{ action: 'buy', price: 10, amount: 2 }, { action: 'sell', price: 15, amount: 2 }] } } } as any, undefined, {});
      expect(result.success).toBe(true);
      expect(result.chainFamily).toBe(chainFamily);
      expect(result.data.result.initialBalance).toBe(1000);
      expect(result.data.result.finalBalance).toBe(1010);
      expect(result.data.result.pnl).toBe(10);
      expect(result.data.result.trades.map((trade: { balance: number }) => trade.balance)).toEqual([980, 1010]);
    }
  });
});
