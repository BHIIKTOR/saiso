import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saisoConfig } from '../src/config/manager.js';

const trackedKeys = [
  'SAISO_NETWORK',
  'NETWORK',
  'CHAIN_ID',
  'RPC_URL',
  'PRIVATE_KEY',
  'MCP_SERVER_TYPE',
] as const;

const envSnapshot = new Map<string, string | undefined>();
for (const key of trackedKeys) {
  envSnapshot.set(key, process.env[key]);
}

afterEach(() => {
  for (const key of trackedKeys) {
    const value = envSnapshot.get(key);
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
  saisoConfig.clearCache();
});

describe('config migration and server typing', () => {
  it('infers svm server type from solana network', () => {
    process.env.SAISO_NETWORK = 'solana-devnet';
    process.env.CHAIN_ID = '103';
    process.env.RPC_URL = 'https://api.devnet.solana.com';
    delete process.env.MCP_SERVER_TYPE;

    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-core-config-'));
    const config = saisoConfig.loadConfig('testnet', projectPath);

    expect(config.mcpServer.type).toBe('svm');
    expect(config.network).toBe('solana-devnet');
  });

  it('accepts SVM JSON-array secret keys during config validation', () => {
    process.env.SAISO_NETWORK = 'solana-devnet';
    process.env.CHAIN_ID = '103';
    process.env.RPC_URL = 'https://api.devnet.solana.com';
    process.env.PRIVATE_KEY = JSON.stringify(Array.from({ length: 64 }, (_, index) => index % 256));
    process.env.MCP_SERVER_TYPE = 'svm';

    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-core-svm-key-'));
    const config = saisoConfig.loadConfig('testnet', projectPath);
    const validation = saisoConfig.validateConfig(config);

    expect(validation.valid).toBe(true);
  });
});
