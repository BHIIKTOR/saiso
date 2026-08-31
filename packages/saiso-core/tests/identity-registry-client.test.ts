import { describe, expect, it, mock, afterEach } from 'bun:test';
import { Erc8004RegistryClient } from '../src/identity/registry-client.js';
import type { Erc8004Registration } from '../src/identity/erc8004-types.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const registration: Erc8004Registration = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'Remote Agent',
  description: 'desc',
  image: 'https://example.com/a.png',
  services: [{ name: 'mcp', endpoint: 'https://example.com/mcp' }],
  active: true,
  registrations: [{ agentId: 42, agentRegistry: 'registry.example' }],
};

describe('Erc8004RegistryClient', () => {
  it('fetches an agent from the registry endpoint', async () => {
    const fetchMock = mock(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(registration),
    } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new Erc8004RegistryClient({ baseUrl: 'https://registry.example/api' });
    const result = await client.getAgent('registry.example', '42');

    expect(result.name).toBe('Remote Agent');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.example/api/agents/registry.example/42',
      { headers: undefined }
    );
  });

  it('URL-encodes registry and agent id', async () => {
    const fetchMock = mock(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(registration),
    } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new Erc8004RegistryClient({ baseUrl: 'https://registry.example/api' });
    await client.getAgent('my registry/1', 'a b');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.example/api/agents/my%20registry%2F1/a%20b',
      { headers: undefined }
    );
  });

  it('passes custom headers', async () => {
    const fetchMock = mock(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(registration),
    } as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new Erc8004RegistryClient({
      baseUrl: 'https://registry.example/api',
      headers: { Authorization: 'Bearer token' },
    });
    await client.getAgent('registry.example', '42');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.example/api/agents/registry.example/42',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: false,
      status: 404,
    } as Response)) as unknown as typeof fetch;

    const client = new Erc8004RegistryClient({ baseUrl: 'https://registry.example/api' });
    await expect(client.getAgent('registry.example', '42')).rejects.toThrow('Failed to fetch agent (404)');
  });

  it('propagates network errors', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;

    const client = new Erc8004RegistryClient({ baseUrl: 'https://registry.example/api' });
    await expect(client.getAgent('registry.example', '42')).rejects.toThrow('network down');
  });
});