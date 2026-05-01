import { describe, expect, it } from 'bun:test';
import {
  ChatTransportError,
  ChatTransportRegistry,
  ChatTransportRouter,
  TelegramTransportAdapter,
  WebhookTransportAdapter,
  type ChatOutboundMessage,
  type ChatTransportAdapter,
} from '../src/chat/index.js';

class MockTransportAdapter implements ChatTransportAdapter {
  readonly transport: string;

  readonly capabilities;

  private readonly sendBehavior: {
    failTimes?: number;
  };

  private attempts = 0;

  constructor(input: {
    transport: string;
    supportsStream?: boolean;
    supportsWebsocket?: boolean;
    supportsButtons?: boolean;
    supportsMedia?: boolean;
    supportsTopics?: boolean;
    supportsCallbacks?: boolean;
    failTimes?: number;
  }) {
    this.transport = input.transport;
    this.capabilities = {
      supportsSync: true,
      supportsStream: input.supportsStream ?? false,
      supportsWebsocket: input.supportsWebsocket ?? false,
      supportsButtons: input.supportsButtons ?? false,
      supportsMedia: input.supportsMedia ?? false,
      supportsTopics: input.supportsTopics ?? false,
      supportsCallbacks: input.supportsCallbacks ?? false,
    };
    this.sendBehavior = {
      failTimes: input.failTimes,
    };
  }

  async normalizeInbound(payload: unknown) {
    return payload as Awaited<ReturnType<ChatTransportAdapter['normalizeInbound']>>;
  }

  async deliver(message: ChatOutboundMessage) {
    this.attempts += 1;
    if (this.sendBehavior.failTimes && this.attempts <= this.sendBehavior.failTimes) {
      throw new Error('transient failure');
    }
    return {
      messageId: `${this.transport}:${message.channelId}:${this.attempts}`,
    };
  }
}

describe('chat transport conformance', () => {
  it('negotiates response mode with deterministic fallback semantics', async () => {
    const registry = new ChatTransportRegistry();
    registry.register(new MockTransportAdapter({ transport: 'sync-only' }));
    registry.register(new MockTransportAdapter({ transport: 'stream-capable', supportsStream: true }));

    const streamExact = registry.resolveMode('stream-capable', 'stream');
    expect(streamExact.selected).toBe('stream');
    expect(streamExact.reason).toBe('exact');

    const streamFallback = registry.resolveMode('sync-only', 'stream');
    expect(streamFallback.selected).toBe('sync');
    expect(streamFallback.reason).toBe('fallback_stream_to_sync');

    const wsFallback = registry.resolveMode('sync-only', 'websocket');
    expect(wsFallback.selected).toBe('sync');
    expect(wsFallback.reason).toBe('fallback_websocket_to_sync');
  });

  it('validates required normalized envelope fields and marks duplicate inbound updates', async () => {
    const registry = new ChatTransportRegistry();
    registry.register(new MockTransportAdapter({ transport: 'ingress' }));

    const router = new ChatTransportRouter(registry);
    const validPayload = {
      transport: 'ingress',
      channelId: 'room-1',
      senderId: 'user-1',
      messageId: 'm-1',
      timestamp: new Date().toISOString(),
      attachments: [],
      text: 'hello',
    };

    const first = await router.ingest('ingress', validPayload);
    expect(first.duplicate).toBeUndefined();

    const second = await router.ingest('ingress', validPayload);
    expect(second.duplicate).toBe(true);

    await expect(router.ingest('ingress', {
      transport: 'ingress',
      channelId: '',
      senderId: 'user-1',
      messageId: 'm-2',
      timestamp: new Date().toISOString(),
      attachments: [],
    })).rejects.toMatchObject({
      code: 'invalid_envelope',
    });
  });

  it('enforces capability contracts before outbound send', async () => {
    const registry = new ChatTransportRegistry();
    registry.register(new MockTransportAdapter({ transport: 'no-rich' }));
    const router = new ChatTransportRouter(registry);

    await expect(router.send('no-rich', {
      channelId: 'room',
      text: 'buttons',
      buttons: [{ id: 'x', label: 'X' }],
    })).rejects.toMatchObject({ code: 'unsupported_capability' });

    await expect(router.send('no-rich', {
      channelId: 'room',
      text: 'media',
      attachments: [{ type: 'image', url: 'https://img.example' }],
    })).rejects.toMatchObject({ code: 'unsupported_capability' });
  });

  it('supports outbound retries and idempotent dedupe for sends', async () => {
    const registry = new ChatTransportRegistry();
    registry.register(new MockTransportAdapter({
      transport: 'retryable',
      failTimes: 1,
      supportsButtons: true,
      supportsTopics: true,
    }));
    const router = new ChatTransportRouter(registry);

    const message: ChatOutboundMessage = {
      channelId: 'ops-room',
      threadId: 'thread-1',
      text: 'payload',
      buttons: [{ id: 'approve', label: 'Approve' }],
    };

    const delivered = await router.send('retryable', message, {
      requestedMode: 'stream',
      retries: 2,
      idempotencyKey: 'dedupe-1',
    });

    expect(delivered.attemptCount).toBe(2);
    expect(delivered.modeUsed).toBe('sync');

    const duplicate = await router.send('retryable', message, {
      requestedMode: 'stream',
      retries: 2,
      idempotencyKey: 'dedupe-1',
    });

    expect(duplicate.messageId).toBe(delivered.messageId);
    expect(duplicate.attemptCount).toBe(delivered.attemptCount);
  });

  it('returns deterministic delivery_failed error after retries are exhausted', async () => {
    const registry = new ChatTransportRegistry();
    registry.register(new MockTransportAdapter({ transport: 'always-fail', failTimes: 99 }));
    const router = new ChatTransportRouter(registry);

    await expect(router.send('always-fail', {
      channelId: 'ops',
      text: 'boom',
    }, {
      retries: 1,
      requestedMode: 'sync',
    })).rejects.toMatchObject({
      code: 'delivery_failed',
      transport: 'always-fail',
    });
  });

  it('maps Telegram ingress payloads into canonical envelope fields', async () => {
    const adapter = new TelegramTransportAdapter({
      send: async () => ({ messageId: 'tg:out:1' }),
    });

    const normalizedMessage = await adapter.normalizeInbound({
      message: {
        message_id: 17,
        date: 1700000000,
        text: 'hello telegram',
        chat: { id: -100123 },
        from: { id: 9001 },
        message_thread_id: 77,
      },
    });

    expect(normalizedMessage.transport).toBe('telegram');
    expect(normalizedMessage.channelId).toBe('-100123');
    expect(normalizedMessage.threadId).toBe('77');
    expect(normalizedMessage.senderId).toBe('9001');
    expect(normalizedMessage.messageId).toBe('17');
    expect(Array.isArray(normalizedMessage.attachments)).toBe(true);

    const normalizedCallback = await adapter.normalizeInbound({
      callback_query: {
        id: 'cb-1',
        data: 'approve:true',
        from: { id: 8001 },
        message: {
          message_id: 20,
          date: 1700000001,
          chat: { id: -100123 },
          message_thread_id: 79,
        },
      },
    });

    expect(normalizedCallback.callback?.id).toBe('cb-1');
    expect(normalizedCallback.callback?.data).toBe('approve:true');
    expect(normalizedCallback.threadId).toBe('79');
  });

  it('enforces Telegram allowlist and safe-mode restrictions', async () => {
    const adapter = new TelegramTransportAdapter({
      send: async () => ({ messageId: 'tg:out:2' }),
      allowedChatIds: ['-100123'],
      safeMode: true,
    });

    await expect(adapter.normalizeInbound({
      message: {
        message_id: 30,
        date: 1700001000,
        chat: { id: -100999 },
        from: { id: 7001 },
        text: 'not allowed',
      },
    })).rejects.toMatchObject({
      code: 'telegram_chat_not_allowed',
    });

    await expect(adapter.normalizeInbound({
      message: {
        message_id: 31,
        date: 1700001001,
        chat: { id: -100123 },
        from: { id: 7001 },
        photo: [{ file_id: 'photo-1' }],
      },
    })).rejects.toMatchObject({
      code: 'telegram_safe_mode_reject_media',
    });

    await expect(adapter.deliver({
      channelId: '-100123',
      text: 'media outbound',
      attachments: [{ type: 'image', url: 'https://img.example' }],
    }, {
      mode: 'sync',
    })).rejects.toMatchObject({
      code: 'telegram_safe_mode_reject_media',
    });
  });

  it('falls back Telegram stream requests to sync mode deterministically', async () => {
    const registry = new ChatTransportRegistry();
    registry.register(new TelegramTransportAdapter({
      send: async () => ({ messageId: 'tg:out:3' }),
    }));
    const router = new ChatTransportRouter(registry);

    const result = await router.send('telegram', {
      channelId: '-100123',
      text: 'mode fallback',
    }, {
      requestedMode: 'stream',
      retries: 0,
    });

    expect(result.modeUsed).toBe('sync');
  });

  it('uses MarkdownV2 parse mode with escaped payload for Telegram delivery', async () => {
    let requestCapture: { text: string; parseMode?: string } | null = null;
    const adapter = new TelegramTransportAdapter({
      parseMode: 'MarkdownV2',
      send: async (request) => {
        requestCapture = { text: request.text, parseMode: request.parseMode };
        return { messageId: 'tg:out:4' };
      },
    });

    await adapter.deliver({
      channelId: '-100123',
      text: '*BTC* price (spot) [v1.0]!',
    }, {
      mode: 'sync',
    });

    expect(requestCapture).toBeTruthy();
    expect(requestCapture?.parseMode).toBe('MarkdownV2');
    expect(requestCapture?.text).toContain('\\(spot\\)');
    expect(requestCapture?.text).toContain('\\[');
    expect(requestCapture?.text).toContain('\\!');
  });

  it('defaults Telegram delivery parse mode to MarkdownV2 when not specified', async () => {
    let requestCapture: { parseMode?: string } | null = null;
    const adapter = new TelegramTransportAdapter({
      send: async (request) => {
        requestCapture = { parseMode: request.parseMode };
        return { messageId: 'tg:out:5' };
      },
    });

    await adapter.deliver({
      channelId: '-100123',
      text: 'plain text',
    }, {
      mode: 'sync',
    });

    expect(requestCapture?.parseMode).toBe('MarkdownV2');
  });

  it('chunks oversized Telegram payloads into sequenced messages', async () => {
    const requests: Array<{ text: string; parseMode?: string }> = [];
    const adapter = new TelegramTransportAdapter({
      maxMessageChars: 120,
      send: async (request) => {
        requests.push({ text: request.text, parseMode: request.parseMode });
        return { messageId: `tg:chunk:${requests.length}` };
      },
    });

    const longText = Array.from({ length: 40 }, (_, index) => `line-${index + 1}`).join('\n');
    const result = await adapter.deliver({
      channelId: '-100123',
      text: longText,
    }, {
      mode: 'sync',
    });

    expect(result.messageId).toBe('tg:chunk:1');
    expect(requests.length).toBeGreaterThan(1);
    expect(requests[0]?.text).toContain('\\[1/');
    expect(requests[0]?.parseMode).toBe('MarkdownV2');
    expect(requests.every((entry) => entry.text.length > 0)).toBe(true);
  });

  it('uses conservative default chunking when maxMessageChars is not configured', async () => {
    const requests: Array<{ text: string; parseMode?: string }> = [];
    const adapter = new TelegramTransportAdapter({
      send: async (request) => {
        requests.push({ text: request.text, parseMode: request.parseMode });
        return { messageId: `tg:default:${requests.length}` };
      },
    });

    const longText = Array.from({ length: 350 }, (_, index) => `feature-${index + 1}`).join(' ');
    await adapter.deliver({
      channelId: '-100123',
      text: longText,
    }, {
      mode: 'sync',
    });

    expect(requests.length).toBeGreaterThan(1);
  });

  it('re-chunks MarkdownV2 payloads when escaping expands output size', async () => {
    const requests: Array<{ text: string; parseMode?: string }> = [];
    const maxChars = 300;
    const adapter = new TelegramTransportAdapter({
      maxMessageChars: maxChars,
      send: async (request) => {
        requests.push({ text: request.text, parseMode: request.parseMode });
        return { messageId: `tg:escaped:${requests.length}` };
      },
    });

    const heavyMarkdown = Array.from({ length: 50 }, () => '*[[]]()_!').join(' ');
    await adapter.deliver({
      channelId: '-100123',
      text: heavyMarkdown,
    }, {
      mode: 'sync',
    });

    expect(requests.length).toBeGreaterThan(1);
    expect(requests.every((entry) => entry.text.length <= maxChars)).toBe(true);
  });

  it('falls back to plain text when Telegram rejects Markdown entity parsing', async () => {
    const requests: Array<{ text: string; parseMode?: string }> = [];
    const adapter = new TelegramTransportAdapter({
      maxMessageChars: 512,
      send: async (request) => {
        requests.push({ text: request.text, parseMode: request.parseMode });
        if (request.parseMode === 'MarkdownV2') {
          throw new Error("Telegram API HTTP 400: Bad Request: can't parse entities");
        }
        return { messageId: `tg:fallback:${requests.length}` };
      },
    });

    const result = await adapter.deliver({
      channelId: '-100123',
      text: '**snapshot**',
    }, {
      mode: 'sync',
    });

    expect(result.messageId).toContain('tg:fallback');
    expect(requests.some((entry) => entry.parseMode === undefined)).toBe(true);
  });

  it('prefixes rendered split chunks when Markdown escaping forces a second split pass', async () => {
    const requests: Array<{ text: string; parseMode?: string }> = [];
    const adapter = new TelegramTransportAdapter({
      maxMessageChars: 300,
      send: async (request) => {
        requests.push({ text: request.text, parseMode: request.parseMode });
        return { messageId: `tg:prefix:${requests.length}` };
      },
    });

    const escapeHeavy = Array.from({ length: 80 }, () => '*[[]]()_!').join(' ');
    await adapter.deliver({
      channelId: '-100123',
      text: escapeHeavy,
    }, {
      mode: 'sync',
    });

    expect(requests.length).toBeGreaterThan(1);
    expect(requests[0]?.text).toContain('\\[1/');
  });

  it('runs shared conformance against webhook adapter as a second transport surface', async () => {
    const postedPayloads: unknown[] = [];
    const webhook = new WebhookTransportAdapter({
      post: async (payload) => {
        postedPayloads.push(payload);
        return { messageId: 'wh:1' };
      },
    });

    const registry = new ChatTransportRegistry();
    registry.register(webhook);

    const router = new ChatTransportRouter(registry);
    const inbound = await router.ingest('webhook', {
      channelId: 'ops',
      senderId: 'svc',
      messageId: 'in-1',
      timestamp: new Date().toISOString(),
      text: 'status',
      attachments: [],
    });

    expect(inbound.transport).toBe('webhook');
    const delivered = await router.send('webhook', {
      channelId: 'ops',
      text: 'ack',
    });

    expect(delivered.messageId).toBe('wh:1');
    expect(postedPayloads.length).toBe(1);
  });

  it('exposes typed transport errors', () => {
    const error = new ChatTransportError('code', 'message', { transport: 'telegram', retryable: true });
    expect(error.code).toBe('code');
    expect(error.transport).toBe('telegram');
    expect(error.retryable).toBe(true);
  });
});
