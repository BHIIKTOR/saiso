import { createHash } from 'node:crypto';
import { readFile, readdir, stat, lstat } from 'node:fs/promises';
import path from 'node:path';
import { PluginError } from './errors.js';

interface CanonicalRecord {
  relativePath: string;
  modeToken: 'exec' | 'file';
  size: number;
  fileSha256: string;
}

function normalizePathForHash(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function compareRawBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

async function walkDirectory(rootDir: string, currentDir: string, out: string[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  entries.sort((a, b) => compareRawBytes(a.name, b.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const entryLstat = await lstat(absolutePath);
    if (entryLstat.isSymbolicLink()) {
      throw new PluginError(
        'PLUGIN_SOURCE_POLICY_VIOLATION',
        `Symlink detected in file-source plugin root: ${absolutePath}`,
        { phase: 'integrity' }
      );
    }

    if (entry.isDirectory()) {
      await walkDirectory(rootDir, absolutePath, out);
      continue;
    }

    if (entry.isFile()) {
      const rel = normalizePathForHash(path.relative(rootDir, absolutePath));
      out.push(rel);
    }
  }
}

export async function computeFileSha256(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function buildCanonicalRecord(rootDir: string, relativePath: string): Promise<CanonicalRecord> {
  const absolutePath = path.join(rootDir, relativePath);
  const [fileStat, fileSha256] = await Promise.all([
    stat(absolutePath),
    computeFileSha256(absolutePath),
  ]);

  const modeToken: 'exec' | 'file' = (fileStat.mode & 0o100) !== 0 ? 'exec' : 'file';

  return {
    relativePath,
    modeToken,
    size: fileStat.size,
    fileSha256,
  };
}

export async function computeDirectoryContentSha256(rootDir: string): Promise<string> {
  const paths: string[] = [];
  await walkDirectory(rootDir, rootDir, paths);
  paths.sort(compareRawBytes);

  const hash = createHash('sha256');
  for (const relPath of paths) {
    const record = await buildCanonicalRecord(rootDir, relPath);
    hash.update(record.relativePath);
    hash.update('\0');
    hash.update(record.modeToken);
    hash.update('\0');
    hash.update(String(record.size));
    hash.update('\0');
    hash.update(record.fileSha256);
    hash.update('\n');
  }

  return hash.digest('hex');
}
