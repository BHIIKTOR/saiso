import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { McpDockerRuntimeConfig, McpServerConfig, McpServerType, SvmServerConfig } from '../types/mcp.js';
import type { SaisoConfig, SaisoEnvironment, ConfigValidationResult } from '../types/config.js';
import type { NetworkConfig } from '../types/networks.js';
import { getNetworkConfig, isNetworkSupported } from '../constants/networks.js';
import { getEvmNetwork, isEvmNetworkSupported } from '../constants/evm-networks.js';
import { getSvmNetwork, isSvmNetworkSupported } from '../constants/svm-networks.js';
import { DEFAULT_CONFIG } from '../constants/defaults.js';
import {
  DEFAULT_MCP_DOCKER_HEALTH_PATH,
  DEFAULT_MCP_DOCKER_PULL_POLICY,
  DEFAULT_MCP_DOCKER_STARTUP_TIMEOUT_MS,
  getDefaultMcpDockerImage
} from '../constants/docker.js';
import { validateDockerRuntimeConfig } from './validation.js';
import { isValidPrivateKey as isValidEvmPrivateKey, isValidSvmPrivateKey } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

/**
 * SAISO Configuration Manager
 */
export class SaisoConfigManager {
  private static instance: SaisoConfigManager;
  private cachedConfig: SaisoConfig | null = null;

  static getInstance(): SaisoConfigManager {
    if (!SaisoConfigManager.instance) {
      SaisoConfigManager.instance = new SaisoConfigManager();
    }
    return SaisoConfigManager.instance;
  }

  /**
   * Load configuration from environment
   */
  loadConfig(environment?: SaisoEnvironment, projectRoot?: string): SaisoConfig {
    try {
      // Load environment variables
      this.loadEnvironmentFiles(environment, projectRoot);

      const env = process.env;
      const targetEnv = environment || (env.SAISO_ENVIRONMENT as SaisoEnvironment) || DEFAULT_CONFIG.environment || 'testnet';
      const network = env.SAISO_NETWORK || env.NETWORK || DEFAULT_CONFIG.network || 'ethereum';

      // Get network configuration
      const networkConfig = this.resolveNetworkConfig(network, targetEnv);
      const chainId = Number.parseInt(env.CHAIN_ID || networkConfig.chainId.toString(), 10);
      const rpcUrl = env.RPC_URL || networkConfig.rpcUrl;

      const saisoConfig: SaisoConfig = {
        environment: targetEnv,
        network,
        chainId,
        rpcUrl,
        wsRpcUrl: env.WS_RPC_URL || networkConfig.wsRpcUrl,
        privateKey: env.PRIVATE_KEY,
        agentName: env.AGENT_NAME || 'SaisoAgent',
        projectName: env.PROJECT_NAME,
        logLevel: (env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || DEFAULT_CONFIG.logLevel || 'info',
        debug: env.DEBUG === 'true' || env.NODE_ENV === 'development',
        mcpServerUrl: env.MCP_SERVER_URL || DEFAULT_CONFIG.mcpServerUrl || 'http://localhost:3001',
        mcpServerPort: Number.parseInt(env.MCP_SERVER_PORT || DEFAULT_CONFIG.mcpServerPort?.toString() || '3001', 10),
        gasMultiplier: Number.parseFloat(env.GAS_MULTIPLIER || networkConfig.gasMultiplier?.toString() || DEFAULT_CONFIG.gasMultiplier?.toString() || '1.2'),
        customNetwork: this.parseCustomNetwork(env.CUSTOM_NETWORK),
        mcpServer: this.getDefaultMcpServerConfig(env, network, chainId, rpcUrl),
        payment: {
          enabled: env.PAYMENT_ENABLED === 'true',
          preferredProtocol: this.parsePaymentProtocol(env.PAYMENT_PREFERRED_PROTOCOL) || 'auto',
          maxPerRequestUsd: this.parseOptionalNumber(env.PAYMENT_MAX_PER_REQUEST_USD, 'PAYMENT_MAX_PER_REQUEST_USD'),
          dailyBudgetUsd: this.parseOptionalNumber(env.PAYMENT_DAILY_BUDGET_USD, 'PAYMENT_DAILY_BUDGET_USD'),
          allowedRecipients: env.PAYMENT_ALLOWED_RECIPIENTS ? env.PAYMENT_ALLOWED_RECIPIENTS.split(',').map(item => item.trim()).filter(Boolean) : undefined,
          blockedRecipients: env.PAYMENT_BLOCKED_RECIPIENTS ? env.PAYMENT_BLOCKED_RECIPIENTS.split(',').map(item => item.trim()).filter(Boolean) : undefined,
          toolMaxPerRequestUsd: this.parseJsonNumberRecord(env.PAYMENT_TOOL_MAX_PER_REQUEST_USD_JSON, 'PAYMENT_TOOL_MAX_PER_REQUEST_USD_JSON'),
          protocolAllowedRecipients: this.parseProtocolRecipientRecord(env.PAYMENT_PROTOCOL_ALLOWED_RECIPIENTS_JSON, 'PAYMENT_PROTOCOL_ALLOWED_RECIPIENTS_JSON'),
          protocolBlockedRecipients: this.parseProtocolRecipientRecord(env.PAYMENT_PROTOCOL_BLOCKED_RECIPIENTS_JSON, 'PAYMENT_PROTOCOL_BLOCKED_RECIPIENTS_JSON'),
          operationClassMinTrustScore: this.parseJsonNumberRecord(env.PAYMENT_OPERATION_CLASS_MIN_TRUST_SCORE_JSON, 'PAYMENT_OPERATION_CLASS_MIN_TRUST_SCORE_JSON'),
        },
        identity: this.parseIdentityConfig(env),
        trust: {
          enabled: env.TRUST_ENABLED === 'true',
          minTrustScore: this.parseOptionalNumber(env.TRUST_MIN_SCORE, 'TRUST_MIN_SCORE', { min: 0, max: 1 }),
          routingProfile: this.parseRoutingProfile(env.TRUST_ROUTING_PROFILE),
          reputationSource: env.TRUST_REPUTATION_SOURCE,
          validationSource: env.TRUST_VALIDATION_SOURCE,
        },
      };

      this.cachedConfig = saisoConfig;
      return saisoConfig;
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      throw new Error(`Configuration loading failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Load environment files in order of precedence
   */
  private loadEnvironmentFiles(environment?: SaisoEnvironment, projectRoot?: string): void {
    const root = projectRoot || process.cwd();
    const env = environment || process.env.SAISO_ENVIRONMENT || 'testnet';

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
      if (existsSync(envPath)) {
        config({ path: envPath, override: false });
        logger.debug(`Loaded environment file: ${envFile}`);
      }
    }
  }

  /**
   * Parse custom network configuration from environment
   */
  private parseCustomNetwork(customNetworkEnv?: string): NetworkConfig | undefined {
    if (!customNetworkEnv) return undefined;

    try {
      return JSON.parse(customNetworkEnv) as NetworkConfig;
    } catch (error) {
      logger.warn('Failed to parse CUSTOM_NETWORK environment variable:', error);
      return undefined;
    }
  }

  /**
   * Get default MCP server configuration
   */
  private getDefaultMcpServerConfig(
    env: NodeJS.ProcessEnv,
    network: string,
    chainId: number,
    rpcUrl: string
  ): McpServerConfig {
    const requestedServerType = (env.MCP_SERVER_TYPE as McpServerType | undefined);
    const serverType = requestedServerType || this.inferServerType(network);
    const mode = (env.MCP_SERVER_MODE as 'npx' | 'docker') || 'npx';
    const docker = this.parseDockerRuntimeConfig(env, serverType);

    if (serverType === 'svm') {
      const svmConfig: SvmServerConfig = {
        network,
        chainId,
        rpcUrl,
        privateKey: env.PRIVATE_KEY,
        port: Number.parseInt(env.MCP_SERVER_PORT || '3001', 10),
        host: env.MCP_SERVER_HOST || 'localhost',
        commitment: (env.SVM_COMMITMENT as 'processed' | 'confirmed' | 'finalized') || 'confirmed',
      };
      return {
        type: 'svm',
        mode,
        config: svmConfig,
        docker,
      };
    }

    return {
      type: 'evm',
      mode,
      docker,
      config: {
        network,
        chainId,
        rpcUrl,
        privateKey: env.PRIVATE_KEY,
        port: Number.parseInt(env.MCP_SERVER_PORT || '3001', 10),
        host: env.MCP_SERVER_HOST || 'localhost',
      },
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: SaisoConfig): ConfigValidationResult {
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
    } else if (!this.isValidUrl(config.rpcUrl)) {
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
      if (!this.isValidPrivateKey(config.privateKey, config)) {
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

  /**
   * Generate environment template
   */
  generateEnvTemplate(environment: SaisoEnvironment): string {
    const defaultNetwork = environment === 'mainnet' ? 'ethereum' : 'sepolia';
    const networkConfig = this.resolveNetworkConfig(defaultNetwork, environment);

    return `# SAISO Configuration - ${environment.toUpperCase()}
# Generated on ${new Date().toISOString()}

# Environment
SAISO_ENVIRONMENT=${environment}

# Network Configuration
SAISO_NETWORK=${defaultNetwork}
CHAIN_ID=${networkConfig.chainId}
RPC_URL=${networkConfig.rpcUrl}
${networkConfig.wsRpcUrl ? `WS_RPC_URL=${networkConfig.wsRpcUrl}` : '# WS_RPC_URL='}

# Security (REQUIRED)
PRIVATE_KEY=your_private_key_here

# Agent Configuration
AGENT_NAME=MyAgent
PROJECT_NAME=my-saiso-project

# Logging
LOG_LEVEL=info
DEBUG=${environment === 'devnet' ? 'true' : 'false'}

# MCP Server
MCP_SERVER_TYPE=evm
MCP_SERVER_URL=http://localhost:3001
MCP_SERVER_PORT=3001
MCP_SERVER_MODE=npx
# MCP_DOCKER_IMAGE=
# MCP_DOCKER_CONTAINER_NAME=
# MCP_DOCKER_NETWORK=
# MCP_DOCKER_HOST=localhost
# MCP_DOCKER_PORT=3001
# MCP_DOCKER_PULL_POLICY=if-not-present
# MCP_DOCKER_HEALTH_PATH=/health
# MCP_DOCKER_STARTUP_TIMEOUT_MS=30000
# MCP_DOCKER_EXTRA_ENV_ALLOWLIST=

# Features
AUTO_FUND=${environment === 'testnet' ? 'true' : 'false'}
GAS_MULTIPLIER=${networkConfig.gasMultiplier || 1.2}

# Payment Policy (optional)
PAYMENT_ENABLED=false
PAYMENT_PREFERRED_PROTOCOL=auto
PAYMENT_MAX_PER_REQUEST_USD=5
PAYMENT_DAILY_BUDGET_USD=50
# PAYMENT_ALLOWED_RECIPIENTS=api.vendor.xyz,0xabc...
# PAYMENT_BLOCKED_RECIPIENTS=malicious.example
# PAYMENT_TOOL_MAX_PER_REQUEST_USD_JSON={"premium-simulate":1.5,"premium-market-intel":0.5}
# PAYMENT_PROTOCOL_ALLOWED_RECIPIENTS_JSON={"x402":["pay.example"],"mpp":["tempo.xyz"]}
# PAYMENT_PROTOCOL_BLOCKED_RECIPIENTS_JSON={"x402":["deny.example"]}
# PAYMENT_OPERATION_CLASS_MIN_TRUST_SCORE_JSON={"read":0.4,"write":0.65,"high-risk":0.8}

# Agent Identity (ERC-8004 aligned, optional)
# IDENTITY_AGENT_REGISTRY=https://registry.example
# IDENTITY_AGENT_ID=did:pkh:eip155:1:0x...
# IDENTITY_AGENT_URI=https://agent.example/.well-known/agent.json
# IDENTITY_ENDPOINTS=[{"name":"mcp","endpoint":"https://agent.example/mcp","version":"1.0"}]
IDENTITY_X402_SUPPORT=true
# IDENTITY_MPP_SUPPORT=true

# Trust Policy (optional)
TRUST_ENABLED=false
TRUST_MIN_SCORE=0.6
# TRUST_ROUTING_PROFILE=trust-first
# TRUST_REPUTATION_SOURCE=
# TRUST_VALIDATION_SOURCE=

# Custom Network (optional)
# CUSTOM_NETWORK={"name":"Custom","chainId":1234,"rpcUrl":"https://..."}
`;
  }

  /**
   * Get cached configuration
   */
  getCachedConfig(): SaisoConfig | null {
    return this.cachedConfig;
  }

  /**
   * Clear cached configuration
   */
  clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Set configuration value
   */
  async setConfigValue(key: string, value: string, environment?: SaisoEnvironment, projectRoot?: string): Promise<void> {
    const root = projectRoot || process.cwd();
    const env = environment || process.env.SAISO_ENVIRONMENT || 'testnet';
    const envFilePath = path.join(root, `.env.${env}`);

    try {
      let envContent = '';
      if (existsSync(envFilePath)) {
        envContent = await import('node:fs/promises').then(fs => fs.readFile(envFilePath, 'utf-8'));
      }

      // Parse existing environment variables
      const envLines = envContent.split('\n');
      const envVars = new Map<string, string>();

      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [envKey, ...envValueParts] = trimmed.split('=');
          if (envKey && envValueParts.length > 0) {
            envVars.set(envKey.trim(), envValueParts.join('=').trim());
          }
        }
      }

      // Map configuration keys to environment variable names
      const keyMapping: Record<string, string> = {
        'environment': 'SAISO_ENVIRONMENT',
        'network': 'SAISO_NETWORK',
        'chainId': 'CHAIN_ID',
        'rpcUrl': 'RPC_URL',
        'wsRpcUrl': 'WS_RPC_URL',
        'privateKey': 'PRIVATE_KEY',
        'agentName': 'AGENT_NAME',
        'projectName': 'PROJECT_NAME',
        'logLevel': 'LOG_LEVEL',
        'debug': 'DEBUG',
        'mcpServerUrl': 'MCP_SERVER_URL',
        'mcpServerPort': 'MCP_SERVER_PORT',
        'mcpServerType': 'MCP_SERVER_TYPE',
        'mcpServerMode': 'MCP_SERVER_MODE',
        'mcpDockerImage': 'MCP_DOCKER_IMAGE',
        'mcpDockerContainerName': 'MCP_DOCKER_CONTAINER_NAME',
        'mcpDockerNetwork': 'MCP_DOCKER_NETWORK',
        'mcpDockerHost': 'MCP_DOCKER_HOST',
        'mcpDockerPort': 'MCP_DOCKER_PORT',
        'mcpDockerPullPolicy': 'MCP_DOCKER_PULL_POLICY',
        'mcpDockerHealthPath': 'MCP_DOCKER_HEALTH_PATH',
        'mcpDockerStartupTimeoutMs': 'MCP_DOCKER_STARTUP_TIMEOUT_MS',
        'mcpDockerExtraEnvAllowlist': 'MCP_DOCKER_EXTRA_ENV_ALLOWLIST',
        'gasMultiplier': 'GAS_MULTIPLIER',
        'paymentEnabled': 'PAYMENT_ENABLED',
        'paymentProtocol': 'PAYMENT_PREFERRED_PROTOCOL',
        'paymentMaxPerRequestUsd': 'PAYMENT_MAX_PER_REQUEST_USD',
        'paymentDailyBudgetUsd': 'PAYMENT_DAILY_BUDGET_USD',
        'paymentAllowedRecipients': 'PAYMENT_ALLOWED_RECIPIENTS',
        'paymentBlockedRecipients': 'PAYMENT_BLOCKED_RECIPIENTS',
        'paymentToolMaxPerRequestUsd': 'PAYMENT_TOOL_MAX_PER_REQUEST_USD_JSON',
        'paymentProtocolAllowedRecipients': 'PAYMENT_PROTOCOL_ALLOWED_RECIPIENTS_JSON',
        'paymentProtocolBlockedRecipients': 'PAYMENT_PROTOCOL_BLOCKED_RECIPIENTS_JSON',
        'paymentOperationClassMinTrustScore': 'PAYMENT_OPERATION_CLASS_MIN_TRUST_SCORE_JSON',
        'identityRegistry': 'IDENTITY_AGENT_REGISTRY',
        'identityAgentId': 'IDENTITY_AGENT_ID',
        'identityAgentUri': 'IDENTITY_AGENT_URI',
        'identityEndpoints': 'IDENTITY_ENDPOINTS',
        'identityX402Support': 'IDENTITY_X402_SUPPORT',
        'identityMppSupport': 'IDENTITY_MPP_SUPPORT',
        'trustEnabled': 'TRUST_ENABLED',
        'trustMinScore': 'TRUST_MIN_SCORE',
        'trustRoutingProfile': 'TRUST_ROUTING_PROFILE',
        'trustReputationSource': 'TRUST_REPUTATION_SOURCE',
        'trustValidationSource': 'TRUST_VALIDATION_SOURCE',
      };

      const envKey = keyMapping[key] || key.toUpperCase();
      envVars.set(envKey, value);

      // Regenerate environment file
      const newEnvContent = Array.from(envVars.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

      await import('node:fs/promises').then(fs => fs.writeFile(envFilePath, newEnvContent));

      // Clear cache to force reload
      this.clearCache();

      logger.info(`Set ${envKey}=${value} in ${envFilePath}`);
    } catch (error) {
      logger.error('Failed to set configuration value:', error);
      throw new Error(`Failed to set configuration: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check if environment is valid
   */
  isValidEnvironment(env: string): env is SaisoEnvironment {
    return ['testnet', 'mainnet', 'devnet'].includes(env);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate private key format
   */
  private isValidPrivateKey(privateKey: string, config: SaisoConfig): boolean {
    const isSvm = config.mcpServer?.type === 'svm' || isSvmNetworkSupported(config.network);
    return isSvm ? isValidSvmPrivateKey(privateKey) : isValidEvmPrivateKey(privateKey);
  }

  private resolveNetworkConfig(network: string, environment: SaisoEnvironment): NetworkConfig {
    try {
      return getNetworkConfig(network, environment);
    } catch {
      const evmNetwork = getEvmNetwork(network);
      if (evmNetwork) {
        return {
          name: evmNetwork.name,
          chainId: evmNetwork.chainId,
          rpcUrl: evmNetwork.rpcUrl || '',
          nativeCurrency: evmNetwork.nativeCurrency || 'ETH',
          decimals: 18,
          blockExplorer: evmNetwork.blockExplorer || '',
          wsRpcUrl: undefined,
          gasMultiplier: 1.2,
          faucets: evmNetwork.faucetUrl ? [evmNetwork.faucetUrl] : [],
        };
      }

      const svmNetwork = getSvmNetwork(network);
      if (svmNetwork) {
        return {
          name: svmNetwork.name,
          chainId: svmNetwork.chainId,
          rpcUrl: svmNetwork.rpcUrl || '',
          nativeCurrency: svmNetwork.nativeCurrency || 'SOL',
          decimals: 9,
          blockExplorer: svmNetwork.blockExplorer || '',
          wsRpcUrl: undefined,
          gasMultiplier: 1.0,
          faucets: svmNetwork.faucetUrl ? [svmNetwork.faucetUrl] : [],
        };
      }

      logger.warn(`Network ${network} not found for ${environment}, falling back to ethereum/${environment}`);
      return getNetworkConfig('ethereum', environment);
    }
  }

  private inferServerType(network: string): McpServerType {
    if (isSvmNetworkSupported(network) || network.startsWith('solana')) {
      return 'svm';
    }
    return 'evm';
  }

  private parseIdentityConfig(env: NodeJS.ProcessEnv): SaisoConfig['identity'] | undefined {
    let endpoints: SaisoConfig['identity'] extends { endpoints?: infer T } ? T : undefined;
    if (env.IDENTITY_ENDPOINTS) {
      try {
        endpoints = JSON.parse(env.IDENTITY_ENDPOINTS) as NonNullable<typeof endpoints>;
      } catch {
        logger.warn('IDENTITY_ENDPOINTS is not valid JSON and will be ignored.');
      }
    }

    const identity = {
      agentRegistry: env.IDENTITY_AGENT_REGISTRY,
      agentId: env.IDENTITY_AGENT_ID,
      agentUri: env.IDENTITY_AGENT_URI,
      endpoints,
      x402Support: env.IDENTITY_X402_SUPPORT === 'true'
        ? true
        : env.IDENTITY_X402_SUPPORT === 'false'
          ? false
          : undefined,
      mppSupport: env.IDENTITY_MPP_SUPPORT === 'true'
        ? true
        : env.IDENTITY_MPP_SUPPORT === 'false'
          ? false
          : undefined,
    };

    if (
      !identity.agentRegistry
      && !identity.agentId
      && !identity.agentUri
      && !identity.endpoints
      && identity.x402Support === undefined
      && identity.mppSupport === undefined
    ) {
      return undefined;
    }

    return identity;
  }

  private parseDockerRuntimeConfig(
    env: NodeJS.ProcessEnv,
    serverType: McpServerType
  ): McpDockerRuntimeConfig {
    const allowlist = env.MCP_DOCKER_EXTRA_ENV_ALLOWLIST
      ? env.MCP_DOCKER_EXTRA_ENV_ALLOWLIST.split(',').map(item => item.trim()).filter(Boolean)
      : undefined;
    const explicitExtraEnv: Record<string, string> = {};
    if (allowlist) {
      for (const key of allowlist) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
          continue;
        }
        const value = env[key];
        if (typeof value === 'string') {
          explicitExtraEnv[key] = value;
        }
      }
    }

    return {
      image: env.MCP_DOCKER_IMAGE || getDefaultMcpDockerImage(serverType),
      containerName: env.MCP_DOCKER_CONTAINER_NAME,
      network: env.MCP_DOCKER_NETWORK,
      host: env.MCP_DOCKER_HOST || 'localhost',
      port: this.parseOptionalInteger(env.MCP_DOCKER_PORT, 'MCP_DOCKER_PORT') ?? undefined,
      pullPolicy: (env.MCP_DOCKER_PULL_POLICY as McpDockerRuntimeConfig['pullPolicy']) || DEFAULT_MCP_DOCKER_PULL_POLICY,
      healthPath: env.MCP_DOCKER_HEALTH_PATH || DEFAULT_MCP_DOCKER_HEALTH_PATH,
      startupTimeoutMs: this.parseOptionalInteger(env.MCP_DOCKER_STARTUP_TIMEOUT_MS, 'MCP_DOCKER_STARTUP_TIMEOUT_MS')
        ?? DEFAULT_MCP_DOCKER_STARTUP_TIMEOUT_MS,
      extraEnvAllowlist: allowlist,
      extraEnv: Object.keys(explicitExtraEnv).length > 0 ? explicitExtraEnv : undefined,
    };
  }

  private parseJsonNumberRecord(raw: string | undefined, envName: string): Record<string, number> | undefined {
    if (!raw || !raw.trim()) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('must be a JSON object');
      }

      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          throw new Error(`value for '${key}' must be a number`);
        }
        out[key] = value;
      }
      return out;
    } catch (error) {
      logger.warn(`${envName} is invalid and will be ignored: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private parseOptionalInteger(raw: string | undefined, envName: string): number | undefined {
    if (!raw || !raw.trim()) {
      return undefined;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed)) {
      logger.warn(`${envName} is invalid and will be ignored: must be an integer`);
      return undefined;
    }
    return parsed;
  }

  private parseProtocolRecipientRecord(
    raw: string | undefined,
    envName: string
  ): Partial<Record<'x402' | 'mpp', string[]>> | undefined {
    if (!raw || !raw.trim()) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('must be a JSON object');
      }

      const out: Partial<Record<'x402' | 'mpp', string[]>> = {};
      for (const protocol of ['x402', 'mpp'] as const) {
        const value = (parsed as Record<string, unknown>)[protocol];
        if (value === undefined) {
          continue;
        }

        if (!Array.isArray(value)) {
          throw new Error(`'${protocol}' must be an array of recipients`);
        }

        const recipients = value
          .filter(item => typeof item === 'string')
          .map(item => (item as string).trim())
          .filter(Boolean);
        out[protocol] = recipients;
      }

      return Object.keys(out).length > 0 ? out : undefined;
    } catch (error) {
      logger.warn(`${envName} is invalid and will be ignored: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private parseRoutingProfile(value: string | undefined): 'trust-first' | 'cost-first' | 'balanced' | undefined {
    if (!value) {
      return undefined;
    }

    if (value === 'trust-first' || value === 'cost-first' || value === 'balanced') {
      return value;
    }

    logger.warn(`TRUST_ROUTING_PROFILE '${value}' is invalid and will be ignored.`);
    return undefined;
  }

  private parsePaymentProtocol(value: string | undefined): 'x402' | 'mpp' | 'auto' | undefined {
    if (!value) {
      return undefined;
    }

    if (value === 'x402' || value === 'mpp' || value === 'auto') {
      return value;
    }

    logger.warn(`PAYMENT_PREFERRED_PROTOCOL '${value}' is invalid and will be ignored.`);
    return undefined;
  }

  private parseOptionalNumber(
    value: string | undefined,
    envName: string,
    bounds?: { min?: number; max?: number }
  ): number | undefined {
    if (value === undefined || value.trim() === '') {
      return undefined;
    }

    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      logger.warn(`${envName} '${value}' is invalid and will be ignored.`);
      return undefined;
    }

    if (typeof bounds?.min === 'number' && parsed < bounds.min) {
      logger.warn(`${envName} '${value}' is below minimum ${bounds.min} and will be ignored.`);
      return undefined;
    }

    if (typeof bounds?.max === 'number' && parsed > bounds.max) {
      logger.warn(`${envName} '${value}' is above maximum ${bounds.max} and will be ignored.`);
      return undefined;
    }

    return parsed;
  }

}

// Export singleton instance
export const saisoConfig = SaisoConfigManager.getInstance();

// Export helper functions
export function loadConfig(environment?: SaisoEnvironment, projectRoot?: string): SaisoConfig {
  return saisoConfig.loadConfig(environment, projectRoot);
}

export function validateConfig(config: SaisoConfig): ConfigValidationResult {
  return saisoConfig.validateConfig(config);
}

export function isValidEnvironment(env: string): env is SaisoEnvironment {
  return saisoConfig.isValidEnvironment(env);
}
