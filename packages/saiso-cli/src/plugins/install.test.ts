import { describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installPlugin } from './install.js';

describe('plugin install policy', () => {
  it('requires explicit file source declaration for path-like specs', async () => {
    await expect(
      installPlugin({
        spec: './local-plugin',
        nonInteractive: true,
      })
    ).rejects.toMatchObject({
      code: 'PLUGIN_SOURCE_POLICY_VIOLATION',
    });
  });

  it('rejects unverified file-source install in non-interactive mode without override', async () => {
    const pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-file-src-'));
    await writeFile(path.join(pluginRoot, 'saiso-plugin.json'), JSON.stringify({
      manifestVersion: 1,
      id: 'acme/local',
      version: '1.0.0',
      pluginApiVersion: '1.0.0',
      saisoRange: '>=1.0.0-rc1 <2.0.0',
      entry: 'entry.js',
      capabilities: ['cli'],
    }));
    await writeFile(path.join(pluginRoot, 'entry.js'), 'export const registerCommands = () => {};');

    await expect(
      installPlugin({
        spec: `file:${pluginRoot}`,
        sourceType: 'file',
        nonInteractive: true,
      })
    ).rejects.toMatchObject({
      code: 'PLUGIN_UNVERIFIED_SOURCE_REJECTED',
    });
  });
});
