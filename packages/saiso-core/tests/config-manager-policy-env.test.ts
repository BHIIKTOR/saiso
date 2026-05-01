import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saisoConfig } from '../src/config/manager.js';

const trackedKeys = [
  'PAYMENT_PREFERRED_PROTOCOL',
  'PAYMENT_MAX_PER_REQUEST_USD',
  'PAYMENT_DAILY_BUDGET_USD',
  'TRUST_MIN_SCORE',
  'TRUST_ROUTING_PROFILE',
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

describe('config manager payment/trust env parsing', () => {
  it('ignores malformed payment/trust env values instead of producing NaN/invalid enums', () => {
    process.env.PAYMENT_PREFERRED_PROTOCOL = 'invalid-protocol';
    process.env.PAYMENT_MAX_PER_REQUEST_USD = 'not-a-number';
    process.env.PAYMENT_DAILY_BUDGET_USD = '';
    process.env.TRUST_MIN_SCORE = 'not-a-number';
    process.env.TRUST_ROUTING_PROFILE = 'not-a-profile';

    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-core-config-policy-env-'));
    const config = saisoConfig.loadConfig('testnet', projectPath);

    expect(config.payment?.preferredProtocol).toBe('auto');
    expect(config.payment?.maxPerRequestUsd).toBeUndefined();
    expect(config.payment?.dailyBudgetUsd).toBeUndefined();
    expect(config.trust?.minTrustScore).toBeUndefined();
    expect(config.trust?.routingProfile).toBeUndefined();
  });

  it('enforces trust min score bounds at env parse time', () => {
    process.env.TRUST_MIN_SCORE = '1.5';

    const projectPath = mkdtempSync(join(tmpdir(), 'saiso-core-config-trust-bounds-'));
    const config = saisoConfig.loadConfig('testnet', projectPath);

    expect(config.trust?.minTrustScore).toBeUndefined();
  });
});
