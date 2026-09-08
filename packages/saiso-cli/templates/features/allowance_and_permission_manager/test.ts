import { describe, it, expect, mock } from 'bun:test';
import { allowancePermissionManagerAction } from './action';

describe('allowance_and_permission_manager action scaffold', () => {
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

    const result = await allowancePermissionManagerAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('allowance_and_permission_manager');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('allowance_and_permission_manager regression checks', () => {

  it('uses the default cap when settings are absent or blank, and preserves zero', async () => {
    for (const setting of [undefined, ' ', 1000]) {
      const result = await allowancePermissionManagerAction.handler({ getSetting: () => setting } as any, { content: { amount: '1' } } as any, undefined, {});
      expect(result.success).toBe(true);
      expect(result.data.policy.checks.maxAllowanceUsd).toBe(1000);
    }
    const result = await allowancePermissionManagerAction.handler({ getSetting: (key: string) => key === 'ALLOWANCE_MAX_USD' ? '0' : undefined } as any, { content: { amount: '1' } } as any, undefined, {});
    expect(result.success).toBe(false);
    expect(result.data.policy.checks.maxAllowanceUsd).toBe(0);
  });

  it('rejects malformed amounts and invalid caps before approval', async () => {
    for (const amount of ['invalid', '', ' ', '-1', 'Infinity', NaN, Infinity, -1, true, {}, null]) {
      const result = await allowancePermissionManagerAction.handler({ getSetting: () => undefined } as any, { content: { amount } } as any, undefined, {});
      expect(result.success).toBe(false);
      expect(result.data.decision).toBe('blocked');
      expect(result.data.policy.violations.some((v: { code: string }) => v.code === 'invalid_amount')).toBe(true);
    }
    for (const cap of [-1, NaN, Infinity, 'invalid', '1000', true, null]) {
      const result = await allowancePermissionManagerAction.handler({ getSetting: () => undefined } as any, { content: { amount: '1', maxAllowanceUsd: cap } } as any, undefined, {});
      expect(result.success).toBe(false);
    }
    const result = await allowancePermissionManagerAction.handler({ getSetting: (key: string) => key === 'ALLOWANCE_MAX_USD' ? 'invalid' : undefined } as any, { content: { amount: '1' } } as any, undefined, {});
    expect(result.success).toBe(false);
  });

  it('enforces allow and block lists and accepts an explicit zero amount', async () => {
    for (const content of [
      { amount: '1', token: 'OTHER', allowedTokens: ['USDC'] },
      { amount: '1', spender: 'BLOCKED', blockedSpenders: ['blocked'] },
    ]) {
      const result = await allowancePermissionManagerAction.handler({ getSetting: () => undefined } as any, { content } as any, undefined, {});
      expect(result.success).toBe(false);
    }
    const result = await allowancePermissionManagerAction.handler({ getSetting: () => undefined } as any, { content: { amount: '0', maxAllowanceUsd: 0 } } as any, undefined, {});
    expect(result.success).toBe(true);
  });
});
