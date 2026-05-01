import { describe, it, expect, beforeEach, mock } from 'bun:test';

const vi = {
  fn: mock,
  mock: mock.module,
  clearAllMocks: () => mock.restore(),
};
import { ethers } from 'ethers';
import { sendTokensAction, SendTokensContent } from './action';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    isAddress: vi.fn(),
    parseEther: vi.fn(),
    parseUnits: vi.fn(),
    formatEther: vi.fn(),
    formatUnits: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Wallet: vi.fn(),
    Contract: vi.fn()
  }
}));

describe('Send Tokens Action', () => {
  const mockRuntime = {
    getSetting: vi.fn()
  };

  const mockProvider = {
    getBalance: vi.fn(),
    getFeeData: vi.fn()
  };

  const mockWallet = {
    address: '0x1234567890123456789012345678901234567890',
    sendTransaction: vi.fn()
  };

  const mockContract = {
    symbol: vi.fn(),
    decimals: vi.fn(),
    balanceOf: vi.fn(),
    transfer: {
      estimateGas: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockRuntime.getSetting.mockImplementation((key: string) => {
      switch (key) {
        case 'PRIVATE_KEY':
          return '0x1234567890123456789012345678901234567890123456789012345678901234';
        case 'RPC_URL':
          return 'https://rpc.sepolia.org';
        default:
          return undefined;
      }
    });

    (ethers.isAddress as any).mockReturnValue(true);
    (ethers.parseEther as any).mockReturnValue(BigInt('1000000000000000000')); // 1 ETH
    (ethers.formatEther as any).mockReturnValue('1.0');
    (ethers.JsonRpcProvider as any).mockReturnValue(mockProvider);
    (ethers.Wallet as any).mockReturnValue(mockWallet);
    (ethers.Contract as any).mockReturnValue(mockContract);

    mockProvider.getBalance.mockResolvedValue(BigInt('2000000000000000000')); // 2 ETH
    mockProvider.getFeeData.mockResolvedValue({
      gasPrice: BigInt('20000000000') // 20 gwei
    });
  });

  describe('validate', () => {
    it('should validate correct input', async () => {
      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '1.0'
        } as SendTokensContent
      };

      const result = await sendTokensAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(true);
    });

    it('should reject missing private key', async () => {
      mockRuntime.getSetting.mockReturnValue(undefined);

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '1.0'
        } as SendTokensContent
      };

      const result = await sendTokensAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(false);
    });

    it('should reject invalid recipient address', async () => {
      (ethers.isAddress as any).mockReturnValue(false);

      const message = {
        content: {
          recipient: 'invalid-address',
          amount: '1.0'
        } as SendTokensContent
      };

      const result = await sendTokensAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(false);
    });

    it('should reject invalid amount', async () => {
      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: 'invalid-amount'
        } as SendTokensContent
      };

      const result = await sendTokensAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(false);
    });
  });

  describe('handler - Native ETH Transfer', () => {
    it('should successfully send native ETH tokens', async () => {
      const mockTx = {
        hash: '0xabcdef1234567890',
        wait: vi.fn().mockResolvedValue({
          gasUsed: BigInt('21000')
        })
      };

      mockWallet.sendTransaction.mockResolvedValue(mockTx);

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '1.0'
        } as SendTokensContent
      };

      const callback = vi.fn();
      const result = await sendTokensAction.handler(
        mockRuntime as any,
        message as any,
        {} as any,
        {} as any,
        callback
      );

      expect(result.success).toBe(true);
      expect(result.data.txHash).toBe('0xabcdef1234567890');
      expect(result.data.symbol).toBe('ETH');
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Successfully sent 1.0 ETH'),
        content: result
      });
    });

    it('should handle insufficient balance error', async () => {
      mockProvider.getBalance.mockResolvedValue(BigInt('500000000000000000')); // 0.5 ETH
      (ethers.formatEther as any).mockReturnValue('0.5');

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '1.0'
        } as SendTokensContent
      };

      const callback = vi.fn();

      await expect(
        sendTokensAction.handler(
          mockRuntime as any,
          message as any,
          {} as any,
          {} as any,
          callback
        )
      ).rejects.toThrow('Insufficient ETH balance');

      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Failed to send tokens'),
        content: { success: false, error: expect.any(String) }
      });
    });
  });

  describe('handler - ERC-20 Token Transfer', () => {
    beforeEach(() => {
      mockContract.symbol.mockResolvedValue('USDC');
      mockContract.decimals.mockResolvedValue(6);
      mockContract.balanceOf.mockResolvedValue(BigInt('1000000000')); // 1000 USDC
      mockContract.transfer.estimateGas.mockResolvedValue(BigInt('65000'));

      (ethers.parseUnits as any).mockReturnValue(BigInt('100000000')); // 100 USDC
      (ethers.formatUnits as any).mockReturnValue('1000');
    });

    it('should successfully send ERC-20 tokens', async () => {
      const mockTx = {
        hash: '0xabcdef1234567890',
        wait: vi.fn().mockResolvedValue({
          gasUsed: BigInt('65000')
        })
      };

      mockContract.transfer = vi.fn().mockResolvedValue(mockTx);

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '100',
          token: '0xA0b86a33E6441b8dB4B2b8b8b8b8b8b8b8b8b8b8'
        } as SendTokensContent
      };

      const callback = vi.fn();
      const result = await sendTokensAction.handler(
        mockRuntime as any,
        message as any,
        {} as any,
        {} as any,
        callback
      );

      expect(result.success).toBe(true);
      expect(result.data.txHash).toBe('0xabcdef1234567890');
      expect(result.data.symbol).toBe('USDC');
      expect(callback).toHaveBeenCalledWith({
        text: expect.stringContaining('Successfully sent 100 USDC'),
        content: result
      });
    });

    it('should handle insufficient token balance', async () => {
      mockContract.balanceOf.mockResolvedValue(BigInt('50000000')); // 50 USDC
      (ethers.formatUnits as any).mockReturnValue('50');

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '100',
          token: '0xA0b86a33E6441b8dB4B2b8b8b8b8b8b8b8b8b8b8'
        } as SendTokensContent
      };

      const callback = vi.fn();

      await expect(
        sendTokensAction.handler(
          mockRuntime as any,
          message as any,
          {} as any,
          {} as any,
          callback
        )
      ).rejects.toThrow('Insufficient USDC balance');
    });
  });

  describe('error handling', () => {
    it('should handle network errors with retry', async () => {
      let attempts = 0;
      mockWallet.sendTransaction.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('network error');
        }
        return Promise.resolve({
          hash: '0xabcdef1234567890',
          wait: vi.fn().mockResolvedValue({ gasUsed: BigInt('21000') })
        });
      });

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '1.0'
        } as SendTokensContent
      };

      const result = await sendTokensAction.handler(
        mockRuntime as any,
        message as any,
        {} as any,
        {} as any,
        vi.fn()
      );

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should not retry on insufficient funds error', async () => {
      mockWallet.sendTransaction.mockRejectedValue(new Error('insufficient funds'));

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '1.0'
        } as SendTokensContent
      };

      await expect(
        sendTokensAction.handler(
          mockRuntime as any,
          message as any,
          {} as any,
          {} as any,
          vi.fn()
        )
      ).rejects.toThrow('insufficient funds');
    });
  });

  describe('gas optimization', () => {
    it('should use custom gas price when provided', async () => {
      const mockTx = {
        hash: '0xabcdef1234567890',
        wait: vi.fn().mockResolvedValue({ gasUsed: BigInt('21000') })
      };

      mockWallet.sendTransaction.mockResolvedValue(mockTx);
      (ethers.parseUnits as any).mockReturnValue(BigInt('25000000000')); // 25 gwei

      const message = {
        content: {
          recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          amount: '1.0',
          gasPrice: '25'
        } as SendTokensContent
      };

      await sendTokensAction.handler(
        mockRuntime as any,
        message as any,
        {} as any,
        {} as any,
        vi.fn()
      );

      expect(mockWallet.sendTransaction).toHaveBeenCalledWith({
        to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
        value: BigInt('1000000000000000000'),
        gasLimit: BigInt('21000'),
        gasPrice: BigInt('25000000000')
      });
    });
  });
});
