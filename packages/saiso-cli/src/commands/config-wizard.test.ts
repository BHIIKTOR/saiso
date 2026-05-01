import { afterEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import {
  getWizardEnvFilePath,
  resolveWizardEnvironmentOverride,
  selectWizardEnvironment,
} from './config.js';

const originalWizardEnv = process.env.SAISO_WIZARD_ENV;

afterEach(() => {
  if (typeof originalWizardEnv === 'string') {
    process.env.SAISO_WIZARD_ENV = originalWizardEnv;
  } else {
    delete process.env.SAISO_WIZARD_ENV;
  }
});

describe('config wizard environment selection', () => {
  it('resolves SAISO_WIZARD_ENV override when valid', async () => {
    process.env.SAISO_WIZARD_ENV = 'mainnet';
    const selected = await selectWizardEnvironment('testnet');
    expect(selected).toBe('mainnet');
  });

  it('ignores invalid SAISO_WIZARD_ENV override values', () => {
    expect(resolveWizardEnvironmentOverride('invalid-env')).toBeUndefined();
  });

  it('maps selected environment to the generated env file path', () => {
    const projectRoot = '/tmp/saiso-wizard';
    const filePath = getWizardEnvFilePath(projectRoot, 'devnet');
    expect(filePath).toBe(path.join(projectRoot, '.env.devnet'));
  });
});
