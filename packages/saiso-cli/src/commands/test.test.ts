import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverTestFiles, findTestFilesInDirectory, buildTestCommand } from './test.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'saiso-test-cmd-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('findTestFilesInDirectory', () => {
  it('finds .test.ts and .test.js files', () => {
    mkdirSync(path.join(dir, 'tests'), { recursive: true });
    writeFileSync(path.join(dir, 'tests', 'a.test.ts'), '');
    writeFileSync(path.join(dir, 'tests', 'b.test.js'), '');
    writeFileSync(path.join(dir, 'tests', 'not-a-test.ts'), '');
    const files = findTestFilesInDirectory(path.join(dir, 'tests'));
    expect(files).toHaveLength(2);
  });

  it('recurses into subdirectories when recursive', () => {
    mkdirSync(path.join(dir, 'tests', 'sub'), { recursive: true });
    writeFileSync(path.join(dir, 'tests', 'sub', 'deep.test.ts'), '');
    const files = findTestFilesInDirectory(path.join(dir, 'tests'), true);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('deep.test.ts');
  });

  it('does not recurse when recursive is false', () => {
    mkdirSync(path.join(dir, 'tests', 'sub'), { recursive: true });
    writeFileSync(path.join(dir, 'tests', 'sub', 'deep.test.ts'), '');
    const files = findTestFilesInDirectory(path.join(dir, 'tests'), false);
    expect(files).toHaveLength(0);
  });

  it('returns empty for missing directories', () => {
    expect(findTestFilesInDirectory(path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('discoverTestFiles', () => {
  it('discovers tests in tests/, src/tests/, and src/', () => {
    mkdirSync(path.join(dir, 'tests'), { recursive: true });
    mkdirSync(path.join(dir, 'src', 'tests'), { recursive: true });
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'tests', 'a.test.ts'), '');
    writeFileSync(path.join(dir, 'src', 'tests', 'b.test.ts'), '');
    writeFileSync(path.join(dir, 'src', 'c.test.ts'), '');
    const files = discoverTestFiles(dir);
    expect(files).toHaveLength(3);
  });

  it('discovers root-level test files', () => {
    writeFileSync(path.join(dir, 'root.test.ts'), '');
    const files = discoverTestFiles(dir);
    expect(files).toContain('root.test.ts');
  });

  it('deduplicates overlapping discoveries', () => {
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'dup.test.ts'), '');
    const files = discoverTestFiles(dir);
    expect(files.filter(f => f.includes('dup.test.ts'))).toHaveLength(1);
  });
});

describe('buildTestCommand', () => {
  const baseOptions = { env: 'testnet' };

  it('starts with the test subcommand', () => {
    const args = buildTestCommand(baseOptions, []);
    expect(args[0]).toBe('test');
  });

  it('adds watch and coverage flags', () => {
    const args = buildTestCommand({ ...baseOptions, watch: true, coverage: true }, []);
    expect(args).toContain('--watch');
    expect(args).toContain('--coverage');
  });

  it('adds grep filter', () => {
    const args = buildTestCommand({ ...baseOptions, filter: 'payments' }, []);
    expect(args).toContain('--grep');
    expect(args).toContain('payments');
  });

  it('adds test patterns when test files exist', () => {
    const args = buildTestCommand(baseOptions, ['tests/a.test.ts']);
    expect(args.some(a => a.includes('tests/**/*.test'))).toBe(true);
  });

  it('omits test patterns when no test files exist', () => {
    const args = buildTestCommand(baseOptions, []);
    expect(args.some(a => a.includes('*.test'))).toBe(false);
  });
});