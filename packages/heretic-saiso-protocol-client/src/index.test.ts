import { describe, expect, it } from 'bun:test';
import { HERETIC_SAISO_ERROR_CODES, HereticSaisoError } from '../src/index.js';

describe('heretic-saiso-protocol-client', () => {
  it('exposes the canonical error code list', () => {
    expect(HERETIC_SAISO_ERROR_CODES).toContain('HERETIC_POLICY_DENIED');
    expect(HERETIC_SAISO_ERROR_CODES).toContain('HERETIC_DAEMON_UNREACHABLE');
    expect(HERETIC_SAISO_ERROR_CODES).toContain('HERETIC_PROTOCOL_ERROR');
  });

  it('constructs typed errors with code and details', () => {
    const error = new HereticSaisoError('HERETIC_POLICY_DENIED', 'Payment policy denied the request', {
      tool: 'premium-simulate',
    });
    expect(error.code).toBe('HERETIC_POLICY_DENIED');
    expect(error.message).toContain('Payment policy denied');
    expect(error.details).toEqual({ tool: 'premium-simulate' });
    expect(error).toBeInstanceOf(Error);
  });
});