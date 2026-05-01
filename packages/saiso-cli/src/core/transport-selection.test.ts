import { describe, expect, it } from 'bun:test';
import { normalizeTransportSelection } from './transport.js';

describe('transport selection helpers', () => {
  it('defaults to telegram transport sync mode', () => {
    const selection = normalizeTransportSelection();
    expect(selection.transport).toBe('telegram');
    expect(selection.requestedMode).toBe('sync');
  });

  it('normalizes transport and mode values', () => {
    const selection = normalizeTransportSelection({
      transport: ' WEBHOOK ',
      mode: 'StReAm',
    });

    expect(selection).toEqual({
      transport: 'webhook',
      requestedMode: 'stream',
    });
  });

  it('rejects unsupported transport response modes', () => {
    expect(() => normalizeTransportSelection({ mode: 'invalid' })).toThrow('unsupported transport mode');
  });
});
