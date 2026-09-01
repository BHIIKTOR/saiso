import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface PortfolioStatePnlContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  balances?: Array<{
    token?: string;
    amount?: number;
    priceUsd?: number;
    costBasisUsd?: number;
  }>;
  targets?: Record<string, number>;
  payload?: Record<string, unknown>;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function computePortfolio(balances: Array<{ token?: string; amount?: number; priceUsd?: number; costBasisUsd?: number }>) {
  const positions = balances.map((balance) => {
    const token = String(balance.token || 'unknown').toUpperCase();
    const amount = Number(balance.amount ?? 0);
    const priceUsd = Number(balance.priceUsd ?? 0);
    const costBasisUsd = Number(balance.costBasisUsd ?? 0);
    const marketValueUsd = amount * priceUsd;
    const pnlUsd = marketValueUsd - costBasisUsd;
    const pnlPercent = costBasisUsd > 0 ? (pnlUsd / costBasisUsd) * 100 : 0;
    return { token, amount, priceUsd, marketValueUsd, costBasisUsd, pnlUsd, pnlPercent };
  });

  const totalValueUsd = positions.reduce((sum, position) => sum + position.marketValueUsd, 0);
  const totalPnlUsd = positions.reduce((sum, position) => sum + position.pnlUsd, 0);
  const allocations = positions.map((position) => ({
    token: position.token,
    weight: totalValueUsd > 0 ? (position.marketValueUsd / totalValueUsd) * 100 : 0,
  }));

  return { positions, totalValueUsd, totalPnlUsd, allocations };
}

export const portfolioStatePnlAction: Action = {
  name: 'PORTFOLIO_STATE_AND_PNL',
  similes: ['PORTFOLIO_STATE_AND_PNL', 'PORTFOLIO_PNL', 'PORTFOLIO_STATE', 'PNL_TRACKER'],
  description: 'Persist balances, allocation drift, and PnL snapshots',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PortfolioStatePnlContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PortfolioStatePnlContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-portfolio-' + Date.now().toString(36);
    const startedAt = Date.now();
    const balances = (content.balances || content.payload?.balances) as Array<{ token?: string; amount?: number; priceUsd?: number; costBasisUsd?: number }> | undefined || [];
    const targets = content.targets || content.payload?.targets || {};
    const portfolio = computePortfolio(balances);

    const drift = Object.entries(targets).map(([token, targetWeight]) => {
      const actual = portfolio.allocations.find((allocation) => allocation.token === token)?.weight || 0;
      return { token, targetWeight, actualWeight: actual, driftPercent: actual - targetWeight };
    });

    const response = {
      success: true,
      operation: 'portfolio_state_and_pnl',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        portfolio,
        allocationDrift: drift,
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
        text: `[portfolio_state_and_pnl] total value $${portfolio.totalValueUsd.toFixed(2)}, PnL $${portfolio.totalPnlUsd.toFixed(2)}`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};