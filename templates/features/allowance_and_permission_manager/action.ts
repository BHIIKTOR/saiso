import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface AllowancePermissionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  operation?: 'check' | 'grant' | 'revoke' | 'list';
  token?: string;
  spender?: string;
  amount?: string;
  maxAllowanceUsd?: number;
  allowedTokens?: string[];
  blockedSpenders?: string[];
  payload?: Record<string, unknown>;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(runtime: IAgentRuntime, key: string, fallback: number): number {
  const value = runtime.getSetting(key);
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return fallback;
  }
  return typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
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

function evaluateAllowance(runtime: IAgentRuntime, content: AllowancePermissionContent) {
  const token = String(content.token ?? content.payload?.token ?? '').toLowerCase();
  const spender = String(content.spender ?? content.payload?.spender ?? '').toLowerCase();
  const rawAmount = content.amount !== undefined ? content.amount
    : content.payload?.amountUsd !== undefined ? content.payload.amountUsd : 0;
  const amountUsd = typeof rawAmount === 'number' || (typeof rawAmount === 'string' && rawAmount.trim())
    ? Number(rawAmount)
    : NaN;
  const maxAllowanceUsd = content.maxAllowanceUsd !== undefined ? content.maxAllowanceUsd : readNumber(runtime, 'ALLOWANCE_MAX_USD', 1000);
  const allowedTokens = [
    ...normalizeList(readSetting(runtime, 'ALLOWANCE_ALLOWED_TOKENS')),
    ...normalizeList(content.allowedTokens),
  ];
  const blockedSpenders = [
    ...normalizeList(readSetting(runtime, 'ALLOWANCE_BLOCKED_SPENDERS')),
    ...normalizeList(content.blockedSpenders),
  ];
  const violations: Array<{ code: string; message: string; severity: 'error' | 'warning' }> = [];

  if (!Number.isFinite(amountUsd) || amountUsd < 0) {
    violations.push({ code: 'invalid_amount', message: 'amount must be a finite, nonnegative USD value', severity: 'error' });
  }
  if (!Number.isFinite(maxAllowanceUsd) || maxAllowanceUsd < 0) {
    violations.push({ code: 'invalid_allowance_cap', message: 'maxAllowanceUsd must be a finite, nonnegative USD value', severity: 'error' });
  }
  if (amountUsd > maxAllowanceUsd) {
    violations.push({ code: 'allowance_exceeds_max', message: `allowance ${amountUsd} exceeds maxAllowanceUsd ${maxAllowanceUsd}`, severity: 'error' });
  }
  if (spender && blockedSpenders.includes(spender)) {
    violations.push({ code: 'spender_blocked', message: `spender ${spender} is blocked`, severity: 'error' });
  }
  if (token && allowedTokens.length > 0 && !allowedTokens.includes(token)) {
    violations.push({ code: 'token_not_allowed', message: `token ${token} is not in the allow list`, severity: 'error' });
  }

  return {
    allowed: !violations.some((violation) => violation.severity === 'error'),
    checks: { token: token || undefined, spender: spender || undefined, amountUsd, maxAllowanceUsd, allowedTokens, blockedSpenders },
    violations,
  };
}

export const allowancePermissionManagerAction: Action = {
  name: 'ALLOWANCE_AND_PERMISSION_MANAGER',
  similes: ['ALLOWANCE_AND_PERMISSION_MANAGER', 'ALLOWANCE_MANAGER', 'PERMISSION_MANAGER', 'TOKEN_APPROVAL'],
  description: 'Manage token approvals and permissions with safety guardrails',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as AllowancePermissionContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as AllowancePermissionContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-allowance-' + Date.now().toString(36);
    const startedAt = Date.now();
    const operation = content.operation || 'check';
    const policy = evaluateAllowance(runtime, content);
    const decision = policy.allowed ? 'approved' : 'blocked';

    const response = {
      success: policy.allowed,
      operation: 'allowance_and_permission_manager',
      chainFamily,
      data: {
        operation,
        decision,
        dryRun: content.dryRun !== false,
        policy,
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
        text: policy.allowed
          ? `[allowance_and_permission_manager] ${operation} approved`
          : `[allowance_and_permission_manager] ${operation} blocked`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};
