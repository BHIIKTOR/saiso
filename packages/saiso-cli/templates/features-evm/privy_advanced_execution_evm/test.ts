import { describe, it, expect, mock } from 'bun:test';
import { privyAdvancedExecutionEvmAction } from './action';

describe('privy_advanced_execution_evm evm adapter', () => {
  it('returns evm adapter response', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const result = await privyAdvancedExecutionEvmAction.handler(runtime, { content: { walletId: 'wallet_1' } } as any, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.chainFamily).toBe('evm');
    expect(result.data.adapter).toBe('evm');
    expect(result.meta.idempotencyKey).toBeDefined();
  });
});
