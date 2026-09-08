import { describe, it, expect, mock } from 'bun:test';
import { oracleMarketDataLayerAction } from './action';

describe('oracle_and_market_data_layer action scaffold', () => {
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

    const result = await oracleMarketDataLayerAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('oracle_and_market_data_layer');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('oracle_and_market_data_layer regression checks', () => {

  it('uses the default freshness window and rejects stale feeds', async () => {
    const invoke = (age: number, setting?: string | number) => oracleMarketDataLayerAction.handler({ getSetting: () => setting } as any, { content: { feeds: [{ symbol: 'eth', price: 2000, timestamp: new Date(Date.now() - age).toISOString() }] } } as any, undefined, {});
    const fresh = await invoke(1000);
    expect(fresh.success).toBe(true);
    expect(fresh.data.maxStalenessMs).toBe(300000);
    expect(fresh.data.feeds[0].symbol).toBe('ETH');
    expect((await invoke(1000, ' ')).success).toBe(true);
    expect((await invoke(300001)).success).toBe(false);
    expect((await invoke(1000, '0')).success).toBe(false);
    expect((await invoke(1000, 300000)).success).toBe(true);
  });

  it('rejects malformed and negative freshness thresholds', async () => {
    for (const setting of ['invalid', '-1', 'Infinity']) {
      const result = await oracleMarketDataLayerAction.handler({ getSetting: () => setting } as any, { content: {} } as any, undefined, {});
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('invalid_freshness_threshold');
    }
  });
});
