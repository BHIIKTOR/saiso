/**
 * SVM MCP Server Orchestrator - Integration with Solana/SVM MCP servers
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type {
  McpServerType,
  McpServerStatus,
  McpServerCapabilities,
  McpHealthCheck,
  NetworkInfo,
  SvmServerConfig,
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
  SVM_NETWORKS,
  getRecommendedSvmNetworks,
  getSvmNetwork,
  isSvmNetworkSupported
} from '../constants/svm-networks.js';
import { getSvmCapabilityTools, resolveSvmToolName } from './parity.js';
import { logger } from '../utils/logger.js';

export class SvmMcpOrchestrator extends McpServerOrchestrator {
  private serverProcess: ChildProcess | null = null;
  private dockerContainerId: string | null = null;
  private dockerContainerName: string | null = null;
  private healthPath = '/health';

  getServerType(): McpServerType {
    return 'svm';
  }

  getSupportedNetworks(): NetworkInfo[] {
    return SVM_NETWORKS;
  }

  getCapabilities(): McpServerCapabilities {
    return {
      networks: SVM_NETWORKS,
      tools: getSvmCapabilityTools(),
      resources: [
        'svm://{network}/account/{address}',
        'svm://{network}/transaction/{signature}',
        'svm://{network}/token/{mint}/{address}',
      ],
      features: {
        ensSupport: false,
        nftSupport: true,
        multiTokenSupport: true,
        contractInteraction: true,
        gasEstimation: true,
      },
    };
  }

  async start(config: SaisoConfig, projectPath: string): Promise<McpServerStatus> {
    logger.info('Starting SVM MCP server...');

    if (this.status?.running) {
      logger.warn('SVM MCP server is already running');
      return this.status;
    }

    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    const svmConfig = this.getSvmServerConfig(config);

    if (config.mcpServer?.mode === 'docker') {
      return this.startDockerServer(svmConfig, projectPath, config.mcpServer?.docker);
    }

    return this.startNpxServer(svmConfig, projectPath);
  }

  async stop(): Promise<void> {
    if (!this.status?.running) {
      logger.warn('SVM MCP server is not running');
      return;
    }

    logger.info('Stopping SVM MCP server...');

    if (this.status.mode === 'docker') {
      await this.stopDockerServer();
    } else {
      await this.stopNpxServer();
    }

    this.status = null;
    logger.info('SVM MCP server stopped');
  }

  async isHealthy(): Promise<boolean> {
    if (!this.status?.running) {
      return false;
    }

    try {
      if (this.status.url.startsWith('http')) {
        const response = await fetch(`${this.status.url}${this.healthPath}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      }

      return this.serverProcess !== null && !this.serverProcess.killed;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<McpHealthCheck> {
    const startTime = Date.now();
    try {
      const healthy = await this.isHealthy();
      return {
        healthy,
        latency: Date.now() - startTime,
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

  validateConfig(config: SaisoConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!isSvmNetworkSupported(config.network)) {
      errors.push(`Network '${config.network}' is not supported by SVM MCP server`);
    }

    if (!config.mcpServer) {
      errors.push('MCP server configuration is required');
    } else if (config.mcpServer.type !== 'svm') {
      errors.push('MCP server type must be "svm"');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getRecommendedNetworks(): NetworkInfo[] {
    return getRecommendedSvmNetworks('development');
  }

  async invokeTool(
    toolName: string,
    params: Record<string, unknown>,
    options: ToolCallOptions = {}
  ): Promise<Record<string, unknown>> {
    if (!this.status?.running || !this.status.url.startsWith('http')) {
      throw new Error('SVM MCP server is not running in HTTP mode');
    }

    const resolvedToolName = resolveSvmToolName(toolName);
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

  private async startNpxServer(svmConfig: SvmServerConfig, projectPath: string): Promise<McpServerStatus> {
    logger.debug('Starting SVM MCP server with npx...');

    const args = [
      '-y',
      '@saiso/svm-mcp-server',
      '--http',
      '--port', svmConfig.port.toString(),
      '--host', svmConfig.host,
    ];

    const env = {
      ...process.env,
      PRIVATE_KEY: svmConfig.privateKey || '',
      NETWORK: svmConfig.network,
      CHAIN_ID: svmConfig.chainId.toString(),
      RPC_URL: svmConfig.rpcUrl || '',
      SVM_COMMITMENT: svmConfig.commitment || 'confirmed',
    };

    this.serverProcess = spawn('npx', args, {
      cwd: projectPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.serverProcess.on('error', (error) => {
      logger.error('SVM MCP server process error:', error.message);
      this.status = null;
    });

    this.serverProcess.on('exit', (code) => {
      logger.debug(`SVM MCP server process exited with code ${code}`);
      this.status = null;
    });

    if (this.serverProcess.stdout) {
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.debug(`SVM MCP stdout: ${output}`);
        }
      });
    }

    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          logger.debug(`SVM MCP stderr: ${output}`);
        }
      });
    }

    const serverUrl = this.generateServerUrl(svmConfig.host, svmConfig.port);

    this.status = {
      running: true,
      pid: this.serverProcess?.pid,
      mode: 'npx',
      type: 'svm',
      url: serverUrl,
      port: svmConfig.port,
      startTime: new Date(),
      health: 'unknown',
    };

    const ready = await this.waitForReady();
    if (!ready) {
      await this.stop();
      throw new Error('SVM MCP server failed to start within timeout period');
    }

    this.updateStatus({ health: 'healthy' });
    logger.info('SVM MCP server started successfully with npx');
    return this.status;
  }

  private async startDockerServer(
    svmConfig: SvmServerConfig,
    projectPath: string,
    dockerConfig?: McpDockerRuntimeConfig
  ): Promise<McpServerStatus> {
    logger.debug('Starting SVM MCP server with docker...');

    const env = {
      PRIVATE_KEY: svmConfig.privateKey || '',
      NETWORK: svmConfig.network,
      CHAIN_ID: svmConfig.chainId.toString(),
      RPC_URL: svmConfig.rpcUrl || '',
      SVM_COMMITMENT: svmConfig.commitment || 'confirmed',
    };

    const launched = await launchDockerMcpServer({
      serverType: 'svm',
      projectPath,
      host: svmConfig.host,
      port: svmConfig.port,
      env,
      docker: dockerConfig,
    });

    this.dockerContainerId = launched.containerId;
    this.dockerContainerName = launched.containerName;
    this.healthPath = launched.healthPath;

    this.status = {
      running: true,
      mode: 'docker',
      type: 'svm',
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
        `SVM MCP docker server failed to start within timeout period.`
        + `${logs ? ` Recent container logs:\n${logs}` : ''}`
      );
    }

    this.updateStatus({ health: 'healthy' });
    logger.info('SVM MCP server started successfully with docker');
    return this.status;
  }

  private async stopNpxServer(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await this.sleep(2000);
      if (!this.serverProcess.killed) {
        this.serverProcess.kill('SIGKILL');
      }
      this.serverProcess = null;
    }
  }

  private async stopDockerServer(): Promise<void> {
    const idOrName = this.dockerContainerName || this.dockerContainerId;
    if (idOrName) {
      await stopDockerContainer(idOrName);
    }
    this.dockerContainerId = null;
    this.dockerContainerName = null;
    this.healthPath = '/health';
  }

  private getSvmServerConfig(config: SaisoConfig): SvmServerConfig {
    const networkInfo = getSvmNetwork(config.network);
    return {
      network: config.network,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl || networkInfo?.rpcUrl,
      privateKey: config.privateKey,
      port: config.mcpServerPort || 3001,
      host: 'localhost',
      commitment: 'confirmed',
    };
  }
}
