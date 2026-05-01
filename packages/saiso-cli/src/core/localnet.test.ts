import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  getDefaultEvmLocalnetScenarios,
  isLikelyMainnetNetwork,
  resolveEvmLocalnetScenarios,
  resolveLocalnetHookPlan,
} from './localnet.js';

describe('localnet helpers', () => {
  it('detects mainnet-like network names for safety gating', () => {
    expect(isLikelyMainnetNetwork('ethereum')).toBe(true);
    expect(isLikelyMainnetNetwork('polygon-mainnet')).toBe(true);
    expect(isLikelyMainnetNetwork('base')).toBe(true);
    expect(isLikelyMainnetNetwork('sepolia')).toBe(false);
    expect(isLikelyMainnetNetwork('solana-devnet')).toBe(false);
  });

  it('resolves localnet script hooks from package.json', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'saiso-localnet-hooks-'));
    writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
      name: 'localnet-test',
      scripts: {
        'localnet:setup': 'echo setup',
        'localnet:deploy': 'echo deploy',
        'localnet:test': 'echo test',
      },
    }), 'utf-8');

    const hooks = await resolveLocalnetHookPlan(projectRoot);
    expect(hooks.setupScript).toBe('localnet:setup');
    expect(hooks.deployScript).toBe('localnet:deploy');
    expect(hooks.testScript).toBe('localnet:test');
  });

  it('exposes deterministic default localnet scenario matrix', () => {
    const scenarios = getDefaultEvmLocalnetScenarios();
    expect(scenarios.length).toBe(6);
    expect(scenarios[0]?.id).toBe('safe-execution-pass');
    expect(scenarios[1]?.id).toBe('policy-denial-before-spend');
    expect(scenarios[5]?.id).toBe('receipt-and-trust-signal-update');
  });

  it('resolves requested localnet scenario ids and rejects unknown ids', () => {
    const selected = resolveEvmLocalnetScenarios([
      'slippage-breach-abort',
      'stale-oracle-data-block',
    ]);
    expect(selected.map((entry) => entry.id)).toEqual([
      'slippage-breach-abort',
      'stale-oracle-data-block',
    ]);

    expect(() => resolveEvmLocalnetScenarios(['not-real-scenario'])).toThrow('Unknown localnet scenario id');
  });
});
