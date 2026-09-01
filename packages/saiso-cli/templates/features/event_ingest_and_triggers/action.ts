import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface EventIngestTriggersContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  event?: {
    type?: string;
    source?: string;
    payload?: Record<string, unknown>;
  };
  triggers?: Array<{
    id?: string;
    eventType?: string;
    action?: string;
  }>;
  payload?: Record<string, unknown>;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeEventType(raw?: string): string {
  return String(raw || 'unknown').toLowerCase().replace(/\s+/g, '_');
}

function matchTriggers(eventType: string, triggers: Array<{ id?: string; eventType?: string; action?: string }>) {
  const matched: Array<{ id: string; eventType: string; action: string }> = [];
  for (const trigger of triggers || []) {
    const triggerType = normalizeEventType(trigger.eventType);
    if (!triggerType || triggerType === eventType || triggerType === '*') {
      matched.push({
        id: trigger.id || `trigger-${matched.length + 1}`,
        eventType: triggerType || '*',
        action: trigger.action || 'notify',
      });
    }
  }
  return matched;
}

export const eventIngestTriggersAction: Action = {
  name: 'EVENT_INGEST_AND_TRIGGERS',
  similes: ['EVENT_INGEST_AND_TRIGGERS', 'EVENT_INGEST', 'EVENT_TRIGGERS', 'EVENT_HOOKS'],
  description: 'Ingest events and trigger deterministic action hooks',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as EventIngestTriggersContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as EventIngestTriggersContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-event-' + Date.now().toString(36);
    const startedAt = Date.now();
    const event = content.event || content.payload?.event || {};
    const eventType = normalizeEventType((event as { type?: string }).type);
    const source = String((event as { source?: string }).source || 'unknown');
    const configuredTriggers = readSetting(runtime, 'EVENT_TRIGGERS');
    const parsedTriggers = configuredTriggers
      ? configuredTriggers.split(';').map((entry) => {
          const [eventTypePart, action] = entry.split(':');
          return { eventType: eventTypePart, action };
        })
      : [];
    const triggers = content.triggers || parsedTriggers;
    const matched = matchTriggers(eventType, triggers);

    const response = {
      success: true,
      operation: 'event_ingest_and_triggers',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        event: { type: eventType, source, payload: (event as { payload?: Record<string, unknown> }).payload || {} },
        matchedTriggers: matched,
        triggerCount: matched.length,
        payload: content.payload || {},
      },
      meta: {
        requestId,
        traceId: requestId,
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: `[event_ingest_and_triggers] ingested ${eventType} from ${source}, matched ${matched.length} triggers`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};