import { afterEach, describe, expect, it } from 'bun:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvmMcpOrchestrator } from '../src/mcp/evm-orchestrator.js';
import { SvmMcpOrchestrator } from '../src/mcp/svm-orchestrator.js';
import { PaymentReceiptStore } from '../src/payments/receipts-store.js';

const openServers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    Array.from(openServers).map(async (server) => {
      await new Promise((resolve) => {
        server.close(() => resolve(undefined));
      });
      openServers.delete(server);
    })
  );
});

async function startJsonRpcServer(
  onCall: (request: { method: string; params: { name: string; arguments: Record<string, unknown> } }) => Record<string, unknown>
): Promise<{ url: string }> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      const body = JSON.parse(raw) as { method: string; params: { name: string; arguments: Record<string, unknown> } };
      const response = onCall(body);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response));
    });
  });

  openServers.add(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test JSON-RPC server');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe('deterministic paid e2e lane', () => {
  it('covers x402 paid retry and receipt persistence through concrete EVM orchestrator', async () => {
    let calls = 0;
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-e2e-x402-'));

    const server = await startJsonRpcServer((request) => {
      calls += 1;
      expect(request.method).toBe('tools/call');
      expect(request.params.name).toBe('premium-simulate');

      if (calls === 1) {
        return {
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: 402,
            message: 'Payment required',
            data: {
              x402Version: '2',
              accepts: [{ amount: '0.2', network: 'eip155:8453', payTo: 'merchant.example' }],
            },
          },
        };
      }

      const meta = request.params.arguments._meta as Record<string, unknown>;
      expect(meta['x402/payment']).toEqual({ signature: 'x402-signed' });
      return {
        jsonrpc: '2.0',
        id: '2',
        result: {
          structuredContent: { ok: true },
          _meta: {
            'x402/payment-response': {
              success: true,
              transaction: '0xsettled-x402',
              network: 'eip155:8453',
              payer: '0xabc',
            },
          },
        },
      };
    });

    const orchestrator = new EvmMcpOrchestrator();
    (orchestrator as unknown as { status: unknown }).status = {
      running: true,
      mode: 'npx',
      type: 'evm',
      url: server.url,
      port: Number(server.url.split(':').pop()),
    };

    const result = await orchestrator.invokeTool(
      'premium-simulate',
      { tx: '0xfeed' },
      {
        payment: { enabled: true, preferredProtocol: 'x402', maxPerRequestUsd: 5 },
        paymentContext: {
          resource: 'tool://premium-simulate',
          amountUsd: 0.2,
          recipient: 'merchant.example',
        },
        projectPath,
        resolveCredential: async () => ({ protocol: 'x402', payload: { signature: 'x402-signed' } }),
      }
    );

    expect(calls).toBe(2);
    expect((result.structuredContent as Record<string, unknown>).ok).toBe(true);

    const receipts = await new PaymentReceiptStore(projectPath).readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].protocol).toBe('x402');
    expect(receipts[0].success).toBe(true);
    expect(receipts[0].reference).toBe('0xsettled-x402');
  });

  it('covers MPP paid retry and receipt persistence through concrete SVM orchestrator', async () => {
    let calls = 0;
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-e2e-mpp-'));

    const server = await startJsonRpcServer((request) => {
      calls += 1;
      expect(request.method).toBe('tools/call');
      expect(request.params.name).toBe('premium-route');

      if (calls === 1) {
        return {
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: 402,
            message: 'Payment required',
            data: {
              challenges: [{ request: { amount: '1.5', network: 'eip155:4217', payTo: 'tempo.vendor' } }],
            },
          },
        };
      }

      const meta = request.params.arguments._meta as Record<string, unknown>;
      expect(meta['org.paymentauth/credential']).toEqual({ token: 'mpp-signed' });
      return {
        jsonrpc: '2.0',
        id: '2',
        result: {
          structuredContent: { ok: true },
          _meta: {
            'org.paymentauth/receipt': {
              status: 'success',
              reference: 'mpp-ref-200',
              amount: '1.5',
            },
          },
        },
      };
    });

    const orchestrator = new SvmMcpOrchestrator();
    (orchestrator as unknown as { status: unknown }).status = {
      running: true,
      mode: 'npx',
      type: 'svm',
      url: server.url,
      port: Number(server.url.split(':').pop()),
    };

    const result = await orchestrator.invokeTool(
      'premium-route',
      { market: 'SOL/USDC' },
      {
        payment: { enabled: true, preferredProtocol: 'mpp', maxPerRequestUsd: 5 },
        paymentContext: {
          resource: 'tool://premium-route',
          amountUsd: 1.5,
          recipient: 'tempo.vendor',
        },
        projectPath,
        resolveCredential: async () => ({ protocol: 'mpp', payload: { token: 'mpp-signed' } }),
      }
    );

    expect(calls).toBe(2);
    expect((result.structuredContent as Record<string, unknown>).ok).toBe(true);

    const receipts = await new PaymentReceiptStore(projectPath).readAll();
    expect(receipts.length).toBe(1);
    expect(receipts[0].protocol).toBe('mpp');
    expect(receipts[0].success).toBe(true);
    expect(receipts[0].reference).toBe('mpp-ref-200');
  });
});
