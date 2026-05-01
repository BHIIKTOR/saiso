import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SaisoPluginLockEntryV1 } from '@saiso/plugin-sdk';

async function createPluginArtifact(
  cacheRoot: string,
  artifactKey: string,
  manifest: Record<string, unknown>,
  entryBody: string,
  sha256Hex: (value: string | Buffer) => string
): Promise<{ manifestSha: string }> {
  const pluginRoot = path.join(cacheRoot, artifactKey);
  await mkdir(pluginRoot, { recursive: true });

  const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(pluginRoot, 'saiso-plugin.json'), manifestRaw, 'utf-8');
  await writeFile(path.join(pluginRoot, 'entry.mjs'), entryBody, 'utf-8');

  return { manifestSha: sha256Hex(manifestRaw) };
}

describe('plugin runtime startup', () => {
  it('loads plugins in lockfile order and skips collisions in non-strict mode', async () => {
    const tempHome = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-runtime-home-'));
    const previousHome = process.env.HOME;
    process.env.HOME = tempHome;

    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-runtime-project-'));

    try {
      const { registerEnabledPluginsAtStartup } = await import('./runtime.js');
      const { sha256Hex } = await import('./fs.js');
      const { getGlobalPluginCacheRoot } = await import('./paths.js');
      const cacheRoot = getGlobalPluginCacheRoot();
      const oneResolved = 'https://example.test/one.tgz';
      const oneIntegrity = 'sha512-one';
      const twoResolved = 'https://example.test/two.tgz';
      const twoIntegrity = 'sha512-two';
      const oneArtifactKey = `npm-${sha256Hex(`${oneResolved}\0${oneIntegrity}`)}`;
      const twoArtifactKey = `npm-${sha256Hex(`${twoResolved}\0${twoIntegrity}`)}`;

      const pluginOneManifest = {
        manifestVersion: 1,
        id: 'acme/one',
        version: '1.0.0',
        pluginApiVersion: '1.0.0',
        saisoRange: '>=1.0.0-rc1 <2.0.0',
        entry: 'entry.mjs',
        capabilities: ['cli'],
      };
      const pluginTwoManifest = {
        manifestVersion: 1,
        id: 'acme/two',
        version: '1.0.0',
        pluginApiVersion: '1.0.0',
        saisoRange: '>=1.0.0-rc1 <2.0.0',
        entry: 'entry.mjs',
        capabilities: ['cli'],
      };

      const one = await createPluginArtifact(
        cacheRoot,
        oneArtifactKey,
        pluginOneManifest,
        `export function registerCommands(program) { program.command('alpha').description('alpha'); }`,
        sha256Hex
      );
      const two = await createPluginArtifact(
        cacheRoot,
        twoArtifactKey,
        pluginTwoManifest,
        `export function registerCommands(program) { program.command('status').description('shadow'); }`,
        sha256Hex
      );

      const lockEntries: SaisoPluginLockEntryV1[] = [
        {
          id: 'acme/one',
          version: '1.0.0',
          manifestVersion: 1,
          pluginApiVersion: '1.0.0',
          saisoRange: '>=1.0.0-rc1 <2.0.0',
          sourceType: 'npm',
          artifactKey: oneArtifactKey,
          entry: 'entry.mjs',
          enabled: true,
          verification: 'verified',
          manifestSha256: one.manifestSha,
          resolved: oneResolved,
          integrity: oneIntegrity,
        },
        {
          id: 'acme/two',
          version: '1.0.0',
          manifestVersion: 1,
          pluginApiVersion: '1.0.0',
          saisoRange: '>=1.0.0-rc1 <2.0.0',
          sourceType: 'npm',
          artifactKey: twoArtifactKey,
          entry: 'entry.mjs',
          enabled: true,
          verification: 'verified',
          manifestSha256: two.manifestSha,
          resolved: twoResolved,
          integrity: twoIntegrity,
        },
      ];

      const program = new Command();
      program.command('status').description('base status command');

      const result = await registerEnabledPluginsAtStartup(program, projectRoot, lockEntries, {
        strictMode: false,
      });

      expect(result.loaded).toEqual(['acme/one']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('PLUGIN_COLLISION');

      const topLevelNames = program.commands.map((cmd) => cmd.name());
      expect(topLevelNames).toContain('alpha');
      expect(topLevelNames.filter((name) => name === 'status')).toHaveLength(1);

      const reportPath = path.join(projectRoot, '.saiso', 'plugin-errors.json');
      const reportRaw = await readFile(reportPath, 'utf-8');
      const report = JSON.parse(reportRaw) as { schemaVersion: number; errors: Array<{ code: string }> };
      expect(report.schemaVersion).toBe(1);
      expect(report.errors[0]?.code).toBe('PLUGIN_COLLISION');
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('fails deterministically when artifact manifest hash is tampered', async () => {
    const tempHome = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-runtime-home-'));
    const previousHome = process.env.HOME;
    process.env.HOME = tempHome;

    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-runtime-project-'));

    try {
      const { registerEnabledPluginsAtStartup } = await import('./runtime.js');
      const { sha256Hex } = await import('./fs.js');
      const { getGlobalPluginCacheRoot } = await import('./paths.js');
      const cacheRoot = getGlobalPluginCacheRoot();
      const resolved = 'https://example.test/tampered.tgz';
      const integrity = 'sha512-tampered';
      const artifactKey = `npm-${sha256Hex(`${resolved}\0${integrity}`)}`;

      const manifest = {
        manifestVersion: 1,
        id: 'acme/tampered',
        version: '1.0.0',
        pluginApiVersion: '1.0.0',
        saisoRange: '>=1.0.0-rc1 <2.0.0',
        entry: 'entry.mjs',
        capabilities: ['cli'],
      };

      await createPluginArtifact(
        cacheRoot,
        artifactKey,
        manifest,
        `export function registerCommands(program) { program.command('tampered-cmd'); }`,
        () => 'f'.repeat(64)
      );

      const program = new Command();
      const result = await registerEnabledPluginsAtStartup(program, projectRoot, [{
        id: 'acme/tampered',
        version: '1.0.0',
        manifestVersion: 1,
        pluginApiVersion: '1.0.0',
        saisoRange: '>=1.0.0-rc1 <2.0.0',
        sourceType: 'npm',
        artifactKey,
        entry: 'entry.mjs',
        enabled: true,
        verification: 'verified',
        manifestSha256: '0'.repeat(64),
        resolved,
        integrity,
      }], { strictMode: false });

      expect(result.loaded).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('PLUGIN_INTEGRITY_MISMATCH');
    } finally {
      process.env.HOME = previousHome;
    }
  });
});
