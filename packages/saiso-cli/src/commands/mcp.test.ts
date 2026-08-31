import { describe, expect, it } from 'bun:test';
import {
  getServerCategory,
  getServerCapabilities,
  createServerSpecificConfig,
  getChainIdForNetwork,
} from './mcp.js';

describe('getServerCategory', () => {
  it('classifies evm and svm as blockchain', () => {
    expect(getServerCategory('evm')).toBe('blockchain');
    expect(getServerCategory('svm')).toBe('blockchain');
  });

  it('classifies utility and custom types', () => {
    expect(getServerCategory('utility')).toBe('utility');
    expect(getServerCategory('custom')).toBe('custom');
  });
});

describe('getServerCapabilities', () => {
  it('returns SVM capabilities', () => {
    const caps = getServerCapabilities('svm');
    expect(caps).toContain('send_sol');
    expect(caps).toContain('query_balance');
    expect(caps).toContain('spl_tokens');
  });

  it('returns EVM capabilities', () => {
    const caps = getServerCapabilities('evm');
    expect(caps).toContain('send_tokens');
    expect(caps).toContain('interact_contract');
    expect(caps).toContain('eip1559');
  });

  it('returns utility and custom capabilities', () => {
    expect(getServerCapabilities('utility')).toContain('api_calls');
    expect(getServerCapabilities('custom')).toContain('custom_operations');
  });
});

describe('getChainIdForNetwork', () => {
  it('maps SVM networks to chain ids', () => {
    expect(getChainIdForNetwork('solana-mainnet', 'svm')).toBe(101);
    expect(getChainIdForNetwork('solana-testnet', 'svm')).toBe(102);
    expect(getChainIdForNetwork('solana-devnet', 'svm')).toBe(103);
  });

  it('maps EVM networks to chain ids', () => {
    expect(getChainIdForNetwork('mainnet', 'evm')).toBe(1);
    expect(getChainIdForNetwork('testnet', 'evm')).toBe(11155111);
    expect(getChainIdForNetwork('devnet', 'evm')).toBe(31337);
  });

  it('falls back to defaults for unknown networks', () => {
    expect(getChainIdForNetwork('unknown', 'svm')).toBe(103);
    expect(getChainIdForNetwork('unknown', 'evm')).toBe(11155111);
  });
});

describe('createServerSpecificConfig', () => {
  it('creates SVM config with commitment', () => {
    const config = createServerSpecificConfig('svm', 'solana-devnet', {});
    expect(config).toMatchObject({
      network: 'solana-devnet',
      chainId: 103,
      mode: 'npx',
      commitment: 'confirmed',
    });
  });

  it('creates EVM config', () => {
    const config = createServerSpecificConfig('evm', 'testnet', {});
    expect(config).toMatchObject({
      network: 'testnet',
      chainId: 11155111,
      mode: 'npx',
    });
  });

  it('creates custom config from options', () => {
    const config = createServerSpecificConfig('custom', 'testnet', {
      command: 'python',
      args: 'server.py,--port,8080',
    });
    expect(config).toMatchObject({
      command: 'python',
      args: ['server.py', '--port', '8080'],
      mode: 'binary',
    });
  });

  it('throws for unsupported server types', () => {
    expect(() => createServerSpecificConfig('unknown' as never, 'testnet', {})).toThrow(
      'Unsupported server type'
    );
  });
});