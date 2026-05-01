/**
 * Send Tokens MCP Tool
 */

import { ethers } from 'ethers';
import { logger } from '@saiso/core';
import type { WalletManager } from '../wallet/manager.js';
import type { SeiRpcClient } from '../rpc/client.js';
import type { MCPToolResult } from '../types.js';

export interface SendTokensArgs {
  to: string;
  amount: string;
}

export class SendTokensTool {
  constructor(
    private walletManager: WalletManager,
    private rpcClient: SeiRpcClient
  ) {}

  /**
   * Send SEI tokens to an address
   */
  async execute(args: SendTokensArgs): Promise<MCPToolResult> {
    try {
      const { to, amount } = args;

      // Validate inputs
      if (!ethers.isAddress(to)) {
        return {
          success: false,
          error: 'Invalid recipient address',
        };
      }

      if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
        return {
          success: false,
          error: 'Invalid amount',
        };
      }

      // Check wallet balance
      const balance = await this.walletManager.getBalance();
      if (Number(balance) < Number(amount)) {
        return {
          success: false,
          error: `Insufficient balance. Available: ${balance} SEI, Required: ${amount} SEI`,
        };
      }

      // Get wallet and send transaction
      const wallet = this.walletManager.getWallet();
      const result = await this.rpcClient.sendTransaction(wallet, {
        to,
        value: amount,
      });

      logger.info(`Sent ${amount} SEI to ${to}, tx: ${result.hash}`);

      return {
        success: true,
        data: {
          to,
          amount,
          hash: result.hash,
          status: result.status,
        },
        transactionHash: result.hash,
      };
    } catch (error) {
      logger.error('Send tokens failed:', error);
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
      name: 'send_tokens',
      description: 'Send SEI tokens to a specified address',
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address (must be a valid Ethereum address)',
          },
          amount: {
            type: 'string',
            description: 'Amount of SEI tokens to send (in SEI, not wei)',
          },
        },
        required: ['to', 'amount'],
      },
    };
  }
}
