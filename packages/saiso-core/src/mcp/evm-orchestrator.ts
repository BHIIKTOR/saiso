/**
 * EVM MCP Server Orchestrator - Integration with @mcpdotdirect/evm-mcp-server
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type {
  McpServerType,
  McpServerStatus,
  McpServerCapabilities,
  McpHealthCheck,
  NetworkInfo,
  EvmServerConfig,
  McpDockerRuntimeConfig
} from '../types/mcp.js';
import type { SaisoConfig } from '../types/config.js';
import { McpServerOrchestrator, type ToolCallOptions } from './orchestrator.js';
import {
  getDockerContainerLogs,
  launchDockerMcpServer,
  stopDockerContainer
} from './docker-runtime.js';
import {
  ALL_EVM_NETWORKS,
  getRecommendedEvmNetworks,
  getEvmNetwork,
  isEvmNetworkSupported
} from '../constants/evm-networks.js';
import { CANONICAL_PARITY_TOOL_NAMES } from '../types/parity.js';
import { resolveEvmToolName } from './parity.js';
import { logger } from '../utils/logger.js';

export class EvmMcpOrchestrator extends McpServerOrchestrator {
  private serverProcess: ChildProcess | null = null;
  private dockerContainerId: string | null = null;
  private dockerContainerName: string | null = null;
  private healthPath = '/health';

  /**
   * Get server type
   */
  getServerType(): McpServerType {
    return 'evm';
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): NetworkInfo[] {
    return ALL_EVM_NETWORKS;
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): McpServerCapabilities {
    return {
      networks: ALL_EVM_NETWORKS,
      tools: [
        ...CANONICAL_PARITY_TOOL_NAMES,

        // Token Operations
        'get-token-info',
        'get-token-balance',
        'transfer-token',
        'approve-token-spending',

        // NFT Operations
        'get-nft-info',
        'check-nft-ownership',
        'transfer-nft',
        'get-nft-balance',

        // ERC1155 Operations
        'get-erc1155-token-uri',
        'get-erc1155-balance',
        'transfer-erc1155',

        // Blockchain Operations
        'get-chain-info',
        'get-balance',
        'transfer-eth',
        'get-transaction',
        'read-contract',
        'write-contract',
        'is-contract',
        'resolve-ens',
      ],
      resources: [
        'evm://{network}/chain',
        'evm://{network}/block/{number}',
        'evm://{network}/address/{address}/balance',
        'evm://{network}/tx/{hash}',
        'evm://{network}/token/{address}',
        'evm://{network}/nft/{address}/{tokenId}',
      ],
      features: {
        ensSupport: true,
        nftSupport: true,
        multiTokenSupport: true,
        contractInteraction: true,
        gasEstimation: true,
      },
    };
  }

  /**
   * Start the EVM MCP server
   */
  async start(config: SaisoConfig, projectPath: string): Promise<McpServerStatus> {
    logger.info('Starting EVM MCP server...');

    // Check if server is already running
    if (this.status?.running) {
      logger.warn('EVM MCP server is already running');
      return this.status;
    }

    // Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Get EVM server configuration
    const evmConfig = this.getEvmServerConfig(config);

    // Start server based on mode
    if (config.mcpServer?.mode === 'docker') {
      return this.startDockerServer(evmConfig, projectPath, config.mcpServer?.docker);
    }

    return this.startNpxServer(evmConfig, projectPath);
  }

  /**
   * Stop the EVM MCP server
   */
  async stop(): Promise<void> {
    if (!this.status?.running) {
      logger.warn('EVM MCP server is not running');
      return;
    }

    logger.info('Stopping EVM MCP server...');

    if (this.status.mode === 'docker') {
      await this.stopDockerServer();
    } else {
      await this.stopNpxServer();
    }

    this.status = null;
    logger.info('EVM MCP server stopped');
  }

  /**
   * Check if server is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.status?.running) {
      return false;
    }

    try {
      // For HTTP mode, check health endpoint
      if (this.status.url.startsWith('http')) {
        const response = await fetch(`${this.status.url}${this.healthPath}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      }

      // For stdio mode, check if process is still running
      if (this.serverProcess && !this.serverProcess.killed) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Perform detailed health check
   */
  async healthCheck(): Promise<McpHealthCheck> {
    const startTime = Date.now();

    try {
      const healthy = await this.isHealthy();
      const latency = Date.now() - startTime;

      return {
        healthy,
        latency,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Validate configuration for EVM server
   */
  validateConfig(config: SaisoConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if network is supported
    if (!isEvmNetworkSupported(config.network)) {
      errors.push(`Network '${config.network}' is not supported by EVM MCP server`);
    }

    // Check MCP server configuration
    if (!config.mcpServer) {
      errors.push('MCP server configuration is required');
    } else if (config.mcpServer.type !== 'evm') {
      errors.push('MCP server type must be "evm"');
    }

    // Validate private key for write operations (optional but recommended)
    if (config.privateKey && !config.privateKey.startsWith('0x')) {
      errors.push('Private key must start with 0x');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get recommended networks for EVM server
   */
  getRecommendedNetworks(): NetworkInfo[] {
    return getRecommendedEvmNetworks('development');
  }

  async invokeTool(
    toolName: string,
    params: Record<string, unknown>,
    options: ToolCallOptions = {}
  ): Promise<Record<string, unknown>> {
    if (!this.status?.running || !this.status.url.startsWith('http')) {
      throw new Error('EVM MCP server is not running in HTTP mode');
    }

    const resolvedToolName = resolveEvmToolName(toolName);

    const execute = (toolParams: Record<string, unknown>) =>
      this.executeJsonRpcToolCall(this.status!.url, resolvedToolName, toolParams, options.timeoutMs);

    const result = options.payment?.enabled && options.paymentContext
      ? await this.executeToolWithPayment(execute, params, {
          payment: options.payment,
          paymentContext: options.paymentContext,
          projectPath: options.projectPath,
          resolveCredential: options.resolveCredential,
        })
      : await execute(params);

    if (result.isError === true) {
      throw new Error(this.extractToolErrorMessage(result));
    }

    return result;
  }

  /**
   * Start EVM MCP server using npx
   */
  private async startNpxServer(evmConfig: EvmServerConfig, projectPath: string): Promise<McpServerStatus> {
    logger.debug('Starting EVM MCP server with npx...');

    const args = [
      '-y',
      '@mcpdotdirect/evm-mcp-server',
      '--http',
      '--port', evmConfig.port.toString(),
      '--host', evmConfig.host,
    ];

    // Set environment variables
    const env = {
      ...process.env,
      PRIVATE_KEY: evmConfig.privateKey || '',
      NETWORK: evmConfig.network,
      CHAIN_ID: evmConfig.chainId.toString(),
      RPC_URL: evmConfig.rpcUrl || '',
    };

    this.serverProcess = spawn('npx', args, {
      cwd: projectPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Handle process events
    this.serverProcess.on('error', (error) => {
      logger.error('EVM MCP server process error:', error.message);
      this.status = null;
    });

    this.serverProcess.on('exit', (code) => {
      logger.debug(`EVM MCP server process exited with code ${code}`);
      this.status = null;
    });

    // Capture output for debugging
    if (this.serverProcess.stdout) {
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.debug(`EVM MCP stdout: ${output}`);
        }
      });
    }

    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.debug(`EVM MCP stderr: ${output}`);
        }
      });
    }

    const serverUrl = this.generateServerUrl(evmConfig.host, evmConfig.port);

    this.status = {
      running: true,
      pid: this.serverProcess?.pid,
      mode: 'npx',
      type: 'evm',
      url: serverUrl,
      port: evmConfig.port,
      startTime: new Date(),
      health: 'unknown',
    };

    // Wait for server to be ready
    const ready = await this.waitForReady();
    if (!ready) {
      await this.stop();
      throw new Error('EVM MCP server failed to start within timeout period');
    }

    this.updateStatus({ health: 'healthy' });
    logger.info('EVM MCP server started successfully with npx');
    return this.status;
  }

  /**
   * Start EVM MCP server using Docker
   */
  private async startDockerServer(
    evmConfig: EvmServerConfig,
    projectPath: string,
    dockerConfig?: McpDockerRuntimeConfig
  ): Promise<McpServerStatus> {
    logger.debug('Starting EVM MCP server with docker...');

    const env = {
      PRIVATE_KEY: evmConfig.privateKey || '',
      NETWORK: evmConfig.network,
      CHAIN_ID: evmConfig.chainId.toString(),
      RPC_URL: evmConfig.rpcUrl || '',
    };

    const launched = await launchDockerMcpServer({
      serverType: 'evm',
      projectPath,
      host: evmConfig.host,
      port: evmConfig.port,
      env,
      docker: dockerConfig,
    });

    this.dockerContainerId = launched.containerId;
    this.dockerContainerName = launched.containerName;
    this.healthPath = launched.healthPath;

    this.status = {
      running: true,
      mode: 'docker',
      type: 'evm',
      url: this.generateServerUrl(launched.host, launched.port),
      port: launched.port,
      startTime: new Date(),
      health: 'unknown',
      capabilities: [`container:${launched.containerName}`],
    };

    const ready = await this.waitForReady(launched.startupTimeoutMs);
    if (!ready) {
      const logs = await getDockerContainerLogs(this.dockerContainerName || this.dockerContainerId || '');
      await this.stopDockerServer();
      throw new Error(
        `EVM MCP docker server failed to start within timeout period.`
        + `${logs ? ` Recent container logs:\n${logs}` : ''}`
      );
    }

    this.updateStatus({ health: 'healthy' });
    logger.info('EVM MCP server started successfully with docker');
    return this.status;
  }

  /**
   * Stop npx server
   */
  private async stopNpxServer(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');

      // Wait for graceful shutdown
      await this.sleep(2000);

      if (!this.serverProcess.killed) {
        this.serverProcess.kill('SIGKILL');
      }

      this.serverProcess = null;
    }
  }

  /**
   * Stop Docker server
   */
  private async stopDockerServer(): Promise<void> {
    const idOrName = this.dockerContainerName || this.dockerContainerId;
    if (idOrName) {
      await stopDockerContainer(idOrName);
    }
    this.dockerContainerId = null;
    this.dockerContainerName = null;
    this.healthPath = '/health';
  }

  /**
   * Get EVM server configuration from SAISO config
   */
  private getEvmServerConfig(config: SaisoConfig): EvmServerConfig {
    const networkInfo = getEvmNetwork(config.network);

    return {
      network: config.network,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl || networkInfo?.rpcUrl,
      privateKey: config.privateKey,
      port: config.mcpServerPort || 3001,
      host: 'localhost',
    };
  }
}
