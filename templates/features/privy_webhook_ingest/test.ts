import { afterEach, describe, it, expect, spyOn } from 'bun:test';
import { createHmac } from 'node:crypto';
import { privyWebhookIngestAction } from './action';

const secret = 'whsec_' + Buffer.from('local-webhook-signing-fixture').toString('base64');

function signed(rawBody = '{ "type": "wallet.created", "wallet_id": "wallet_1" }', timestamp = String(Math.floor(Date.now() / 1000))) {
  const id = 'msg_fixture';
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(id + '.' + timestamp + '.' + rawBody).digest('base64');
  return { rawBody, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + signature } };
}

function invoke(content: Record<string, unknown>, signingSecret = secret) {
  return privyWebhookIngestAction.handler({ getSetting: (key: string) => key === 'PRIVY_WEBHOOK_SECRET' ? signingSecret : undefined } as any, { content } as any, undefined, {});
}

describe('privy_webhook_ingest verification', () => {
  afterEach(() => { spyOn(Date, 'now').mockRestore(); });

  it('returns only the event authenticated from the exact raw body', async () => {
    const result = await invoke(signed());
    expect(result.success).toBe(true);
    expect(result.data.verified).toBe(true);
    expect(result.data.event).toEqual({ type: 'wallet.created', wallet_id: 'wallet_1' });
  });

  it('matches the published Svix manual verification vector', async () => {
    spyOn(Date, 'now').mockReturnValue(1731705121000);
    // Published vector uses event_type; it verifies but fails the Privy event schema.
    const result = await invoke({
      rawBody: '{"event_type":"ping","data":{"success":true}}',
      headers: { 'svix-id': 'msg_loFOjxBNrRLzqYUf', 'svix-timestamp': '1731705121', 'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=' },
    }, 'whsec_plJ3nmyCDGBKInavdOK15jsl');
    expect(result.error.message).toBe('Authenticated webhook body must be an object with a string type');
  });

  it('rejects the unsigned event substitution and legacy ambiguous input', async () => {
    for (const extra of [{ event: { type: 'transaction.confirmed' } }, { payload: { type: 'transaction.confirmed' } }, { signature: 'legacy' }]) {
      const result = await invoke({ ...signed(), ...extra });
      expect(result.success).toBe(false);
      expect(result.data.verified).toBe(false);
      expect(result.data.event).toBeUndefined();
    }
  });

  it('rejects tampered body, ID, timestamp, missing headers, and secret', async () => {
    const delivery = signed();
    for (const content of [
      { ...delivery, rawBody: delivery.rawBody + ' ' },
      { ...delivery, headers: { ...delivery.headers, 'svix-id': 'other' } },
      { ...delivery, headers: { ...delivery.headers, 'svix-timestamp': 'invalid' } },
      { ...delivery, headers: {} },
      { ...delivery, headers: { ...delivery.headers, 'svix-signature': 123 } },
    ]) {
      const result = await invoke(content);
      expect(result.success).toBe(false);
      expect(result.data.event).toBeUndefined();
    }
    expect((await invoke(delivery, '')).success).toBe(false);
  });

  it('rejects old and future deliveries', async () => {
    for (const offset of [-301, 301]) {
      const result = await invoke(signed(undefined, String(Math.floor(Date.now() / 1000) + offset)));
      expect(result.success).toBe(false);
    }
  });

  it('accepts a matching v1 signature during key rotation', async () => {
    const delivery = signed();
    delivery.headers['svix-signature'] = 'v2,unknown v1,' + Buffer.alloc(32).toString('base64') + ' ' + delivery.headers['svix-signature'];
    expect((await invoke(delivery)).success).toBe(true);
  });

  it('rejects invalid authenticated JSON without exposing an event', async () => {
    const result = await invoke(signed('{'));
    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Authenticated webhook body is not valid JSON');
    expect(result.data.event).toBeUndefined();
  });
});
