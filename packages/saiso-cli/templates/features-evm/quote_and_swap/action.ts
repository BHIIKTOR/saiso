import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';

interface QuoteAndSwapContent {
  sellToken?: string;
  buyToken?: string;
  sellAmount?: string;
  takerAddress?: string;
  slippageBps?: number;
  execute?: boolean;
  dryRun?: boolean;
  quoteProvider?: '0x' | 'custom';
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

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers });
  const body = await response.text();
  const parsed = body ? JSON.parse(body) as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(`Quote provider HTTP ${response.status}: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function normalizeZeroExToken(token: string): string {
  return token.toUpperCase() === 'ETH'
    ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
    : token;
}

function isHostedZeroExUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'api.0x.org';
  } catch {
    return false;
  }
}

function authRequiredResponse(requestId: string, startedAt: number) {
  return {
    success: false,
    operation: 'quote_and_swap',
    chainFamily: 'evm',
    error: {
      code: 'quote_provider_auth_required',
      message: 'ZEROX_API_KEY is required for hosted 0x swap API',
    },
    meta: {
      requestId,
      provider: '0x',
      requiredEnv: ['ZEROX_API_KEY'],
      latencyMs: Date.now() - startedAt,
    },
  };
}

export const quoteAndSwapAction: Action = {
  name: 'QUOTE_AND_SWAP',
  similes: ['QUOTE_AND_SWAP', 'SWAP_QUOTE', 'TOKEN_SWAP', 'ROUTE_SWAP'],
  description: 'Fetch EVM swap quotes and return executable transaction requests without broadcasting by default',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as QuoteAndSwapContent;
    return Boolean(content.sellToken && content.buyToken && content.sellAmount);
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
    const requestId = content.requestId || 'saiso-evm-swap-' + startedAt.toString(36);

    try {
      const sellToken = requireString(content.sellToken, 'sellToken');
      const buyToken = requireString(content.buyToken, 'buyToken');
      const sellAmount = requireString(content.sellAmount, 'sellAmount');
      const chainId = Number(readSetting(runtime, 'CHAIN_ID', '1'));
      const baseUrl = content.quoteUrl
        || readSetting(runtime, 'ZEROX_SWAP_API_BASE', 'https://api.0x.org/swap/allowance-holder');
      const apiKey = readSetting(runtime, 'ZEROX_API_KEY');
      const provider = content.quoteProvider || '0x';
      if (provider !== 'custom' && isHostedZeroExUrl(baseUrl) && !apiKey) {
        const response = authRequiredResponse(requestId, startedAt);
        if (callback) {
          callback({ text: '[quote_and_swap] EVM quote provider auth required', content: response });
        }
        return response;
      }
      const endpoint = content.execute === true || content.dryRun === false ? 'quote' : 'price';
      const url = `${baseUrl.replace(/\/$/, '')}/${endpoint}?${toQuery({
        chainId,
        sellToken: normalizeZeroExToken(sellToken),
        buyToken: normalizeZeroExToken(buyToken),
        sellAmount,
        takerAddress: content.takerAddress || readSetting(runtime, 'WALLET_ADDRESS'),
        slippagePercentage: typeof content.slippageBps === 'number'
          ? Math.max(0, content.slippageBps / 10_000)
          : undefined,
      })}`;
      const headers: Record<string, string> = { '0x-version': 'v2' };
      if (apiKey) headers['0x-api-key'] = apiKey;
      const quote = await fetchJson(url, headers);
      const transaction = quote.transaction as Record<string, unknown> | undefined;

      const response = {
        success: true,
        operation: 'quote_and_swap',
        chainFamily: 'evm',
        data: {
          adapter: 'evm',
          provider,
          chainId,
          sellToken,
          buyToken,
          sellAmount,
          executable: endpoint === 'quote',
          transactionRequest: endpoint === 'quote'
            ? {
                to: transaction?.to ?? quote.to,
                data: transaction?.data ?? quote.data,
                value: transaction?.value ?? quote.value,
                gas: transaction?.gas ?? quote.gas,
                gasPrice: transaction?.gasPrice ?? quote.gasPrice,
              }
            : undefined,
          quote,
        },
        meta: {
          requestId,
          quoteUrl: url,
          latencyMs: Date.now() - startedAt,
        },
      };

      if (callback) {
        callback({ text: '[quote_and_swap] EVM quote ready', content: response });
      }
      return response;
    } catch (error) {
      const response = {
        success: false,
        operation: 'quote_and_swap',
        chainFamily: 'evm',
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
        callback({ text: '[quote_and_swap] EVM quote failed', content: response });
      }
      return response;
    }
  },
  examples: [],
};
