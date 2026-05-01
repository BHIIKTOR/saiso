import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { gasEstimationAction, type GasEstimationContent } from './action';
import { ethers } from 'ethers';

// Mock ethers provider
const mockProvider = {
  getNetwork: mock(() => Promise.resolve({ chainId: 11155111n })),
  getFeeData: mock(() => Promise.resolve({
    gasPrice: ethers.parseUnits('0.01', 'gwei'),
    maxFeePerGas: ethers.parseUnits('0.02', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('0.001', 'gwei')
  })),
  getBlockNumber: mock(() => Promise.resolve(12345)),
  getBlock: mock(() => Promise.resolve({ timestamp: Date.now() / 1000 })),
  estimateGas: mock(() => Promise.resolve(21000n))
};

// Mock ethers
mock.module('ethers', () => ({
  ethers: {
    JsonRpcProvider: mock(() => mockProvider),
    parseUnits: ethers.parseUnits,
    formatUnits: ethers.formatUnits,
    formatEther: ethers.formatEther,
    parseEther: ethers.parseEther
  }
}));

// Mock runtime
const mockRuntime = {
  getSetting: mock((key: string) => {
    const settings = {
      'RPC_URL': 'https://rpc.sepolia.org',
      'GAS_PRICE_API_KEY': 'test-api-key',
      'ETH_PRICE_USD_FALLBACK': '3500',
      'MEV_PROTECTION_ENABLED': 'false'
    };
    return settings[key];
  })
};

// Mock message
const createMockMessage = (content: GasEstimationContent) => ({
  content,
  userId: 'test-user',
  agentId: 'test-agent',
  roomId: 'test-room',
  createdAt: Date.now()
});

describe('Gas Estimation Action', () => {
  beforeEach(() => {
    // Reset all mocks
    mockProvider.getNetwork.mockClear();
    mockProvider.getFeeData.mockClear();
    mockProvider.getBlockNumber.mockClear();
    mockProvider.getBlock.mockClear();
    mockProvider.estimateGas.mockClear();
    mockRuntime.getSetting.mockClear();
  });

  describe('validate', () => {
    it('should return true when RPC URL is configured', async () => {
      const message = createMockMessage({ transactionType: 'transfer' });
      const result = await gasEstimationAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(true);
    });

    it('should return false when RPC URL is not configured', async () => {
      const mockRuntimeNoRpc = {
        getSetting: mock(() => null)
      };
      const message = createMockMessage({ transactionType: 'transfer' });
      const result = await gasEstimationAction.validate(mockRuntimeNoRpc as any, message as any);
      expect(result).toBe(false);
    });
  });

  describe('handler', () => {
    it('should estimate gas for simple transfer', async () => {
      const content: GasEstimationContent = {
        to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
        value: '1',
        transactionType: 'transfer'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.gasLimit).toBe(21000);
      expect(result.data.networkInfo.networkName).toBe('Sepolia Testnet');
      expect(result.data.networkInfo.chainId).toBe(11155111);
      expect(result.data.speedComparison).toHaveProperty('slow');
      expect(result.data.speedComparison).toHaveProperty('standard');
      expect(result.data.speedComparison).toHaveProperty('fast');
      expect(result.data.speedComparison).toHaveProperty('instant');
    });

    it('should estimate gas for contract interaction', async () => {
      const content: GasEstimationContent = {
        to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
        data: '0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b8d4c9db96c4b4d8b5000000000000000000000000000000000000000000000000016345785d8a0000',
        transactionType: 'contract'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.gasLimit).toBeGreaterThan(21000); // Should be higher for contract calls
      expect(result.data.networkInfo.networkName).toBe('Sepolia Testnet');
    });

    it('should apply custom speed multiplier', async () => {
      const content: GasEstimationContent = {
        speed: 'fast',
        multiplier: 1.5,
        transactionType: 'transfer'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.speedComparison.fast.gasPrice).toBeDefined();

      // Fast should be more expensive than standard
      const fastPrice = Number.parseFloat(result.data.speedComparison.fast.gasPrice);
      const standardPrice = Number.parseFloat(result.data.speedComparison.standard.gasPrice);
      expect(fastPrice).toBeGreaterThan(standardPrice);
    });

    it('should include MEV protection when enabled', async () => {
      const content: GasEstimationContent = {
        mevProtection: true,
        transactionType: 'contract'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.mevProtection).toBeDefined();
      expect(result.data.mevProtection?.enabled).toBe(true);
      expect(result.data.mevProtection?.strategies).toContain('Private mempool submission');
    });

    it('should provide recommendations based on network conditions', async () => {
      const content: GasEstimationContent = {
        transactionType: 'contract'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.recommendations).toBeInstanceOf(Array);
      expect(result.data.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle custom EIP-1559 parameters', async () => {
      const content: GasEstimationContent = {
        maxFeePerGas: '0.05',
        maxPriorityFeePerGas: '0.002',
        transactionType: 'transfer'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.maxFeePerGas).toBe('0.05');
      expect(result.data.maxPriorityFeePerGas).toBe('0.002');
    });

    it('should include USD pricing when requested', async () => {
      const content: GasEstimationContent = {
        includeUsdPrice: true,
        transactionType: 'transfer'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.estimatedCost.usd).toBeDefined();
      expect(Number.parseFloat(result.data.estimatedCost.usd!)).toBeGreaterThan(0);
    });

    it('should handle estimation errors gracefully', async () => {
      // Mock provider to throw error on gas estimation
      mockProvider.estimateGas.mockRejectedValueOnce(new Error('Estimation failed'));

      const content: GasEstimationContent = {
        to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
        data: '0xinvalid',
        transactionType: 'contract'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.gasLimit).toBe(200000); // Should fall back to default
    });

    it('should return normalized failures for provider errors', async () => {
      mockProvider.getNetwork.mockRejectedValueOnce(new Error('RPC unavailable'));

      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        createMockMessage({ transactionType: 'transfer' }) as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(false);
      expect(result.operation).toBe('gas_estimation');
      expect(result.error.code).toBe('gas_estimation_failed');
      expect(result.error.message).toContain('RPC unavailable');
    });

    it('should analyze network congestion correctly', async () => {
      // Mock high gas prices to simulate congestion
      mockProvider.getFeeData.mockResolvedValueOnce({
        gasPrice: ethers.parseUnits('100', 'gwei'), // Very high gas price
        maxFeePerGas: ethers.parseUnits('120', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('10', 'gwei')
      });

      const content: GasEstimationContent = {
        transactionType: 'transfer'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.networkInfo.congestionLevel).toBe('high');
      expect(result.data.recommendations).toContain(
        'Network congestion is high. Consider waiting or using higher gas prices.'
      );
    });
  });

  describe('network configurations', () => {
    it('should handle unknown networks with defaults', async () => {
      // Mock unknown network
      mockProvider.getNetwork.mockResolvedValueOnce({ chainId: 999999n });

      const content: GasEstimationContent = {
        transactionType: 'transfer'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.networkInfo.networkName).toBe('Chain 999999');
      expect(result.data.networkInfo.eip1559Supported).toBe(true);
    });

    it('should use correct configuration for ETH mainnet', async () => {
      mockProvider.getNetwork.mockResolvedValueOnce({ chainId: 1n });

      const content: GasEstimationContent = {
        transactionType: 'transfer'
      };

      const message = createMockMessage(content);
      const result = await gasEstimationAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.data.networkInfo.networkName).toBe('Ethereum Mainnet');
      expect(result.data.networkInfo.avgBlockTime).toBe(12);
    });
  });
});
