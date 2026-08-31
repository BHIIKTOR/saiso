import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  generateRandomHex,
  generateSecureId,
  sha256,
  md5,
  isValidPrivateKey,
  isValidSvmPrivateKey,
  isValidAddress,
  maskSensitive,
  generateDeterministicId,
  isValidChainId,
  formatWei,
  parseEther,
} from '../src/utils/crypto.js';
import {
  exists,
  ensureDir,
  copyFile,
  copyDir,
  readJson,
  writeJson,
  findProjectRoot,
  isSaisoProject,
  backupFile,
  cleanupBackups,
} from '../src/utils/files.js';
import { createLogger } from '../src/utils/logger.js';

describe('crypto utils', () => {
  it('generates random hex of requested length', () => {
    const hex = generateRandomHex(16);
    expect(hex).toHaveLength(32);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it('generates secure ids with alphanumeric charset', () => {
    const id = generateSecureId(20);
    expect(id).toHaveLength(20);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('hashes with sha256 deterministically', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
    expect(sha256('hello')).toHaveLength(64);
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('hashes with md5', () => {
    expect(md5('hello')).toHaveLength(32);
  });

  it('validates EVM private keys', () => {
    const valid = '0x' + 'a'.repeat(64);
    expect(isValidPrivateKey(valid)).toBe(true);
    expect(isValidPrivateKey('a'.repeat(64))).toBe(true);
    expect(isValidPrivateKey('0x' + 'a'.repeat(63))).toBe(false);
    expect(isValidPrivateKey('0x' + 'z'.repeat(64))).toBe(false);
    expect(isValidPrivateKey('short')).toBe(false);
  });

  it('validates SVM private keys in array, hex, and base58 forms', () => {
    expect(isValidSvmPrivateKey(JSON.stringify(Array(32).fill(1)))).toBe(true);
    expect(isValidSvmPrivateKey(JSON.stringify(Array(64).fill(1)))).toBe(true);
    expect(isValidSvmPrivateKey(JSON.stringify(Array(31).fill(1)))).toBe(false);
    expect(isValidSvmPrivateKey('0x' + 'a'.repeat(64))).toBe(true);
    expect(isValidSvmPrivateKey('0x' + 'a'.repeat(128))).toBe(true);
    expect(isValidSvmPrivateKey('0x' + 'a'.repeat(63))).toBe(false);
    expect(isValidSvmPrivateKey('1'.repeat(44))).toBe(true);
    expect(isValidSvmPrivateKey('0OIl')).toBe(false);
    expect(isValidSvmPrivateKey('')).toBe(false);
  });

  it('validates EVM addresses', () => {
    expect(isValidAddress('0x' + 'a'.repeat(40))).toBe(true);
    expect(isValidAddress('0x' + 'A'.repeat(40))).toBe(true);
    expect(isValidAddress('0x' + 'a'.repeat(39))).toBe(false);
    expect(isValidAddress('a'.repeat(40))).toBe(false);
  });

  it('masks sensitive values', () => {
    expect(maskSensitive('1234567890', 3)).toBe('123****890');
    expect(maskSensitive('short', 6)).toBe('*****');
  });

  it('generates deterministic ids', () => {
    expect(generateDeterministicId('abc')).toBe(generateDeterministicId('abc'));
    expect(generateDeterministicId('abc')).toHaveLength(16);
  });

  it('validates chain ids', () => {
    expect(isValidChainId(1)).toBe(true);
    expect(isValidChainId(0)).toBe(false);
    expect(isValidChainId(1.5)).toBe(false);
    expect(isValidChainId(0xFFFFFFFF + 1)).toBe(false);
  });

  it('formats wei to ether', () => {
    expect(formatWei('1000000000000000000')).toBe('1');
    expect(formatWei('1500000000000000000')).toBe('1.5');
    expect(formatWei('1')).toBe('0.000000000000000001');
  });

  it('parses ether to wei', () => {
    expect(parseEther('1')).toBe(1000000000000000000n);
    expect(parseEther('1.5')).toBe(1500000000000000000n);
    expect(parseEther('0.000000000000000001')).toBe(1n);
  });

  it('round-trips ether formatting', () => {
    expect(formatWei(parseEther('2.75'))).toBe('2.75');
  });
});

describe('files utils', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'saiso-files-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('checks file existence', async () => {
    const file = path.join(dir, 'a.txt');
    writeFileSync(file, 'x');
    expect(await exists(file)).toBe(true);
    expect(await exists(path.join(dir, 'missing.txt'))).toBe(false);
  });

  it('ensures directories exist', async () => {
    const nested = path.join(dir, 'a', 'b', 'c');
    await ensureDir(nested);
    expect(await exists(nested)).toBe(true);
  });

  it('copies files and creates destination dirs', async () => {
    const src = path.join(dir, 'src.txt');
    const dest = path.join(dir, 'nested', 'dest.txt');
    writeFileSync(src, 'content');
    await copyFile(src, dest);
    expect(await exists(dest)).toBe(true);
  });

  it('copies directories recursively', async () => {
    const src = path.join(dir, 'src-dir');
    mkdirSync(path.join(src, 'sub'), { recursive: true });
    writeFileSync(path.join(src, 'a.txt'), 'a');
    writeFileSync(path.join(src, 'sub', 'b.txt'), 'b');
    const dest = path.join(dir, 'dest-dir');
    await copyDir(src, dest);
    expect(await exists(path.join(dest, 'a.txt'))).toBe(true);
    expect(await exists(path.join(dest, 'sub', 'b.txt'))).toBe(true);
  });

  it('reads and writes JSON', async () => {
    const file = path.join(dir, 'data.json');
    await writeJson(file, { hello: 'world' });
    const data = await readJson<{ hello: string }>(file);
    expect(data.hello).toBe('world');
  });

  it('throws when reading invalid JSON', async () => {
    const file = path.join(dir, 'bad.json');
    writeFileSync(file, '{not json');
    await expect(readJson(file)).rejects.toThrow();
  });

  it('finds project root by marker', async () => {
    const nested = path.join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{}');
    expect(await findProjectRoot(nested, ['package.json'])).toBe(dir);
  });

  it('returns null when no marker found', async () => {
    const nested = path.join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(await findProjectRoot(nested, ['package.json'])).toBeNull();
  });

  it('detects SAISO projects', async () => {
    const project = path.join(dir, 'proj');
    mkdirSync(path.join(project, '.saiso'), { recursive: true });
    writeFileSync(path.join(project, '.saiso', 'config.json'), '{}');
    writeFileSync(path.join(project, 'package.json'), JSON.stringify({ dependencies: { '@saiso/core': '1.0.0' } }));
    expect(await isSaisoProject(project)).toBe(true);
  });

  it('rejects non-SAISO projects', async () => {
    const project = path.join(dir, 'proj');
    mkdirSync(project, { recursive: true });
    writeFileSync(path.join(project, 'package.json'), JSON.stringify({ dependencies: {} }));
    expect(await isSaisoProject(project)).toBe(false);
  });

  it('backs up files and cleans up old backups', async () => {
    const file = path.join(dir, 'config.json');
    writeFileSync(file, '{}');
    const backup = await backupFile(file);
    expect(await exists(backup)).toBe(true);
    await cleanupBackups(file, 5);
    expect(await exists(backup)).toBe(true);
  });

  it('throws when backing up a missing file', async () => {
    await expect(backupFile(path.join(dir, 'missing.json'))).rejects.toThrow('File does not exist');
  });
});

describe('logger utils', () => {
  it('creates a logger with a prefix', () => {
    const logger = createLogger({ prefix: 'test', timestamp: false });
    expect(logger).toBeDefined();
  });

  it('creates child loggers with combined prefixes', () => {
    const logger = createLogger({ prefix: 'parent', timestamp: false });
    const child = logger.child('child');
    expect(child).toBeDefined();
  });

  it('supports level changes', () => {
    const logger = createLogger({ level: 'debug', timestamp: false });
    logger.setLevel('error');
    logger.setPrefix('new');
    expect(logger).toBeDefined();
  });
});