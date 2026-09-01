import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface LocalStrategyTestHarnessContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  strategy?: string;
  scenario?: {
    name?: string;
    steps?: Array<{
      action?: string;
      price?: number;
      amount?: number;
    }>;
  };
  payload?: Record<string, unknown>;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function runScenario(strategy: string, steps: Array<{ action?: string; price?: number; amount?: number }>) {
  let balance = 1000;
  let pnl = 0;
  const trades: Array<{ step: number; action: string; price: number; amount: number; balance: number }> = [];

  steps.forEach((step, index) => {
    const action = step.action || 'hold';
    const price = Number(step.price ?? 0);
    const amount = Number(step.amount ?? 0);
    if (action === 'buy' && amount > 0) {
      balance -= amount * price;
      pnl -= amount * price;
    } else if (action === 'sell' && amount > 0) {
      balance += amount * price;
      pnl += amount * price;
    }
    trades.push({ step: index + 1, action, price, amount, balance });
  });

  return {
    strategy,
    initialBalance: 1000,
    finalBalance: balance,
    pnl,
    tradeCount: trades.length,
    trades,
  };
}

export const localStrategyTestHarnessAction: Action = {
  name: 'LOCAL_STRATEGY_TEST_HARNESS',
  similes: ['LOCAL_STRATEGY_TEST_HARNESS', 'STRATEGY_TEST', 'STRATEGY_HARNESS', 'BACKTEST'],
  description: 'Run deterministic strategy scenarios for local validation',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as LocalStrategyTestHarnessContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as LocalStrategyTestHarnessContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-strategy-' + Date.now().toString(36);
    const startedAt = Date.now();
    const strategy = content.strategy || readSetting(runtime, 'STRATEGY_NAME', 'default');
    const scenario = content.scenario || content.payload?.scenario || {};
    const steps = (scenario as { steps?: Array<{ action?: string; price?: number; amount?: number }> }).steps || [];
    const result = runScenario(strategy, steps);

    const response = {
      success: true,
      operation: 'local_strategy_test_harness',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        scenario: (scenario as { name?: string }).name || 'default',
        result,
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
        text: `[local_strategy_test_harness] strategy '${strategy}' completed with PnL ${result.pnl}`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};