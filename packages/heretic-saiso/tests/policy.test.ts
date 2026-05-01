import { describe, expect, it } from 'bun:test';
import { resolveStrictMode } from '../src/policy.js';
import { getDefaultIntegrationState } from '../src/state.js';
import type { HereticIntegrationConfig } from '../src/types.js';

describe('policy strict mode resolution', () => {
  it('applies precedence cli > config > env > default', () => {
    const integration = getDefaultIntegrationState();

    const fromConfig = resolveStrictMode(integration, {
      env: { SAISO_HERETIC_POLICY_STRICT: 'true' } as NodeJS.ProcessEnv,
    });
    expect(fromConfig.strict).toBe(false);
    expect(fromConfig.source).toBe('config');

    const envFallbackIntegration = {
      ...integration,
      policy: {} as HereticIntegrationConfig['policy'],
    } as HereticIntegrationConfig;
    const fromEnv = resolveStrictMode(envFallbackIntegration, {
      env: { SAISO_HERETIC_POLICY_STRICT: 'true' } as NodeJS.ProcessEnv,
    });
    expect(fromEnv.strict).toBe(true);
    expect(fromEnv.source).toBe('env');

    const fromDefault = resolveStrictMode(envFallbackIntegration, { env: {} as NodeJS.ProcessEnv });
    expect(fromDefault.strict).toBe(false);
    expect(fromDefault.source).toBe('default');

    const fromCli = resolveStrictMode(integration, {
      cliStrict: true,
      env: { SAISO_HERETIC_POLICY_STRICT: 'false' } as NodeJS.ProcessEnv,
    });
    expect(fromCli.strict).toBe(true);
    expect(fromCli.source).toBe('cli');
  });
});
