import { describe, expect, it } from 'bun:test';
import { MultiChainEnvManager, type ServerConfig } from '../src/env/multi-chain-manager.js';

function makeServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    name: 'eth-defi',
    displayName: 'ETH DeFi',
    description: 'desc',
    type: 'evm',
    category: 'blockchain',
    autoStart: false,
    port: 3001,
    envPrefix: 'ETH_DEFI_',
    capabilities: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    serverConfig: {},
    ...overrides,
  };
}

describe('MultiChainEnvManager', () => {
  it('generates an EVM environment template', async () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    manager.registerServer(makeServerConfig());
    const template = await manager.generateEnvTemplate('eth-defi');

    expect(template).toContain('# Environment configuration for ETH DeFi');
    expect(template).toContain('ETH_DEFI_PORT=3001');
    expect(template).toContain('ETH_DEFI_HOST=localhost');
    expect(template).toContain('ETH_DEFI_NETWORK=sepolia');
    expect(template).toContain('ETH_DEFI_CHAIN_ID=11155111');
    expect(template).toContain('ETH_DEFI_RPC_URL=https://rpc.sepolia.org');
    expect(template).toContain('ETH_DEFI_PAYMENT_ENABLED=false');
    expect(template).toContain('ETH_DEFI_TRUST_ENABLED=false');
  });

  it('generates an SVM environment template with commitment', async () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    manager.registerServer(makeServerConfig({ name: 'svm-trading', type: 'svm', envPrefix: 'SVM_TRADING_' }));
    const template = await manager.generateEnvTemplate('svm-trading');

    expect(template).toContain('SVM_TRADING_NETWORK=solana-devnet');
    expect(template).toContain('SVM_TRADING_CHAIN_ID=103');
    expect(template).toContain('SVM_TRADING_RPC_URL=https://api.devnet.solana.com');
    expect(template).toContain('SVM_TRADING_SVM_COMMITMENT=confirmed');
  });

  it('throws when generating a template for an unknown server', async () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    await expect(manager.generateEnvTemplate('missing')).rejects.toThrow("Server 'missing' not found");
  });

  it('validates a server environment with required vars present', () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    manager.registerServer(makeServerConfig());
    process.env.ETH_DEFI_PORT = '3001';
    process.env.ETH_DEFI_HOST = 'localhost';
    const result = manager.validateServerEnvironment('eth-defi');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports missing required environment variables', () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    manager.registerServer(makeServerConfig());
    delete process.env.ETH_DEFI_PORT;
    delete process.env.ETH_DEFI_HOST;
    const result = manager.validateServerEnvironment('eth-defi');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ETH_DEFI_PORT'))).toBe(true);
    expect(result.errors.some(e => e.includes('ETH_DEFI_HOST'))).toBe(true);
  });

  it('returns invalid for unknown server validation', () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    const result = manager.validateServerEnvironment('missing');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Server 'missing' not found");
  });

  it('aggregates results across all servers', () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    manager.registerServer(makeServerConfig({ name: 'a', envPrefix: 'A_' }));
    manager.registerServer(makeServerConfig({ name: 'b', envPrefix: 'B_' }));
    delete process.env.A_PORT;
    delete process.env.B_PORT;
    const result = manager.validateAllServerEnvironments();
    expect(result.valid).toBe(false);
    expect(result.serverResults).toHaveProperty('a');
    expect(result.serverResults).toHaveProperty('b');
  });

  it('collects only prefixed environment variables', () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    manager.registerServer(makeServerConfig());
    process.env.ETH_DEFI_API_KEY = 'secret';
    process.env.UNRELATED_VAR = 'nope';
    const env = manager.getServerEnvironment('eth-defi');
    expect(env.ETH_DEFI_API_KEY).toBe('secret');
    expect(env.UNRELATED_VAR).toBeUndefined();
  });

  it('returns empty env for unknown server', () => {
    const manager = new MultiChainEnvManager('/tmp/project');
    expect(manager.getServerEnvironment('missing')).toEqual({});
  });
});