import { ChatTransportError } from './errors.js';
import { ChatTransportRegistry } from './registry.js';
import type {
  ChatDeliveryResult,
  ChatOutboundMessage,
  ChatSendOptions,
  NormalizedChatMessage,
} from './types.js';

const REQUIRED_ENVELOPE_FIELDS: Array<keyof NormalizedChatMessage> = [
  'transport',
  'channelId',
  'senderId',
  'messageId',
  'timestamp',
  'attachments',
];

export class ChatTransportRouter {
  private readonly inboundSeen = new Set<string>();

  private readonly outboundDeliveries = new Map<string, ChatDeliveryResult>();

  constructor(private readonly registry: ChatTransportRegistry) {}

  async ingest(transport: string, payload: unknown): Promise<NormalizedChatMessage> {
    const adapter = this.registry.get(transport);
    const normalized = await adapter.normalizeInbound(payload);

    const missing = REQUIRED_ENVELOPE_FIELDS.filter((field) => {
      const value = normalized[field];
      if (field === 'attachments') {
        return !Array.isArray(value);
      }
      return typeof value !== 'string' || value.trim().length === 0;
    });

    if (missing.length > 0) {
      throw new ChatTransportError(
        'invalid_envelope',
        `Normalized message is missing required field(s): ${missing.join(', ')}`,
        {
          transport,
          details: { missingFields: missing },
        }
      );
    }

    const inboundKey = `${normalized.transport}:${normalized.channelId}:${normalized.messageId}`;
    if (this.inboundSeen.has(inboundKey)) {
      return {
        ...normalized,
        duplicate: true,
      };
    }
    this.inboundSeen.add(inboundKey);
    return normalized;
  }

  async send(transport: string, message: ChatOutboundMessage, options: ChatSendOptions = {}): Promise<ChatDeliveryResult> {
    const adapter = this.registry.get(transport);
    const modeResolution = this.registry.resolveMode(transport, options.requestedMode ?? 'sync');

    assertCapabilities(transport, adapter.capabilities, message);

    const dedupeKey = options.idempotencyKey
      ? `${transport}:${message.channelId}:${options.idempotencyKey}`
      : undefined;

    if (dedupeKey) {
      const existing = this.outboundDeliveries.get(dedupeKey);
      if (existing) {
        return existing;
      }
    }

    const retries = Math.max(0, options.retries ?? 0);
    let attemptCount = 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      attemptCount = attempt + 1;
      try {
        const delivery = await adapter.deliver(message, {
          mode: modeResolution.selected,
          idempotencyKey: options.idempotencyKey,
          threadId: message.threadId,
        });

        const result: ChatDeliveryResult = {
          transport,
          modeUsed: modeResolution.selected,
          messageId: delivery.messageId,
          deliveredAt: new Date().toISOString(),
          attemptCount,
          idempotencyKey: options.idempotencyKey,
        };

        if (dedupeKey) {
          this.outboundDeliveries.set(dedupeKey, result);
        }

        return result;
      } catch (error) {
        lastError = error;
      }
    }

    throw new ChatTransportError(
      'delivery_failed',
      `Delivery failed after ${attemptCount} attempt(s)`,
      {
        transport,
        retryable: true,
        details: {
          attemptCount,
          requestedMode: options.requestedMode ?? 'sync',
          selectedMode: modeResolution.selected,
          reason: modeResolution.reason,
        },
        cause: lastError,
      }
    );
  }
}

function assertCapabilities(
  transport: string,
  capabilities: {
    supportsButtons: boolean;
    supportsMedia: boolean;
    supportsTopics: boolean;
    supportsCallbacks: boolean;
  },
  message: ChatOutboundMessage,
): void {
  if (message.buttons && message.buttons.length > 0 && !capabilities.supportsButtons) {
    throw new ChatTransportError('unsupported_capability', 'Transport does not support buttons', {
      transport,
      details: { capability: 'supportsButtons' },
    });
  }

  if (message.attachments && message.attachments.length > 0 && !capabilities.supportsMedia) {
    throw new ChatTransportError('unsupported_capability', 'Transport does not support media attachments', {
      transport,
      details: { capability: 'supportsMedia' },
    });
  }

  if (message.threadId && !capabilities.supportsTopics) {
    throw new ChatTransportError('unsupported_capability', 'Transport does not support thread/topic targeting', {
      transport,
      details: { capability: 'supportsTopics' },
    });
  }

  if (message.callbackContext && !capabilities.supportsCallbacks) {
    throw new ChatTransportError('unsupported_capability', 'Transport does not support callback context', {
      transport,
      details: { capability: 'supportsCallbacks' },
    });
  }
}
