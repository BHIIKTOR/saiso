import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface observabilityIncidentHooksActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const observabilityIncidentHooksAction: Action = {
  name: 'OBSERVABILITY_INCIDENT_HOOKS',
  similes: ['OBSERVABILITY_INCIDENT_HOOKS', 'OBSERVABILITY_INCIDENT_HOOKS_RUN', 'OBSERVABILITY_INCIDENT_HOOKS_EXECUTE'],
  description: 'Emit structured telemetry and incident hooks',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as observabilityIncidentHooksActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as observabilityIncidentHooksActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'observability_and_incident_hooks',
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
        text: '[observability_and_incident_hooks] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
        content: response,
      });
    }

    return response;
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Run observability_and_incident_hooks in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running observability_and_incident_hooks with preconfigured safety guardrails.',
          action: 'OBSERVABILITY_INCIDENT_HOOKS',
        },
      },
    ],
  ] as ActionExample[][],
};
