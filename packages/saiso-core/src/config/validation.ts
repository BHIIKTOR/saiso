import type { SaisoConfig, ConfigValidationResult } from '../types/config.js';
import type { McpDockerRuntimeConfig } from '../types/mcp.js';
import { isNetworkSupported } from '../constants/networks.js';
import { isEvmNetworkSupported } from '../constants/evm-networks.js';
import { isSvmNetworkSupported } from '../constants/svm-networks.js';
import { isValidPrivateKey, isValidSvmPrivateKey, isValidAddress } from '../utils/crypto.js';

/**
 * Configuration Validation Utilities
 */

/**
 * Validate SAISO configuration
 */
export function validateConfig(config: SaisoConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields
  if (!config.network) {
    errors.push('Network is required');
  } else if (!isNetworkSupported(config.network) && !isEvmNetworkSupported(config.network) && !isSvmNetworkSupported(config.network) && !config.customNetwork) {
    errors.push(`Unsupported network: ${config.network}`);
  }

  if (!config.chainId || config.chainId <= 0) {
    errors.push('Valid chain ID is required');
  }

  if (!config.rpcUrl) {
    errors.push('RPC URL is required');
  } else if (!isValidUrl(config.rpcUrl)) {
    errors.push('Invalid RPC URL format');
  }

  if (!config.agentName || config.agentName.trim() === '') {
    errors.push('Agent name is required');
  }

  if (config.mcpServer?.mode === 'docker') {
    const dockerValidation = validateDockerRuntimeConfig(config.mcpServer?.docker);
    errors.push(...dockerValidation.errors);
    warnings.push(...dockerValidation.warnings);
  }

  // Validate private key if provided
  if (config.privateKey) {
    const isSvm = config.mcpServer?.type === 'svm' || isSvmNetworkSupported(config.network);
    const validPrivateKey = isSvm
      ? isValidSvmPrivateKey(config.privateKey)
      : isValidPrivateKey(config.privateKey);
    if (!validPrivateKey) {
      errors.push('Invalid private key format');
    }
  } else if (config.environment === 'mainnet') {
    errors.push('Private key is required for mainnet');
  } else {
    warnings.push('No private key provided - some features may not work');
  }

  // Validate log level
  if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
    errors.push('Invalid log level');
  }

  // Validate gas multiplier
  if (config.gasMultiplier && (config.gasMultiplier <= 0 || config.gasMultiplier > 10)) {
    warnings.push('Gas multiplier should be between 0 and 10');
  }

  if (config.payment) {
    if (!['x402', 'mpp', 'auto'].includes(config.payment.preferredProtocol)) {
      errors.push('payment.preferredProtocol must be x402, mpp, or auto');
    }

    if (typeof config.payment.maxPerRequestUsd === 'number' && config.payment.maxPerRequestUsd < 0) {
      errors.push('payment.maxPerRequestUsd must be non-negative');
    }

    if (typeof config.payment.dailyBudgetUsd === 'number' && config.payment.dailyBudgetUsd < 0) {
      errors.push('payment.dailyBudgetUsd must be non-negative');
    }

    if (config.payment.toolMaxPerRequestUsd) {
      for (const [toolName, limit] of Object.entries(config.payment.toolMaxPerRequestUsd)) {
        if (typeof limit !== 'number' || Number.isNaN(limit) || limit < 0) {
          errors.push(`payment.toolMaxPerRequestUsd.${toolName} must be a non-negative number`);
        }
      }
    }

    if (config.payment.operationClassMinTrustScore) {
      for (const [operationClass, minTrust] of Object.entries(config.payment.operationClassMinTrustScore)) {
        if (typeof minTrust !== 'number' || Number.isNaN(minTrust) || minTrust < 0 || minTrust > 1) {
          errors.push(`payment.operationClassMinTrustScore.${operationClass} must be between 0 and 1`);
        }
      }
    }
  }

  if (config.trust?.enabled && typeof config.trust.minTrustScore === 'number') {
    if (config.trust.minTrustScore < 0 || config.trust.minTrustScore > 1) {
      errors.push('trust.minTrustScore must be between 0 and 1');
    }
  }

  if (
    config.trust?.routingProfile
    && !['trust-first', 'cost-first', 'balanced'].includes(config.trust.routingProfile)
  ) {
    errors.push('trust.routingProfile must be trust-first, cost-first, or balanced');
  }

  // Environment-specific validations
  if (config.environment === 'mainnet') {
    if (config.debug) {
      warnings.push('Debug mode is enabled on mainnet');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateDockerRuntimeConfig(
  dockerConfig: McpDockerRuntimeConfig | undefined
): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!dockerConfig) {
    warnings.push('MCP docker mode enabled without explicit docker runtime config; defaults will be used.');
    return { valid: true, errors, warnings };
  }

  if (dockerConfig.image !== undefined && dockerConfig.image.trim() === '') {
    errors.push('mcpServer.docker.image must be a non-empty string when provided');
  }

  if (dockerConfig.containerName !== undefined && dockerConfig.containerName.trim() === '') {
    errors.push('mcpServer.docker.containerName must be a non-empty string when provided');
  }

  if (dockerConfig.network !== undefined && dockerConfig.network.trim() === '') {
    errors.push('mcpServer.docker.network must be a non-empty string when provided');
  }

  if (dockerConfig.host !== undefined && dockerConfig.host.trim() === '') {
    errors.push('mcpServer.docker.host must be a non-empty string when provided');
  }

  if (
    dockerConfig.port !== undefined
    && (!Number.isInteger(dockerConfig.port) || dockerConfig.port <= 0 || dockerConfig.port > 65535)
  ) {
    errors.push('mcpServer.docker.port must be an integer between 1 and 65535');
  }

  if (
    dockerConfig.pullPolicy !== undefined
    && !['always', 'if-not-present', 'never'].includes(dockerConfig.pullPolicy)
  ) {
    errors.push('mcpServer.docker.pullPolicy must be always, if-not-present, or never');
  }

  if (
    dockerConfig.startupTimeoutMs !== undefined
    && (!Number.isInteger(dockerConfig.startupTimeoutMs) || dockerConfig.startupTimeoutMs < 1000 || dockerConfig.startupTimeoutMs > 300000)
  ) {
    errors.push('mcpServer.docker.startupTimeoutMs must be an integer between 1000 and 300000');
  }

  if (dockerConfig.healthPath !== undefined) {
    if (!dockerConfig.healthPath.startsWith('/')) {
      errors.push('mcpServer.docker.healthPath must start with "/"');
    }
    if (dockerConfig.healthPath.includes('..')) {
      errors.push('mcpServer.docker.healthPath must not contain ".."');
    }
  }

  if (dockerConfig.extraEnvAllowlist !== undefined) {
    for (const envKey of dockerConfig.extraEnvAllowlist) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(envKey)) {
        errors.push(`mcpServer.docker.extraEnvAllowlist contains invalid env key '${envKey}'`);
      }
    }
  }

  if (dockerConfig.extraEnv !== undefined) {
    for (const [key, value] of Object.entries(dockerConfig.extraEnv)) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        errors.push(`mcpServer.docker.extraEnv contains invalid env key '${key}'`);
      }
      if (typeof value !== 'string') {
        errors.push(`mcpServer.docker.extraEnv.${key} must be a string`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate environment name
 */
export function isValidEnvironment(env: string): env is 'testnet' | 'mainnet' | 'devnet' {
  return ['testnet', 'mainnet', 'devnet'].includes(env);
}

/**
 * Validate network configuration
 */
export function validateNetworkConfig(config: unknown): config is import('../types/networks.js').NetworkConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const obj = config as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.chainId === 'number' &&
    typeof obj.rpcUrl === 'string' &&
    typeof obj.nativeCurrency === 'string' &&
    typeof obj.decimals === 'number' &&
    typeof obj.blockExplorer === 'string'
  );
}
