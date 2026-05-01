import { convert } from 'telegram-markdown-v2';

import { ChatTransportError } from './errors.js';
import type {
  ChatOutboundMessage,
  ChatTransportAdapter,
  NormalizedChatMessage,
} from './types.js';

export interface TelegramSendRequest {
  chatId: string;
  text: string;
  parseMode?: TelegramParseMode;
  threadId?: string;
  buttons?: Array<{ id: string; label: string; callbackData?: string; url?: string }>;
  attachments?: Array<{ type: string; url?: string }>;
}

export type TelegramParseMode = 'MarkdownV2' | 'Markdown' | 'HTML';

export interface TelegramSendResponse {
  messageId: string;
}

export interface TelegramAdapterOptions {
  send: (request: TelegramSendRequest) => Promise<TelegramSendResponse>;
  allowedChatIds?: string[];
  safeMode?: boolean;
  parseMode?: TelegramParseMode;
  maxMessageChars?: number;
}

type TelegramIncomingPayload = {
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: {
      id: number | string;
      type?: string;
    };
    from?: {
      id: number | string;
    };
    message_thread_id?: number;
    photo?: Array<{ file_id: string }>;
    document?: { file_id: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: {
      id: number | string;
    };
    message?: {
      message_id: number;
      date?: number;
      chat: {
        id: number | string;
      };
      message_thread_id?: number;
    };
  };
};

export class TelegramTransportAdapter implements ChatTransportAdapter {
  readonly transport = 'telegram';

  readonly capabilities = {
    supportsSync: true,
    supportsStream: false,
    supportsWebsocket: false,
    supportsButtons: true,
    supportsMedia: true,
    supportsTopics: true,
    supportsCallbacks: true,
  };

  constructor(private readonly options: TelegramAdapterOptions) {}

  async normalizeInbound(payload: unknown): Promise<NormalizedChatMessage> {
    const update = payload as TelegramIncomingPayload;

    if (update.message) {
      const channelId = String(update.message.chat.id);
      this.assertAllowedChat(channelId);
      const attachments = extractTelegramAttachments(update.message);
      if (this.options.safeMode && attachments.length > 0) {
        throw new ChatTransportError(
          'telegram_safe_mode_reject_media',
          'Telegram safe mode rejects inbound media messages',
          { transport: this.transport, details: { channelId } }
        );
      }
      return {
        transport: this.transport,
        channelId,
        threadId: update.message.message_thread_id ? String(update.message.message_thread_id) : undefined,
        senderId: String(update.message.from?.id ?? update.message.chat.id),
        messageId: String(update.message.message_id),
        timestamp: new Date(update.message.date * 1000).toISOString(),
        text: update.message.text,
        attachments,
        raw: payload,
      };
    }

    const callback = update.callback_query;
    if (callback && callback.message) {
      const callbackMessage = callback.message;
      const channelId = String(callbackMessage.chat.id);
      this.assertAllowedChat(channelId);
      if (this.options.safeMode && !callback.data) {
        throw new ChatTransportError(
          'telegram_safe_mode_reject_callback',
          'Telegram safe mode rejects empty callback payloads',
          { transport: this.transport, details: { channelId } }
        );
      }
      return {
        transport: this.transport,
        channelId,
        threadId: callbackMessage.message_thread_id ? String(callbackMessage.message_thread_id) : undefined,
        senderId: String(callback.from.id),
        messageId: `${callbackMessage.message_id}:${callback.id}`,
        timestamp: new Date((callbackMessage.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        text: callback.data,
        callback: {
          id: callback.id,
          data: callback.data ?? '',
        },
        attachments: [],
        raw: payload,
      };
    }

    throw new ChatTransportError(
      'invalid_telegram_payload',
      'Unsupported Telegram update payload shape',
      {
        transport: this.transport,
      }
    );
  }

  async deliver(
    message: ChatOutboundMessage,
    _options: {
      mode: 'sync' | 'stream' | 'websocket';
      idempotencyKey?: string;
      threadId?: string;
    }
  ): Promise<{ messageId: string }> {
    this.assertAllowedChat(message.channelId);
    if (this.options.safeMode && message.attachments && message.attachments.length > 0) {
      throw new ChatTransportError(
        'telegram_safe_mode_reject_media',
        'Telegram safe mode rejects outbound media attachments',
        { transport: this.transport, details: { channelId: message.channelId } }
      );
    }

    try {
      const parseMode = this.options.parseMode ?? 'MarkdownV2';
      const maxMessageChars = normalizeTelegramMaxMessageChars(this.options.maxMessageChars);
      const chunks = splitTelegramMessageText(message.text, maxMessageChars);
      let firstMessageId = '';

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const withPrefix = chunks.length > 1
          ? `[${index + 1}/${chunks.length}] ${chunk}`
          : chunk;
        const rendered = parseMode === 'MarkdownV2'
          ? escapeTelegramMarkdownV2(withPrefix)
          : withPrefix;
        const renderedChunks = splitRenderedTelegramText(rendered, maxMessageChars, parseMode);
        let deliveredByPlainFallback = false;

        for (let renderedIndex = 0; renderedIndex < renderedChunks.length; renderedIndex += 1) {
          const renderedChunk = renderedChunks[renderedIndex];
          const useRenderedPrefix = chunks.length === 1 && renderedChunks.length > 1;
          const renderedWithPrefix = useRenderedPrefix
            ? prefixRenderedChunk(renderedChunk, renderedIndex + 1, renderedChunks.length, parseMode)
            : renderedChunk;
          if (deliveredByPlainFallback) {
            break;
          }
          try {
            const response = await this.options.send({
              chatId: message.channelId,
              text: renderedWithPrefix,
              parseMode,
              threadId: message.threadId,
              buttons: message.buttons,
              attachments: message.attachments?.map((attachment) => ({
                type: attachment.type,
                url: attachment.url,
              })),
            });
            if (!firstMessageId) {
              firstMessageId = response.messageId;
            }
          } catch (error) {
            if (parseMode === 'MarkdownV2' && isMarkdownEntityError(error)) {
              const plainChunks = splitRenderedTelegramText(withPrefix, maxMessageChars);
              for (let plainIndex = 0; plainIndex < plainChunks.length; plainIndex += 1) {
                const plainChunk = plainChunks[plainIndex];
                const usePlainPrefix = chunks.length === 1 && plainChunks.length > 1;
                const plainWithPrefix = usePlainPrefix
                  ? prefixPlainChunk(plainChunk, plainIndex + 1, plainChunks.length)
                  : plainChunk;
                const response = await this.options.send({
                  chatId: message.channelId,
                  text: plainWithPrefix,
                  parseMode: undefined,
                  threadId: message.threadId,
                  buttons: message.buttons,
                  attachments: message.attachments?.map((attachment) => ({
                    type: attachment.type,
                    url: attachment.url,
                  })),
                });
                if (!firstMessageId) {
                  firstMessageId = response.messageId;
                }
              }
              deliveredByPlainFallback = true;
              continue;
            }
            throw error;
          }
        }
      }

      return {
        messageId: firstMessageId,
      };
    } catch (error) {
      throw new ChatTransportError(
        'telegram_delivery_failed',
        error instanceof Error ? error.message : String(error),
        {
          transport: this.transport,
          retryable: true,
          cause: error,
        }
      );
    }
  }

  private assertAllowedChat(channelId: string): void {
    if (!this.options.allowedChatIds || this.options.allowedChatIds.length === 0) {
      return;
    }

    if (!this.options.allowedChatIds.includes(channelId)) {
      throw new ChatTransportError(
        'telegram_chat_not_allowed',
        `Telegram chat '${channelId}' is not in allowlist`,
        { transport: this.transport, details: { channelId } }
      );
    }
  }
}

function escapeTelegramMarkdownV2(text: string): string {
  try {
    return convert(text, 'escape').trimEnd();
  } catch {
    // Defensive fallback for malformed markdown payloads.
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}

function normalizeTelegramMaxMessageChars(input: number | undefined): number {
  if (!Number.isFinite(input)) {
    // Use a conservative default for mobile-readable chunking; callers can override.
    return 1200;
  }
  const parsed = Math.floor(Number(input));
  if (parsed < 256) return 256;
  if (parsed > 4096) return 4096;
  return parsed;
}

function isMarkdownEntityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /parse entities|can\'t parse entities|entity/i.test(message);
}

function splitTelegramMessageText(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [''];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxChars) {
    const floor = Math.max(1, Math.floor(maxChars * 0.6));
    const window = remaining.slice(0, maxChars);
    const idxDoubleNewline = window.lastIndexOf('\n\n');
    const idxNewline = window.lastIndexOf('\n');
    const idxSentence = window.lastIndexOf('. ');
    const idxSpace = window.lastIndexOf(' ');
    const candidates = [idxDoubleNewline + 2, idxNewline + 1, idxSentence + 2, idxSpace + 1]
      .filter((index) => index > floor && index <= maxChars);
    const splitIndex = candidates.length > 0
      ? Math.max(...candidates)
      : maxChars;
    const chunk = remaining.slice(0, splitIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
      remaining = remaining.slice(splitIndex).trim();
      continue;
    }
    chunks.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }

  if (remaining.trim().length > 0) {
    chunks.push(remaining.trim());
  }
  return chunks.length > 0 ? chunks : [normalized];
}

function splitRenderedTelegramText(text: string, maxChars: number, parseMode?: TelegramParseMode): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const floor = Math.max(1, Math.floor(maxChars * 0.6));
    const window = remaining.slice(0, maxChars);
    const idxDoubleNewline = window.lastIndexOf('\n\n');
    const idxNewline = window.lastIndexOf('\n');
    const idxSentence = window.lastIndexOf('. ');
    const idxSpace = window.lastIndexOf(' ');
    const candidates = [idxDoubleNewline + 2, idxNewline + 1, idxSentence + 2, idxSpace + 1]
      .filter((index) => index > floor && index <= maxChars);
    let splitIndex = candidates.length > 0
      ? Math.max(...candidates)
      : maxChars;

    if (parseMode === 'MarkdownV2') {
      while (splitIndex > 1 && remaining[splitIndex - 1] === '\\') {
        splitIndex -= 1;
      }
    }

    const candidate = remaining.slice(0, splitIndex).trimEnd();
    if (candidate.length === 0) {
      const forced = remaining.slice(0, maxChars);
      chunks.push(forced);
      remaining = remaining.slice(maxChars);
      continue;
    }

    chunks.push(candidate);
    remaining = remaining.slice(splitIndex).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

function prefixRenderedChunk(
  chunk: string,
  index: number,
  total: number,
  parseMode: TelegramParseMode,
): string {
  if (total <= 1) return chunk;
  if (parseMode === 'MarkdownV2') {
    return `\\[${index}/${total}\\] ${chunk}`;
  }
  return `[${index}/${total}] ${chunk}`;
}

function prefixPlainChunk(chunk: string, index: number, total: number): string {
  if (total <= 1) return chunk;
  return `[${index}/${total}] ${chunk}`;
}

function extractTelegramAttachments(message: NonNullable<TelegramIncomingPayload['message']>) {
  const attachments: Array<{ type: 'image' | 'file'; id: string }> = [];
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    attachments.push({
      type: 'image',
      id: message.photo[message.photo.length - 1]!.file_id,
    });
  }
  if (message.document?.file_id) {
    attachments.push({
      type: 'file',
      id: message.document.file_id,
    });
  }
  return attachments;
}
