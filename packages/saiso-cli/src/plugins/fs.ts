import { constants as fsConstants } from 'node:fs';
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export function getSaisoHomeDir(): string {
  return path.join(os.homedir(), '.saiso');
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  await writeFile(tempPath, payload, { encoding: 'utf-8', mode: 0o600 });

  const tempHandle = await open(tempPath, fsConstants.O_RDWR);
  try {
    await tempHandle.sync();
  } finally {
    await tempHandle.close();
  }

  await rename(tempPath, filePath);

  const dirHandle = await open(path.dirname(filePath), fsConstants.O_RDONLY);
  try {
    await dirHandle.sync();
  } finally {
    await dirHandle.close();
  }
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
