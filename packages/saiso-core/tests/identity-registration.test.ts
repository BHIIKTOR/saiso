import { describe, expect, it } from 'bun:test';
import { createErc8004Registration, validateErc8004Registration } from '../src/identity/erc8004-registration.js';
import type { Erc8004Registration } from '../src/identity/erc8004-types.js';

const validRegistration: Erc8004Registration = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'Test Agent',
  description: 'A test agent',
  image: 'https://example.com/agent.png',
  services: [{ name: 'mcp', endpoint: 'https://example.com/mcp' }],
  active: true,
  registrations: [{ agentId: 1, agentRegistry: 'registry.example' }],
};

describe('createErc8004Registration', () => {
  it('injects the registration type', () => {
    const registration = createErc8004Registration({
      name: 'Agent',
      description: 'desc',
      image: 'https://example.com/a.png',
      services: [],
      active: true,
      registrations: [],
    });
    expect(registration.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
  });

  it('preserves all provided fields', () => {
    const registration = createErc8004Registration({
      name: 'Agent',
      description: 'desc',
      image: 'https://example.com/a.png',
      services: [{ name: 'mcp', endpoint: 'https://example.com/mcp' }],
      active: false,
      registrations: [{ agentId: 7, agentRegistry: 'reg' }],
    });
    expect(registration.name).toBe('Agent');
    expect(registration.active).toBe(false);
    expect(registration.registrations[0].agentId).toBe(7);
  });
});

describe('validateErc8004Registration', () => {
  it('accepts a valid registration', () => {
    const result = validateErc8004Registration(validRegistration);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing name', () => {
    const result = validateErc8004Registration({ ...validRegistration, name: '  ' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name is required');
  });

  it('rejects missing description', () => {
    const result = validateErc8004Registration({ ...validRegistration, description: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('description is required');
  });

  it('rejects missing image', () => {
    const result = validateErc8004Registration({ ...validRegistration, image: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('image is required');
  });

  it('rejects empty services array', () => {
    const result = validateErc8004Registration({ ...validRegistration, services: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('at least one service endpoint is required');
  });

  it('rejects empty registrations array', () => {
    const result = validateErc8004Registration({ ...validRegistration, registrations: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('at least one on-chain registration reference is required');
  });

  it('rejects invalid payment preferred protocol', () => {
    const result = validateErc8004Registration({
      ...validRegistration,
      paymentSupport: { preferred: 'bitcoin' as never },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('paymentSupport.preferred must be x402, mpp, or auto');
  });

  it('accepts valid payment preferred protocols', () => {
    for (const preferred of ['x402', 'mpp', 'auto'] as const) {
      const result = validateErc8004Registration({
        ...validRegistration,
        paymentSupport: { preferred },
      });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects signing metadata missing algorithm', () => {
    const result = validateErc8004Registration({
      ...validRegistration,
      signing: { algorithm: '', keyId: 'key-1' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('signing.algorithm is required when signing metadata is provided');
  });

  it('rejects signing metadata missing keyId', () => {
    const result = validateErc8004Registration({
      ...validRegistration,
      signing: { algorithm: 'ed25519', keyId: '' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('signing.keyId is required when signing metadata is provided');
  });

  it('rejects invalid signedAt timestamp', () => {
    const result = validateErc8004Registration({
      ...validRegistration,
      signing: { algorithm: 'ed25519', keyId: 'key-1', signedAt: 'not-a-date' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('signing.signedAt must be a valid ISO timestamp');
  });

  it('accepts valid signedAt timestamp', () => {
    const result = validateErc8004Registration({
      ...validRegistration,
      signing: { algorithm: 'ed25519', keyId: 'key-1', signedAt: '2026-01-01T00:00:00Z' },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid runtime serverType', () => {
    const result = validateErc8004Registration({
      ...validRegistration,
      runtime: { serverType: 'cosmos' as never },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('runtime.serverType must be evm or svm');
  });

  it('accepts evm and svm runtime serverTypes', () => {
    for (const serverType of ['evm', 'svm'] as const) {
      const result = validateErc8004Registration({ ...validRegistration, runtime: { serverType } });
      expect(result.valid).toBe(true);
    }
  });

  it('collects multiple errors at once', () => {
    const result = validateErc8004Registration({
      ...validRegistration,
      name: '',
      description: '',
      services: [],
      registrations: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});