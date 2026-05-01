/**
 * Multi-Server MCP Types - Concurrent Server Architecture
 */

// Import shared types to avoid conflicts
import type { McpServerStatus, NetworkInfo } from './mcp.js';

// Re-export shared types for convenience
export type { McpServerStatus, NetworkInfo };

export type ServerCategory = 'blockchain' | 'utility' | 'custom';
export type ServerType = 'evm' | 'svm' | 'utility' | 'custom';

export interface IndividualServerConfig {
  /** User-defined server name */
  name: string;
  /** Friendly display name */
  displayName: string;
  /** User description */
  description: string;
  /** Server type */
  type: ServerType;
  /** Server category */
  category: ServerCategory;
  /** Auto-start with saiso dev */
  autoStart: boolean;
  /** Allocated port */
  port: number;
  /** Environment variable prefix */
  envPrefix: string;
  /** Server capabilities */
  capabilities: string[];
  /** Creation timestamp */
  createdAt: Date;
  /** Last modified timestamp */
  updatedAt: Date;
  /** Server-specific configuration */
  serverConfig: MultiEvmServerConfig | MultiSvmServerConfig | UtilityServerConfig | CustomServerConfig;
  /** Optional trust score for routing */
  trustScore?: number;
  /** Optional cost estimate for paid routing decisions */
  costPerRequestUsd?: number;
  /** Optional metadata describing identity/reputation source */
  trustMetadata?: Record<string, string | number | boolean>;
}

export interface MultiEvmServerConfig {
  network: string;
  chainId: number;
  rpcUrl?: string;
  mode: 'npx' | 'docker';
  customNetworks?: NetworkInfo[];
}

export interface MultiSvmServerConfig {
  network: string;
  chainId: number;
  rpcUrl?: string;
  mode: 'npx' | 'docker';
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface UtilityServerConfig {
  command: string;
  args: string[];
  mode: 'npx' | 'docker' | 'binary';
  healthEndpoint?: string;
}

export interface CustomServerConfig {
  command: string;
  args: string[];
  mode: 'npx' | 'docker' | 'binary';
  healthEndpoint?: string;
  customConfig?: Record<string, string | number | boolean>;
}

export interface McpServerInstance {
  config: IndividualServerConfig;
  orchestrator: McpServerOrchestrator;
  status: McpServerStatus | null;
  lastHealthCheck?: Date;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export interface ServerInfo {
  name: string;
  displayName: string;
  description: string;
  type: ServerType;
  category: ServerCategory;
  status: 'running' | 'stopped' | 'error';
  port: number;
  url?: string;
  capabilities: string[];
  autoStart: boolean;
  lastHealthCheck?: Date;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  trustScore?: number;
  costPerRequestUsd?: number;
}

export interface RoutingCriteria {
  capability?: string;
  network?: string;
  serverType?: ServerType;
  category?: ServerCategory;
  routingProfile?: 'trust-first' | 'cost-first' | 'balanced';
  preferredServers?: string[];
  excludeServers?: string[];
  minTrustScore?: number;
  maxCostUsd?: number;
}

export interface ResourceAllocation {
  port: number;
  allocated: boolean;
  serverName?: string;
  allocatedAt?: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GlobalConfig {
  version: string;
  defaultServerType: ServerType;
  autoStartServers: string[];
  resourceLimits: {
    maxServers: number;
    portRange: {
      start: number;
      end: number;
    };
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableServerLogs: boolean;
  };
  agentMemory: {
    preserveAcrossServers: boolean;
    backupInterval: number; // minutes
  };
}

// Import existing types for compatibility
import type { McpServerOrchestrator } from '../mcp/orchestrator.js';
