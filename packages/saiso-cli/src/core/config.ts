import path from 'node:path';
import fs from 'fs-extra';
import {
  saisoConfig as coreConfig,
  type SaisoConfig,
  type SaisoEnvironment,
  type ConfigValidationResult,
  type McpServerConfig,
  type McpServerType,
} from '@saiso/core';

interface DockerRuntimeConfigLike {
  image?: string;
  containerName?: string;
  network?: string;
  host?: string;
  port?: number;
  pullPolicy?: string;
  healthPath?: string;
  startupTimeoutMs?: number;
}

export class SaisoConfigManager {
  private static instance: SaisoConfigManager;

  static getInstance(): SaisoConfigManager {
    if (!SaisoConfigManager.instance) {
      SaisoConfigManager.instance = new SaisoConfigManager();
    }
    return SaisoConfigManager.instance;
  }

  loadConfig(environment?: SaisoEnvironment, projectPath: string = process.cwd()): SaisoConfig {
    return coreConfig.loadConfig(environment, projectPath);
  }

  validateConfig(config: SaisoConfig): ConfigValidationResult {
    return coreConfig.validateConfig(config);
  }

  generateEnvTemplate(environment: SaisoEnvironment): string {
    return coreConfig.generateEnvTemplate(environment);
  }

  async setConfigValue(
    key: string,
    value: string,
    environment?: SaisoEnvironment,
    projectPath: string = process.cwd(),
  ): Promise<void> {
    await coreConfig.setConfigValue(key, value, environment, projectPath);
  }

  validateMcpServerConfig(mcpServer: McpServerConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!mcpServer) {
      errors.push('MCP server configuration is missing');
      return { valid: false, errors, warnings };
    }

    if (!['evm', 'svm'].includes(mcpServer.type)) {
      errors.push(`Unsupported MCP server type: ${mcpServer.type}`);
    }

    if (!['npx', 'docker'].includes(mcpServer.mode)) {
      errors.push(`Unsupported MCP server mode: ${mcpServer.mode}`);
    }

    if (mcpServer.mode === 'docker') {
      const docker = (mcpServer as McpServerConfig & { docker?: DockerRuntimeConfigLike }).docker;
      const dockerValidation = validateDockerRuntimeConfigLocal(docker);
      errors.push(...dockerValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async migrateToMcpServer(projectPath: string, targetType: McpServerType): Promise<void> {
    const current = this.loadConfig(undefined, projectPath);
    const targetNetwork = this.resolveTargetNetwork(targetType, current.network, current.environment);

    await this.setConfigValue('MCP_SERVER_TYPE', targetType, current.environment, projectPath);
    await this.setConfigValue('network', targetNetwork, current.environment, projectPath);

    const envPath = path.join(projectPath, `.env.${current.environment}`);
    if (await fs.pathExists(envPath)) {
      const envContent = await fs.readFile(envPath, 'utf-8');
      if (!envContent.includes('MCP_SERVER_MODE=')) {
        await fs.writeFile(envPath, `${envContent.trim()}\nMCP_SERVER_MODE=npx\n`);
      }
    }
  }

  private resolveTargetNetwork(
    targetType: McpServerType,
    currentNetwork: string,
    environment: SaisoEnvironment,
  ): string {
    if (targetType === 'svm') {
      return environment === 'mainnet' ? 'solana-mainnet' : 'solana-devnet';
    }

    if (
      currentNetwork.startsWith('solana')
      || ['testnet', 'mainnet', 'devnet'].includes(currentNetwork)
    ) {
      return environment === 'mainnet' ? 'ethereum' : 'sepolia';
    }

    return currentNetwork;
  }
}

function validateDockerRuntimeConfigLocal(
  dockerConfig: DockerRuntimeConfigLike | undefined
): { errors: string[] } {
  const errors: string[] = [];
  if (!dockerConfig) {
    return { errors };
  }
  if (dockerConfig.port !== undefined && (!Number.isInteger(dockerConfig.port) || dockerConfig.port <= 0 || dockerConfig.port > 65535)) {
    errors.push('mcpServer.docker.port must be an integer between 1 and 65535');
  }
  if (dockerConfig.pullPolicy !== undefined && !['always', 'if-not-present', 'never'].includes(dockerConfig.pullPolicy)) {
    errors.push('mcpServer.docker.pullPolicy must be always, if-not-present, or never');
  }
  if (dockerConfig.healthPath !== undefined && !dockerConfig.healthPath.startsWith('/')) {
    errors.push('mcpServer.docker.healthPath must start with "/"');
  }
  if (dockerConfig.startupTimeoutMs !== undefined && (!Number.isInteger(dockerConfig.startupTimeoutMs) || dockerConfig.startupTimeoutMs < 1000)) {
    errors.push('mcpServer.docker.startupTimeoutMs must be an integer >= 1000');
  }
  return { errors };
}

export const saisoConfig = SaisoConfigManager.getInstance();

export function loadConfig(environment?: SaisoEnvironment, projectPath?: string): SaisoConfig {
  return saisoConfig.loadConfig(environment, projectPath);
}

export function validateConfig(config: SaisoConfig): ConfigValidationResult {
  return saisoConfig.validateConfig(config);
}

export function isValidEnvironment(env: string): env is SaisoEnvironment {
  return ['testnet', 'mainnet', 'devnet'].includes(env);
}

export type { SaisoConfig, SaisoEnvironment, ConfigValidationResult };
