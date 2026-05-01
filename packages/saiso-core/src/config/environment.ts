import { config } from 'dotenv';
import path from 'node:path';
import type { SaisoEnvironment, EnvironmentConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { exists } from '../utils/files.js';

/**
 * Environment Configuration Management
 */

/**
 * Load environment files in order of precedence
 */
export async function loadEnvironmentFiles(
  environment?: SaisoEnvironment,
  projectRoot?: string
): Promise<void> {
  const root = projectRoot || process.cwd();
  const env = environment || (process.env.SAISO_ENVIRONMENT as SaisoEnvironment) || 'testnet';

  // Load highest-precedence files first; with override=false this preserves:
  // .env.<env>.local > .env.local > .env.<env> > .env
  const envFiles = [
    `.env.${env}.local`,
    '.env.local',
    `.env.${env}`,
    '.env',
  ];

  for (const envFile of envFiles) {
    const envPath = path.join(root, envFile);
    if (await exists(envPath)) {
      config({ path: envPath, override: false });
      logger.debug(`Loaded environment file: ${envFile}`);
    }
  }
}

/**
 * Get environment variables as typed configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    // Environment
    SAISO_ENVIRONMENT: process.env.SAISO_ENVIRONMENT,
    NODE_ENV: process.env.NODE_ENV,

    // Network
    SAISO_NETWORK: process.env.SAISO_NETWORK,
    NETWORK: process.env.NETWORK,
    CHAIN_ID: process.env.CHAIN_ID,

    // RPC
    RPC_URL: process.env.RPC_URL,
    WS_RPC_URL: process.env.WS_RPC_URL,

    // Security
    PRIVATE_KEY: process.env.PRIVATE_KEY,

    // Agent
    AGENT_NAME: process.env.AGENT_NAME,
    PROJECT_NAME: process.env.PROJECT_NAME,

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL,
    DEBUG: process.env.DEBUG,

    // MCP
    MCP_SERVER_URL: process.env.MCP_SERVER_URL,
    MCP_SERVER_PORT: process.env.MCP_SERVER_PORT,
    MCP_SERVER_TYPE: process.env.MCP_SERVER_TYPE,
    MCP_SERVER_MODE: process.env.MCP_SERVER_MODE,
    MCP_DOCKER_IMAGE: process.env.MCP_DOCKER_IMAGE,
    MCP_DOCKER_CONTAINER_NAME: process.env.MCP_DOCKER_CONTAINER_NAME,
    MCP_DOCKER_NETWORK: process.env.MCP_DOCKER_NETWORK,
    MCP_DOCKER_HOST: process.env.MCP_DOCKER_HOST,
    MCP_DOCKER_PORT: process.env.MCP_DOCKER_PORT,
    MCP_DOCKER_PULL_POLICY: process.env.MCP_DOCKER_PULL_POLICY,
    MCP_DOCKER_HEALTH_PATH: process.env.MCP_DOCKER_HEALTH_PATH,
    MCP_DOCKER_STARTUP_TIMEOUT_MS: process.env.MCP_DOCKER_STARTUP_TIMEOUT_MS,
    MCP_DOCKER_EXTRA_ENV_ALLOWLIST: process.env.MCP_DOCKER_EXTRA_ENV_ALLOWLIST,

    // Features
    AUTO_FUND: process.env.AUTO_FUND,
    GAS_MULTIPLIER: process.env.GAS_MULTIPLIER,

    // Payments
    PAYMENT_ENABLED: process.env.PAYMENT_ENABLED,
    PAYMENT_PREFERRED_PROTOCOL: process.env.PAYMENT_PREFERRED_PROTOCOL,
    PAYMENT_MAX_PER_REQUEST_USD: process.env.PAYMENT_MAX_PER_REQUEST_USD,
    PAYMENT_DAILY_BUDGET_USD: process.env.PAYMENT_DAILY_BUDGET_USD,
    PAYMENT_ALLOWED_RECIPIENTS: process.env.PAYMENT_ALLOWED_RECIPIENTS,
    PAYMENT_BLOCKED_RECIPIENTS: process.env.PAYMENT_BLOCKED_RECIPIENTS,

    // Identity
    IDENTITY_AGENT_REGISTRY: process.env.IDENTITY_AGENT_REGISTRY,
    IDENTITY_AGENT_ID: process.env.IDENTITY_AGENT_ID,
    IDENTITY_AGENT_URI: process.env.IDENTITY_AGENT_URI,
    IDENTITY_ENDPOINTS: process.env.IDENTITY_ENDPOINTS,
    IDENTITY_X402_SUPPORT: process.env.IDENTITY_X402_SUPPORT,

    // Trust
    TRUST_ENABLED: process.env.TRUST_ENABLED,
    TRUST_MIN_SCORE: process.env.TRUST_MIN_SCORE,
    TRUST_REPUTATION_SOURCE: process.env.TRUST_REPUTATION_SOURCE,
    TRUST_VALIDATION_SOURCE: process.env.TRUST_VALIDATION_SOURCE,

    // Custom
    CUSTOM_NETWORK: process.env.CUSTOM_NETWORK,
  };
}

/**
 * Set environment variable
 */
export function setEnvironmentVariable(key: string, value: string): void {
  process.env[key] = value;
  logger.debug(`Set environment variable: ${key}`);
}

/**
 * Get environment variable with default
 */
export function getEnvironmentVariable(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Get current environment
 */
export function getCurrentEnvironment(): SaisoEnvironment {
  const env = process.env.SAISO_ENVIRONMENT as SaisoEnvironment;
  if (['testnet', 'mainnet', 'devnet'].includes(env)) {
    return env;
  }
  return 'testnet'; // Default fallback
}

/**
 * Switch environment
 */
export function switchEnvironment(environment: SaisoEnvironment): void {
  process.env.SAISO_ENVIRONMENT = environment;
  logger.info(`Switched to environment: ${environment}`);
}

/**
 * Validate required environment variables
 */
export function validateRequiredEnvironmentVariables(required: string[]): string[] {
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * Mask sensitive environment variables for logging
 */
export function maskEnvironmentVariables(env: EnvironmentConfig): Record<string, string> {
  const masked: Record<string, string> = {};
  const sensitiveKeys = ['PRIVATE_KEY'];

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      masked[key] = 'undefined';
    } else if (sensitiveKeys.some(sensitive => key.includes(sensitive))) {
      masked[key] = value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : '***';
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
