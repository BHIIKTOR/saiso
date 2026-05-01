/**
 * SEI MCP Server - Main orchestration server for SEI blockchain operations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@saiso/core';
import { WalletManager } from './wallet/manager.js';
import { SeiRpcClient } from './rpc/client.js';
import { SendTokensTool, QueryBalanceTool, InteractContractTool } from './tools/index.js';
import type { SeiNetworkConfig } from './types.js';

export interface SeiMCPServerConfig {
  privateKey: string;
  networkConfig: SeiNetworkConfig;
}

export class SeiMCPServer {
  private server: Server;
  private walletManager: WalletManager;
  private rpcClient: SeiRpcClient;
  private sendTokensTool: SendTokensTool;
  private queryBalanceTool: QueryBalanceTool;
  private interactContractTool: InteractContractTool;
  private isInitialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'saiso-sei-server',
        version: '0.1.0',
      }
    );

    this.walletManager = new WalletManager();
    this.rpcClient = new SeiRpcClient({
      name: 'SEI Devnet',
      chainId: 713715,
      rpcUrl: 'https://evm-rpc-testnet.sei-apis.com',
      nativeCurrency: 'SEI',
      blockExplorer: 'https://seitrace.com',
      faucetUrl: 'https://faucet.sei.io',
    });

    this.sendTokensTool = new SendTokensTool(this.walletManager, this.rpcClient);
    this.queryBalanceTool = new QueryBalanceTool(this.walletManager);
    this.interactContractTool = new InteractContractTool(this.walletManager, this.rpcClient);

    this.setupHandlers();
  }

  /**
   * Initialize the server with configuration
   */
  async initialize(config: SeiMCPServerConfig): Promise<void> {
    try {
      // Initialize wallet manager
      await this.walletManager.initialize(config.privateKey, config.networkConfig);

      // Update RPC client with provided network config
      this.rpcClient = new SeiRpcClient(config.networkConfig);

      // Recreate tools with updated clients
      this.sendTokensTool = new SendTokensTool(this.walletManager, this.rpcClient);
      this.queryBalanceTool = new QueryBalanceTool(this.walletManager);
      this.interactContractTool = new InteractContractTool(this.walletManager, this.rpcClient);

      this.isInitialized = true;
      logger.info('SEI MCP Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SEI MCP Server:', error);
      throw error;
    }
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          SendTokensTool.getDefinition(),
          QueryBalanceTool.getDefinition(),
          InteractContractTool.getDefinition(),
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.isInitialized) {
        throw new McpError(
          ErrorCode.InternalError,
          'Server not initialized. Call initialize() first.'
        );
      }

      const { name, arguments: args } = request.params;

      try {
        let result: unknown;

        if (!args) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Tool arguments are required'
          );
        }

        switch (name) {
          case 'send_tokens':
            result = await this.sendTokensTool.execute(args as { to: string; amount: string });
            break;
          case 'query_balance':
            result = await this.queryBalanceTool.execute(args as { address?: string });
            break;
          case 'interact_contract':
            result = await this.interactContractTool.execute(args as {
              address: string;
              method: string;
              args: unknown[];
              value?: string;
              abi?: string[]
            });
            break;
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool execution failed for ${name}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();

    await this.server.connect(transport);
    logger.info('SEI MCP Server started and connected');
  }

  /**
   * Get server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Check if server is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get wallet information
   */
  async getWalletInfo() {
    if (!this.isInitialized) {
      throw new Error('Server not initialized');
    }
    return this.walletManager.getWalletInfo();
  }

  /**
   * Get network status
   */
  async getNetworkStatus() {
    if (!this.isInitialized) {
      throw new Error('Server not initialized');
    }
    return this.rpcClient.getNetworkStatus();
  }
}

/**
 * Create and configure SEI MCP Server with devnet defaults
 */
export function createSeiMCPServer(privateKey: string): SeiMCPServer {
  const server = new SeiMCPServer();

  // Default to SEI devnet configuration
  const defaultConfig: SeiMCPServerConfig = {
    privateKey,
    networkConfig: {
      name: 'SEI Devnet',
      chainId: 713715,
      rpcUrl: 'https://evm-rpc-testnet.sei-apis.com',
      nativeCurrency: 'SEI',
      blockExplorer: 'https://seitrace.com',
      faucetUrl: 'https://faucet.sei.io',
    },
  };

  // Initialize server
  server.initialize(defaultConfig).catch((error) => {
    logger.error('Failed to initialize SEI MCP Server:', error);
    process.exit(1);
  });

  return server;
}
