import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import packageJson from '../package.json';

describe('CLI version', () => {
  it('matches package.json version', () => {
    const repoRoot = path.resolve(import.meta.dir, '..', '..', '..');
    const cliPath = path.join(import.meta.dir, 'cli.ts');

    const result = spawnSync(process.execPath, ['run', cliPath, '--version'], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr}`.trim();
    expect(output).toContain(packageJson.version);
  });
});
