import { afterEach, describe, it, expect, spyOn } from 'bun:test';
import { privyPolicyControlsAction } from './action';

const originalFetch = globalThis.fetch;
const settings: Record<string, string> = {
  PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 'secret',
  PRIVY_BASE_URL: 'https://privy.example/v1',
  PRIVY_RETRY_BASE_DELAY_MS: '0',
};
function invoke(content: Record<string, unknown>, config = settings) {
  return privyPolicyControlsAction.handler({ getSetting: (key: string) => config[key] } as any, { content } as any, undefined, {});
}

describe('privy_policy_controls HTTP contract', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('create-policy: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"create-policy","payload":{"version":"1.0","name":"Review","chain_type":"ethereum","rules":[]}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/policies');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"version":"1.0","name":"Review","chain_type":"ethereum","rules":[]});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('create-rule: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"create-rule","policyId":"policy_1","authorizationSignature":"fixture-auth-signature","payload":{"name":"Allow","method":"eth_sendTransaction","conditions":[],"action":"ALLOW"}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/policies/policy_1/rules');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"name":"Allow","method":"eth_sendTransaction","conditions":[],"action":"ALLOW"});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');
    expect(headers.get('privy-authorization-signature')).toBe('fixture-auth-signature');
  });

  it('create-condition-set: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"create-condition-set","payload":{"name":"Recipients"}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/condition_sets');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"name":"Recipients"});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('create-key-quorum: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"create-key-quorum","payload":{"display_name":"Review","authorization_threshold":1,"public_keys":["fixture-public-key"]}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/key_quorums');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"display_name":"Review","authorization_threshold":1,"public_keys":["fixture-public-key"]});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('preserves the response envelope and caller request controls', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    for (const chainFamily of ['evm', 'svm']) {
      const result = await invoke({ ...{"operation":"create-policy","payload":{"version":"1.0","name":"Review","chain_type":"ethereum","rules":[]}}, chainFamily, requestId: 'request_1', idempotencyKey: 'stable-key', expiresAt });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('privy_policy_controls');
      expect(result.chainFamily).toBe(chainFamily);
      expect(result.requestId).toBe('request_1');
      expect(result.meta.idempotencyKey).toBe('stable-key');
      expect(result.meta.expiresAt).toBe(expiresAt);
    }
  });

  it('rejects invalid operations and missing identifiers without an HTTP request', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    for (const content of [{"operation":"unknown"},{"operation":"list-policies"},{"operation":"create-rule"}]) {
      const result = await invoke(content);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('privy_policy_controls_failed');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports missing credentials and provider rejection without claiming success', async () => {
    const content = {"operation":"create-policy","payload":{"version":"1.0","name":"Review","chain_type":"ethereum","rules":[]}};
    expect((await invoke(content, {})).success).toBe(false);
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rejected', { status: 400 }));
    const result = await invoke(content);
    expect(result.success).toBe(false);
    expect(result.error.message).toContain('HTTP 400');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
