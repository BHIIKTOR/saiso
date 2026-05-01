export type ChatResponseMode = 'sync' | 'stream' | 'websocket';

export interface ChatAttachment {
  id?: string;
  type: 'image' | 'video' | 'audio' | 'file' | 'link';
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export interface ChatButton {
  id: string;
  label: string;
  callbackData?: string;
  url?: string;
}

export interface ChatCallbackPayload {
  id: string;
  data: string;
  context?: Record<string, unknown>;
}

export interface NormalizedChatMessage {
  transport: string;
  channelId: string;
  threadId?: string;
  senderId: string;
  messageId: string;
  timestamp: string;
  text?: string;
  attachments: ChatAttachment[];
  callback?: ChatCallbackPayload;
  raw?: unknown;
  duplicate?: boolean;
}

export interface ChatOutboundMessage {
  channelId: string;
  threadId?: string;
  text: string;
  buttons?: ChatButton[];
  attachments?: ChatAttachment[];
  callbackContext?: Record<string, unknown>;
}

export interface ChatTransportCapabilities {
  supportsSync: boolean;
  supportsStream: boolean;
  supportsWebsocket: boolean;
  supportsButtons: boolean;
  supportsMedia: boolean;
  supportsTopics: boolean;
  supportsCallbacks: boolean;
}

export interface ChatDeliveryResult {
  transport: string;
  modeUsed: ChatResponseMode;
  messageId: string;
  deliveredAt: string;
  attemptCount: number;
  idempotencyKey?: string;
}

export interface ChatTransportAdapter {
  transport: string;
  capabilities: ChatTransportCapabilities;
  normalizeInbound(payload: unknown): Promise<NormalizedChatMessage>;
  deliver(
    message: ChatOutboundMessage,
    options: {
      mode: ChatResponseMode;
      idempotencyKey?: string;
      threadId?: string;
    }
  ): Promise<{ messageId: string }>;
}

export interface ChatSendOptions {
  requestedMode?: ChatResponseMode;
  retries?: number;
  idempotencyKey?: string;
}

export interface ChatModeResolution {
  requested: ChatResponseMode;
  selected: ChatResponseMode;
  reason: 'exact' | 'fallback_stream_to_sync' | 'fallback_websocket_to_sync';
}
