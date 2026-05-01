import { describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServerOrchestrator } from '../src/mcp/orchestrator.js';
import type { McpHealthCheck, McpServerCapabilities, McpServerStatus, McpServerType, NetworkInfo } from '../src/types/mcp.js';
import type { SaisoConfig } from '../src/types/config.js';
import { PaymentReceiptStore } from '../src/payments/receipts-store.js';

class DummyOrchestrator extends McpServerOrchestrator {
  getServerType(): McpServerType { return 'evm'; }
  getSupportedNetworks(): NetworkInfo[] { return []; }
  getCapabilities(): McpServerCapabilities {
    return {
      networks: [],
      tools: [],
      resources: [],
      features: {
        ensSupport: false,
        nftSupport: false,
        multiTokenSupport: false,
        contractInteraction: false,
        gasEstimation: false,
      },
    };
  }
  async start(_config: SaisoConfig, _projectPath: string): Promise<McpServerStatus> {
    throw new Error('not implemented');
  }
  async stop(): Promise<void> {}
  async isHealthy(): Promise<boolean> { return true; }
  async healthCheck(): Promise<McpHealthCheck> {
    return { healthy: true, latency: 1, timestamp: new Date() };
  }
  validateConfig(_config: SaisoConfig): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
  getRecommendedNetworks(): NetworkInfo[] { return []; }

  async runPaid<TParams extends Record<string, unknown>, TResult extends Record<string, unknown>>(
    execute: (params: TParams) => Promise<TResult>,
    params: TParams,
    options: Parameters<McpServerOrchestrator['executeToolWithPayment']>[2]
  ): Promise<TResult> {
    return this.executeToolWithPayment(execute, params, options);
  }
}

describe('payment-aware orchestration execution', () => {
  it('handles x402 challenge -> retry -> receipt persistence', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-x402-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    let calls = 0;
    const execute = async (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
      calls += 1;
      if (calls === 1) {
        return {
          isError: true,
          structuredContent: {
            x402Version: '2',
            accepts: [{ amount: '0.01', network: 'eip155:11155111', payTo: 'merchant.example' }],
          },
        };
      }

      expect((params._meta as Record<string, unknown>)['x402/payment']).toEqual({ signature: '0xpaid' });
      return {
        _meta: {
          'x402/payment-response': {
            success: true,
            transaction: '0xabc',
            network: 'eip155:11155111',
            payer: '0x123',
          },
        },
      };
    };

    const result = await orchestrator.runPaid(execute, { method: 'paidTool' }, {
      payment: { enabled: true, preferredProtocol: 'x402', maxPerRequestUsd: 5 },
      paymentContext: { resource: 'tool://paidTool', amountUsd: 0.5, recipient: 'merchant.example' },
      projectPath,
      resolveCredential: async () => ({ protocol: 'x402', payload: { signature: '0xpaid' } }),
    });

    expect(calls).toBe(2);
    expect(result._meta).toBeDefined();

    const receipts = await receiptStore.readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].protocol).toBe('x402');
    expect(receipts[0].success).toBe(true);
  });

  it('handles mpp challenge -> retry -> receipt persistence', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-mpp-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    let calls = 0;
    const execute = async (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
      calls += 1;
      if (calls === 1) {
        return {
          isError: true,
          structuredContent: {
            challenges: [{ request: { amount: '0.25', network: 'eip155:11155111', payTo: 'mpp.vendor' } }],
          },
        };
      }

      expect((params._meta as Record<string, unknown>)['org.paymentauth/credential']).toEqual({ auth: 'mpp-token' });
      return {
        _meta: {
          'org.paymentauth/receipt': {
            status: 'success',
            reference: 'mpp-ref-1',
            amount: '0.25',
          },
        },
      };
    };

    const result = await orchestrator.runPaid(execute, { method: 'paidTool' }, {
      payment: { enabled: true, preferredProtocol: 'mpp', maxPerRequestUsd: 5 },
      paymentContext: { resource: 'tool://paidTool', amountUsd: 0.25, recipient: 'mpp.vendor' },
      projectPath,
      resolveCredential: async () => ({ protocol: 'mpp', payload: { auth: 'mpp-token' } }),
    });

    expect(calls).toBe(2);
    expect(result._meta).toBeDefined();

    const receipts = await receiptStore.readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].protocol).toBe('mpp');
    expect(receipts[0].success).toBe(true);
  });

  it('persists policy-denied failures with deterministic outcomeClass', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-policy-denied-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    await expect(
      orchestrator.runPaid(
        async () => ({ ok: true }),
        { method: 'paidTool' },
        {
          payment: { enabled: true, preferredProtocol: 'x402', maxPerRequestUsd: 0.1 },
          paymentContext: { resource: 'tool://paidTool', amountUsd: 2, recipient: 'merchant.example' },
          projectPath,
        }
      )
    ).rejects.toThrow('Payment policy blocked request');

    const receipts = await receiptStore.readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].success).toBe(false);
    expect(receipts[0].outcomeClass).toBe('policy-denied');
  });

  it('applies challenge amount and recipient to policy before credential resolution', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-challenge-policy-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    let credentialResolved = false;

    await expect(
      orchestrator.runPaid(
        async () => ({
          isError: true,
          structuredContent: {
            x402Version: '2',
            accepts: [{ amount: '2.5', network: 'eip155:11155111', payTo: 'merchant.example' }],
          },
        }),
        { method: 'paidTool' },
        {
          payment: {
            enabled: true,
            preferredProtocol: 'x402',
            maxPerRequestUsd: 1,
            allowedRecipients: ['merchant.example'],
          },
          paymentContext: { resource: 'tool://paidTool' },
          projectPath,
          resolveCredential: async () => {
            credentialResolved = true;
            return { protocol: 'x402', payload: { signature: '0xpaid' } };
          },
        }
      )
    ).rejects.toThrow('per-request limit');

    expect(credentialResolved).toBe(false);

    const receipts = await receiptStore.readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].success).toBe(false);
    expect(receipts[0].outcomeClass).toBe('policy-denied');
  });

  it('fails closed when challenge recipient is missing for an allowlist policy', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-missing-recipient-'));

    await expect(
      orchestrator.runPaid(
        async () => ({
          isError: true,
          structuredContent: {
            challenges: [{ request: { amount: '0.25', network: 'eip155:11155111' } }],
          },
        }),
        { method: 'paidTool' },
        {
          payment: {
            enabled: true,
            preferredProtocol: 'mpp',
            protocolAllowedRecipients: { mpp: ['tempo.xyz'] },
          },
          paymentContext: { resource: 'tool://paidTool' },
          projectPath,
          resolveCredential: async () => ({ protocol: 'mpp', payload: { auth: 'mpp-token' } }),
        }
      )
    ).rejects.toThrow('recipient is required');
  });

  it('persists credential-error failures when challenge settlement has no resolver', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-credential-error-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    await expect(
      orchestrator.runPaid(
        async () => ({
          isError: true,
          structuredContent: {
            x402Version: '2',
            accepts: [{ amount: '0.01', network: 'eip155:11155111', payTo: 'merchant.example' }],
          },
        }),
        { method: 'paidTool' },
        {
          payment: { enabled: true, preferredProtocol: 'x402', maxPerRequestUsd: 5 },
          paymentContext: { resource: 'tool://paidTool', amountUsd: 0.01, recipient: 'merchant.example' },
          projectPath,
        }
      )
    ).rejects.toThrow('no credential resolver');

    const receipts = await receiptStore.readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].success).toBe(false);
    expect(receipts[0].outcomeClass).toBe('credential-error');
  });

  it('allows execution when request reaches but does not exceed daily budget', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-daily-budget-allow-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    await receiptStore.append({
      protocol: 'x402',
      success: true,
      outcomeClass: 'settled',
      reference: 'prior-1',
      timestamp: new Date().toISOString(),
      raw: {
        amountUsd: 3,
      },
    });

    let callCount = 0;
    const result = await orchestrator.runPaid(
      async () => {
        callCount += 1;
        return { ok: true };
      },
      { method: 'paidTool' },
      {
        payment: { enabled: true, preferredProtocol: 'x402', dailyBudgetUsd: 5 },
        paymentContext: { resource: 'tool://paidTool', amountUsd: 2, recipient: 'merchant.example' },
        projectPath,
      }
    );

    expect(callCount).toBe(1);
    expect(result.ok).toBe(true);
  });

  it('denies execution when request exceeds daily budget', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-daily-budget-deny-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    await receiptStore.append({
      protocol: 'mpp',
      success: true,
      outcomeClass: 'settled',
      reference: 'prior-2',
      timestamp: new Date().toISOString(),
      raw: {
        amountUsd: 4.5,
      },
    });

    await expect(
      orchestrator.runPaid(
        async () => ({ ok: true }),
        { method: 'paidTool' },
        {
          payment: { enabled: true, preferredProtocol: 'mpp', dailyBudgetUsd: 5 },
          paymentContext: { resource: 'tool://paidTool', amountUsd: 0.6, recipient: 'tempo.xyz' },
          projectPath,
        }
      )
    ).rejects.toThrow('daily budget');

    const receipts = await receiptStore.readAll();
    const latest = receipts[receipts.length - 1];
    expect(latest.success).toBe(false);
    expect(latest.outcomeClass).toBe('policy-denied');
  });

  it('resets daily budget accounting across UTC day boundary', async () => {
    const orchestrator = new DummyOrchestrator();
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-daily-budget-rollover-'));
    const receiptStore = new PaymentReceiptStore(projectPath);

    await receiptStore.append({
      protocol: 'x402',
      success: true,
      outcomeClass: 'settled',
      reference: 'yesterday',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      raw: {
        amountUsd: 4.9,
      },
    });

    const result = await orchestrator.runPaid(
      async () => ({ ok: true }),
      { method: 'paidTool' },
      {
        payment: { enabled: true, preferredProtocol: 'x402', dailyBudgetUsd: 5 },
        paymentContext: { resource: 'tool://paidTool', amountUsd: 1, recipient: 'merchant.example' },
        projectPath,
      }
    );

    expect(result.ok).toBe(true);
  });
});
