import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface QuoteAndSwapContent {
  chainFamily?: 'evm' | 'svm';
  sellToken?: string;
  buyToken?: string;
  sellAmount?: string;
  takerAddress?: string;
  inputMint?: string;
  outputMint?: string;
  amount?: string;
  walletAddress?: string;
  slippageBps?: number;
  execute?: boolean;
  dryRun?: boolean;
  quoteUrl?: string;
  requestId?: string;
  quoteProvider?: '0x' | 'custom';
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
    throw new Error(`quote provider HTTP ${response.status}: ${JSON.stringify(parsed)}`);
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

class QuoteProviderAuthRequiredError extends Error {
  code = 'quote_provider_auth_required';
  provider = '0x';
  requiredEnv = ['ZEROX_API_KEY'];

  constructor() {
    super('ZEROX_API_KEY is required for hosted 0x swap API');
  }
}

async function quoteEvm(runtime: IAgentRuntime, content: QuoteAndSwapContent) {
  const sellToken = requireString(content.sellToken, 'sellToken');
  const buyToken = requireString(content.buyToken, 'buyToken');
  const sellAmount = requireString(content.sellAmount, 'sellAmount');
  const chainId = Number(readSetting(runtime, 'CHAIN_ID', '1'));
  const baseUrl = (content.quoteUrl || readSetting(runtime, 'ZEROX_SWAP_API_BASE', 'https://api.0x.org/swap/allowance-holder')).replace(/\/$/, '');
  const apiKey = readSetting(runtime, 'ZEROX_API_KEY');
  const provider = content.quoteProvider || '0x';
  if (provider !== 'custom' && isHostedZeroExUrl(baseUrl) && !apiKey) {
    throw new QuoteProviderAuthRequiredError();
  }
  const endpoint = content.execute === true || content.dryRun === false ? 'quote' : 'price';
  const query = new URLSearchParams({
    chainId: String(chainId),
    sellToken: normalizeZeroExToken(sellToken),
    buyToken: normalizeZeroExToken(buyToken),
    sellAmount,
  });
  const takerAddress = content.takerAddress || readSetting(runtime, 'WALLET_ADDRESS');
  if (takerAddress) query.set('takerAddress', takerAddress);
  if (typeof content.slippageBps === 'number') query.set('slippagePercentage', String(Math.max(0, content.slippageBps / 10_000)));
  const quoteUrl = `${baseUrl}/${endpoint}?${query.toString()}`;
  const headers: Record<string, string> = { '0x-version': 'v2' };
  if (apiKey) headers['0x-api-key'] = apiKey;
  const quote = await fetchJson(quoteUrl, { headers });
  const transaction = quote.transaction as Record<string, unknown> | undefined;

  return {
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
    quoteUrl,
  };
}

async function quoteSvm(runtime: IAgentRuntime, content: QuoteAndSwapContent) {
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
  if (content.execute === true || content.dryRun === false) {
    const walletAddress = content.walletAddress || readSetting(runtime, 'WALLET_ADDRESS');
    if (!walletAddress) throw new Error('walletAddress or WALLET_ADDRESS is required to build a Jupiter swap transaction');
    swap = await fetchJson(`${baseUrl}/swap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: walletAddress, dynamicComputeUnitLimit: true }),
    });
  }
  return {
    adapter: 'svm',
    provider: 'jupiter',
    executable: Boolean(swap),
    quote,
    swapTransaction: swap?.swapTransaction,
    swap,
    quoteUrl,
  };
}

export const quoteAndSwapAction: Action = {
  name: 'QUOTE_AND_SWAP',
  similes: ['QUOTE_AND_SWAP', 'SWAP_QUOTE', 'TOKEN_SWAP', 'ROUTE_SWAP'],
  description: 'Quote EVM and SVM token swaps and optionally build executable transaction payloads',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as QuoteAndSwapContent;
    return content.chainFamily === 'svm'
      ? Boolean(content.inputMint && content.outputMint && content.amount)
      : Boolean(content.sellToken && content.buyToken && content.sellAmount);
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
    const requestId = content.requestId || 'saiso-swap-' + startedAt.toString(36);
    const chainFamily = content.chainFamily || 'evm';

    try {
      const data = chainFamily === 'svm'
        ? await quoteSvm(runtime, content)
        : await quoteEvm(runtime, content);
      const response = {
        success: true,
        operation: 'quote_and_swap',
        chainFamily,
        data,
        meta: {
          requestId,
          quoteUrl: data.quoteUrl,
          latencyMs: Date.now() - startedAt,
        },
      };
      if (callback) callback({ text: '[quote_and_swap] quote ready', content: response });
      return response;
    } catch (error) {
      const authError = error instanceof QuoteProviderAuthRequiredError ? error : undefined;
      const response = {
        success: false,
        operation: 'quote_and_swap',
        chainFamily,
        error: {
          code: authError?.code || 'quote_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        meta: {
          requestId,
          ...(authError ? { provider: authError.provider, requiredEnv: authError.requiredEnv } : {}),
          latencyMs: Date.now() - startedAt,
        },
      };
      if (callback) callback({ text: '[quote_and_swap] quote failed', content: response });
      return response;
    }
  },
  examples: [] as ActionExample[][],
};
