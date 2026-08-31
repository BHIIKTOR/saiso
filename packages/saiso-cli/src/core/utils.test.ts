import { describe, expect, it } from 'bun:test';
import {
  isValidEnvironment,
  formatFileSize,
  withTimeout,
  retry,
  isValidPrivateKey,
  maskSensitive,
} from './utils.js';

describe('isValidEnvironment', () => {
  it('accepts the three supported environments', () => {
    expect(isValidEnvironment('testnet')).toBe(true);
    expect(isValidEnvironment('mainnet')).toBe(true);
    expect(isValidEnvironment('devnet')).toBe(true);
  });

  it('rejects invalid environments', () => {
    expect(isValidEnvironment('prod')).toBe(false);
    expect(isValidEnvironment('')).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes, KB, MB, GB', () => {
    expect(formatFileSize(512)).toBe('512 Bytes');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3 GB');
  });
});

describe('withTimeout', () => {
  it('resolves when the promise completes first', async () => {
    const result = await withTimeout(Promise.resolve('done'), 1000);
    expect(result).toBe('done');
  });

  it('rejects when the timeout fires first', async () => {
    const slow = new Promise<string>(() => {});
    await expect(withTimeout(slow, 10, 'too slow')).rejects.toThrow('too slow');
  });
});

describe('retry', () => {
  it('succeeds on the first attempt', async () => {
    const fn = () => Promise.resolve('ok');
    expect(await retry(fn, { delay: 0 })).toBe('ok');
  });

  it('retries until success', async () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return calls >= 3 ? Promise.resolve('recovered') : Promise.reject(new Error('flaky'));
    };
    expect(await retry(fn, { maxAttempts: 3, delay: 0 })).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('throws after exhausting attempts', async () => {
    const fn = () => Promise.reject(new Error('always fails'));
    await expect(retry(fn, { maxAttempts: 2, delay: 0 })).rejects.toThrow('always fails');
  });
});

describe('isValidPrivateKey', () => {
  it('accepts 64-char hex keys with and without 0x prefix', () => {
    expect(isValidPrivateKey('a'.repeat(64))).toBe(true);
    expect(isValidPrivateKey('0x' + 'a'.repeat(64))).toBe(true);
  });

  it('rejects invalid keys', () => {
    expect(isValidPrivateKey('short')).toBe(false);
    expect(isValidPrivateKey('z'.repeat(64))).toBe(false);
    expect(isValidPrivateKey('a'.repeat(63))).toBe(false);
  });
});

describe('maskSensitive', () => {
  it('masks short values entirely', () => {
    expect(maskSensitive('abc', 4)).toBe('***');
  });

  it('keeps visible start and end', () => {
    expect(maskSensitive('1234567890', 3)).toBe('123****890');
  });
});