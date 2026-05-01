import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { computeDirectoryContentSha256 } from './hash.js';

describe('plugin file source hash', () => {
  it('is deterministic regardless of traversal order', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-hash-'));
    await mkdir(path.join(root, 'b'), { recursive: true });
    await mkdir(path.join(root, 'a'), { recursive: true });
    await writeFile(path.join(root, 'b', 'two.txt'), '2');
    await writeFile(path.join(root, 'a', 'one.txt'), '1');

    const first = await computeDirectoryContentSha256(root);
    const second = await computeDirectoryContentSha256(root);

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('rejects symlinks in file-source roots', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'saiso-plugin-hash-link-'));
    const target = path.join(root, 'target.txt');
    await writeFile(target, 'x');
    await symlink(target, path.join(root, 'linked.txt'));

    await expect(computeDirectoryContentSha256(root)).rejects.toThrow('Symlink detected');
  });
});
