import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { ethers } from 'ethers';

export interface GasEstimationContent {
  to?: string;
  data?: string;
  value?: string;
  speed?: 'slow' | 'standard' | 'fast' | 'instant';
  multiplier?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit?: number;
  mevProtection?: boolean;
  includeUsdPrice?: boolean;
  transactionType?: 'transfer' | 'contract' | 'deployment';
}

export interface GasEstimationResult {
  gasLimit: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  baseFeePerGas?: string;
  estimatedCost: {
    wei: string;
    ether: string;
    gwei: string;
    usd?: string;
  };
  networkInfo: {
    chainId: number;
    networkName: string;
    congestionLevel: 'low' | 'medium' | 'high';
    avgBlockTime: number;
    eip1559Supported: boolean;
  };
  recommendations: string[];
  mevProtection?: {
    enabled: boolean;
    strategies: string[];
    additionalCost?: string;
  };
  speedComparison: {
    slow: { gasPrice: string; estimatedTime: string; cost: string };
    standard: { gasPrice: string; estimatedTime: string; cost: string };
    fast: { gasPrice: string; estimatedTime: string; cost: string };
    instant: { gasPrice: string; estimatedTime: string; cost: string };
  };
}

// Network-specific configurations
interface NetworkConfig {
  name: string;
  baseGasPrice: string;
  fastMultiplier: number;
  instantMultiplier: number;
  avgBlockTime: number;
  eip1559: boolean;
  mevProtection: boolean;
}

const NETWORK_CONFIGS: Record<number, NetworkConfig> = {
  // Ethereum Networks
  1: { // Ethereum Mainnet
    name: 'Ethereum Mainnet',
    baseGasPrice: '20',
    fastMultiplier: 1.5,
    instantMultiplier: 2.0,
    avgBlockTime: 12,
    eip1559: true,
    mevProtection: true
  },
  11155111: { // Sepolia Testnet
    name: 'Sepolia Testnet',
    baseGasPrice: '1',
    fastMultiplier: 1.2,
    instantMultiplier: 1.5,
    avgBlockTime: 12,
    eip1559: true,
    mevProtection: false
  },
  // Polygon Networks
  137: { // Polygon Mainnet
    name: 'Polygon Mainnet',
    baseGasPrice: '30',
    fastMultiplier: 1.3,
    instantMultiplier: 1.8,
    avgBlockTime: 2,
    eip1559: true,
    mevProtection: true
  },
  80001: { // Mumbai Testnet
    name: 'Mumbai Testnet',
    baseGasPrice: '1',
    fastMultiplier: 1.2,
    instantMultiplier: 1.5,
    avgBlockTime: 2,
    eip1559: true,
    mevProtection: false
  }
};

export const gasEstimationAction: Action = {
  name: 'GAS_ESTIMATION',
  similes: ['ESTIMATE_GAS', 'GAS_PRICE', 'TRANSACTION_COST', 'GAS_COST', 'FEE_ESTIMATION'],
  description: 'Estimate gas costs for EVM transactions with advanced optimization, MEV protection, and comprehensive cost analysis',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const rpcUrl = runtime.getSetting('RPC_URL');
    return !!rpcUrl;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: unknown,
    callback?: HandlerCallback
  ) => {
    const startedAt = Date.now();
    const requestId = `saiso-gas-${startedAt.toString(36)}`;
    try {
      const content = message.content as GasEstimationContent;

      // Get configuration
      const rpcUrlSetting = runtime.getSetting('RPC_URL');
      const gasApiKeySetting = runtime.getSetting('GAS_PRICE_API_KEY');
      const rpcUrl = typeof rpcUrlSetting === 'string' && rpcUrlSetting.trim()
        ? rpcUrlSetting.trim()
        : 'https://rpc.sepolia.org';
      const gasApiKey = typeof gasApiKeySetting === 'string' && gasApiKeySetting.trim()
        ? gasApiKeySetting.trim()
        : undefined;
      const mevProtectionEnabled = runtime.getSetting('MEV_PROTECTION_ENABLED') === 'true';

      // Setup provider
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Get network configuration
      const networkConfig = NETWORK_CONFIGS[chainId] || {
        name: `Chain ${chainId}`,
        baseGasPrice: '20',
        fastMultiplier: 1.2,
        instantMultiplier: 1.5,
        avgBlockTime: 12,
        eip1559: true,
        mevProtection: false
      };

      // Get current network fee data
      const feeData = await provider.getFeeData();
      const blockNumber = await provider.getBlockNumber();
      const block = await provider.getBlock(blockNumber);

      // Determine transaction type and estimate gas limit
      let gasLimit = content.gasLimit || 21000; // Default for simple transfer
      let transactionType = content.transactionType || 'transfer';

      if (content.to && content.data) {
        // Contract interaction
        transactionType = 'contract';
        try {
          gasLimit = Number(await provider.estimateGas({
            to: content.to,
            data: content.data,
            value: content.value ? ethers.parseEther(content.value) : 0
          }));
          // Add 20% buffer for contract calls
          gasLimit = Math.floor(gasLimit * 1.2);
        } catch (error) {
          // If estimation fails, use higher default for contract calls
          gasLimit = content.gasLimit || 200000;
        }
      } else if (content.data && !content.to) {
        // Contract deployment
        transactionType = 'deployment';
        gasLimit = content.gasLimit || 2000000;
      }

      // Calculate gas prices for different speeds
      const baseGasPrice = feeData.gasPrice || ethers.parseUnits(networkConfig.baseGasPrice, 'gwei');
      const baseFeePerGas = feeData.maxFeePerGas || baseGasPrice;

      const speedMultipliers = {
        slow: 0.8,
        standard: 1.0,
        fast: networkConfig.fastMultiplier,
        instant: networkConfig.instantMultiplier
      };

      // Apply custom multiplier if provided
      const customMultiplier = content.multiplier || 1.0;

      // Calculate gas prices for each speed
      const speedComparison = {
        slow: { gasPrice: '', estimatedTime: '', cost: '' },
        standard: { gasPrice: '', estimatedTime: '', cost: '' },
        fast: { gasPrice: '', estimatedTime: '', cost: '' },
        instant: { gasPrice: '', estimatedTime: '', cost: '' }
      };
      const speeds = ['slow', 'standard', 'fast', 'instant'] as const;

      for (const speed of speeds) {
        const multiplier = speedMultipliers[speed] * customMultiplier;
        let gasPrice: bigint;
        let maxFeePerGas: bigint | undefined;
        let maxPriorityFeePerGas: bigint | undefined;

        if (networkConfig.eip1559 && feeData.maxFeePerGas) {
          // EIP-1559 pricing
          const priorityFeeSource = feeData.maxPriorityFeePerGas ?? feeData.maxFeePerGas;
          maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * multiplier));
          maxPriorityFeePerGas = BigInt(Math.floor(Number(priorityFeeSource) * multiplier * 0.1));
          gasPrice = maxFeePerGas;
        } else {
          // Legacy pricing
          gasPrice = BigInt(Math.floor(Number(baseGasPrice) * multiplier));
        }

        const cost = gasPrice * BigInt(gasLimit);
        const estimatedTime = calculateEstimatedTime(speed, networkConfig.avgBlockTime);

        speedComparison[speed] = {
          gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
          estimatedTime,
          cost: ethers.formatEther(cost)
        };
      }

      // Use requested speed or default to standard
      const selectedSpeed = content.speed || 'standard';
      const selectedMultiplier = speedMultipliers[selectedSpeed] * customMultiplier;

      // Calculate final gas prices
      let finalGasPrice: bigint;
      let finalMaxFeePerGas: bigint | undefined;
      let finalMaxPriorityFeePerGas: bigint | undefined;

      if (content.maxFeePerGas && content.maxPriorityFeePerGas) {
        // Use custom EIP-1559 values
        finalMaxFeePerGas = ethers.parseUnits(content.maxFeePerGas, 'gwei');
        finalMaxPriorityFeePerGas = ethers.parseUnits(content.maxPriorityFeePerGas, 'gwei');
        finalGasPrice = finalMaxFeePerGas;
      } else if (networkConfig.eip1559 && feeData.maxFeePerGas) {
        // Calculate EIP-1559 pricing
        const priorityFeeSource = feeData.maxPriorityFeePerGas ?? feeData.maxFeePerGas;
        finalMaxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * selectedMultiplier));
        finalMaxPriorityFeePerGas = BigInt(Math.floor(Number(priorityFeeSource) * selectedMultiplier * 0.1));
        finalGasPrice = finalMaxFeePerGas;
      } else {
        // Use fallback gas pricing
        finalGasPrice = BigInt(Math.floor(Number(baseGasPrice) * selectedMultiplier));
      }

      // Calculate total cost
      const totalCost = finalGasPrice * BigInt(gasLimit);

      // Analyze network congestion
      const congestionLevel = analyzeCongestion(feeData, networkConfig);

      // Generate recommendations
      const recommendations = generateRecommendations(
        selectedSpeed,
        congestionLevel,
        transactionType,
        networkConfig,
        content
      );

      // MEV Protection analysis
      let mevProtection: { enabled: boolean; strategies: string[]; additionalCost?: string } | undefined = undefined;
      if (content.mevProtection || mevProtectionEnabled) {
        mevProtection = {
          enabled: true,
          strategies: generateMevStrategies(transactionType, networkConfig),
          additionalCost: ethers.formatEther(totalCost * 5n / 100n) // ~5% additional cost
        };
      }

      // USD price estimation uses an optional runtime price API or configured fallback.
      let usdPrice: string | undefined;
      if (content.includeUsdPrice !== false) {
        const ethPriceUsd = await getNativeAssetPriceUsd(runtime, chainId, gasApiKey);
        if (ethPriceUsd) {
          const costInEth = parseFloat(ethers.formatEther(totalCost));
          usdPrice = (costInEth * ethPriceUsd).toFixed(4);
        }
      }

      const result: GasEstimationResult = {
        gasLimit,
        gasPrice: finalMaxFeePerGas ? undefined : ethers.formatUnits(finalGasPrice, 'gwei'),
        maxFeePerGas: finalMaxFeePerGas ? ethers.formatUnits(finalMaxFeePerGas, 'gwei') : undefined,
        maxPriorityFeePerGas: finalMaxPriorityFeePerGas ? ethers.formatUnits(finalMaxPriorityFeePerGas, 'gwei') : undefined,
        baseFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') : undefined,
        estimatedCost: {
          wei: totalCost.toString(),
          ether: ethers.formatEther(totalCost),
          gwei: ethers.formatUnits(totalCost, 'gwei'),
          usd: usdPrice
        },
        networkInfo: {
          chainId,
          networkName: networkConfig.name,
          congestionLevel,
          avgBlockTime: networkConfig.avgBlockTime,
          eip1559Supported: networkConfig.eip1559
        },
        recommendations,
        mevProtection,
        speedComparison
      };

      const response = {
        success: true,
        operation: 'gas_estimation',
        chainFamily: 'evm',
        data: result,
        meta: {
          requestId,
          provider: 'ethers',
          latencyMs: Date.now() - startedAt,
        },
      };

      if (callback) {
        const costText = usdPrice
          ? `${result.estimatedCost.ether} ETH (~$${usdPrice})`
          : `${result.estimatedCost.ether} ETH`;

        callback({
          text: `Gas estimation for ${transactionType} transaction: ${costText} at ${selectedSpeed} speed (${result.gasPrice || result.maxFeePerGas} gwei). Network: ${networkConfig.name} (${congestionLevel} congestion)`,
          content: response as any
        });
      }

      return response as any;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const response = {
        success: false,
        operation: 'gas_estimation',
        chainFamily: 'evm',
        data: null,
        error: {
          code: 'gas_estimation_failed',
          message: errorMessage,
        },
        meta: {
          requestId,
          provider: 'ethers',
          latencyMs: Date.now() - startedAt,
        },
      };

      if (callback) {
        callback({
          text: `Failed to estimate gas: ${errorMessage}`,
          content: response as any
        });
      }

      return response as any;
    }
  }
};

/**
 * Calculate estimated confirmation time based on speed and network
 */
function calculateEstimatedTime(speed: string, avgBlockTime: number): string {
  const blockMultipliers: Record<string, number> = {
    slow: 5,
    standard: 2,
    fast: 1,
    instant: 0.5
  };

  const blocks = blockMultipliers[speed] || 2;
  const timeInSeconds = blocks * avgBlockTime;

  if (timeInSeconds < 60) {
    return `${Math.round(timeInSeconds)}s`;
  } else if (timeInSeconds < 3600) {
    return `${Math.round(timeInSeconds / 60)}m`;
  } else {
    return `${Math.round(timeInSeconds / 3600)}h`;
  }
}

/**
 * Analyze network congestion based on current fee data
 */
function analyzeCongestion(feeData: any, networkConfig: any): 'low' | 'medium' | 'high' {
  if (!feeData.gasPrice) return 'medium';

  const currentGasPrice = Number(ethers.formatUnits(feeData.gasPrice, 'gwei'));
  const baseGasPrice = parseFloat(networkConfig.baseGasPrice);

  if (currentGasPrice < baseGasPrice * 1.5) return 'low';
  if (currentGasPrice < baseGasPrice * 3) return 'medium';
  return 'high';
}

/**
 * Generate recommendations based on transaction context
 */
function generateRecommendations(
  speed: string,
  congestion: string,
  transactionType: string,
  networkConfig: any,
  content: GasEstimationContent
): string[] {
  const recommendations: string[] = [];

  if (congestion === 'high') {
    recommendations.push('Network congestion is high. Consider waiting or using higher gas prices.');
  }

  if (speed === 'instant' && congestion === 'low') {
    recommendations.push('Network is not congested. Standard speed may be sufficient.');
  }

  if (transactionType === 'contract' && !content.gasLimit) {
    recommendations.push('Consider setting a custom gas limit for contract interactions.');
  }

  if (networkConfig.eip1559 && !content.maxFeePerGas) {
    recommendations.push('This network supports EIP-1559. Consider using maxFeePerGas for better control.');
  }

  if (networkConfig.mevProtection && !content.mevProtection) {
    recommendations.push('MEV protection is available on this network for sensitive transactions.');
  }

  return recommendations;
}

/**
 * Generate MEV protection strategies
 */
function generateMevStrategies(transactionType: string, networkConfig: any): string[] {
  const strategies: string[] = [];

  strategies.push('Private mempool submission');

  if (networkConfig.mevProtection) {
    if (transactionType === 'contract') {
      strategies.push('Flashbots bundle inclusion');
      strategies.push('MEV-resistant gas pricing');
    }

    strategies.push('Transaction timing optimization');
  }

  return strategies;
}

function extractUsdPrice(payload: unknown): number | null {
  if (typeof payload === 'number' && Number.isFinite(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, any>;
  const candidates = [
    record.usd,
    record.price,
    record.priceUsd,
    record.nativeTokenPriceUsd,
    record.ethereum?.usd,
    record.data?.amount,
    record.data?.usd,
    record.rates?.USD,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * Get the native asset USD price from a configured provider.
 */
async function getNativeAssetPriceUsd(runtime: IAgentRuntime, chainId: number, apiKey?: string): Promise<number | null> {
  const fallback = Number(runtime.getSetting('ETH_PRICE_USD_FALLBACK') || runtime.getSetting('GAS_PRICE_USD_FALLBACK'));
  const priceUrlSetting = runtime.getSetting('ETH_PRICE_API_URL') || runtime.getSetting('GAS_PRICE_API_URL');
  const priceUrl = typeof priceUrlSetting === 'string' && priceUrlSetting.trim()
    ? priceUrlSetting.trim()
    : undefined;

  if (priceUrl) {
    const url = new URL(priceUrl);
    if (!url.searchParams.has('chainId')) {
      url.searchParams.set('chainId', String(chainId));
    }
    const response = await fetch(url.toString(), {
      headers: apiKey ? { 'x-api-key': apiKey } : undefined,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`price API HTTP ${response.status}: ${JSON.stringify(parsed)}`);
    }
    return extractUsdPrice(parsed);
  }

  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}
