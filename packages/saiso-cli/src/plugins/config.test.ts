import { describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SaisoPluginManifest } from '@saiso/plugin-sdk';
import { normalizePluginConfigSchema, readPluginConfig, validatePluginConfig } from './config.js';

const baseManifest: SaisoPluginManifest = {
  manifestVersion: 1,
  id: 'acme/config',
  version: '1.0.0',
  pluginApiVersion: '1.0.0',
  saisoRange: '>=1.0.0-rc1',
  entry: 'dist/index.js',
  capabilities: ['doctor'],
};

describe('plugin config validation', () => {
  it('injects additionalProperties=false when omitted at root', () => {
    const manifest: SaisoPluginManifest = {
      ...baseManifest,
      configSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
        },
      },
    };

    const schema = normalizePluginConfigSchema(manifest);
    expect(schema).toBeTruthy();
    expect((schema as Record<string, unknown>).additionalProperties).toBe(false);
  });

  it('rejects schema roots that are not object', () => {
    const manifest: SaisoPluginManifest = {
      ...baseManifest,
      configSchema: {
        type: 'array',
      },
    };

    expect(() => normalizePluginConfigSchema(manifest)).toThrow("root type must be 'object'");
  });

  it('rejects unknown keys when root additionalProperties defaults to false', () => {
    const manifest: SaisoPluginManifest = {
      ...baseManifest,
      configSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
        },
      },
    };

    expect(() => validatePluginConfig(manifest, { apiKey: 'ok', extra: true })).toThrow('config is invalid');
  });

  it('rejects malformed config JSON with deterministic code path', async () => {
    const manifest: SaisoPluginManifest = {
      ...baseManifest,
      configSchema: {
        type: 'object',
      },
    };

    const dir = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-config-'));
    const configPath = path.join(dir, 'plugin.json');
    await writeFile(configPath, '{oops');

    await expect(readPluginConfig(manifest, configPath)).rejects.toMatchObject({
      code: 'PLUGIN_CONFIG_FILE_INVALID',
    });
  });
});
