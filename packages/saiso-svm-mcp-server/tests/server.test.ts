import { afterEach, describe, expect, it } from 'bun:test';
import { AddressInfo } from 'node:net';
import { Keypair } from '@solana/web3.js';
import { startSvmMcpServer } from '../src/server.js';

let activeServer: Awaited<ReturnType<typeof startSvmMcpServer>> | undefined;

async function withServer<T>(
  fn: (baseUrl: string) => Promise<T>,
  options: { privateKey?: string } = {},
): Promise<T> {
  activeServer = await startSvmMcpServer({
    host: '127.0.0.1',
    port: 0,
    network: 'solana-devnet',
    rpcUrl: 'http://127.0.0.1:8899',
    privateKey: options.privateKey,
  });

  const address = activeServer.address() as AddressInfo;
  const host = address.address === '::' ? '127.0.0.1' : address.address;
  const baseUrl = `http://${host}:${address.port}`;

  return fn(baseUrl);
}

async function postJson(baseUrl: string, payload: unknown): Promise<Response> {
  return fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  if (!activeServer) {
    return;
  }

  await new Promise<void>((resolve) => {
    activeServer?.close(() => resolve());
  });
  activeServer = undefined;
});

describe('saiso svm mcp server transport', () => {
  it('serves health endpoints', async () => {
    await withServer(async (baseUrl) => {
      for (const path of ['/health', '/healthz', '/readyz']) {
        const response = await fetch(`${baseUrl}${path}`);
        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body.ok).toBe(true);
        expect(body.service).toBe('@saiso/svm-mcp-server');
        expect(body.network).toBe('solana-devnet');
      }
    });
  });

  it('rejects unsupported HTTP methods', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`, { method: 'GET' });
      expect(response.status).toBe(405);
      const body = await response.json() as Record<string, unknown>;
      expect(body.error).toBe('method_not_allowed');
    });
  });

  it('returns tools/list with canonical and legacy tool names', async () => {
    await withServer(async (baseUrl) => {
      const response = await postJson(baseUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });

      expect(response.status).toBe(200);
      const body = await response.json() as {
        result?: { tools?: Array<{ name: string }> };
      };

      const tools = body.result?.tools ?? [];
      const names = tools.map((tool) => tool.name);
      expect(names).toContain('wallet.native_balance');
      expect(names).toContain('send-sol');
      expect(names).toContain('simulate-transaction');
    });
  });

  it('returns json-rpc method not found for unsupported methods', async () => {
    await withServer(async (baseUrl) => {
      const response = await postJson(baseUrl, {
        jsonrpc: '2.0',
        id: 'abc',
        method: 'not-real',
      });

      expect(response.status).toBe(400);
      const body = await response.json() as {
        id: string | null;
        error?: { code?: number; message?: string };
      };

      expect(body.id).toBe('abc');
      expect(body.error?.code).toBe(-32601);
      expect(body.error?.message).toContain('Unsupported method');
    });
  });

  it('returns json-rpc invalid params when tools/call has no name', async () => {
    await withServer(async (baseUrl) => {
      const response = await postJson(baseUrl, {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {},
      });

      expect(response.status).toBe(400);
      const body = await response.json() as {
        error?: { code?: number; message?: string };
      };

      expect(body.error?.code).toBe(-32602);
      expect(body.error?.message).toContain('Missing params.name');
    });
  });

  it('returns structured tool errors for unsupported tools', async () => {
    await withServer(async (baseUrl) => {
      const response = await postJson(baseUrl, {
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: {
          name: 'tool.that.does.not.exist',
          arguments: {},
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json() as {
        result?: {
          isError?: boolean;
          structuredContent?: {
            error?: { code?: string };
          };
        };
      };

      expect(body.result?.isError).toBe(true);
      expect(body.result?.structuredContent?.error?.code).toBe('unsupported_tool');
    });
  });

  it('executes wallet.address through tools/call when private key is configured', async () => {
    const wallet = Keypair.generate();
    const arraySecret = JSON.stringify(Array.from(wallet.secretKey));

    await withServer(async (baseUrl) => {
      const response = await postJson(baseUrl, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'wallet.address',
          arguments: {},
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json() as {
        result?: {
          isError?: boolean;
          structuredContent?: {
            success?: boolean;
            data?: { address?: string };
          };
        };
      };

      expect(body.result?.isError).toBeUndefined();
      expect(body.result?.structuredContent?.success).toBe(true);
      expect(body.result?.structuredContent?.data?.address).toBe(wallet.publicKey.toBase58());
    }, {
      privateKey: arraySecret,
    });
  });

  it('returns json-rpc internal error shape for malformed JSON payloads', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      });

      expect(response.status).toBe(500);
      const body = await response.json() as {
        id: null;
        error?: { code?: number; message?: string };
      };

      expect(body.id).toBe(null);
      expect(body.error?.code).toBe(-32000);
      expect(body.error?.message).toContain('JSON');
    });
  });
});
