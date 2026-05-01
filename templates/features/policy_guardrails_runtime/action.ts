import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface PolicyGuardrailsRuntimeContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  amountUsd?: number;
  maxCostUsd?: number;
  recipient?: string;
  operationClass?: string;
  trustScore?: number;
  minTrustScore?: number;
  allowedRecipients?: string[];
  blockedRecipients?: string[];
  requireDryRun?: boolean;
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

function evaluatePolicy(runtime: IAgentRuntime, content: PolicyGuardrailsRuntimeContent) {
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
  const requireDryRun = content.requireDryRun ?? readSetting(runtime, 'POLICY_REQUIRE_DRY_RUN') === 'true';
  const dryRun = content.dryRun !== false;
  const violations: Array<{ code: string; message: string; severity: 'error' | 'warning' }> = [];

  if (amountUsd > maxCostUsd) {
    violations.push({
      code: 'max_cost_exceeded',
      message: `amountUsd ${amountUsd} exceeds maxCostUsd ${maxCostUsd}`,
      severity: 'error',
    });
  }
  if (trustScore < minTrustScore) {
    violations.push({
      code: 'trust_score_too_low',
      message: `trustScore ${trustScore} is below minTrustScore ${minTrustScore}`,
      severity: 'error',
    });
  }
  if (recipient && blockedRecipients.includes(recipient)) {
    violations.push({
      code: 'recipient_blocked',
      message: `recipient ${recipient} is blocked`,
      severity: 'error',
    });
  }
  if (recipient && allowedRecipients.length > 0 && !allowedRecipients.includes(recipient)) {
    violations.push({
      code: 'recipient_not_allowed',
      message: `recipient ${recipient} is not in the allow list`,
      severity: 'error',
    });
  }
  if (requireDryRun && !dryRun) {
    violations.push({
      code: 'dry_run_required',
      message: 'policy requires dryRun=true before live execution',
      severity: 'error',
    });
  }

  return {
    allowed: !violations.some((violation) => violation.severity === 'error'),
    dryRun,
    checks: {
      amountUsd,
      maxCostUsd,
      trustScore,
      minTrustScore,
      recipient: recipient || undefined,
      allowedRecipients,
      blockedRecipients,
      requireDryRun,
    },
    violations,
  };
}

export const policyGuardrailsRuntimeAction: Action = {
  name: 'POLICY_GUARDRAILS_RUNTIME',
  similes: ['POLICY_GUARDRAILS_RUNTIME', 'POLICY_CHECK', 'SPEND_GUARDRAILS', 'RECIPIENT_GUARDRAILS'],
  description: 'Enforce runtime guardrails for cost, trust, dry-run state, and recipients',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PolicyGuardrailsRuntimeContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PolicyGuardrailsRuntimeContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-policy-' + Date.now().toString(36);
    const startedAt = Date.now();
    const policy = evaluatePolicy(runtime, content);

    const response = {
      success: policy.allowed,
      operation: 'policy_guardrails_runtime',
      chainFamily,
      data: {
        allowed: policy.allowed,
        dryRun: policy.dryRun,
        operationClass: content.operationClass || 'generic',
        payload: content.payload || {},
        checks: policy.checks,
        violations: policy.violations,
      },
      meta: {
        requestId,
        traceId: requestId,
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: policy.allowed ? '[policy_guardrails_runtime] policy approved' : '[policy_guardrails_runtime] policy denied',
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};
