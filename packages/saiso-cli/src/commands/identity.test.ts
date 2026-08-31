import { describe, expect, it } from 'bun:test';
import {
  parseServiceFlag,
  parseOptionalBooleanOption,
  uniqueServices,
  topLevelDiff,
} from './identity.js';
import type { Erc8004Registration } from '@saiso/core';

describe('parseServiceFlag', () => {
  it('parses name=endpoint format', () => {
    expect(parseServiceFlag('mcp=https://example.com/mcp')).toEqual({
      name: 'mcp',
      endpoint: 'https://example.com/mcp',
    });
  });

  it('trims whitespace around name and endpoint', () => {
    expect(parseServiceFlag('  mcp  =  https://example.com/mcp  ')).toEqual({
      name: 'mcp',
      endpoint: 'https://example.com/mcp',
    });
  });

  it('throws on missing equals sign', () => {
    expect(() => parseServiceFlag('no-equals')).toThrow(/Expected format: name=https:\/\/endpoint/);
  });

  it('throws on empty name', () => {
    expect(() => parseServiceFlag('=https://example.com')).toThrow(/Invalid --service value/);
  });

  it('throws on empty endpoint', () => {
    expect(() => parseServiceFlag('mcp=')).toThrow(/Invalid --service value/);
  });
});

describe('parseOptionalBooleanOption', () => {
  it('returns undefined for missing value', () => {
    expect(parseOptionalBooleanOption(undefined, '--flag')).toBeUndefined();
  });

  it('parses true and false case-insensitively', () => {
    expect(parseOptionalBooleanOption('true', '--flag')).toBe(true);
    expect(parseOptionalBooleanOption('TRUE', '--flag')).toBe(true);
    expect(parseOptionalBooleanOption('false', '--flag')).toBe(false);
    expect(parseOptionalBooleanOption('False', '--flag')).toBe(false);
  });

  it('throws on invalid boolean strings', () => {
    expect(() => parseOptionalBooleanOption('yes', '--flag')).toThrow(/Expected true or false/);
  });

  it('throws on non-string values', () => {
    expect(() => parseOptionalBooleanOption(42, '--flag')).toThrow(/Expected true or false/);
  });
});

describe('uniqueServices', () => {
  it('deduplicates services by name and endpoint', () => {
    const services = [
      { name: 'mcp', endpoint: 'https://a.com/mcp' },
      { name: 'mcp', endpoint: 'https://a.com/mcp' },
      { name: 'mcp', endpoint: 'https://b.com/mcp' },
    ];
    expect(uniqueServices(services)).toHaveLength(2);
  });

  it('preserves order of first occurrence', () => {
    const services = [
      { name: 'a', endpoint: 'https://a.com' },
      { name: 'b', endpoint: 'https://b.com' },
      { name: 'a', endpoint: 'https://a.com' },
    ];
    expect(uniqueServices(services).map(s => s.name)).toEqual(['a', 'b']);
  });
});

describe('topLevelDiff', () => {
  const base: Erc8004Registration = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Agent',
    description: 'desc',
    image: 'https://example.com/a.png',
    services: [{ name: 'mcp', endpoint: 'https://example.com/mcp' }],
    active: true,
    registrations: [{ agentId: 1, agentRegistry: 'reg' }],
  };

  it('marks all keys as added when previous is null', () => {
    const diff = topLevelDiff(null, base);
    expect(diff.added).toContain('name');
    expect(diff.added).toContain('services');
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('reports no differences for identical registrations', () => {
    const diff = topLevelDiff(base, { ...base });
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('reports changed keys when values differ', () => {
    const diff = topLevelDiff(base, { ...base, name: 'Renamed' });
    expect(diff.changed).toContain('name');
  });

  it('reports removed keys', () => {
    const next = { ...base } as Erc8004Registration;
    delete (next as Record<string, unknown>).image;
    const diff = topLevelDiff(base, next);
    expect(diff.removed).toContain('image');
  });

  it('reports added keys', () => {
    const next = { ...base, x402Support: true } as Erc8004Registration;
    const diff = topLevelDiff(base, next);
    expect(diff.added).toContain('x402Support');
  });
});