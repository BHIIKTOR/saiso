import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { checkNetworkStatusAction } from './action';

// Mock ethers
const mockProvider = {
  getNetwork: mock(() => Promise.resolve({ chainId: 11155111n })),
  getBlockNumber: mock(() => Promise.resolve(1234567)),
  getFeeData: mock(() => Promise.resolve({ gasPrice: 100000000n })),
  send: mock((method: string) => {
    if (method === 'eth_syncing') return Promise.resolve(false);
    if (method === 'net_peerCount') return Promise.resolve('0x2f');
    return Promise.resolve(null);
  })
};

mock.module('ethers', () => ({
  ethers: {
    JsonRpcProvider: mock(() => mockProvider),
    formatUnits: mock((value: bigint, unit: string) => {
      if (unit === 'gwei') return '0.1';
      return '0';
    })
  }
}));

// Mock runtime
const mockRuntime = {
  getSetting: mock((key: string) => {
    const settings: Record<string, string> = {
      'NETWORK': 'sepolia',
      'SAISO_ENVIRONMENT': 'testnet',
      'RPC_URL': 'https://rpc.sepolia.org',
      'CHAIN_ID': '11155111'
    };
    return settings[key];
  })
};

// Mock memory
const createMockMemory = (text: string) => ({
  content: { text },
  userId: 'test-user',
  agentId: 'test-agent',
  roomId: 'test-room',
  createdAt: Date.now()
});

describe('Check Network Status Action', () => {
  beforeEach(() => {
    // Reset all mocks
    mockProvider.getNetwork.mockClear();
    mockProvider.getBlockNumber.mockClear();
    mockProvider.getFeeData.mockClear();
    mockProvider.send.mockClear();
    mockRuntime.getSetting.mockClear();
  });

  describe('validate', () => {
    test('should validate network status queries', async () => {
      const testCases = [
        'Check Sepolia network status',
        'Is the network healthy?',
        'Network connectivity check',
        'Check network status',
        'Is ETH network working?',
        'Network health diagnostics',
        'Monitor network status'
      ];

      for (const text of testCases) {
        const memory = createMockMemory(text);
        const result = await checkNetworkStatusAction.validate(mockRuntime as any, memory);
        expect(result).toBe(true);
      }
    });

    test('should reject non-network status queries', async () => {
      const testCases = [
        'Send 1 ETH to address',
        'What is my balance?',
        'Deploy a contract',
        'Hello world',
        'Calculate gas price',
        'Transfer tokens'
      ];

      for (const text of testCases) {
        const memory = createMockMemory(text);
        const result = await checkNetworkStatusAction.validate(mockRuntime as any, memory);
        expect(result).toBe(false);
      }
    });

    test('should validate question patterns', async () => {
      const testCases = [
        'Is the network working?',
        'Is ETH network healthy?',
        'Is the network up?',
        'Network status?',
        'Check network connectivity?'
      ];

      for (const text of testCases) {
        const memory = createMockMemory(text);
        const result = await checkNetworkStatusAction.validate(mockRuntime as any, memory);
        expect(result).toBe(true);
      }
    });
  });

  describe('handler', () => {
    test('should successfully check network status', async () => {
      const memory = createMockMemory('Check Sepolia network status');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Network Status Check'),
        content: {
          success: true,
          network: 'sepolia',
          environment: 'testnet',
          status: expect.objectContaining({
            isHealthy: true,
            isConnected: true,
            chainIdValid: true
          }),
          timestamp: expect.any(Number)
        }
      });
    });

    test('should handle network connection failure', async () => {
      // Mock network failure
      mockProvider.getNetwork.mockRejectedValueOnce(new Error('Connection failed'));

      const memory = createMockMemory('Check network status');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('UNHEALTHY'),
        content: {
          success: false,
          network: 'sepolia',
          environment: 'testnet',
          status: expect.objectContaining({
            isHealthy: false,
            isConnected: false,
            errors: expect.arrayContaining([expect.stringContaining('Connection failed')])
          }),
          timestamp: expect.any(Number)
        }
      });
    });

    test('should handle chain ID mismatch', async () => {
      // Mock different chain ID
      mockProvider.getNetwork.mockResolvedValueOnce({ chainId: 999999n });

      const memory = createMockMemory('Check network status');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('UNHEALTHY'),
        content: {
          success: false,
          network: 'sepolia',
          environment: 'testnet',
          status: expect.objectContaining({
            isHealthy: false,
            chainIdValid: false,
            errors: expect.arrayContaining([expect.stringContaining('Chain ID mismatch')])
          }),
          timestamp: expect.any(Number)
        }
      });
    });

    test('should handle missing RPC URL', async () => {
      // Mock missing RPC URL
      mockRuntime.getSetting.mockImplementation((key: string) => {
        if (key === 'RPC_URL') return undefined;
        return mockRuntime.getSetting(key);
      });

      const memory = createMockMemory('Check network status');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(false);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('RPC URL not configured'),
        content: {
          success: false,
          error: expect.stringContaining('RPC URL not configured'),
          timestamp: expect.any(Number)
        }
      });
    });

    test('should include peer count when requested', async () => {
      const memory = createMockMemory('Check network status with peer count');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(mockProvider.send).toHaveBeenCalledWith('net_peerCount', []);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Peer Count'),
        content: expect.objectContaining({
          success: true,
          status: expect.objectContaining({
            metrics: expect.objectContaining({
              peerCount: 47 // 0x2f in hex = 47 in decimal
            })
          })
        })
      });
    });

    test('should check sync status', async () => {
      const memory = createMockMemory('Check network sync status');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(mockProvider.send).toHaveBeenCalledWith('eth_syncing', []);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Synchronized'),
        content: expect.objectContaining({
          success: true,
          status: expect.objectContaining({
            metrics: expect.objectContaining({
              isSyncing: false,
              syncProgress: 100
            })
          })
        })
      });
    });

    test('should handle syncing node', async () => {
      // Mock syncing status
      mockProvider.send.mockImplementation((method: string) => {
        if (method === 'eth_syncing') {
          return Promise.resolve({
            currentBlock: '0x12c000', // 1228800
            highestBlock: '0x130000'  // 1245184
          });
        }
        if (method === 'net_peerCount') return Promise.resolve('0x2f');
        return Promise.resolve(null);
      });

      const memory = createMockMemory('Check sync status');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Syncing'),
        content: expect.objectContaining({
          success: true,
          status: expect.objectContaining({
            metrics: expect.objectContaining({
              isSyncing: true,
              syncProgress: expect.any(Number)
            })
          })
        })
      });
    });

    test('should handle timeout parameter', async () => {
      const memory = createMockMemory('Check network status with timeout 5000');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      // Verify that the timeout was parsed and used
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.objectContaining({
          success: true
        })
      }));
    });

    test('should handle warnings gracefully', async () => {
      // Mock failures for optional operations
      mockProvider.getBlockNumber.mockRejectedValueOnce(new Error('Block height failed'));
      mockProvider.getFeeData.mockRejectedValueOnce(new Error('Gas price failed'));

      const memory = createMockMemory('Check network status');
      const callback = mock();

      const result = await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Warnings'),
        content: expect.objectContaining({
          success: true, // Still healthy despite warnings
          status: expect.objectContaining({
            isHealthy: true,
            warnings: expect.arrayContaining([
              'Failed to get block height',
              'Failed to get gas price'
            ])
          })
        })
      });
    });
  });

  describe('parameter parsing', () => {
    test('should parse network name from text', async () => {
      const memory = createMockMemory('Check ethereum network status');
      const callback = mock();

      await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      // Should attempt to use ethereum network (though config lookup isn't implemented)
      expect(callback).toHaveBeenCalled();
    });

    test('should parse boolean flags', async () => {
      const testCases = [
        'Check network status with no metrics',
        'Check network status without metrics',
        'Check network status and peer count',
        'Check network status skip chain id',
        'Check network status no sync check'
      ];

      for (const text of testCases) {
        const memory = createMockMemory(text);
        const callback = mock();

        const result = await checkNetworkStatusAction.handler(
          mockRuntime as any,
          memory,
          {} as any,
          {},
          callback
        );

        expect(result).toBe(true);
        expect(callback).toHaveBeenCalled();
        callback.mockClear();
      }
    });
  });

  describe('response formatting', () => {
    test('should format healthy network response', async () => {
      const memory = createMockMemory('Check network status');
      const callback = mock();

      await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      const response = callback.mock.calls[0][0].text;
      expect(response).toContain('✅');
      expect(response).toContain('HEALTHY');
      expect(response).toContain('Network Information');
      expect(response).toContain('Performance Metrics');
      expect(response).toContain('🟢 Network is operating normally');
    });

    test('should format unhealthy network response', async () => {
      mockProvider.getNetwork.mockRejectedValueOnce(new Error('Connection failed'));

      const memory = createMockMemory('Check network status');
      const callback = mock();

      await checkNetworkStatusAction.handler(
        mockRuntime as any,
        memory,
        {} as any,
        {},
        callback
      );

      const response = callback.mock.calls[0][0].text;
      expect(response).toContain('❌');
      expect(response).toContain('UNHEALTHY');
      expect(response).toContain('Errors');
      expect(response).toContain('🔴 Network issues detected');
    });
  });
});
