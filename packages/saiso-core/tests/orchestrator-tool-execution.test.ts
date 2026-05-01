import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvmMcpOrchestrator } from '../src/mcp/evm-orchestrator.js';
import { SvmMcpOrchestrator } from '../src/mcp/svm-orchestrator.js';
import { PaymentReceiptStore } from '../src/payments/receipts-store.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('orchestrator invokeTool', () => {
  it('executes an EVM MCP JSON-RPC tool call', async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: { name: string; arguments: Record<string, unknown> };
      };

      expect(body.method).toBe('tools/call');
      expect(body.params.name).toBe('get-balance');
      expect(body.params.arguments).toEqual({ address: '0xabc' });

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        result: {
          structuredContent: { balance: '1.23' },
        },
      }), { status: 200 });
    }) as typeof fetch;

    const orchestrator = new EvmMcpOrchestrator();
    (orchestrator as unknown as { status: unknown }).status = {
      running: true,
      mode: 'npx',
      type: 'evm',
      url: 'http://localhost:3001',
      port: 3001,
    };

    const result = await orchestrator.invokeTool('wallet.native_balance', { address: '0xabc' });
    expect((result.structuredContent as Record<string, unknown>).balance).toBe('1.23');
  });

  it('retries paid EVM tool calls when x402 challenge is returned', async () => {
    let callCount = 0;
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-paid-tool-'));

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body)) as {
        params: { arguments: Record<string, unknown> };
      };

      if (callCount === 1) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: 402,
            message: 'Payment required',
            data: {
              x402Version: '2',
              accepts: [{ amount: '0.1', network: 'eip155:11155111', payTo: 'merchant.example' }],
            },
          },
        }), { status: 200 });
      }

      const meta = body.params.arguments._meta as Record<string, unknown>;
      expect(meta['x402/payment']).toEqual({ signature: '0xpaid' });

      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: '2',
        result: {
          _meta: {
            'x402/payment-response': {
              success: true,
              transaction: '0xsettled',
              network: 'eip155:11155111',
              payer: '0xpayer',
            },
          },
        },
      }), { status: 200 });
    }) as typeof fetch;

    const orchestrator = new EvmMcpOrchestrator();
    (orchestrator as unknown as { status: unknown }).status = {
      running: true,
      mode: 'npx',
      type: 'evm',
      url: 'http://localhost:3001',
      port: 3001,
    };

    const result = await orchestrator.invokeTool(
      'premium-simulate',
      { tx: '0xdeadbeef' },
      {
        payment: {
          enabled: true,
          preferredProtocol: 'x402',
          maxPerRequestUsd: 5,
        },
        paymentContext: {
          resource: 'tool://premium-simulate',
          amountUsd: 0.1,
          recipient: 'merchant.example',
          metadata: {
            serverFamily: 'evm',
            method: 'premium-simulate',
          },
        },
        resolveCredential: async () => ({ protocol: 'x402', payload: { signature: '0xpaid' } }),
        projectPath,
      }
    );

    expect(result._meta).toBeDefined();
    expect(callCount).toBe(2);

    const receipts = await new PaymentReceiptStore(projectPath).readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].protocol).toBe('x402');
    expect(receipts[0].reference).toBe('0xsettled');
    expect((receipts[0].raw as Record<string, unknown>).chainFamily).toBe('evm');
    expect((receipts[0].raw as Record<string, unknown>).method).toBe('premium-simulate');
  });

  it('executes an SVM MCP JSON-RPC tool call with canonical tool names', async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        params: { name: string };
      };
      expect(body.params.name).toBe('wallet.native_balance');
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        result: {
          structuredContent: { lamports: 12345 },
        },
      }), { status: 200 });
    }) as typeof fetch;

    const orchestrator = new SvmMcpOrchestrator();
    (orchestrator as unknown as { status: unknown }).status = {
      running: true,
      mode: 'npx',
      type: 'svm',
      url: 'http://localhost:3002',
      port: 3002,
    };

    const result = await orchestrator.invokeTool('wallet.native_balance', { address: 'abc' });
    expect((result.structuredContent as Record<string, unknown>).lamports).toBe(12345);
  });

  it('maps legacy SVM tool names to canonical operation names', async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        params: { name: string };
      };
      expect(body.params.name).toBe('token.transfer');
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        result: {
          structuredContent: { signature: '5abc' },
        },
      }), { status: 200 });
    }) as typeof fetch;

    const orchestrator = new SvmMcpOrchestrator();
    (orchestrator as unknown as { status: unknown }).status = {
      running: true,
      mode: 'npx',
      type: 'svm',
      url: 'http://localhost:3002',
      port: 3002,
    };

    const result = await orchestrator.invokeTool('send-sol', { to: 'abc', lamports: 1000 });
    expect((result.structuredContent as Record<string, unknown>).signature).toBe('5abc');
  });
});
