import { describe, it, expect, mock } from 'bun:test';
import { portfolioStatePnlAction } from './action';

describe('portfolio_state_and_pnl action scaffold', () => {
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

    const result = await portfolioStatePnlAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('portfolio_state_and_pnl');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('portfolio_state_and_pnl behavior', () => {

  it('computes values, PnL, and allocation drift from supplied positions', async () => {
    const result = await portfolioStatePnlAction.handler({ getSetting: () => undefined } as any, { content: { balances: [{ token: 'ETH', amount: 2, priceUsd: 100, costBasisUsd: 150 }, { token: 'USDC', amount: 100, priceUsd: 1, costBasisUsd: 100 }], targets: { ETH: 50, USDC: 50 } } } as any, undefined, {});
    expect(result.data.portfolio.totalValueUsd).toBe(300);
    expect(result.data.portfolio.totalPnlUsd).toBe(50);
    expect(result.data.allocationDrift[0].driftPercent).toBeCloseTo(16.6666667);
    expect(result.data.allocationDrift[1].driftPercent).toBeCloseTo(-16.6666667);
  });
});
