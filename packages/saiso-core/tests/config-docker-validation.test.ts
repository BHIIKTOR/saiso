import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saisoConfig } from '../src/config/manager.js';
import { validateDockerRuntimeConfig } from '../src/config/validation.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  saisoConfig.clearCache();
});

describe('docker runtime config validation', () => {
  it('accepts well-formed docker config', () => {
    const result = validateDockerRuntimeConfig({
      image: 'ghcr.io/example/mcp:latest',
      pullPolicy: 'if-not-present',
      host: 'localhost',
      port: 3001,
      healthPath: '/health',
      startupTimeoutMs: 15000,
      extraEnvAllowlist: ['FOO_TOKEN'],
      extraEnv: { FOO_TOKEN: 'abc' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('rejects malformed docker config values', () => {
    const result = validateDockerRuntimeConfig({
      port: 70000,
      healthPath: 'health',
      pullPolicy: 'invalid' as 'always',
      startupTimeoutMs: 10,
      extraEnvAllowlist: ['bad-key'],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('port'))).toBe(true);
    expect(result.errors.some((error) => error.includes('healthPath'))).toBe(true);
    expect(result.errors.some((error) => error.includes('pullPolicy'))).toBe(true);
    expect(result.errors.some((error) => error.includes('extraEnvAllowlist'))).toBe(true);
  });
});

describe('config manager docker parsing', () => {
  it('populates docker defaults when MCP_SERVER_MODE=docker', () => {
    process.env.MCP_SERVER_MODE = 'docker';
    process.env.MCP_SERVER_TYPE = 'evm';
    process.env.SAISO_NETWORK = 'sepolia';
    process.env.CHAIN_ID = '11155111';
    process.env.RPC_URL = 'https://rpc.example';
    process.env.MCP_DOCKER_PULL_POLICY = 'never';
    process.env.MCP_DOCKER_HEALTH_PATH = '/ready';

    const projectRoot = mkdtempSync(path.join(tmpdir(), 'saiso-docker-config-'));
    const loaded = saisoConfig.loadConfig('testnet', projectRoot);
    expect(loaded.mcpServer.mode).toBe('docker');
    expect(loaded.mcpServer.docker?.image).toContain('evm-mcp-server');
    expect(loaded.mcpServer.docker?.pullPolicy).toBe('never');
    expect(loaded.mcpServer.docker?.healthPath).toBe('/ready');
  });
});
