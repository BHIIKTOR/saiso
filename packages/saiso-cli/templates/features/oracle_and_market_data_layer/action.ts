import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface OracleMarketDataContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  feeds?: Array<{
    symbol?: string;
    price?: number;
    timestamp?: string;
    source?: string;
  }>;
  maxStalenessMs?: number;
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

function normalizeFeed(feed: { symbol?: string; price?: number; timestamp?: string; source?: string }, maxStalenessMs: number) {
  const symbol = String(feed.symbol || 'unknown').toUpperCase();
  const price = Number(feed.price ?? 0);
  const timestamp = feed.timestamp ? new Date(feed.timestamp).getTime() : Date.now();
  const ageMs = Date.now() - timestamp;
  const stale = ageMs > maxStalenessMs;
  return {
    symbol,
    price,
    source: feed.source || 'unknown',
    timestamp: new Date(timestamp).toISOString(),
    ageMs,
    stale,
  };
}

export const oracleMarketDataLayerAction: Action = {
  name: 'ORACLE_AND_MARKET_DATA_LAYER',
  similes: ['ORACLE_AND_MARKET_DATA_LAYER', 'ORACLE_LAYER', 'MARKET_DATA', 'PRICE_FEED'],
  description: 'Normalize prices and liquidity feeds with freshness checks',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as OracleMarketDataContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as OracleMarketDataContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-oracle-' + Date.now().toString(36);
    const startedAt = Date.now();
    const maxStalenessMs = content.maxStalenessMs ?? readNumber(runtime, 'ORACLE_MAX_STALENESS_MS', 300000);
    const feeds = ((content.feeds || content.payload?.feeds) as Array<{ symbol?: string; price?: number; timestamp?: string; source?: string }> | undefined || []).map((feed) => normalizeFeed(feed, maxStalenessMs));
    const staleFeeds = feeds.filter((feed) => feed.stale);

    const response = {
      success: staleFeeds.length === 0,
      operation: 'oracle_and_market_data_layer',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        feeds,
        staleCount: staleFeeds.length,
        maxStalenessMs,
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
        text: staleFeeds.length > 0
          ? `[oracle_and_market_data_layer] ${staleFeeds.length} stale feed(s) detected`
          : `[oracle_and_market_data_layer] ${feeds.length} feed(s) normalized`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};