import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface PrivyWebhookIngestContent {
  chainFamily?: 'evm' | 'svm';
  dryRun?: boolean;
  requestId?: string;
  signature?: string;
  event?: {
    type?: string;
    payload?: Record<string, unknown>;
  };
  payload?: Record<string, unknown>;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function verifySignature(secret: string, signature: string, body: string): boolean {
  if (!secret || !signature) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

function normalizeEventType(raw?: string): string {
  return String(raw || 'unknown').toLowerCase().replace(/\s+/g, '_');
}

export const privyWebhookIngestAction: Action = {
  name: 'PRIVY_WEBHOOK_INGEST',
  similes: ['PRIVY_WEBHOOK_INGEST', 'PRIVY_WEBHOOK', 'WEBHOOK_INGEST', 'PRIVY_EVENTS'],
  description: 'Verify webhook signatures and dispatch typed wallet, tx, and action events',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyWebhookIngestContent;
    return typeof content === 'object' && content !== null
      && (content.chainFamily === undefined || content.chainFamily === 'evm' || content.chainFamily === 'svm');
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PrivyWebhookIngestContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-webhook-' + startedAt.toString(36);
    const secret = readSetting(runtime, 'PRIVY_WEBHOOK_SECRET');
    const event = content.event || content.payload?.event || {};
    const eventType = normalizeEventType((event as { type?: string }).type);
    const body = JSON.stringify(content.payload || content.event || {});
    const signature = content.signature || '';
    const verified = verifySignature(secret, signature, body);

    const response = {
      success: verified,
      operation: 'privy_webhook_ingest',
      chainFamily,
      requestId,
      data: {
        dryRun: content.dryRun !== false,
        verified,
        event: { type: eventType, payload: (event as { payload?: Record<string, unknown> }).payload || {} },
        payload: content.payload || {},
      },
      meta: {
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: verified
          ? `[privy_webhook_ingest] verified ${eventType} event`
          : '[privy_webhook_ingest] signature verification failed',
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};