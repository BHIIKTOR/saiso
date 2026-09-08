import { afterEach, describe, it, expect, spyOn } from 'bun:test';
import { privyAdvancedExecutionEvmAction } from './action';

const originalFetch = globalThis.fetch;
const settings: Record<string, string> = {
  PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 'secret',
  PRIVY_BASE_URL: 'https://privy.example/v1',
  PRIVY_RETRY_BASE_DELAY_MS: '0',
};
function invoke(content: Record<string, unknown>, config = settings) {
  return privyAdvancedExecutionEvmAction.handler({ getSetting: (key: string) => config[key] } as any, { content } as any, undefined, {});
}

describe('privy_advanced_execution_evm HTTP contract', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('auth-signature: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"auth-signature","walletId":"wallet_1","authorizationSignature":"fixture-auth-signature","payload":{"params":{"contract":"0xcontract","chain_id":1,"nonce":0}}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/wallets/wallet_1/rpc');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"method":"eth_sign7702Authorization","params":{"contract":"0xcontract","chain_id":1,"nonce":0}});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');
    expect(headers.get('privy-authorization-signature')).toBe('fixture-auth-signature');
  });

  it('user-operation: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"user-operation","walletId":"wallet_1","payload":{"params":{"user_operation":{"sender":"0xsender"},"chain_id":1,"contract":"0xentrypoint"}}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/wallets/wallet_1/rpc');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"method":"eth_signUserOperation","params":{"user_operation":{"sender":"0xsender"},"chain_id":1,"contract":"0xentrypoint"}});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('send-call: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"send-call","walletId":"wallet_1","network":"eip155:8453","payload":{"params":{"calls":[{"to":"0xrecipient","value":"0x1"}]}}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/wallets/wallet_1/rpc');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"method":"wallet_sendCalls","caip2":"eip155:8453","params":{"calls":[{"to":"0xrecipient","value":"0x1"}]}});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('preserves the response envelope and caller request controls', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    for (const chainFamily of ['evm']) {
      const result = await invoke({ ...{"operation":"auth-signature","walletId":"wallet_1","authorizationSignature":"fixture-auth-signature","payload":{"params":{"contract":"0xcontract","chain_id":1,"nonce":0}}}, chainFamily, requestId: 'request_1', idempotencyKey: 'stable-key', expiresAt });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('privy_advanced_execution_evm');
      expect(result.chainFamily).toBe(chainFamily);
      expect(result.requestId).toBe('request_1');
      expect(result.meta.idempotencyKey).toBe('stable-key');
      expect(result.meta.expiresAt).toBe(expiresAt);
    }
  });

  it('rejects invalid operations and missing identifiers without an HTTP request', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    for (const content of [{"operation":"unknown"},{"operation":"auth-signature"},{"operation":"send-call","walletId":"wallet_1"}]) {
      const result = await invoke(content);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('privy_advanced_execution_evm_failed');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports missing credentials and provider rejection without claiming success', async () => {
    const content = {"operation":"auth-signature","walletId":"wallet_1","authorizationSignature":"fixture-auth-signature","payload":{"params":{"contract":"0xcontract","chain_id":1,"nonce":0}}};
    expect((await invoke(content, {})).success).toBe(false);
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rejected', { status: 400 }));
    const result = await invoke(content);
    expect(result.success).toBe(false);
    expect(result.error.message).toContain('HTTP 400');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
