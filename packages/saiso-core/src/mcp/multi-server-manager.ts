/**
 * SAISO MCP Manager - Multi-server concurrent orchestration
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  IndividualServerConfig,
  McpServerInstance,
  ServerInfo,
  RoutingCriteria,
  GlobalConfig,
  ValidationResult,
  ServerType,
  McpServerStatus
} from '../types/multi-server.js';
import { ResourceTracker } from './resource-tracker.js';
import { McpServerRegistry } from './server-registry.js';
import { createMcpOrchestrator } from './index.js';
import type { McpServerOrchestrator, ToolCallOptions } from './orchestrator.js';
import type { SaisoConfig } from '../types/config.js';
import type { EvmServerConfig, SvmServerConfig } from '../types/mcp.js';

export class SaisoMcpManager {
  private resourceTracker: ResourceTracker;
  private registry: McpServerRegistry;
  private globalConfig: GlobalConfig;
  private projectPath: string;

  constructor(projectPath: string, globalConfig?: Partial<GlobalConfig>) {
    this.projectPath = projectPath;
    this.resourceTracker = new ResourceTracker(
      globalConfig?.resourceLimits?.portRange || { start: 3001, end: 3100 }
    );
    this.registry = new McpServerRegistry();
    this.globalConfig = this.mergeGlobalConfig(globalConfig);
  }

  /**
   * Add a new server configuration
   */
  async addServer(config: IndividualServerConfig): Promise<void> {
    // Validate server configuration
    const validation = this.validateServerConfig(config);
    if (!validation.valid) {
      throw new Error(`Server validation failed: ${validation.errors.join(', ')}`);
    }

    // Check resource conflicts
    const resourceValidation = this.resourceTracker.checkResourceConflicts(config);
    if (!resourceValidation.valid) {
      throw new Error(`Resource conflicts: ${resourceValidation.errors.join(', ')}`);
    }

    // Allocate port
    const allocatedPort = this.resourceTracker.allocatePort(config.name, config.port);
    config.port = allocatedPort;

    // Create orchestrator instance
    const orchestrator = this.createOrchestratorForServer(config);

    // Create server instance
    const instance: McpServerInstance = {
      config,
      orchestrator,
      status: null,
      healthStatus: 'unknown',
    };

    // Register server
    this.registry.register(config.name, instance);

    // Save server configuration to disk
    await this.saveServerConfig(config);
  }

  /**
   * Remove a server configuration
   */
  async removeServer(name: string): Promise<void> {
    const instance = this.registry.get(name);
    if (!instance) {
      throw new Error(`Server '${name}' not found`);
    }

    // Stop server if running
    if (instance.status?.running) {
      await this.stopServer(name);
    }

    // Release resources
    this.resourceTracker.releasePort(instance.config.port);

    // Unregister server
    this.registry.unregister(name);

    // Remove server configuration file
    await this.removeServerConfig(name);
  }

  /**
   * Start a specific server
   */
  async startServer(name: string): Promise<McpServerStatus> {
    const instance = this.registry.get(name);
    if (!instance) {
      throw new Error(`Server '${name}' not found`);
    }

    if (instance.status?.running) {
      throw new Error(`Server '${name}' is already running`);
    }

    // Create compatibility SaisoConfig for orchestrator interface
    const orchestratorConfig = this.createOrchestratorConfig(instance.config);

    // Start the server
    const rawStatus = await instance.orchestrator.start(orchestratorConfig, this.projectPath);

    // Normalize status into manager format.
    const status: McpServerStatus = {
      ...rawStatus,
      port: instance.config.port,
      type: instance.config.type as 'evm' | 'svm',
    };

    // Update registry
    this.registry.updateServerStatus(name, status);
    this.registry.updateHealthStatus(name, 'healthy');

    return status;
  }

  /**
   * Stop a specific server
   */
  async stopServer(name: string): Promise<void> {
    const instance = this.registry.get(name);
    if (!instance) {
      throw new Error(`Server '${name}' not found`);
    }

    if (!instance.status?.running) {
      throw new Error(`Server '${name}' is not running`);
    }

    // Stop the server
    await instance.orchestrator.stop();

    // Update registry
    this.registry.updateServerStatus(name, null);
    this.registry.updateHealthStatus(name, 'unknown');
  }

  /**
   * Restart a specific server
   */
  async restartServer(name: string): Promise<McpServerStatus> {
    await this.stopServer(name);
    await this.sleep(2000); // Wait before restarting
    return this.startServer(name);
  }

  /**
   * Start all auto-start servers
   */
  async startAutoStartServers(): Promise<{ started: string[]; failed: string[] }> {
    const autoStartServers = this.registry.getAutoStartServers();
    const started: string[] = [];
    const failed: string[] = [];

    for (const instance of autoStartServers) {
      try {
        await this.startServer(instance.config.name);
        started.push(instance.config.name);
      } catch (error) {
        failed.push(instance.config.name);
        console.error(`Failed to start server '${instance.config.name}':`, error);
      }
    }

    return { started, failed };
  }

  /**
   * Stop all running servers
   */
  async stopAllServers(): Promise<void> {
    const runningServers = this.registry.getRunningServers();

    await Promise.all(
      runningServers.map(async (instance) => {
        try {
          await this.stopServer(instance.config.name);
        } catch (error) {
          console.error(`Failed to stop server '${instance.config.name}':`, error);
        }
      })
    );
  }

  /**
   * Get all server information
   */
  listServers(): ServerInfo[] {
    return this.registry.getServerInfo();
  }

  /**
   * Route request to optimal server
   */
  async routeRequest(criteria: RoutingCriteria): Promise<string | null> {
    const optimalServer = this.registry.getOptimalServer(criteria);
    return optimalServer?.config.name || null;
  }

  /**
   * Execute a tool call on a specific running server.
   */
  async executeTool(
    serverName: string,
    toolName: string,
    params: Record<string, unknown>,
    options?: ToolCallOptions
  ): Promise<Record<string, unknown>> {
    const instance = this.registry.get(serverName);
    if (!instance) {
      throw new Error(`Server '${serverName}' not found`);
    }
    if (!instance.status?.running) {
      throw new Error(`Server '${serverName}' is not running`);
    }

    return instance.orchestrator.invokeTool(toolName, params, options);
  }

  /**
   * Route and execute a tool call on the optimal server.
   */
  async routeAndExecuteTool(
    criteria: RoutingCriteria,
    toolName: string,
    params: Record<string, unknown>,
    options?: ToolCallOptions,
    executionOptions?: { autoStartIfStopped?: boolean }
  ): Promise<{ serverName: string; result: Record<string, unknown> }> {
    const serverName = await this.routeRequest(criteria);
    if (!serverName) {
      throw new Error('No matching server found for routing criteria');
    }

    if (executionOptions?.autoStartIfStopped) {
      const status = this.getServerStatus(serverName);
      if (!status?.running) {
        await this.startServer(serverName);
      }
    }

    const result = await this.executeTool(serverName, toolName, params, options);
    return { serverName, result };
  }

  /**
   * Get servers by capability
   */
  getServersByCapability(capability: string): string[] {
    return this.registry.getByCapability(capability).map(instance => instance.config.name);
  }

  /**
   * Get server status
   */
  getServerStatus(name: string): McpServerStatus | null {
    const instance = this.registry.get(name);
    return instance?.status || null;
  }

  /**
   * Update trust score metadata for a server and persist configuration.
   */
  async updateServerTrust(name: string, trustScore: number, trustMetadata?: Record<string, string | number | boolean>): Promise<void> {
    const instance = this.registry.get(name);
    if (!instance) {
      throw new Error(`Server '${name}' not found`);
    }

    instance.config.trustScore = Math.max(0, Math.min(1, trustScore));
    if (trustMetadata) {
      instance.config.trustMetadata = trustMetadata;
    }
    await this.saveServerConfig(instance.config);
  }

  /**
   * Update server routing cost metadata and persist configuration.
   */
  async updateServerCost(name: string, costPerRequestUsd: number): Promise<void> {
    const instance = this.registry.get(name);
    if (!instance) {
      throw new Error(`Server '${name}' not found`);
    }

    instance.config.costPerRequestUsd = Math.max(0, costPerRequestUsd);
    await this.saveServerConfig(instance.config);
  }

  /**
   * Check server health
   */
  async checkServerHealth(name: string): Promise<boolean> {
    const instance = this.registry.get(name);
    if (!instance) {
      return false;
    }

    try {
      const isHealthy = await instance.orchestrator.isHealthy();
      this.registry.updateHealthStatus(name, isHealthy ? 'healthy' : 'unhealthy');
      return isHealthy;
    } catch (error) {
      this.registry.updateHealthStatus(name, 'unhealthy');
      return false;
    }
  }

  /**
   * Check health of all servers
   */
  async checkAllServersHealth(): Promise<Record<string, boolean>> {
    const servers = this.registry.getAllInstances();
    const results: Record<string, boolean> = {};

    await Promise.all(
      servers.map(async (instance) => {
        results[instance.config.name] = await this.checkServerHealth(instance.config.name);
      })
    );

    return results;
  }

  /**
   * Get resource usage statistics
   */
  getResourceStats() {
    return this.resourceTracker.getResourceStats();
  }

  /**
   * Get server count statistics
   */
  getServerStats() {
    return this.registry.getServerCountByStatus();
  }

  /**
   * Load server configurations from disk
   */
  async loadServerConfigs(): Promise<void> {
    const serversDir = path.join(this.projectPath, '.saiso', 'servers');

    try {
      const files = await fs.readdir(serversDir);
      const configFiles = files.filter(file => file.endsWith('.json'));

      for (const file of configFiles) {
        try {
          const configPath = path.join(serversDir, file);
          const configData = await fs.readFile(configPath, 'utf-8');
          const config: IndividualServerConfig = JSON.parse(configData);

          // Create orchestrator instance
          const orchestrator = this.createOrchestratorForServer(config);

          // Create server instance
          const instance: McpServerInstance = {
            config,
            orchestrator,
            status: null,
            healthStatus: 'unknown',
          };

          // Register server (skip validation since it's already saved)
          this.registry.register(config.name, instance);

          // Allocate port in resource tracker
          this.resourceTracker.allocatePort(config.name, config.port);
        } catch (error) {
          console.error(`Failed to load server config from ${file}:`, error);
        }
      }
    } catch (error) {
      // Servers directory doesn't exist yet, which is fine
    }
  }

  /**
   * Save global configuration
   */
  async saveGlobalConfig(): Promise<void> {
    const configPath = path.join(this.projectPath, '.saiso', 'global-config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(this.globalConfig, null, 2));
  }

  /**
   * Load global configuration
   */
  async loadGlobalConfig(): Promise<void> {
    const configPath = path.join(this.projectPath, '.saiso', 'global-config.json');

    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      const loadedConfig = JSON.parse(configData);
      this.globalConfig = this.mergeGlobalConfig(loadedConfig);
    } catch (error) {
      // Config file doesn't exist, use defaults
    }
  }

  /**
   * Validate server configuration
   */
  private validateServerConfig(config: IndividualServerConfig): ValidationResult {
    const errors: string[] = [];

    // Basic validation
    if (!config.name || config.name.trim() === '') {
      errors.push('Server name is required');
    }

    if (!config.displayName || config.displayName.trim() === '') {
      errors.push('Display name is required');
    }

    if (!config.type) {
      errors.push('Server type is required');
    }

    if (!config.envPrefix || config.envPrefix.trim() === '') {
      errors.push('Environment prefix is required');
    }

    if (!config.port || config.port < 1 || config.port > 65535) {
      errors.push('Valid port number is required');
    }

    // Registry validation
    const registryValidation = this.registry.validateServerConfig(config.name, {
      config,
      orchestrator: {} as McpServerOrchestrator, // Temporary for validation
      status: null,
    });

    errors.push(...registryValidation.errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Create orchestrator for server type
   */
  private createOrchestratorForServer(config: IndividualServerConfig) {
    if (config.type !== 'evm' && config.type !== 'svm') {
      throw new Error(`Server type '${config.type}' is not supported by the MCP orchestrator system`);
    }

    let orchestratorServerConfig: EvmServerConfig | SvmServerConfig;
    if (config.type === 'svm') {
      orchestratorServerConfig = {
        ...config.serverConfig,
        port: config.port,
        host: 'localhost',
      } as unknown as SvmServerConfig;
    } else {
      orchestratorServerConfig = {
        ...config.serverConfig,
        port: config.port,
        host: 'localhost',
      } as unknown as EvmServerConfig;
    }

    // Create a minimal SaisoConfig for orchestrator creation
    const tempConfig: SaisoConfig = {
      environment: 'testnet',
      network: 'testnet',
      chainId: 1,
      rpcUrl: 'http://localhost:8545',
      agentName: 'temp',
      logLevel: 'info',
      debug: false,
      mcpServerUrl: `http://localhost:${config.port}`,
      mcpServerPort: config.port,
      mcpServer: {
        type: config.type,
        mode: 'npx',
        config: orchestratorServerConfig,
      },
    };

    return createMcpOrchestrator(tempConfig);
  }

  /**
   * Create orchestrator-compatible SAISO config for a server entry.
   */
  private createOrchestratorConfig(serverConfig: IndividualServerConfig): SaisoConfig {
    let orchestratorServerConfig: EvmServerConfig | SvmServerConfig;
    if (serverConfig.type === 'evm' || serverConfig.type === 'svm') {
      orchestratorServerConfig = {
        ...serverConfig.serverConfig,
        port: serverConfig.port,
        host: 'localhost',
      } as EvmServerConfig | SvmServerConfig;
    } else {
      throw new Error(`Server type '${serverConfig.type}' is not supported by the orchestrator system`);
    }

    const baseConfig: SaisoConfig = {
      environment: 'testnet',
      network: 'testnet',
      chainId: 1,
      rpcUrl: 'http://localhost:8545',
      agentName: serverConfig.name,
      logLevel: this.globalConfig.logging.level,
      debug: this.globalConfig.logging.level === 'debug',
      mcpServerUrl: `http://localhost:${serverConfig.port}`,
      mcpServerPort: serverConfig.port,
      mcpServer: {
        type: serverConfig.type as 'evm' | 'svm',
        mode: 'npx',
        config: orchestratorServerConfig,
      },
    };

    // Override with server-specific configuration
    if ('network' in serverConfig.serverConfig) {
      baseConfig.network = serverConfig.serverConfig.network;
    }

    if ('chainId' in serverConfig.serverConfig) {
      baseConfig.chainId = serverConfig.serverConfig.chainId;
    }

    if ('rpcUrl' in serverConfig.serverConfig && serverConfig.serverConfig.rpcUrl) {
      baseConfig.rpcUrl = serverConfig.serverConfig.rpcUrl;
    }

    return baseConfig;
  }

  /**
   * Save server configuration to disk
   */
  private async saveServerConfig(config: IndividualServerConfig): Promise<void> {
    const serversDir = path.join(this.projectPath, '.saiso', 'servers');
    await fs.mkdir(serversDir, { recursive: true });

    const configPath = path.join(serversDir, `${config.name}.json`);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Remove server configuration from disk
   */
  private async removeServerConfig(name: string): Promise<void> {
    const configPath = path.join(this.projectPath, '.saiso', 'servers', `${name}.json`);

    try {
      await fs.unlink(configPath);
    } catch (error) {
      // File might not exist, which is fine
    }
  }

  /**
   * Merge global configuration with defaults
   */
  private mergeGlobalConfig(config?: Partial<GlobalConfig>): GlobalConfig {
    return {
      version: '1.0.0',
      defaultServerType: 'evm',
      autoStartServers: [],
      resourceLimits: {
        maxServers: 10,
        portRange: { start: 3001, end: 3100 },
      },
      logging: {
        level: 'info',
        enableServerLogs: true,
      },
      agentMemory: {
        preserveAcrossServers: true,
        backupInterval: 30,
      },
      ...config,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
