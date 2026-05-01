import { describe, expect, it } from 'bun:test';
import { getRuntimeTransportCatalog } from './runtime-transport.js';

describe('runtime telegram transport catalog', () => {
  it('includes telegram with expected capability surface', () => {
    const catalog = getRuntimeTransportCatalog();
    const telegram = catalog.find((entry) => entry.transport === 'telegram');

    expect(telegram).toBeDefined();
    expect(telegram?.capabilities.supportsSync).toBe(true);
    expect(telegram?.capabilities.supportsButtons).toBe(true);
    expect(telegram?.capabilities.supportsCallbacks).toBe(true);
  });

  it('includes webhook as second transport extensibility proof', () => {
    const catalog = getRuntimeTransportCatalog();
    const webhook = catalog.find((entry) => entry.transport === 'webhook');

    expect(webhook).toBeDefined();
    expect(webhook?.capabilities.supportsButtons).toBe(false);
    expect(webhook?.capabilities.supportsMedia).toBe(false);
  });
});
