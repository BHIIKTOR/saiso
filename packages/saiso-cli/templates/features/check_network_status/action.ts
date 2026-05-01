import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { ethers } from 'ethers';

interface NetworkStatusParams {
  network?: string;
  timeout?: number;
  includeMetrics?: boolean;
  checkPeers?: boolean;
  validateChainId?: boolean;
  checkSync?: boolean;
}

interface NetworkMetrics {
  responseTime: number;
  blockHeight: number;
  chainId: number;
  gasPrice: string;
  peerCount?: number;
  isSyncing?: boolean;
  syncProgress?: number;
}

interface NetworkStatus {
  network: string;
  environment: string;
  isHealthy: boolean;
  isConnected: boolean;
  chainIdValid: boolean;
  rpcUrl: string;
  metrics: NetworkMetrics;
  timestamp: number;
  errors: string[];
  warnings: string[];
}

export const checkNetworkStatusAction: Action = {
  name: 'CHECK_NETWORK_STATUS',
  similes: [
    'NETWORK_STATUS',
    'CHECK_NETWORK',
    'NETWORK_HEALTH',
    'NETWORK_CONNECTIVITY',
    'NETWORK_DIAGNOSTICS',
    'CHECK_CONNECTION',
    'NETWORK_METRICS',
    'NETWORK_INFO'
  ],
  description: 'Check network connectivity, health, and synchronization status across all supported EVM networks',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const content = message.content?.text?.toLowerCase() || '';

    // Check for network status related keywords
    const networkKeywords = [
      'network', 'status', 'health', 'connectivity', 'connection',
      'check', 'monitor', 'diagnostics', 'metrics', 'sync',
      'chain', 'rpc', 'node', 'peer', 'block'
    ];

    const hasNetworkKeyword = networkKeywords.some(keyword =>
      content.includes(keyword)
    );

    // Check for status/health related keywords
    const statusKeywords = [
      'status', 'health', 'healthy', 'working', 'online',
      'available', 'accessible', 'up', 'down', 'connected'
    ];

    const hasStatusKeyword = statusKeywords.some(keyword =>
      content.includes(keyword)
    );

    // Check for question patterns
    const questionPatterns = [
      /is.*network.*working/i,
      /is.*network.*healthy/i,
      /is.*network.*up/i,
      /network.*status/i,
      /check.*network/i,
      /network.*connectivity/i,
      /network.*health/i
    ];

    const hasQuestionPattern = questionPatterns.some(pattern =>
      pattern.test(content)
    );

    return hasNetworkKeyword && (hasStatusKeyword || hasQuestionPattern);
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    try {
      console.log('🔍 Checking network status...');

      // Parse parameters from message
      const params = await parseNetworkStatusParams(message.content?.text || '');

      // Get network configuration
      const config = runtime.getSetting('NETWORK_CONFIG') || {
        network: runtime.getSetting('NETWORK') || 'sepolia',
        environment: runtime.getSetting('SAISO_ENVIRONMENT') || 'testnet',
        rpcUrl: runtime.getSetting('RPC_URL') || 'https://rpc.sepolia.org',
        chainId: parseInt(runtime.getSetting('CHAIN_ID') || '11155111', 10)
      };

      // Override with specific network if requested
      if (params.network) {
        config.network = params.network;
        // You would need to implement network config lookup here
        // For now, we'll use the current config
      }

      if (!config.rpcUrl) {
        throw new Error('RPC URL not configured. Please set RPC_URL environment variable.');
      }

      // Perform network status check
      const status = await checkNetworkStatus(config, params);

      // Format response based on status
      const response = formatNetworkStatusResponse(status);

      if (callback) {
        callback({
          text: response,
          content: {
            success: status.isHealthy,
            network: status.network,
            environment: status.environment,
            status: status,
            timestamp: status.timestamp
          }
        });
      }

      return true;
    } catch (error) {
      console.error('❌ Network status check failed:', error);

      const errorMessage = `Failed to check network status: ${error instanceof Error ? error.message : 'Unknown error'}`;

      if (callback) {
        callback({
          text: errorMessage,
          content: {
            success: false,
            error: errorMessage,
            timestamp: Date.now()
          }
        });
      }

      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Check Sepolia network status' }
      },
      {
        user: '{{agent}}',
        content: {
          text: '🔍 Checking Sepolia status...\n\n✅ **Network Status: HEALTHY**\n\n**Network Details:**\n• Network: Sepolia Testnet\n• Chain ID: 11155111 ✅\n• RPC URL: https://rpc.sepolia.org\n• Block Height: 1,234,567\n• Response Time: 245ms\n\n**Health Metrics:**\n• Connection: ✅ Connected\n• Chain ID: ✅ Valid\n• Sync Status: ✅ Synchronized\n• Gas Price: 0.1 gwei\n\n🟢 All systems operational!'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Is the network healthy and synchronized?' }
      },
      {
        user: '{{agent}}',
        content: {
          text: '🔍 Checking network health and synchronization...\n\n✅ **Network Status: HEALTHY & SYNCHRONIZED**\n\n**Health Check Results:**\n• Network Connectivity: ✅ Excellent (156ms)\n• Chain Synchronization: ✅ Fully synced\n• Node Health: ✅ Operational\n• Block Production: ✅ Normal (2.1s avg)\n\n**Current Metrics:**\n• Latest Block: 1,234,567\n• Gas Price: 0.12 gwei\n• Network Load: Low\n\n🟢 Network is performing optimally!'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Get network performance metrics' }
      },
      {
        user: '{{agent}}',
        content: {
          text: '📊 **Network Performance Metrics**\n\n**Response Times:**\n• RPC Latency: 178ms\n• Block Query: 145ms\n• Gas Price Query: 89ms\n\n**Network Statistics:**\n• Current Block: 1,234,567\n• Block Time: 2.1s average\n• Gas Price: 0.11 gwei\n• Network Utilization: 23%\n\n**Health Indicators:**\n• Uptime: 99.9%\n• Sync Status: ✅ Current\n• Peer Count: 47 connected\n• Transaction Pool: 156 pending\n\n📈 Performance: Excellent'
        }
      }
    ]
  ] as ActionExample[][]
};

async function parseNetworkStatusParams(text: string): Promise<NetworkStatusParams> {
  const params: NetworkStatusParams = {
    timeout: 10000,
    includeMetrics: true,
    checkPeers: false,
    validateChainId: true,
    checkSync: true
  };

  // Parse network name
  const networkMatch = text.match(/(?:check|status|monitor)\s+(\w+)\s+(?:network|testnet|mainnet)/i);
  if (networkMatch) {
    params.network = networkMatch[1].toLowerCase();
  }

  // Parse timeout
  const timeoutMatch = text.match(/timeout[:\s]+(\d+)/i);
  if (timeoutMatch) {
    params.timeout = parseInt(timeoutMatch[1], 10);
  }

  // Parse boolean flags
  if (text.includes('no metrics') || text.includes('without metrics')) {
    params.includeMetrics = false;
  }

  if (text.includes('check peers') || text.includes('peer count')) {
    params.checkPeers = true;
  }

  if (text.includes('skip chain id') || text.includes('no chain validation')) {
    params.validateChainId = false;
  }

  if (text.includes('skip sync') || text.includes('no sync check')) {
    params.checkSync = false;
  }

  return params;
}

async function checkNetworkStatus(
  config: any,
  params: NetworkStatusParams
): Promise<NetworkStatus> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  let provider: ethers.JsonRpcProvider;
  let isConnected = false;
  let chainIdValid = false;
  let metrics: NetworkMetrics = {
    responseTime: 0,
    blockHeight: 0,
    chainId: 0,
    gasPrice: '0'
  };

  try {
    // Create provider with timeout
    provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
      staticNetwork: true,
      batchMaxCount: 1
    });

    // Test basic connectivity
    const connectStart = Date.now();
    const network = await Promise.race([
      provider.getNetwork(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), params.timeout || 10000)
      )
    ]) as ethers.Network;

    const connectTime = Date.now() - connectStart;
    isConnected = true;
    metrics.responseTime = connectTime;
    metrics.chainId = Number(network.chainId);

    // Validate chain ID
    if (params.validateChainId && config.chainId) {
      chainIdValid = metrics.chainId === config.chainId;
      if (!chainIdValid) {
        errors.push(`Chain ID mismatch: expected ${config.chainId}, got ${metrics.chainId}`);
      }
    } else {
      chainIdValid = true;
    }

    // Get current block height
    try {
      metrics.blockHeight = await provider.getBlockNumber();
    } catch (error) {
      warnings.push('Failed to get block height');
    }

    // Get gas price
    try {
      const gasPrice = await provider.getFeeData();
      metrics.gasPrice = ethers.formatUnits(gasPrice.gasPrice || 0, 'gwei');
    } catch (error) {
      warnings.push('Failed to get gas price');
    }

    // Check sync status if requested
    if (params.checkSync) {
      try {
        // For most networks, if we can get the latest block, we're synced
        // Some networks support eth_syncing method
        const syncStatus = await provider.send('eth_syncing', []);
        if (syncStatus === false) {
          metrics.isSyncing = false;
          metrics.syncProgress = 100;
        } else if (typeof syncStatus === 'object') {
          metrics.isSyncing = true;
          const current = parseInt(syncStatus.currentBlock, 16);
          const highest = parseInt(syncStatus.highestBlock, 16);
          metrics.syncProgress = Math.round((current / highest) * 100);
        }
      } catch (error) {
        // If eth_syncing is not supported, assume synced if we can get blocks
        metrics.isSyncing = false;
        metrics.syncProgress = 100;
      }
    }

    // Check peer count if requested
    if (params.checkPeers) {
      try {
        const peerCount = await provider.send('net_peerCount', []);
        metrics.peerCount = parseInt(peerCount, 16);

        if (metrics.peerCount < 3) {
          warnings.push('Low peer count detected');
        }
      } catch (error) {
        warnings.push('Failed to get peer count');
      }
    }

  } catch (error) {
    errors.push(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Determine overall health
  const isHealthy = isConnected && chainIdValid && errors.length === 0;

  return {
    network: config.network,
    environment: config.environment,
    isHealthy,
    isConnected,
    chainIdValid,
    rpcUrl: config.rpcUrl,
    metrics,
    timestamp: Date.now(),
    errors,
    warnings
  };
}

function formatNetworkStatusResponse(status: NetworkStatus): string {
  const { isHealthy, isConnected, chainIdValid, network, environment, metrics, errors, warnings } = status;

  // Header with overall status
  const statusIcon = isHealthy ? '✅' : '❌';
  const statusText = isHealthy ? 'HEALTHY' : 'UNHEALTHY';

  let response = `🔍 **Network Status Check**\n\n${statusIcon} **Status: ${statusText}**\n\n`;

  // Network details
  response += `**Network Information:**\n`;
  response += `• Network: ${network.charAt(0).toUpperCase() + network.slice(1)} ${environment.charAt(0).toUpperCase() + environment.slice(1)}\n`;
  response += `• Chain ID: ${metrics.chainId} ${chainIdValid ? '✅' : '❌'}\n`;
  response += `• RPC URL: ${status.rpcUrl}\n`;
  response += `• Connection: ${isConnected ? '✅ Connected' : '❌ Disconnected'}\n\n`;

  // Performance metrics
  if (isConnected) {
    response += `**Performance Metrics:**\n`;
    response += `• Response Time: ${metrics.responseTime}ms\n`;
    response += `• Block Height: ${metrics.blockHeight.toLocaleString()}\n`;
    response += `• Gas Price: ${metrics.gasPrice} gwei\n`;

    if (metrics.isSyncing !== undefined) {
      const syncStatus = metrics.isSyncing ? `🔄 Syncing (${metrics.syncProgress}%)` : '✅ Synchronized';
      response += `• Sync Status: ${syncStatus}\n`;
    }

    if (metrics.peerCount !== undefined) {
      const peerIcon = metrics.peerCount >= 3 ? '✅' : '⚠️';
      response += `• Peer Count: ${peerIcon} ${metrics.peerCount}\n`;
    }

    response += '\n';
  }

  // Warnings
  if (warnings.length > 0) {
    response += `**Warnings:**\n`;
    warnings.forEach(warning => {
      response += `⚠️ ${warning}\n`;
    });
    response += '\n';
  }

  // Errors
  if (errors.length > 0) {
    response += `**Errors:**\n`;
    errors.forEach(error => {
      response += `❌ ${error}\n`;
    });
    response += '\n';
  }

  // Overall assessment
  if (isHealthy) {
    response += `🟢 Network is operating normally!`;
  } else {
    response += `🔴 Network issues detected. Please check configuration and connectivity.`;
  }

  return response;
}
