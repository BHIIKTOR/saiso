import { describe, it, expect, beforeEach, mock } from 'bun:test';

const vi = {
  fn: mock,
  mock: mock.module,
  clearAllMocks: () => mock.restore(),
};
import { ethers } from 'ethers';
import { interactContractAction, InteractContractContent } from './action';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    isAddress: vi.fn(),
    parseEther: vi.fn(),
    parseUnits: vi.fn(),
    JsonRpcProvider: vi.fn(),
    Wallet: vi.fn(),
    Contract: vi.fn()
  }
}));

describe('Interact Contract Action', () => {
  const mockRuntime = {
    getSetting: vi.fn()
  };

  const mockProvider = {
    getFeeData: vi.fn()
  };

  const mockWallet = {
    address: '0x1234567890123456789012345678901234567890'
  };

  const mockContract = {
    totalSupply: vi.fn(),
    approve: vi.fn(),
    connect: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();

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
    (ethers.parseEther as any).mockReturnValue(BigInt('1000000000000000000'));
    (ethers.parseUnits as any).mockReturnValue(BigInt('20000000000'));
    (ethers.JsonRpcProvider as any).mockReturnValue(mockProvider);
    (ethers.Wallet as any).mockReturnValue(mockWallet);
    (ethers.Contract as any).mockReturnValue(mockContract);

    mockProvider.getFeeData.mockResolvedValue({
      gasPrice: BigInt('20000000000')
    });
  });

  describe('validate', () => {
    it('should validate read-only contract call', async () => {
      const message = {
        content: {
          contractAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          functionName: 'totalSupply',
          isReadOnly: true
        } as InteractContractContent
      };

      const result = await interactContractAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(true);
    });

    it('should validate write contract call with private key', async () => {
      const message = {
        content: {
          contractAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          functionName: 'approve',
          parameters: ['0x123...abc', '1000000'],
          isReadOnly: false
        } as InteractContractContent
      };

      const result = await interactContractAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(true);
    });

    it('should reject invalid contract address', async () => {
      (ethers.isAddress as any).mockReturnValue(false);

      const message = {
        content: {
          contractAddress: 'invalid-address',
          functionName: 'totalSupply',
          isReadOnly: true
        } as InteractContractContent
      };

      const result = await interactContractAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(false);
    });
  });

  describe('handler - Read-only calls', () => {
    it('should successfully execute read-only contract call', async () => {
      mockContract.totalSupply.mockResolvedValue(BigInt('1000000000000000000000000'));

      const message = {
        content: {
          contractAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b5',
          functionName: 'totalSupply',
          isReadOnly: true
        } as InteractContractContent
      };

      const callback = vi.fn();
      const result = await interactContractAction.handler(
        mockRuntime as any,
        message as any,
        {} as any,
        {} as any,
        callback
      );

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('read');
      expect(result.data.result).toBe('1000000000000000000000000');
    });
  });
});
