/**
 * Query Balance MCP Tool
 */

import { ethers } from 'ethers';
import { logger } from '@saiso/core';
import type { WalletManager } from '../wallet/manager.js';
import type { MCPToolResult } from '../types.js';

export interface QueryBalanceArgs {
  address?: string;
}

export class QueryBalanceTool {
  constructor(private walletManager: WalletManager) {}

  /**
   * Query SEI balance for an address
   */
  async execute(args: QueryBalanceArgs): Promise<MCPToolResult> {
    try {
      const { address } = args;

      // Validate address if provided
      if (address && !ethers.isAddress(address)) {
        return {
          success: false,
          error: 'Invalid address format',
        };
      }

      // Get balance
      const targetAddress = address || this.walletManager.getAddress();
      const balance = await this.walletManager.getBalance(targetAddress);
      const networkConfig = this.walletManager.getNetworkConfig();

      logger.info(`Balance query for ${targetAddress}: ${balance} SEI`);

      return {
        success: true,
        data: {
          address: targetAddress,
          balance,
          currency: networkConfig.nativeCurrency,
          network: networkConfig.name,
        },
      };
    } catch (error) {
      logger.error('Balance query failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get tool definition for MCP
   */
  static getDefinition() {
    return {
      name: 'query_balance',
      description: 'Query SEI balance for a wallet address',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Wallet address to query (optional, defaults to agent wallet)',
          },
        },
        required: [],
      },
    };
  }
}
