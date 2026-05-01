/**
 * EVM Network Definitions - For EVM MCP Server Integration
 * Based on @mcpdotdirect/evm-mcp-server supported networks
 */

import type { NetworkInfo } from '../types/mcp.js';

/**
 * Mainnet EVM Networks
 */
export const EVM_MAINNETS: NetworkInfo[] = [
  // Tier 1 Networks
  {
    name: 'ethereum',
    chainId: 1,
    testnet: false,
    rpcUrl: 'https://eth.llamarpc.com',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://etherscan.io',
  },
  {
    name: 'optimism',
    chainId: 10,
    testnet: false,
    rpcUrl: 'https://mainnet.optimism.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://optimistic.etherscan.io',
  },
  {
    name: 'arbitrum',
    chainId: 42161,
    testnet: false,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://arbiscan.io',
  },
  {
    name: 'base',
    chainId: 8453,
    testnet: false,
    rpcUrl: 'https://mainnet.base.org',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://basescan.org',
  },
  {
    name: 'polygon',
    chainId: 137,
    testnet: false,
    rpcUrl: 'https://polygon-rpc.com',
    nativeCurrency: 'MATIC',
    blockExplorer: 'https://polygonscan.com',
  },

  // Tier 2 Networks
  {
    name: 'avalanche',
    chainId: 43114,
    testnet: false,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    nativeCurrency: 'AVAX',
    blockExplorer: 'https://snowtrace.io',
  },
  {
    name: 'bsc',
    chainId: 56,
    testnet: false,
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    nativeCurrency: 'BNB',
    blockExplorer: 'https://bscscan.com',
  },
  {
    name: 'zkSync',
    chainId: 324,
    testnet: false,
    rpcUrl: 'https://mainnet.era.zksync.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://explorer.zksync.io',
  },
  {
    name: 'linea',
    chainId: 59144,
    testnet: false,
    rpcUrl: 'https://rpc.linea.build',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://lineascan.build',
  },
  {
    name: 'celo',
    chainId: 42220,
    testnet: false,
    rpcUrl: 'https://forno.celo.org',
    nativeCurrency: 'CELO',
    blockExplorer: 'https://celoscan.io',
  },

  // Emerging Networks
  {
    name: 'scroll',
    chainId: 534352,
    testnet: false,
    rpcUrl: 'https://rpc.scroll.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://scrollscan.com',
  },
  {
    name: 'mantle',
    chainId: 5000,
    testnet: false,
    rpcUrl: 'https://rpc.mantle.xyz',
    nativeCurrency: 'MNT',
    blockExplorer: 'https://mantlescan.xyz',
  },
  {
    name: 'manta',
    chainId: 169,
    testnet: false,
    rpcUrl: 'https://pacific-rpc.manta.network/http',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://pacific-explorer.manta.network',
  },
  {
    name: 'blast',
    chainId: 81457,
    testnet: false,
    rpcUrl: 'https://rpc.blast.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://blastscan.io',
  },
  {
    name: 'fraxtal',
    chainId: 252,
    testnet: false,
    rpcUrl: 'https://rpc.frax.com',
    nativeCurrency: 'frxETH',
    blockExplorer: 'https://fraxscan.com',
  },
  {
    name: 'mode',
    chainId: 34443,
    testnet: false,
    rpcUrl: 'https://mainnet.mode.network',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://modescan.io',
  },
  {
    name: 'metis',
    chainId: 1088,
    testnet: false,
    rpcUrl: 'https://andromeda.metis.io/?owner=1088',
    nativeCurrency: 'METIS',
    blockExplorer: 'https://andromeda-explorer.metis.io',
  },
  {
    name: 'kroma',
    chainId: 255,
    testnet: false,
    rpcUrl: 'https://api.kroma.network',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://kromascan.com',
  },
  {
    name: 'zora',
    chainId: 7777777,
    testnet: false,
    rpcUrl: 'https://rpc.zora.energy',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://explorer.zora.energy',
  },

  // Specialized Networks
  {
    name: 'filecoin',
    chainId: 314,
    testnet: false,
    rpcUrl: 'https://api.node.glif.io/rpc/v1',
    nativeCurrency: 'FIL',
    blockExplorer: 'https://filfox.info',
  },
  {
    name: 'moonbeam',
    chainId: 1284,
    testnet: false,
    rpcUrl: 'https://rpc.api.moonbeam.network',
    nativeCurrency: 'GLMR',
    blockExplorer: 'https://moonscan.io',
  },
  {
    name: 'cronos',
    chainId: 25,
    testnet: false,
    rpcUrl: 'https://evm.cronos.org',
    nativeCurrency: 'CRO',
    blockExplorer: 'https://cronoscan.com',
  },
  {
    name: 'aurora',
    chainId: 1313161554,
    testnet: false,
    rpcUrl: 'https://mainnet.aurora.dev',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://aurorascan.dev',
  },
  {
    name: 'canto',
    chainId: 7700,
    testnet: false,
    rpcUrl: 'https://canto.gravitychain.io',
    nativeCurrency: 'CANTO',
    blockExplorer: 'https://cantoscan.com',
  },
];

/**
 * Testnet EVM Networks
 */
export const EVM_TESTNETS: NetworkInfo[] = [
  // Primary Testnets
  {
    name: 'sepolia',
    chainId: 11155111,
    testnet: true,
    rpcUrl: 'https://rpc.sepolia.org',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.etherscan.io',
    faucetUrl: 'https://sepoliafaucet.com',
  },
  {
    name: 'optimism-sepolia',
    chainId: 11155420,
    testnet: true,
    rpcUrl: 'https://sepolia.optimism.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia-optimism.etherscan.io',
    faucetUrl: 'https://app.optimism.io/faucet',
  },
  {
    name: 'arbitrum-sepolia',
    chainId: 421614,
    testnet: true,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.arbiscan.io',
    faucetUrl: 'https://faucet.arbitrum.io',
  },
  {
    name: 'base-sepolia',
    chainId: 84532,
    testnet: true,
    rpcUrl: 'https://sepolia.base.org',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.basescan.org',
    faucetUrl: 'https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet',
  },
  {
    name: 'polygon-amoy',
    chainId: 80002,
    testnet: true,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    nativeCurrency: 'MATIC',
    blockExplorer: 'https://amoy.polygonscan.com',
    faucetUrl: 'https://faucet.polygon.technology',
  },

  // Other Testnets
  {
    name: 'avalanche-fuji',
    chainId: 43113,
    testnet: true,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    nativeCurrency: 'AVAX',
    blockExplorer: 'https://testnet.snowtrace.io',
    faucetUrl: 'https://faucet.avax.network',
  },
  {
    name: 'bsc-testnet',
    chainId: 97,
    testnet: true,
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    nativeCurrency: 'BNB',
    blockExplorer: 'https://testnet.bscscan.com',
    faucetUrl: 'https://testnet.bnbchain.org/faucet-smart',
  },
  {
    name: 'zkSync-sepolia',
    chainId: 300,
    testnet: true,
    rpcUrl: 'https://sepolia.era.zksync.dev',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.explorer.zksync.io',
    faucetUrl: 'https://portal.zksync.io/faucet',
  },
  {
    name: 'linea-sepolia',
    chainId: 59141,
    testnet: true,
    rpcUrl: 'https://rpc.sepolia.linea.build',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.lineascan.build',
    faucetUrl: 'https://faucet.goerli.linea.build',
  },
  {
    name: 'scroll-sepolia',
    chainId: 534351,
    testnet: true,
    rpcUrl: 'https://sepolia-rpc.scroll.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.scrollscan.com',
    faucetUrl: 'https://sepolia.scroll.io/faucet',
  },
  {
    name: 'mantle-sepolia',
    chainId: 5003,
    testnet: true,
    rpcUrl: 'https://rpc.sepolia.mantle.xyz',
    nativeCurrency: 'MNT',
    blockExplorer: 'https://sepolia.mantlescan.xyz',
    faucetUrl: 'https://faucet.sepolia.mantle.xyz',
  },
  {
    name: 'blast-sepolia',
    chainId: 168587773,
    testnet: true,
    rpcUrl: 'https://sepolia.blast.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.blastscan.io',
    faucetUrl: 'https://faucet.blast.io',
  },
  {
    name: 'celo-alfajores',
    chainId: 44787,
    testnet: true,
    rpcUrl: 'https://alfajores-forno.celo-testnet.org',
    nativeCurrency: 'CELO',
    blockExplorer: 'https://alfajores.celoscan.io',
    faucetUrl: 'https://faucet.celo.org/alfajores',
  },

  // Additional testnets
  {
    name: 'goerli',
    chainId: 5,
    testnet: true,
    rpcUrl: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://goerli.etherscan.io',
    faucetUrl: 'https://goerlifaucet.com',
  },
  {
    name: 'holesky',
    chainId: 17000,
    testnet: true,
    rpcUrl: 'https://ethereum-holesky.publicnode.com',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://holesky.etherscan.io',
    faucetUrl: 'https://faucet.holesky.ethpandaops.io',
  },
];

/**
 * All EVM Networks (Mainnets + Testnets)
 */
export const ALL_EVM_NETWORKS: NetworkInfo[] = [
  ...EVM_MAINNETS,
  ...EVM_TESTNETS,
];

/**
 * Recommended EVM Networks for different use cases
 */
export const RECOMMENDED_EVM_NETWORKS = {
  development: ['sepolia', 'polygon-amoy', 'base-sepolia', 'arbitrum-sepolia'],
  production: ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism'],
  defi: ['ethereum', 'polygon', 'arbitrum', 'avalanche', 'bsc'],
  nft: ['ethereum', 'polygon', 'base', 'zora', 'optimism'],
  gaming: ['polygon', 'avalanche', 'arbitrum', 'manta', 'blast'],
  lowCost: ['polygon', 'bsc', 'avalanche', 'arbitrum', 'base'],
} as const;

/**
 * Get EVM network by name
 */
export function getEvmNetwork(name: string): NetworkInfo | undefined {
  return ALL_EVM_NETWORKS.find(network =>
    network.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Get EVM network by chain ID
 */
export function getEvmNetworkByChainId(chainId: number): NetworkInfo | undefined {
  return ALL_EVM_NETWORKS.find(network => network.chainId === chainId);
}

/**
 * Check if network is supported by EVM MCP server
 */
export function isEvmNetworkSupported(name: string): boolean {
  return ALL_EVM_NETWORKS.some(network =>
    network.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Get recommended networks for a use case
 */
export function getRecommendedEvmNetworks(useCase: keyof typeof RECOMMENDED_EVM_NETWORKS): NetworkInfo[] {
  const networkNames = RECOMMENDED_EVM_NETWORKS[useCase];
  return networkNames.map(name => getEvmNetwork(name)).filter(Boolean) as NetworkInfo[];
}
