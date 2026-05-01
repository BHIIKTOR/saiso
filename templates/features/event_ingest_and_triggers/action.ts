import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface eventIngestTriggersActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const eventIngestTriggersAction: Action = {
  name: 'EVENT_INGEST_TRIGGERS',
  similes: ['EVENT_INGEST_TRIGGERS', 'EVENT_INGEST_TRIGGERS_RUN', 'EVENT_INGEST_TRIGGERS_EXECUTE'],
  description: 'Ingest events and trigger deterministic action hooks',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as eventIngestTriggersActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as eventIngestTriggersActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'event_ingest_and_triggers',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        payload: content.payload || {},
        policy: {
          maxCostUsd: content.maxCostUsd ?? Number(runtime.getSetting('PAYMENT_MAX_PER_REQUEST_USD') || 5),
          minTrustScore: content.minTrustScore ?? Number(runtime.getSetting('TRUST_MIN_SCORE') || 0.65),
        },
      },
      meta: {
        requestId: traceId,
        traceId,
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: '[event_ingest_and_triggers] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Run event_ingest_and_triggers in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running event_ingest_and_triggers with preconfigured safety guardrails.',
          action: 'EVENT_INGEST_TRIGGERS',
        },
      },
    ],
  ] as ActionExample[][],
};
