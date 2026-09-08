import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface CrossChainIntentRouterContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  intent?: string;
  sourceChain?: string;
  destinationChain?: string;
  amountUsd?: number;
  maxCostUsd?: number;
  minTrustScore?: number;
  payload?: Record<string, unknown>;
}

function readNumber(runtime: IAgentRuntime, key: string, fallback: number): number {
  const value = runtime.getSetting(key);
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return fallback;
  }
  return typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
}

function buildRoutePlan(content: CrossChainIntentRouterContent) {
  const source = content.sourceChain || 'evm';
  const destination = content.destinationChain || 'svm';
  const intent = content.intent || 'transfer';
  const steps: Array<{ chain: string; action: string; status: 'pending' }> = [];

  if (source !== destination) {
    steps.push({ chain: source, action: `${intent}:prepare`, status: 'pending' });
    steps.push({ chain: 'bridge', action: 'bridge:lock-and-mint', status: 'pending' });
    steps.push({ chain: destination, action: `${intent}:settle`, status: 'pending' });
  } else {
    steps.push({ chain: source, action: `${intent}:execute`, status: 'pending' });
  }

  return { source, destination, intent, steps };
}

export const crossChainIntentRouterAction: Action = {
  name: 'CROSS_CHAIN_INTENT_ROUTER',
  similes: ['CROSS_CHAIN_INTENT_ROUTER', 'CROSS_CHAIN_ROUTER', 'INTENT_ROUTER', 'CROSS_CHAIN_INTENT'],
  description: 'Plan and execute intent paths across multiple chains',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as CrossChainIntentRouterContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as CrossChainIntentRouterContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-intent-' + Date.now().toString(36);
    const startedAt = Date.now();
    const amountUsd = Number(content.amountUsd ?? content.payload?.amountUsd ?? 0);
    const maxCostUsd = content.maxCostUsd ?? readNumber(runtime, 'PAYMENT_MAX_PER_REQUEST_USD', 5);
    const minTrustScore = content.minTrustScore ?? readNumber(runtime, 'TRUST_MIN_SCORE', 0.65);
    const plan = buildRoutePlan(content);
    const violations: string[] = [];

    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
      violations.push('amountUsd must be finite and nonnegative');
    }
    if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0) {
      violations.push('maxCostUsd must be finite and nonnegative');
    }
    if (!Number.isFinite(minTrustScore) || minTrustScore < 0 || minTrustScore > 1) {
      violations.push('minTrustScore must be between 0 and 1');
    }
    if (amountUsd > maxCostUsd) {
      violations.push(`amountUsd ${amountUsd} exceeds maxCostUsd ${maxCostUsd}`);
    }
    const costWithinBudget = violations.length === 0;

    const response = {
      success: costWithinBudget,
      operation: 'cross_chain_intent_router',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        plan,
        policy: { amountUsd, maxCostUsd, minTrustScore },
        violations,
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
        text: costWithinBudget
          ? `[cross_chain_intent_router] route planned across ${plan.steps.length} steps`
          : `[cross_chain_intent_router] route blocked: ${violations.join('; ')}`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};
