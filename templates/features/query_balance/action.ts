import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { ethers } from 'ethers';

export interface QueryBalanceContent {
  address?: string;
  token?: string;
}

export const queryBalanceAction: Action = {
  name: 'QUERY_BALANCE',
  similes: ['CHECK_BALANCE', 'GET_BALANCE', 'BALANCE_CHECK', 'WALLET_BALANCE'],
  description: 'Query the balance of ETH tokens or ERC-20 tokens for a given address',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const content = message.content as QueryBalanceContent;
    return !!(content.address || runtime.getSetting('PRIVATE_KEY'));
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    try {
      const content = message.content as QueryBalanceContent;

      // Get the address to query
      let address = content.address;
      if (!address) {
        // Use the agent's own address if no address provided
        const privateKey = runtime.getSetting('PRIVATE_KEY');
        if (!privateKey) {
          throw new Error('No address provided and no private key configured');
        }
        const wallet = new ethers.Wallet(privateKey);
        address = wallet.address;
      }

      // Get RPC URL from environment
      const rpcUrl = runtime.getSetting('RPC_URL') || 'https://rpc.sepolia.org';
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      let balance: bigint;
      let symbol = 'ETH';
      let decimals = 18;

      if (content.token) {
        // Query ERC-20 token balance
        const tokenContract = new ethers.Contract(
          content.token,
          [
            'function balanceOf(address) view returns (uint256)',
            'function symbol() view returns (string)',
            'function decimals() view returns (uint8)'
          ],
          provider
        );

        balance = await tokenContract.balanceOf(address);
        symbol = await tokenContract.symbol();
        decimals = await tokenContract.decimals();
      } else {
        // Query native ETH balance
        balance = await provider.getBalance(address);
      }

      const formattedBalance = ethers.formatUnits(balance, decimals);

      const response = {
        success: true,
        data: {
          address,
          balance: formattedBalance,
          symbol,
          decimals,
          raw: balance.toString()
        }
      };

      if (callback) {
        callback({
          text: `Balance for ${address}: ${formattedBalance} ${symbol}`,
          content: response
        });
      }

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      if (callback) {
        callback({
          text: `Failed to query balance: ${errorMessage}`,
          content: { success: false, error: errorMessage }
        });
      }

      throw error;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'What is my ETH balance?'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll check your ETH balance.',
          action: 'QUERY_BALANCE'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Check the balance of 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll check the balance for that address.',
          action: 'QUERY_BALANCE',
          content: {
            address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5'
          }
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'What is the USDC balance for 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5?'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll check the USDC token balance for that address.',
          action: 'QUERY_BALANCE',
          content: {
            address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
            token: '0xA0b86a33E6441b8dB4B2b8b8b8b8b8b8b8b8b8b8'
          }
        }
      }
    ]
  ] as ActionExample[][]
};
