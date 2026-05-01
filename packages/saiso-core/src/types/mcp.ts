/**
 * MCP Server Types
 */

export type McpServerType = 'evm' | 'svm';
export type McpServerMode = 'npx' | 'docker';
export type McpDockerPullPolicy = 'always' | 'if-not-present' | 'never';

export interface McpDockerRuntimeConfig {
  /** Fully-qualified runtime image override */
  image?: string;
  /** Container name override; falls back to deterministic SAISO naming */
  containerName?: string;
  /** Docker network to attach */
  network?: string;
  /** Host interface used for HTTP reachability checks */
  host?: string;
  /** Host port mapping override */
  port?: number;
  /** Docker image pull strategy */
  pullPolicy?: McpDockerPullPolicy;
  /** Health endpoint path for readiness checks */
  healthPath?: string;
  /** Startup timeout in milliseconds */
  startupTimeoutMs?: number;
  /** Additional environment variables that may be forwarded */
  extraEnvAllowlist?: string[];
  /** Explicit extra environment variables for the container */
  extraEnv?: Record<string, string>;
}

export interface McpServerStatus {
  running: boolean;
  pid?: number;
  mode: McpServerMode;
  type: McpServerType;
  url: string;
  port: number;
  startTime?: Date;
  health?: 'healthy' | 'unhealthy' | 'unknown';
  capabilities?: string[];
}

export interface NetworkInfo {
  name: string;
  chainId: number;
  testnet: boolean;
  rpcUrl?: string;
  nativeCurrency: string;
  blockExplorer?: string;
  faucetUrl?: string;
}

export interface EvmServerConfig {
  network: string;
  chainId: number;
  rpcUrl?: string;
  privateKey?: string;
  port: number;
  host: string;
  customNetworks?: NetworkInfo[];
}

export interface SvmServerConfig {
  network: string;
  chainId: number;
  rpcUrl?: string;
  privateKey?: string;
  port: number;
  host: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface McpServerConfig {
  type: McpServerType;
  mode: McpServerMode;
  config: EvmServerConfig | SvmServerConfig;
  docker?: McpDockerRuntimeConfig;
}

export interface McpServerCapabilities {
  networks: NetworkInfo[];
  tools: string[];
  resources: string[];
  features: {
    ensSupport: boolean;
    nftSupport: boolean;
    multiTokenSupport: boolean;
    contractInteraction: boolean;
    gasEstimation: boolean;
  };
}

export interface McpServerOptions {
  mode: McpServerMode;
  config: McpServerConfig;
  projectPath: string;
}

export interface McpHealthCheck {
  healthy: boolean;
  latency?: number;
  error?: string;
  timestamp: Date;
}
