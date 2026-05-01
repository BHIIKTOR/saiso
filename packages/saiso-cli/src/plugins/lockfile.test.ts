import { describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProjectLockfile, writeProjectLockfile } from './lockfile.js';

describe('plugin lockfile parsing', () => {
  it('creates empty v1 lockfile shape when file does not exist', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-lock-'));
    const lockfilePath = path.join(tempDir, 'plugins.lock.json');

    const lockfile = await readProjectLockfile(lockfilePath);
    expect(lockfile.lockfileVersion).toBe(1);
    expect(lockfile.plugins).toEqual([]);
  });

  it('rejects unknown top-level keys', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-lock-'));
    const lockfilePath = path.join(tempDir, 'plugins.lock.json');

    await writeFile(
      lockfilePath,
      JSON.stringify({
        lockfileVersion: 1,
        plugins: [],
        extra: true,
      })
    );

    await expect(readProjectLockfile(lockfilePath)).rejects.toMatchObject({
      code: 'PLUGIN_LOCKFILE_INVALID_JSON',
    });
  });

  it('rejects unsupported lockfile versions', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-lock-'));
    const lockfilePath = path.join(tempDir, 'plugins.lock.json');

    await writeFile(lockfilePath, JSON.stringify({ lockfileVersion: 99, plugins: [] }));

    await expect(readProjectLockfile(lockfilePath)).rejects.toMatchObject({
      code: 'PLUGIN_LOCKFILE_UNSUPPORTED_VERSION',
    });
  });

  it('writes and re-reads strict lockfile entries', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-lock-'));
    const lockfilePath = path.join(tempDir, 'plugins.lock.json');

    await writeProjectLockfile(lockfilePath, {
      lockfileVersion: 1,
      plugins: [
        {
          id: 'acme/payments',
          version: '1.2.3',
          manifestVersion: 1,
          pluginApiVersion: '1.0.0',
          saisoRange: '>=1.0.0-rc1',
          sourceType: 'npm',
          artifactKey: 'npm-abc',
          entry: 'dist/index.js',
          enabled: false,
          verification: 'verified',
          manifestSha256: 'a'.repeat(64),
          resolved: 'https://example.test/pkg.tgz',
          integrity: 'sha512-test',
        },
      ],
    });

    const lockfile = await readProjectLockfile(lockfilePath);
    expect(lockfile.plugins[0]?.id).toBe('acme/payments');
  });
});
