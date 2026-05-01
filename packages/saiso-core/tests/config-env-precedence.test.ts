import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saisoConfig } from '../src/config/manager.js';

const trackedKeys = ['AGENT_NAME'] as const;
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

describe('config environment file precedence', () => {
  it('applies .env.<env>.local > .env.local > .env.<env> > .env', () => {
    delete process.env.AGENT_NAME;

    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-env-precedence-'));
    writeFileSync(join(projectPath, '.env'), 'AGENT_NAME=from-env\n');
    writeFileSync(join(projectPath, '.env.testnet'), 'AGENT_NAME=from-env-testnet\n');
    writeFileSync(join(projectPath, '.env.local'), 'AGENT_NAME=from-env-local\n');
    writeFileSync(join(projectPath, '.env.testnet.local'), 'AGENT_NAME=from-env-testnet-local\n');

    const config = saisoConfig.loadConfig('testnet', projectPath);
    expect(config.agentName).toBe('from-env-testnet-local');
  });

  it('does not override already-exported process env variables', () => {
    process.env.AGENT_NAME = 'from-process-env';

    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-env-precedence-process-'));
    writeFileSync(join(projectPath, '.env'), 'AGENT_NAME=from-env\n');
    writeFileSync(join(projectPath, '.env.testnet.local'), 'AGENT_NAME=from-env-testnet-local\n');

    const config = saisoConfig.loadConfig('testnet', projectPath);
    expect(config.agentName).toBe('from-process-env');
  });
});
