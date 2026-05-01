import type { NetworkRegistry } from '../types/networks.js';

/**
 * EVM Network Registry
 * Supports multiple EVM-compatible blockchains
 */

export const NETWORKS: NetworkRegistry = {
  ethereum: {
    testnet: {
      name: 'Ethereum Sepolia',
      chainId: 11155111,
      rpcUrl: 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
      nativeCurrency: 'ETH',
      decimals: 18,
      blockExplorer: 'https://sepolia.etherscan.io',
      features: {
        eip1559: true,
      },
      gasMultiplier: 1.5,
      faucets: [
        'https://sepoliafaucet.com',
        'https://faucet.sepolia.dev',
      ],
    },
    mainnet: {
      name: 'Ethereum Mainnet',
      chainId: 1,
      rpcUrl: 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
      nativeCurrency: 'ETH',
      decimals: 18,
      blockExplorer: 'https://etherscan.io',
      features: {
        eip1559: true,
      },
      gasMultiplier: 1.2,
    },
  },
  polygon: {
    testnet: {
      name: 'Polygon Mumbai',
      chainId: 80001,
      rpcUrl: 'https://rpc-mumbai.maticvigil.com',
      nativeCurrency: 'MATIC',
      decimals: 18,
      blockExplorer: 'https://mumbai.polygonscan.com',
      features: {
        eip1559: true,
        layer2: true,
      },
      gasMultiplier: 1.1,
      faucets: [
        'https://faucet.polygon.technology',
      ],
    },
    mainnet: {
      name: 'Polygon Mainnet',
      chainId: 137,
      rpcUrl: 'https://polygon-rpc.com',
      nativeCurrency: 'MATIC',
      decimals: 18,
      blockExplorer: 'https://polygonscan.com',
      features: {
        eip1559: true,
        layer2: true,
      },
      gasMultiplier: 1.1,
    },
  },
  arbitrum: {
    testnet: {
      name: 'Arbitrum Sepolia',
      chainId: 421614,
      rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
      nativeCurrency: 'ETH',
      decimals: 18,
      blockExplorer: 'https://sepolia.arbiscan.io',
      features: {
        layer2: true,
      },
      gasMultiplier: 1.0,
      faucets: [
        'https://faucet.arbitrum.io',
      ],
    },
    mainnet: {
      name: 'Arbitrum One',
      chainId: 42161,
      rpcUrl: 'https://arb1.arbitrum.io/rpc',
      nativeCurrency: 'ETH',
      decimals: 18,
      blockExplorer: 'https://arbiscan.io',
      features: {
        layer2: true,
      },
      gasMultiplier: 1.0,
    },
  },
};

/**
 * Get network configuration by name and environment
 */
export function getNetworkConfig(network: string, environment: 'testnet' | 'mainnet' | 'devnet') {
  const networkConfig = NETWORKS[network]?.[environment];
  if (!networkConfig) {
    throw new Error(`Network configuration not found: ${network} ${environment}`);
  }
  return networkConfig;
}

/**
 * Get all supported networks
 */
export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORKS);
}

/**
 * Check if network is supported
 */
export function isNetworkSupported(network: string): boolean {
  return network in NETWORKS;
}

/**
 * Get network by chain ID
 */
export function getNetworkByChainId(chainId: number) {
  for (const [networkName, environments] of Object.entries(NETWORKS)) {
    for (const [env, config] of Object.entries(environments)) {
      if (config?.chainId === chainId) {
        return {
          network: networkName,
          environment: env as 'testnet' | 'mainnet' | 'devnet',
          config,
        };
      }
    }
  }
  return null;
}
