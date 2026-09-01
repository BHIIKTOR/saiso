import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface ObservabilityIncidentHooksContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  signal?: {
    type?: 'metric' | 'trace' | 'incident';
    name?: string;
    severity?: 'info' | 'warning' | 'critical';
    value?: number;
    tags?: Record<string, string>;
  };
  payload?: Record<string, unknown>;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function classifySeverity(raw?: string): 'info' | 'warning' | 'critical' {
  const normalized = String(raw || 'info').toLowerCase();
  if (normalized === 'critical' || normalized === 'warning') {
    return normalized;
  }
  return 'info';
}

function buildSignal(signal: ObservabilityIncidentHooksContent['signal']) {
  const type = signal?.type || 'metric';
  const name = signal?.name || 'unnamed';
  const severity = classifySeverity(signal?.severity);
  const value = Number(signal?.value ?? 0);
  const tags = signal?.tags || {};
  const incident = severity === 'critical' || (type === 'incident' && severity !== 'info');
  return { type, name, severity, value, tags, incident };
}

export const observabilityIncidentHooksAction: Action = {
  name: 'OBSERVABILITY_AND_INCIDENT_HOOKS',
  similes: ['OBSERVABILITY_AND_INCIDENT_HOOKS', 'OBSERVABILITY', 'INCIDENT_HOOKS', 'METRICS_HOOKS'],
  description: 'Emit structured metrics, traces, and incident signals',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as ObservabilityIncidentHooksContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as ObservabilityIncidentHooksContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-obs-' + Date.now().toString(36);
    const startedAt = Date.now();
    const signal = buildSignal(content.signal || (content.payload?.signal as ObservabilityIncidentHooksContent['signal']));
    const hookUrl = readSetting(runtime, 'OBSERVABILITY_HOOK_URL');

    const response = {
      success: true,
      operation: 'observability_and_incident_hooks',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        signal,
        hookConfigured: Boolean(hookUrl),
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
        text: signal.incident
          ? `[observability_and_incident_hooks] incident signal '${signal.name}' at ${signal.severity}`
          : `[observability_and_incident_hooks] ${signal.type} '${signal.name}' emitted`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};