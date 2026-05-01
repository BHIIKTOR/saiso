/**
 * Types for SAISO MCP Orchestration
 */

export interface SeiNetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: string;
  blockExplorer: string;
  faucetUrl?: string;
}

export interface WalletInfo {
  address: string;
  balance: string;
  network: string;
}

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export interface TransactionResult {
  hash: string;
  blockNumber?: number;
  gasUsed?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface ContractInteraction {
  address: string;
  method: string;
  args: unknown[];
  value?: string;
}

export interface NetworkStatus {
  connected: boolean;
  chainId: number;
  blockNumber: number;
  gasPrice: string;
  networkName: string;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  totalCost: string;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  transactionHash?: string;
}
