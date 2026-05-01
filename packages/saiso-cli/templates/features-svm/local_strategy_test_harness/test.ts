import { describe, it, expect, mock } from 'bun:test';
import { localStrategyTestHarnessAction } from './action';

describe('local_strategy_test_harness svm adapter', () => {
  it('returns svm adapter response', async () => {
    const runtime = {
      getSetting: mock((key: string) => (key === 'CHAIN_ID' ? '1' : 'https://example-rpc')),
    } as any;

    const result = await localStrategyTestHarnessAction.handler(runtime, { content: {} } as any, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.chainFamily).toBe('svm');
    expect(result.data.adapter).toBe('svm');
  });
});
