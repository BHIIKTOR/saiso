import type { SaisoEnvironment } from './config.js';

/**
 * EVM Network Configuration Types
 * Supports any EVM-compatible blockchain
 */

export interface NetworkFeatures {
  /** Supports EIP-1559 (Type 2 transactions) */
  eip1559?: boolean;
  /** Fast finality (< 1 second) */
  fastFinality?: boolean;
  /** Layer 2 scaling solution */
  layer2?: boolean;
  /** Custom gas calculation */
  customGas?: boolean;
}

export interface NetworkConfig {
  /** Network display name */
  name: string;
  /** EVM Chain ID */
  chainId: number;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Native currency symbol */
  nativeCurrency: string;
  /** Native currency decimals */
  decimals: number;
  /** Block explorer base URL */
  blockExplorer: string;
  /** Network-specific features */
  features?: NetworkFeatures;
  /** Gas price multiplier for this network */
  gasMultiplier?: number;
  /** Testnet faucet URLs */
  faucets?: string[];
  /** WebSocket RPC URL (optional) */
  wsRpcUrl?: string;
}

export interface NetworkRegistry {
  [key: string]: {
    testnet?: NetworkConfig;
    mainnet?: NetworkConfig;
    devnet?: NetworkConfig;
  };
}

export interface ChainInfo {
  chainId: number;
  name: string;
  environment: SaisoEnvironment;
  config: NetworkConfig;
}
