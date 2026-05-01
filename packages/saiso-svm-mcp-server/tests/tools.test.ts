import { describe, expect, it } from 'bun:test';
import { executeTool, supportedTools, canonicalToolHandlers, type ToolContext } from '../src/tools.js';

const mockContext = {
  connection: {} as unknown as ToolContext['connection'],
  network: 'solana-devnet',
} as ToolContext;

describe('saiso svm mcp tools', () => {
  it('exposes canonical + legacy tool names', () => {
    expect(supportedTools).toContain('wallet.native_balance');
    expect(supportedTools).toContain('send-sol');
    expect(supportedTools).toContain('simulate-transaction');
  });

  it('returns unsupported tool errors', async () => {
    const result = await executeTool('not-a-real-tool', {}, mockContext);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('unsupported_tool');
  });

  it('resolves legacy aliases through canonical handlers', async () => {
    const original = canonicalToolHandlers['wallet.native_balance'];

    canonicalToolHandlers['wallet.native_balance'] = async (_args, ctx) => ({
      success: true,
      chainFamily: 'svm',
      network: ctx.network,
      data: { ok: true },
    });

    try {
      const result = await executeTool('get-balance', { address: 'abc' }, mockContext);
      expect(result.success).toBe(true);
      expect(result.data?.ok).toBe(true);
    } finally {
      canonicalToolHandlers['wallet.native_balance'] = original;
    }
  });
});
