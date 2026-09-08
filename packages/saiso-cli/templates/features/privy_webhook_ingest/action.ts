import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface PrivyWebhookIngestContent {
  chainFamily?: 'evm' | 'svm';
  dryRun?: boolean;
  requestId?: string;
  rawBody?: string;
  headers?: Record<string, string>;
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

function verifySignature(secret: string, headers: Record<string, string>, body: string): boolean {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];
  if (!secret.startsWith('whsec_') || typeof id !== 'string' || !id || typeof timestamp !== 'string'
    || typeof signatures !== 'string' || !/^\d+$/.test(timestamp)) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > 300000) return false;

  const encodedSecret = secret.slice(6);
  const key = Buffer.from(encodedSecret, 'base64');
  if (!key.length || key.toString('base64').replace(/=+$/, '') !== encodedSecret.replace(/=+$/, '')) return false;
  // Svix signs the exact request bytes, including the delivery ID and timestamp.
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(' ').some((signature) => {
    if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
    const actual = Buffer.from(signature.slice(3), 'base64');
    return actual.length === expected.length && timingSafeEqual(expected, actual);
  });
}

export const privyWebhookIngestAction: Action = {
  name: 'PRIVY_WEBHOOK_INGEST',
  similes: ['PRIVY_WEBHOOK_INGEST', 'PRIVY_WEBHOOK', 'WEBHOOK_INGEST', 'PRIVY_EVENTS'],
  description: 'Verify Privy Svix webhook deliveries and return the authenticated event',
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
    let event: Record<string, unknown> | undefined;
    let failure: string | undefined;
    if (content.event !== undefined || content.payload !== undefined || content.signature !== undefined) {
      failure = 'Pass only rawBody and Svix headers; separate event, payload, and signature fields are not authenticated';
    } else if (typeof content.rawBody !== 'string' || !content.headers) {
      failure = 'rawBody and svix-id, svix-timestamp, svix-signature headers are required';
    } else if (!verifySignature(secret, content.headers, content.rawBody)) {
      failure = 'Invalid webhook signature, signing secret, or delivery timestamp';
    } else {
      try {
        const parsed: unknown = JSON.parse(content.rawBody);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('type' in parsed) || typeof parsed.type !== 'string') {
          failure = 'Authenticated webhook body must be an object with a string type';
        } else {
          event = parsed;
        }
      } catch {
        failure = 'Authenticated webhook body is not valid JSON';
      }
    }
    const verified = event !== undefined;

    const response = {
      success: verified,
      ...(failure ? { error: { code: 'privy_webhook_verification_failed', message: failure } } : {}),
      operation: 'privy_webhook_ingest',
      chainFamily,
      requestId,
      data: {
        dryRun: content.dryRun !== false,
        verified,
        ...(event ? { event } : {}),
      },
      meta: {
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: verified
          ? `[privy_webhook_ingest] verified ${event?.type} event`
          : '[privy_webhook_ingest] signature verification failed',
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};
