import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface PreflightRiskChecksContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  amountUsd?: number;
  maxCostUsd?: number;
  recipient?: string;
  trustScore?: number;
  minTrustScore?: number;
  allowedRecipients?: string[];
  blockedRecipients?: string[];
  simulation?: {
    success?: boolean;
    gasUsed?: string | number;
    error?: string;
    warnings?: string[];
  };
  simulationResult?: {
    success?: boolean;
    gasUsed?: string | number;
    error?: string;
    warnings?: string[];
  };
  payload?: Record<string, unknown>;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(runtime: IAgentRuntime, key: string, fallback: number): number {
  const value = Number(readSetting(runtime, key));
  return Number.isFinite(value) ? value : fallback;
}

function normalizeList(values?: string[] | string): string[] {
  if (Array.isArray(values)) {
    return values.map((value) => value.toLowerCase()).filter(Boolean);
  }
  if (typeof values === 'string') {
    return values.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function evaluatePolicy(runtime: IAgentRuntime, content: PreflightRiskChecksContent) {
  const amountUsd = Number(content.amountUsd ?? content.payload?.amountUsd ?? 0);
  const maxCostUsd = content.maxCostUsd ?? readNumber(runtime, 'PAYMENT_MAX_PER_REQUEST_USD', 5);
  const trustScore = content.trustScore ?? Number(content.payload?.trustScore ?? 1);
  const minTrustScore = content.minTrustScore ?? readNumber(runtime, 'TRUST_MIN_SCORE', 0.65);
  const recipient = String(content.recipient ?? content.payload?.recipient ?? '').toLowerCase();
  const allowedRecipients = [
    ...normalizeList(readSetting(runtime, 'PAYMENT_ALLOWED_RECIPIENTS')),
    ...normalizeList(content.allowedRecipients),
  ];
  const blockedRecipients = [
    ...normalizeList(readSetting(runtime, 'PAYMENT_BLOCKED_RECIPIENTS')),
    ...normalizeList(content.blockedRecipients),
  ];
  const violations: Array<{ code: string; message: string; severity: 'error' | 'warning' }> = [];

  if (amountUsd > maxCostUsd) {
    violations.push({ code: 'max_cost_exceeded', message: `amountUsd ${amountUsd} exceeds maxCostUsd ${maxCostUsd}`, severity: 'error' });
  }
  if (trustScore < minTrustScore) {
    violations.push({ code: 'trust_score_too_low', message: `trustScore ${trustScore} is below minTrustScore ${minTrustScore}`, severity: 'error' });
  }
  if (recipient && blockedRecipients.includes(recipient)) {
    violations.push({ code: 'recipient_blocked', message: `recipient ${recipient} is blocked`, severity: 'error' });
  }
  if (recipient && allowedRecipients.length > 0 && !allowedRecipients.includes(recipient)) {
    violations.push({ code: 'recipient_not_allowed', message: `recipient ${recipient} is not in the allow list`, severity: 'error' });
  }

  return {
    allowed: !violations.some((violation) => violation.severity === 'error'),
    checks: { amountUsd, maxCostUsd, trustScore, minTrustScore, recipient: recipient || undefined, allowedRecipients, blockedRecipients },
    violations,
  };
}

export const preflightRiskChecksAction: Action = {
  name: 'PREFLIGHT_RISK_CHECKS',
  similes: ['PREFLIGHT_RISK_CHECKS', 'PREFLIGHT_CHECK', 'SIMULATION_CHECK', 'POLICY_PREFLIGHT'],
  description: 'Run simulation and policy checks before execution',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PreflightRiskChecksContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PreflightRiskChecksContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-preflight-' + Date.now().toString(36);
    const startedAt = Date.now();
    const policy = evaluatePolicy(runtime, content);
    const simulation = content.simulation || content.simulationResult || {};
    const simulationOk = simulation.success !== false && !simulation.error;
    const warnings = [
      ...policy.violations.filter((violation) => violation.severity === 'warning').map((violation) => violation.message),
      ...(simulation.warnings || []),
    ];
    const approved = policy.allowed && simulationOk;
    const decision = approved ? 'approved' : 'blocked';

    const response = {
      success: approved,
      operation: 'preflight_risk_checks',
      chainFamily,
      data: {
        decision,
        approved,
        dryRun: content.dryRun !== false,
        policy,
        simulation: {
          provided: Boolean(content.simulation || content.simulationResult),
          success: simulationOk,
          gasUsed: simulation.gasUsed,
          error: simulation.error,
          warnings,
        },
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
        text: approved ? '[preflight_risk_checks] preflight approved' : '[preflight_risk_checks] preflight blocked',
        content: response,
      });
    }

    return response;
  },
  examples: [] as ActionExample[][],
};
