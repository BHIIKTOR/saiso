import bs58 from 'bs58';
import { afterEach, describe, expect, it } from 'bun:test';
import { Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  canonicalToolHandlers,
  executeTool,
  resetToolDepsForTests,
  toolDeps,
  type ToolContext,
} from '../src/tools.js';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    connection: {} as ToolContext['connection'],
    network: 'solana-devnet',
    ...overrides,
  };
}

afterEach(() => {
  resetToolDepsForTests();
});

describe('saiso svm mcp tool coverage', () => {
  it('parses wallet keys from array, hex seed, bs58 seed, and bs58 secret key formats', async () => {
    const arrayWallet = Keypair.generate();
    const arrayKey = JSON.stringify(Array.from(arrayWallet.secretKey));
    const arrayResult = await executeTool('wallet.address', {}, makeContext({ privateKey: arrayKey }));
    expect(arrayResult.success).toBe(true);
    expect(arrayResult.data?.address).toBe(arrayWallet.publicKey.toBase58());

    const hexSeed = Buffer.alloc(32, 7);
    const hexWallet = Keypair.fromSeed(hexSeed);
    const hexResult = await executeTool('wallet.address', {}, makeContext({ privateKey: `0x${hexSeed.toString('hex')}` }));
    expect(hexResult.success).toBe(true);
    expect(hexResult.data?.address).toBe(hexWallet.publicKey.toBase58());

    const bs58Seed = bs58.encode(hexSeed);
    const bs58SeedResult = await executeTool('wallet.address', {}, makeContext({ privateKey: bs58Seed }));
    expect(bs58SeedResult.success).toBe(true);
    expect(bs58SeedResult.data?.address).toBe(hexWallet.publicKey.toBase58());

    const bs58Secret = bs58.encode(arrayWallet.secretKey);
    const bs58SecretResult = await executeTool('wallet.address', {}, makeContext({ privateKey: bs58Secret }));
    expect(bs58SecretResult.success).toBe(true);
    expect(bs58SecretResult.data?.address).toBe(arrayWallet.publicKey.toBase58());
  });

  it('returns parse errors for invalid numeric amount input', async () => {
    const wallet = Keypair.generate();
    const recipient = Keypair.generate().publicKey.toBase58();
    const ctx = makeContext({ privateKey: bs58.encode(wallet.secretKey) });

    const invalidLamports = await executeTool('token.transfer', {
      to: recipient,
      lamports: 'not-a-number',
    }, ctx);

    expect(invalidLamports.success).toBe(false);
    expect(invalidLamports.error?.code).toBe('token_transfer_failed');
    expect(invalidLamports.error?.message).toContain("Invalid unsigned integer for 'lamports'");

    const invalidDecimal = await executeTool('token.transfer', {
      to: recipient,
      amount: '1..23',
    }, ctx);

    expect(invalidDecimal.success).toBe(false);
    expect(invalidDecimal.error?.code).toBe('token_transfer_failed');
    expect(invalidDecimal.error?.message).toContain('Invalid decimal amount');

    const overPreciseDecimal = await executeTool('token.transfer', {
      to: recipient,
      amount: '0.0000000001',
    }, ctx);

    expect(overPreciseDecimal.success).toBe(false);
    expect(overPreciseDecimal.error?.code).toBe('token_transfer_failed');
    expect(overPreciseDecimal.error?.message).toContain('Too many decimal places');
  });

  it('rejects SVM transfer amounts that exceed safe instruction encoding range', async () => {
    const wallet = Keypair.generate();
    const recipient = Keypair.generate().publicKey.toBase58();
    const ctx = makeContext({ privateKey: bs58.encode(wallet.secretKey) });

    const result = await executeTool('token.transfer', {
      to: recipient,
      lamports: (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(),
    }, ctx);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('token_transfer_failed');
    expect(result.error?.message).toContain('safe integer range');
  });

  it('falls back from SPL token program to token-2022 for token balance checks', async () => {
    const calls: string[] = [];

    toolDeps.getMint = (async (_connection, _mint, _commitment, programId) => {
      calls.push(programId.toBase58());
      if (programId.equals(TOKEN_PROGRAM_ID)) {
        throw new Error('legacy token program miss');
      }
      return { decimals: 6 } as never;
    }) as typeof toolDeps.getMint;

    const ctx = makeContext({
      connection: {
        getTokenAccountBalance: async () => {
          throw new Error('token account not found');
        },
      } as ToolContext['connection'],
    });

    const owner = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();

    const result = await executeTool('token.balance', { owner, mint }, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.tokenProgram).toBe(TOKEN_2022_PROGRAM_ID.toBase58());
    expect(result.data?.amount).toBe('0');
    expect(calls).toEqual([TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);
  });

  it('runs native transfer simulation and broadcast branches deterministically', async () => {
    const wallet = Keypair.generate();
    const recipient = Keypair.generate().publicKey.toBase58();
    const blockhash = Keypair.generate().publicKey.toBase58();

    let simulated = false;
    let sent = false;
    let confirmed = false;

    const ctx = makeContext({
      privateKey: bs58.encode(wallet.secretKey),
      connection: {
        getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 42 }),
        simulateTransaction: async () => {
          simulated = true;
          return { value: { err: null } };
        },
        sendTransaction: async () => {
          sent = true;
          return 'native-sig-1';
        },
        confirmTransaction: async () => {
          confirmed = true;
          return { value: { err: null } };
        },
      } as ToolContext['connection'],
    });

    const simulationResult = await executeTool('token.transfer', {
      to: recipient,
      lamports: '1000',
      dryRun: true,
    }, ctx);

    expect(simulationResult.success).toBe(true);
    expect(simulationResult.data?.mode).toBe('native');
    expect(simulated).toBe(true);

    const broadcastResult = await executeTool('token.transfer', {
      to: recipient,
      lamports: '1000',
    }, ctx);

    expect(broadcastResult.success).toBe(true);
    expect(broadcastResult.txHash).toBe('native-sig-1');
    expect(sent).toBe(true);
    expect(confirmed).toBe(true);
  });

  it('covers token transfer ATA creation and existing ATA branches', async () => {
    const wallet = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    toolDeps.getMint = (async () => ({ decimals: 6 } as never)) as typeof toolDeps.getMint;

    const blockhash = Keypair.generate().publicKey.toBase58();
    const txInstructionLengths: number[] = [];

    const absentAtaCtx = makeContext({
      privateKey: bs58.encode(wallet.secretKey),
      connection: {
        getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 99 }),
        getAccountInfo: async () => null,
        simulateTransaction: async (tx: { instructions: unknown[] }) => {
          txInstructionLengths.push(tx.instructions.length);
          return { value: { err: null } };
        },
      } as ToolContext['connection'],
    });

    const presentAtaCtx = makeContext({
      privateKey: bs58.encode(wallet.secretKey),
      connection: {
        getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 100 }),
        getAccountInfo: async () => ({ executable: false }),
        simulateTransaction: async (tx: { instructions: unknown[] }) => {
          txInstructionLengths.push(tx.instructions.length);
          return { value: { err: null } };
        },
      } as ToolContext['connection'],
    });

    const args = {
      to: recipient.toBase58(),
      mint: mint.toBase58(),
      amount: '1',
      dryRun: true,
    };

    const absentAtaResult = await executeTool('token.transfer', args, absentAtaCtx);
    expect(absentAtaResult.success).toBe(true);
    expect(absentAtaResult.data?.mode).toBe('token');

    const presentAtaResult = await executeTool('token.transfer', args, presentAtaCtx);
    expect(presentAtaResult.success).toBe(true);
    expect(presentAtaResult.data?.mode).toBe('token');

    expect(txInstructionLengths).toEqual([2, 1]);
  });

  it('normalizes handler failures that omit an error payload', async () => {
    const original = canonicalToolHandlers['network.status'];
    canonicalToolHandlers['network.status'] = async () => ({
      success: false,
      chainFamily: 'svm',
      network: 'solana-devnet',
    }) as never;

    try {
      const result = await executeTool('network.status', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('tool_error');
      expect(result.error?.message).toBe('Unknown tool error');
    } finally {
      canonicalToolHandlers['network.status'] = original;
    }
  });

  it('returns missing-transaction error for tx.simulate without payload', async () => {
    const result = await executeTool('tx.simulate', {}, makeContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('missing_transaction');
  });

  it('returns wallet_not_configured when transfer is requested without private key', async () => {
    const recipient = Keypair.generate().publicKey.toBase58();
    const result = await executeTool('token.transfer', { to: recipient, lamports: '1' }, makeContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('wallet_not_configured');
  });

  it('estimates default fee when transaction payload is omitted', async () => {
    const blockhash = Keypair.generate().publicKey.toBase58();
    const result = await executeTool('tx.estimate_fee', {}, makeContext({
      connection: {
        getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 1 }),
      } as ToolContext['connection'],
    }));

    expect(result.success).toBe(true);
    expect(result.data?.feeLamports).toBe(5000);
    expect(result.cost?.lamports).toBe(5000);
  });

  it('returns tool_execution_failed when a handler throws unexpectedly', async () => {
    const original = canonicalToolHandlers['wallet.address'];
    canonicalToolHandlers['wallet.address'] = async () => {
      throw new Error('boom');
    };

    try {
      const result = await executeTool('wallet.address', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('tool_execution_failed');
      expect(result.error?.message).toContain('boom');
    } finally {
      canonicalToolHandlers['wallet.address'] = original;
    }
  });

  it('accepts legacy tx aliases via tx and transactionBase64', async () => {
    const payload = Buffer.from('not-a-valid-tx').toString('base64');
    toolDeps.deserializeVersionedTransaction = () => {
      throw new Error('not versioned');
    };
    toolDeps.deserializeLegacyTransaction = () => {
      throw new Error('not legacy');
    };

    const txResult = await executeTool('simulate-transaction', { tx: payload }, makeContext());
    expect(txResult.success).toBe(false);
    expect(txResult.error?.code).toBe('tx_simulate_failed');

    const base64Result = await executeTool('simulate-transaction', { transactionBase64: payload }, makeContext());
    expect(base64Result.success).toBe(false);
    expect(base64Result.error?.code).toBe('tx_simulate_failed');
  });

  it('returns contract_read account_not_found with deterministic error code', async () => {
    const target = new PublicKey(Keypair.generate().publicKey).toBase58();

    const result = await executeTool('contract.read', { address: target }, makeContext({
      connection: {
        getAccountInfo: async () => null,
      } as ToolContext['connection'],
    }));

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('account_not_found');
  });
});
