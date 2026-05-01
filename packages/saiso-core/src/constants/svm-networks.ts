import type { NetworkInfo } from '../types/mcp.js';

/**
 * SVM Network Definitions
 * Numeric chain IDs are internal identifiers used by SAISO for routing/config.
 */
export const SVM_NETWORKS: NetworkInfo[] = [
  {
    name: 'solana-mainnet',
    chainId: 101,
    testnet: false,
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    nativeCurrency: 'SOL',
    blockExplorer: 'https://explorer.solana.com',
  },
  {
    name: 'solana-testnet',
    chainId: 102,
    testnet: true,
    rpcUrl: 'https://api.testnet.solana.com',
    nativeCurrency: 'SOL',
    blockExplorer: 'https://explorer.solana.com/?cluster=testnet',
    faucetUrl: 'https://solfaucet.com',
  },
  {
    name: 'solana-devnet',
    chainId: 103,
    testnet: true,
    rpcUrl: 'https://api.devnet.solana.com',
    nativeCurrency: 'SOL',
    blockExplorer: 'https://explorer.solana.com/?cluster=devnet',
    faucetUrl: 'https://faucet.solana.com',
  },
];

export function getSvmNetwork(network: string): NetworkInfo | undefined {
  return SVM_NETWORKS.find((item) => item.name.toLowerCase() === network.toLowerCase());
}

export function isSvmNetworkSupported(network: string): boolean {
  return getSvmNetwork(network) !== undefined;
}

export function getRecommendedSvmNetworks(environment: 'development' | 'production' = 'development'): NetworkInfo[] {
  if (environment === 'production') {
    return SVM_NETWORKS.filter((network) => !network.testnet);
  }
  return SVM_NETWORKS.filter((network) => network.testnet);
}
