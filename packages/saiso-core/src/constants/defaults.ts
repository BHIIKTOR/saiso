import type { SaisoConfig } from '../types/config.js';

/**
 * Default Configuration Values
 */

export const DEFAULT_CONFIG: Partial<SaisoConfig> = {
  environment: 'testnet',
  network: 'sepolia',
  logLevel: 'info',
  debug: false,
  mcpServerUrl: 'http://localhost:3001',
  mcpServerPort: 3001,
  gasMultiplier: 1.2,
};

export const DEFAULT_PORTS = {
  MCP_SERVER: 3001,
  AGENT_HTTP: 3000,
  AGENT_WS: 3002,
} as const;

export const DEFAULT_TIMEOUTS = {
  NETWORK_REQUEST: 30000,
  TRANSACTION_CONFIRM: 60000,
  MCP_SERVER_START: 30000,
  AGENT_START: 10000,
} as const;

export const DEFAULT_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  BACKOFF_MULTIPLIER: 2,
} as const;

export const SUPPORTED_ENVIRONMENTS = ['testnet', 'mainnet', 'devnet'] as const;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const DEFAULT_GAS_LIMITS = {
  TRANSFER: 21000,
  CONTRACT_CALL: 100000,
  CONTRACT_DEPLOY: 500000,
} as const;
