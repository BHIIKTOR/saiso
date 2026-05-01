import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';

interface QuoteAndSwapContent {
  inputMint?: string;
  outputMint?: string;
  amount?: string;
  slippageBps?: number;
  walletAddress?: string;
  execute?: boolean;
  dryRun?: boolean;
  quoteUrl?: string;
  requestId?: string;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const body = await response.text();
  const parsed = body ? JSON.parse(body) as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(`Jupiter HTTP ${response.status}: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

export const quoteAndSwapAction: Action = {
  name: 'QUOTE_AND_SWAP',
  similes: ['QUOTE_AND_SWAP', 'JUPITER_QUOTE', 'SVM_SWAP'],
  description: 'Fetch Jupiter SVM swap quotes and optionally build a swap transaction',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as QuoteAndSwapContent;
    return Boolean(content.inputMint && content.outputMint && content.amount);
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as QuoteAndSwapContent;
    const startedAt = Date.now();
    const requestId = content.requestId || 'saiso-svm-swap-' + startedAt.toString(36);

    try {
      const baseUrl = (content.quoteUrl || readSetting(runtime, 'JUPITER_QUOTE_API_BASE', 'https://lite-api.jup.ag/swap/v1')).replace(/\/$/, '');
      const query = new URLSearchParams({
        inputMint: requireString(content.inputMint, 'inputMint'),
        outputMint: requireString(content.outputMint, 'outputMint'),
        amount: requireString(content.amount, 'amount'),
        slippageBps: String(content.slippageBps ?? 50),
      });
      const quoteUrl = `${baseUrl}/quote?${query.toString()}`;
      const quote = await fetchJson(quoteUrl);

      let swap: Record<string, unknown> | undefined;
      const shouldBuildSwap = content.execute === true || content.dryRun === false;
      if (shouldBuildSwap) {
        const walletAddress = content.walletAddress || readSetting(runtime, 'WALLET_ADDRESS');
        if (!walletAddress) {
          throw new Error('walletAddress or WALLET_ADDRESS is required to build a Jupiter swap transaction');
        }
        swap = await fetchJson(`${baseUrl}/swap`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey: walletAddress,
            dynamicComputeUnitLimit: true,
          }),
        });
      }

      const response = {
        success: true,
        operation: 'quote_and_swap',
        chainFamily: 'svm',
        data: {
          adapter: 'svm',
          provider: 'jupiter',
          executable: Boolean(swap),
          quote,
          swapTransaction: swap?.swapTransaction,
          swap,
        },
        meta: {
          requestId,
          quoteUrl,
          latencyMs: Date.now() - startedAt,
        },
      };
      if (callback) {
        callback({ text: '[quote_and_swap] SVM quote ready', content: response });
      }
      return response;
    } catch (error) {
      const response = {
        success: false,
        operation: 'quote_and_swap',
        chainFamily: 'svm',
        error: {
          code: 'quote_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        meta: {
          requestId,
          latencyMs: Date.now() - startedAt,
        },
      };
      if (callback) {
        callback({ text: '[quote_and_swap] SVM quote failed', content: response });
      }
      return response;
    }
  },
  examples: [],
};
