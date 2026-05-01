import type { NetworkConfig } from './networks.js';
import type { McpServerConfig } from './mcp.js';

/**
 * SAISO Configuration Types
 */

export type SaisoEnvironment = 'testnet' | 'mainnet' | 'devnet';

export interface SaisoConfig {
  /** Current environment */
  environment: SaisoEnvironment;
  /** Network configuration */
  network: string;
  /** Chain ID */
  chainId: number;
  /** RPC URL */
  rpcUrl: string;
  /** WebSocket RPC URL (optional) */
  wsRpcUrl?: string;
  /** Private key for transactions */
  privateKey?: string;
  /** Agent name */
  agentName: string;
  /** Project name */
  projectName?: string;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Debug mode */
  debug: boolean;
  /** MCP server URL */
  mcpServerUrl: string;
  /** MCP server port */
  mcpServerPort: number;
  /** Gas price multiplier */
  gasMultiplier?: number;
  /** Custom network configuration */
  customNetwork?: NetworkConfig;
  /** MCP server configuration */
  mcpServer: McpServerConfig;
  /** Optional payment configuration */
  payment?: PaymentConfig;
  /** Optional identity configuration */
  identity?: AgentIdentityConfig;
  /** Optional trust configuration */
  trust?: TrustConfig;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EnvironmentConfig {
  /** Environment variables mapping */
  [key: string]: string | undefined;
}

export interface ProjectConfig {
  /** SAISO version */
  version: string;
  /** Project type */
  type: 'agent' | 'library';
  /** Installed features */
  features: string[];
  /** Environment configurations */
  environments: {
    [env in SaisoEnvironment]?: {
      default?: boolean;
      confirmations?: boolean;
      limits?: {
        maxTransactionValue?: string;
        dailyLimit?: string;
      };
      experimental?: boolean;
    };
  };
  /** Custom settings */
  settings?: {
    [key: string]: string | number | boolean | object;
  };
}

export interface FeatureConfig {
  /** Feature name */
  name: string;
  /** Display name */
  displayName: string;
  /** Description */
  description: string;
  /** Version */
  version: string;
  /** Category */
  category: string;
  /** Server type compatibility */
  serverType?: 'evm' | 'svm' | 'universal';
  /** Dependencies */
  dependencies: Record<string, string>;
  /** SAISO feature dependencies that must be installed first */
  featureDependencies?: string[];
  /** Files to copy */
  files: Array<{
    source: string;
    destination: string;
  }>;
  /** Integration configuration */
  integration: {
    actions?: string[];
    evaluators?: string[];
    providers?: string[];
    imports?: string[];
  };
  /** Environment requirements */
  environment: {
    required: string[];
    optional: string[];
  };
  /** Feature capabilities */
  features: Record<string, string | number | boolean>;
  /** Usage examples */
  examples: string[];
  /** Network support */
  networks?: {
    [network: string]: {
      supported: boolean;
      config?: Record<string, string | number | boolean>;
    };
  };
  /** Feature parameters */
  parameters?: Record<string, {
    type: string;
    values?: string[];
    range?: number[];
    default?: string | number | boolean;
    optional?: boolean;
    description: string;
  }>;
  /** Network support mapping */
  networkSupport?: Record<string, {
    testnet?: boolean;
    mainnet?: boolean;
    devnet?: boolean;
    features?: string[];
  }>;
}

export interface PaymentConfig {
  enabled: boolean;
  preferredProtocol: 'x402' | 'mpp' | 'auto';
  maxPerRequestUsd?: number;
  dailyBudgetUsd?: number;
  allowedRecipients?: string[];
  blockedRecipients?: string[];
  toolMaxPerRequestUsd?: Record<string, number>;
  protocolAllowedRecipients?: Partial<Record<'x402' | 'mpp', string[]>>;
  protocolBlockedRecipients?: Partial<Record<'x402' | 'mpp', string[]>>;
  operationClassMinTrustScore?: Record<string, number>;
}

export interface AgentIdentityConfig {
  agentRegistry?: string;
  agentId?: string;
  agentUri?: string;
  endpoints?: Array<{
    name: string;
    endpoint: string;
    version?: string;
  }>;
  x402Support?: boolean;
  mppSupport?: boolean;
}

export interface TrustConfig {
  enabled: boolean;
  minTrustScore?: number;
  routingProfile?: 'trust-first' | 'cost-first' | 'balanced';
  reputationSource?: string;
  validationSource?: string;
}
