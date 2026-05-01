import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServiceBlueprintServer } from '../src/service/blueprint.js';

const runningServers: Server[] = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map(server => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function startServer(server: Server): Promise<string> {
  runningServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('service blueprint server', () => {
  it('serves /healthz and /readyz with expected shape', async () => {
    let ready = false;
    let isShuttingDown = false;
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async () => ({ ok: true }),
      },
      projectPath: process.cwd(),
      isReady: () => ready,
      isShuttingDown: () => isShuttingDown,
    });

    const baseUrl = await startServer(server);

    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    const healthJson = await health.json() as Record<string, unknown>;
    expect(healthJson.status).toBe('ok');
    expect(healthJson.service).toBe('test-agent');
    expect(healthJson.serverType).toBe('evm');
    expect(healthJson.ready).toBe(false);

    const readyResponse = await fetch(`${baseUrl}/readyz`);
    expect(readyResponse.status).toBe(503);
    const readyJson = await readyResponse.json() as Record<string, unknown>;
    expect(readyJson.shuttingDown).toBe(false);

    ready = true;
    const readyResponse2 = await fetch(`${baseUrl}/readyz`);
    expect(readyResponse2.status).toBe(200);

    isShuttingDown = true;
    const readyResponse3 = await fetch(`${baseUrl}/readyz`);
    expect(readyResponse3.status).toBe(503);
    const readyJson3 = await readyResponse3.json() as Record<string, unknown>;
    expect(readyJson3.shuttingDown).toBe(true);
  });

  it('serves registration metadata from /.well-known/agent-registration.json', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-service-registration-'));
    const registrationPath = join(projectPath, '.well-known', 'agent-registration.json');
    mkdirSync(join(projectPath, '.well-known'), { recursive: true });
    writeFileSync(registrationPath, JSON.stringify({ name: 'registration-test' }));

    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'solana-devnet',
        serverType: 'svm',
      },
      orchestrator: {
        invokeTool: async () => ({ ok: true }),
      },
      registrationPath,
      projectPath,
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/.well-known/agent-registration.json`);
    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.name).toBe('registration-test');
  });

  it('handles paid tool endpoint and resolves x402 credential from header', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async (_toolName, _params, options) => {
          const credential = await options?.resolveCredential?.({
            protocol: 'x402',
            requirements: [],
            raw: {},
          });
          expect(credential?.protocol).toBe('x402');
          expect(credential?.payload).toEqual({ signature: '0xpaid' });
          return { settled: true };
        },
      },
      projectPath: process.cwd(),
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/paid/tool`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-payment': '{"payload":{"signature":"0xpaid"}}',
      },
      body: JSON.stringify({
        tool: 'premium-simulate',
        params: { tx: '0x', dryRun: true },
        payment: {
          amountUsd: 0.2,
          recipient: 'merchant.example',
          operationClass: 'high-risk',
        },
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.tool).toBe('premium-simulate');
  });

  it('returns 402 when payment credential header is missing for paid settlement', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async (_toolName, _params, options) => {
          await options?.resolveCredential?.({
            protocol: 'x402',
            requirements: [],
            raw: {},
          });
          return { settled: true };
        },
      },
      projectPath: process.cwd(),
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/paid/tool`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'premium-simulate',
      }),
    });

    expect(response.status).toBe(402);
    const json = await response.json() as Record<string, unknown>;
    expect(typeof json.error).toBe('string');
    expect(json.code).toBe('PAYMENT_REQUIRED');
  });

  it('returns 400 for invalid JSON request body on /paid/tool', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async () => ({ settled: true }),
      },
      projectPath: process.cwd(),
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/paid/tool`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{"tool":',
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe('INVALID_REQUEST_BODY');
    expect(typeof json.error).toBe('string');
  });

  it('returns 404 with explicit code when registration file is missing', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-service-registration-missing-'));
    const registrationPath = join(projectPath, '.well-known', 'agent-registration.json');

    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'solana-devnet',
        serverType: 'svm',
      },
      orchestrator: {
        invokeTool: async () => ({ ok: true }),
      },
      registrationPath,
      projectPath,
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/.well-known/agent-registration.json`);
    expect(response.status).toBe(404);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe('REGISTRATION_NOT_FOUND');
  });

  it('returns 402 when credential header JSON is malformed', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async (_toolName, _params, options) => {
          await options?.resolveCredential?.({
            protocol: 'x402',
            requirements: [],
            raw: {},
          });
          return { settled: true };
        },
      },
      projectPath: process.cwd(),
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/paid/tool`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-payment': '{"payload":',
      },
      body: JSON.stringify({
        tool: 'premium-simulate',
      }),
    });

    expect(response.status).toBe(402);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe('PAYMENT_REQUIRED');
  });

  it('returns 500 for non-payment orchestrator failures', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async () => {
          throw new Error('orchestrator unavailable');
        },
      },
      projectPath: process.cwd(),
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/paid/tool`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'premium-simulate',
      }),
    });

    expect(response.status).toBe(500);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe('INTERNAL_ERROR');
  });

  it('returns 404 for unsupported routes and methods', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async () => ({ ok: true }),
      },
      projectPath: process.cwd(),
    });

    const baseUrl = await startServer(server);
    const missingRoute = await fetch(`${baseUrl}/does-not-exist`);
    const wrongMethod = await fetch(`${baseUrl}/paid/tool`);

    expect(missingRoute.status).toBe(404);
    expect(wrongMethod.status).toBe(404);
    const missingRouteJson = await missingRoute.json() as Record<string, unknown>;
    const wrongMethodJson = await wrongMethod.json() as Record<string, unknown>;
    expect(missingRouteJson.code).toBe('NOT_FOUND');
    expect(wrongMethodJson.code).toBe('NOT_FOUND');
  });

  it('returns 413 when request body exceeds configured max size', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async () => ({ settled: true }),
      },
      projectPath: process.cwd(),
      maxBodyBytes: 64,
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/paid/tool`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'premium-simulate',
        params: {
          oversized: 'x'.repeat(2048),
        },
      }),
    });

    expect(response.status).toBe(413);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe('REQUEST_BODY_TOO_LARGE');
  });

  it('returns explicit code when tool field is missing', async () => {
    const server = createServiceBlueprintServer({
      config: {
        agentName: 'test-agent',
        network: 'sepolia',
        serverType: 'evm',
      },
      orchestrator: {
        invokeTool: async () => ({ settled: true }),
      },
      projectPath: process.cwd(),
    });

    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/paid/tool`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        params: { dryRun: true },
      }),
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe('TOOL_REQUIRED');
  });
});
