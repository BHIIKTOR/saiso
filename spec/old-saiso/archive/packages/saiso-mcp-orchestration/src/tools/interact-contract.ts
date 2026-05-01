/**
 * Interact Contract MCP Tool
 */

import { ethers } from 'ethers';
import { logger } from '@saiso/core';
import type { WalletManager } from '../wallet/manager.js';
import type { SeiRpcClient } from '../rpc/client.js';
import type { MCPToolResult } from '../types.js';

export interface InteractContractArgs {
  address: string;
  method: string;
  args: unknown[];
  value?: string;
  abi?: string[];
}

export class InteractContractTool {
  constructor(
    private walletManager: WalletManager,
    private rpcClient: SeiRpcClient
  ) {}

  /**
   * Interact with a smart contract
   */
  async execute(args: InteractContractArgs): Promise<MCPToolResult> {
    try {
      const { address, method, args: methodArgs, value, abi } = args;

      // Validate contract address
      if (!ethers.isAddress(address)) {
        return {
          success: false,
          error: 'Invalid contract address',
        };
      }

      // Validate method name
      if (!method || typeof method !== 'string') {
        return {
          success: false,
          error: 'Method name is required',
        };
      }

      // Get wallet and provider
      const wallet = this.walletManager.getWallet();
      const provider = this.walletManager.getProvider();

      // Create contract instance
      let contract: ethers.Contract;

      if (abi && Array.isArray(abi)) {
        // Use provided ABI
        contract = new ethers.Contract(address, abi, wallet);
      } else {
        // Use minimal ABI for common methods
        const minimalAbi = [
          `function ${method}(${methodArgs.map((_, i) => `uint256 arg${i}`).join(', ')}) external payable returns (bool)`,
          `function ${method}(${methodArgs.map((_, i) => `string arg${i}`).join(', ')}) external payable returns (bool)`,
          `function ${method}() external view returns (uint256)`,
          `function ${method}() external view returns (string)`,
        ];

        contract = new ethers.Contract(address, minimalAbi, wallet);
      }

      // Check if method exists
      if (!contract[method]) {
        return {
          success: false,
          error: `Method '${method}' not found in contract`,
        };
      }

      // Prepare transaction options
      const txOptions: { value?: bigint } = {};
      if (value) {
        txOptions.value = ethers.parseEther(value);
      }

      // Call contract method
      let result: unknown;
      const contractMethod = contract[method] as (...args: unknown[]) => Promise<unknown>;

      if (methodArgs.length > 0) {
        result = await contractMethod(...methodArgs, txOptions);
      } else {
        result = await contractMethod(txOptions);
      }

      // Handle different result types
      let responseData: unknown;
      let transactionHash: string | undefined;

      if (result && typeof result === 'object' && 'hash' in result) {
        // Transaction result
        transactionHash = result.hash as string;
        responseData = {
          hash: result.hash,
          status: 'pending',
        };
        logger.info(`Contract interaction sent: ${result.hash}`);
      } else {
        // View function result
        responseData = result;
        logger.info(`Contract view call result: ${JSON.stringify(result)}`);
      }

      return {
        success: true,
        data: {
          contract: address,
          method,
          args: methodArgs,
          result: responseData,
        },
        transactionHash,
      };
    } catch (error) {
      logger.error('Contract interaction failed:', error);
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
      name: 'interact_contract',
      description: 'Interact with smart contracts on SEI blockchain',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Contract address (must be a valid Ethereum address)',
          },
          method: {
            type: 'string',
            description: 'Contract method name to call',
          },
          args: {
            type: 'array',
            description: 'Arguments to pass to the contract method',
            items: {},
          },
          value: {
            type: 'string',
            description: 'Amount of SEI to send with the transaction (optional)',
          },
          abi: {
            type: 'array',
            description: 'Contract ABI (optional, will use minimal ABI if not provided)',
            items: {
              type: 'string',
            },
          },
        },
        required: ['address', 'method', 'args'],
      },
    };
  }
}
