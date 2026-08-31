import { describe, expect, it } from 'bun:test';
import { isValidEnvironment } from './switch-env.js';

describe('isValidEnvironment', () => {
  it('accepts testnet, mainnet, and devnet', () => {
    expect(isValidEnvironment('testnet')).toBe(true);
    expect(isValidEnvironment('mainnet')).toBe(true);
    expect(isValidEnvironment('devnet')).toBe(true);
  });

  it('rejects invalid environments', () => {
    expect(isValidEnvironment('production')).toBe(false);
    expect(isValidEnvironment('')).toBe(false);
    expect(isValidEnvironment('Testnet')).toBe(false);
  });
});