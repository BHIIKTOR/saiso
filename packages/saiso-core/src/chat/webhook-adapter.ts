import { ChatTransportError } from './errors.js';
import type { ChatOutboundMessage, ChatTransportAdapter, NormalizedChatMessage } from './types.js';

export interface WebhookTransportOptions {
  transportId?: string;
  post: (payload: {
    channelId: string;
    text: string;
    threadId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ messageId: string }>;
}

export class WebhookTransportAdapter implements ChatTransportAdapter {
  readonly transport: string;

  readonly capabilities = {
    supportsSync: true,
    supportsStream: false,
    supportsWebsocket: false,
    supportsButtons: false,
    supportsMedia: false,
    supportsTopics: false,
    supportsCallbacks: false,
  };

  constructor(private readonly options: WebhookTransportOptions) {
    this.transport = options.transportId || 'webhook';
  }

  async normalizeInbound(payload: unknown): Promise<NormalizedChatMessage> {
    const body = payload as Record<string, unknown>;
    const channelId = body.channelId;
    const senderId = body.senderId;
    const messageId = body.messageId;
    const timestamp = body.timestamp;

    if (
      typeof channelId !== 'string'
      || typeof senderId !== 'string'
      || typeof messageId !== 'string'
      || typeof timestamp !== 'string'
    ) {
      throw new ChatTransportError(
        'invalid_webhook_payload',
        'Webhook payload must include channelId, senderId, messageId, timestamp',
        { transport: this.transport }
      );
    }

    return {
      transport: this.transport,
      channelId,
      senderId,
      messageId,
      timestamp,
      text: typeof body.text === 'string' ? body.text : undefined,
      attachments: Array.isArray(body.attachments) ? body.attachments as NormalizedChatMessage['attachments'] : [],
      raw: payload,
    };
  }

  async deliver(
    message: ChatOutboundMessage,
    _options: {
      mode: 'sync' | 'stream' | 'websocket';
      idempotencyKey?: string;
      threadId?: string;
    }
  ): Promise<{ messageId: string }> {
    try {
      const result = await this.options.post({
        channelId: message.channelId,
        text: message.text,
        threadId: message.threadId,
      });
      return {
        messageId: result.messageId,
      };
    } catch (error) {
      throw new ChatTransportError(
        'webhook_delivery_failed',
        error instanceof Error ? error.message : String(error),
        {
          transport: this.transport,
          retryable: true,
          cause: error,
        }
      );
    }
  }
}
