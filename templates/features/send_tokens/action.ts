import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { ethers } from 'ethers';

export interface SendTokensContent {
  recipient: string;
  amount: string;
  token?: string; // Optional: ERC-20 token contract address
  gasLimit?: string;
  gasPrice?: string;
}

export const sendTokensAction: Action = {
  name: 'SEND_TOKENS',
  similes: ['TRANSFER_TOKENS', 'SEND_PAYMENT', 'TRANSFER_FUNDS', 'PAY', 'SEND_MONEY'],
  description: 'Send ETH tokens or ERC-20 tokens to a specified address with gas optimization and error handling',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const content = message.content as SendTokensContent;
    const privateKey = runtime.getSetting('PRIVATE_KEY');

    return !!(
      privateKey &&
      content.recipient &&
      content.amount &&
      ethers.isAddress(content.recipient) &&
      !isNaN(parseFloat(content.amount))
    );
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    try {
      const content = message.content as SendTokensContent;

      // Get configuration
      const privateKey = runtime.getSetting('PRIVATE_KEY');
      const rpcUrl = runtime.getSetting('RPC_URL') || 'https://rpc.sepolia.org';

      if (!privateKey) {
        throw new Error('PRIVATE_KEY not configured');
      }

      // Setup provider and wallet
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);

      // Validate recipient address
      if (!ethers.isAddress(content.recipient)) {
        throw new Error(`Invalid recipient address: ${content.recipient}`);
      }

      // Parse amount
      const amount = ethers.parseEther(content.amount);
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      let txHash: string;
      let tokenSymbol = 'ETH';
      let actualGasUsed: bigint;

      if (content.token) {
        // ERC-20 token transfer
        if (!ethers.isAddress(content.token)) {
          throw new Error(`Invalid token contract address: ${content.token}`);
        }

        const tokenContract = new ethers.Contract(
          content.token,
          [
            'function transfer(address to, uint256 amount) returns (bool)',
            'function balanceOf(address account) view returns (uint256)',
            'function symbol() view returns (string)',
            'function decimals() view returns (uint8)'
          ],
          wallet
        );

        // Get token info
        const [symbol, decimals, balance] = await Promise.all([
          tokenContract.symbol(),
          tokenContract.decimals(),
          tokenContract.balanceOf(wallet.address)
        ]);

        tokenSymbol = symbol;
        const tokenAmount = ethers.parseUnits(content.amount, decimals);

        // Check balance
        if (balance < tokenAmount) {
          throw new Error(`Insufficient ${symbol} balance. Have: ${ethers.formatUnits(balance, decimals)}, Need: ${content.amount}`);
        }

        // Estimate gas for token transfer
        const estimatedGas = await tokenContract.transfer.estimateGas(content.recipient, tokenAmount);
        const gasLimit = content.gasLimit ? BigInt(content.gasLimit) : estimatedGas * 120n / 100n; // 20% buffer

        // Get current gas price with optimization
        const feeData = await provider.getFeeData();
        const gasPrice = content.gasPrice
          ? ethers.parseUnits(content.gasPrice, 'gwei')
          : feeData.gasPrice || ethers.parseUnits('20', 'gwei');

        // Execute token transfer with retry logic
        const tx = await executeWithRetry(async () => {
          return await tokenContract.transfer(content.recipient, tokenAmount, {
            gasLimit,
            gasPrice
          });
        });

        txHash = tx.hash;

        // Wait for confirmation
        const receipt = await tx.wait();
        actualGasUsed = receipt?.gasUsed || 0n;

      } else {
        // Native ETH transfer
        const balance = await provider.getBalance(wallet.address);

        // Estimate gas for native transfer
        const estimatedGas = 21000n; // Standard ETH transfer gas
        const feeData = await provider.getFeeData();
        const gasPrice = content.gasPrice
          ? ethers.parseUnits(content.gasPrice, 'gwei')
          : feeData.gasPrice || ethers.parseUnits('20', 'gwei');

        const gasLimit = content.gasLimit ? BigInt(content.gasLimit) : estimatedGas;
        const totalCost = amount + (gasLimit * gasPrice);

        // Check balance including gas
        if (balance < totalCost) {
          const balanceEth = ethers.formatEther(balance);
          const totalCostEth = ethers.formatEther(totalCost);
          throw new Error(`Insufficient ETH balance. Have: ${balanceEth} ETH, Need: ${totalCostEth} ETH (including gas)`);
        }

        // Execute native transfer with retry logic
        const tx = await executeWithRetry(async () => {
          return await wallet.sendTransaction({
            to: content.recipient,
            value: amount,
            gasLimit,
            gasPrice
          });
        });

        txHash = tx.hash;

        // Wait for confirmation
        const receipt = await tx.wait();
        actualGasUsed = receipt?.gasUsed || 0n;
      }

      const response = {
        success: true,
        data: {
          txHash,
          recipient: content.recipient,
          amount: content.amount,
          token: content.token || 'native',
          symbol: tokenSymbol,
          gasUsed: actualGasUsed.toString(),
          network: rpcUrl.includes('testnet') ? 'testnet' : 'mainnet'
        }
      };

      if (callback) {
        callback({
          text: `Successfully sent ${content.amount} ${tokenSymbol} to ${content.recipient}. Transaction: ${txHash}`,
          content: response
        });
      }

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      if (callback) {
        callback({
          text: `Failed to send tokens: ${errorMessage}`,
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
          text: 'Send 1 ETH to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll send 1 ETH to that address.',
          action: 'SEND_TOKENS',
          content: {
            recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
            amount: '1'
          }
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Transfer 100 USDC to 0x123...abc'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll transfer 100 USDC to that address.',
          action: 'SEND_TOKENS',
          content: {
            recipient: '0x123...abc',
            amount: '100',
            token: '0xA0b86a33E6441b8dB4B2b8b8b8b8b8b8b8b8b8b8'
          }
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Pay 0.5 ETH to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5 with custom gas'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll send 0.5 ETH with custom gas settings.',
          action: 'SEND_TOKENS',
          content: {
            recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
            amount: '0.5',
            gasPrice: '25'
          }
        }
      }
    ]
  ] as ActionExample[][]
};

/**
 * Execute a transaction with retry logic and exponential backoff
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain errors
      if (
        lastError.message.includes('insufficient funds') ||
        lastError.message.includes('invalid address') ||
        lastError.message.includes('nonce too low')
      ) {
        throw lastError;
      }

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
