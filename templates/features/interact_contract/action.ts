import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { ethers } from 'ethers';

export interface InteractContractContent {
  contractAddress: string;
  functionName: string;
  parameters?: any[];
  abi?: string | any[];
  value?: string; // ETH value to send with transaction
  gasLimit?: string;
  gasPrice?: string;
  isReadOnly?: boolean;
}

export const interactContractAction: Action = {
  name: 'INTERACT_CONTRACT',
  similes: ['CALL_CONTRACT', 'CONTRACT_CALL', 'EXECUTE_CONTRACT', 'CONTRACT_FUNCTION'],
  description: 'Interact with smart contracts by calling functions with gas optimization and comprehensive error handling',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const content = message.content as InteractContractContent;
    const privateKey = runtime.getSetting('PRIVATE_KEY');

    return !!(
      content.contractAddress &&
      content.functionName &&
      ethers.isAddress(content.contractAddress) &&
      (content.isReadOnly || privateKey)
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
      const content = message.content as InteractContractContent;

      // Get configuration
      const privateKey = runtime.getSetting('PRIVATE_KEY');
      const rpcUrl = runtime.getSetting('RPC_URL') || 'https://rpc.sepolia.org';

      // Setup provider
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      // Validate contract address
      if (!ethers.isAddress(content.contractAddress)) {
        throw new Error(`Invalid contract address: ${content.contractAddress}`);
      }

      // Parse ABI
      let abi: any[];
      if (content.abi) {
        if (typeof content.abi === 'string') {
          try {
            abi = JSON.parse(content.abi);
          } catch (error) {
            throw new Error('Invalid ABI format: must be valid JSON');
          }
        } else {
          abi = content.abi;
        }
      } else {
        // Use minimal ABI if none provided
        abi = [`function ${content.functionName}(...args) ${content.isReadOnly ? 'view' : ''} returns (...)`];
      }

      // Create contract instance
      const contract = new ethers.Contract(content.contractAddress, abi, provider);

      // Prepare parameters
      const params = content.parameters || [];

      let result: any;
      let txHash: string | undefined;
      let gasUsed: bigint | undefined;

      if (content.isReadOnly) {
        // Read-only function call
        try {
          result = await contract[content.functionName](...params);

          // Format result for display
          const formattedResult = formatContractResult(result);

          const response = {
            success: true,
            data: {
              contractAddress: content.contractAddress,
              functionName: content.functionName,
              parameters: params,
              result: formattedResult,
              type: 'read',
              network: rpcUrl.includes('testnet') ? 'testnet' : 'mainnet'
            }
          };

          if (callback) {
            callback({
              text: `Contract call successful. Result: ${JSON.stringify(formattedResult)}`,
              content: response as any
            });
          }

          return response as any;

        } catch (error) {
          throw new Error(`Contract read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

      } else {
        // Write transaction
        if (!privateKey) {
          throw new Error('Private key required for contract write operations');
        }

        const wallet = new ethers.Wallet(privateKey, provider);
        const contractWithSigner = contract.connect(wallet);

        // Prepare transaction options
        const txOptions: any = {};

        if (content.value) {
          txOptions.value = ethers.parseEther(content.value);
        }

        // Estimate gas
        try {
          const estimatedGas = await contractWithSigner[content.functionName].estimateGas(...params, txOptions);
          txOptions.gasLimit = content.gasLimit ? BigInt(content.gasLimit) : estimatedGas * 120n / 100n; // 20% buffer
        } catch (error) {
          throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Get gas price
        const feeData = await provider.getFeeData();
        txOptions.gasPrice = content.gasPrice
          ? ethers.parseUnits(content.gasPrice, 'gwei')
          : feeData.gasPrice || ethers.parseUnits('20', 'gwei');

        // Execute transaction with retry logic
        const tx = await executeWithRetry(async () => {
          return await contractWithSigner[content.functionName](...params, txOptions);
        });

        txHash = tx.hash;

        // Wait for confirmation
        const receipt = await tx.wait();
        gasUsed = receipt?.gasUsed || 0n;

        // Parse transaction result
        result = receipt?.logs || [];

        const response = {
          success: true,
          data: {
            contractAddress: content.contractAddress,
            functionName: content.functionName,
            parameters: params,
            txHash,
            gasUsed: gasUsed.toString(),
            logs: result,
            type: 'write',
            network: rpcUrl.includes('testnet') ? 'testnet' : 'mainnet'
          }
        };

        if (callback) {
          callback({
            text: `Contract transaction successful. Transaction: ${txHash}`,
            content: response as any
          });
        }

        return response as any;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      if (callback) {
        callback({
          text: `Contract interaction failed: ${errorMessage}`,
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
          text: 'Check the total supply of token at 0x123...abc'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll check the total supply of that token contract.',
          action: 'INTERACT_CONTRACT',
          content: {
            contractAddress: '0x123...abc',
            functionName: 'totalSupply',
            isReadOnly: true
          }
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Call approve function on USDC contract for 100 tokens'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll approve 100 USDC tokens for spending.',
          action: 'INTERACT_CONTRACT',
          content: {
            contractAddress: '0xA0b86a33E6441b8dB4B2b8b8b8b8b8b8b8b8b8b8',
            functionName: 'approve',
            parameters: ['0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5', '100000000'],
            isReadOnly: false
          }
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Execute custom contract function with ABI'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I\'ll execute the contract function with the provided ABI.',
          action: 'INTERACT_CONTRACT',
          content: {
            contractAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
            functionName: 'customFunction',
            parameters: ['param1', 123],
            abi: '[{"inputs":[{"name":"param1","type":"string"},{"name":"param2","type":"uint256"}],"name":"customFunction","outputs":[],"type":"function"}]',
            isReadOnly: false
          }
        }
      }
    ]
  ] as ActionExample[][]
};

/**
 * Format contract call results for display
 */
function formatContractResult(result: any): any {
  if (result === null || result === undefined) {
    return result;
  }

  // Handle BigInt values
  if (typeof result === 'bigint') {
    return result.toString();
  }

  // Handle arrays
  if (Array.isArray(result)) {
    return result.map(formatContractResult);
  }

  // Handle objects
  if (typeof result === 'object') {
    const formatted: any = {};
    for (const [key, value] of Object.entries(result)) {
      // Skip numeric keys for arrays
      if (!isNaN(Number(key))) continue;
      formatted[key] = formatContractResult(value);
    }
    return formatted;
  }

  return result;
}

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
        lastError.message.includes('execution reverted') ||
        lastError.message.includes('nonce too low') ||
        lastError.message.includes('gas estimation failed')
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
