import bs58 from 'bs58';
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';

export type ChainFamily = 'svm';

export interface ToolResponse {
  success: boolean;
  network: string;
  chainFamily: ChainFamily;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  txHash?: string;
  receipt?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface ToolContext {
  connection: Connection;
  network: string;
  privateKey?: string;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResponse>;

type GetMintFn = typeof getMint;
type GetAssociatedTokenAddressSyncFn = typeof getAssociatedTokenAddressSync;
type CreateAssociatedTokenAccountInstructionFn = typeof createAssociatedTokenAccountInstruction;
type CreateTransferCheckedInstructionFn = typeof createTransferCheckedInstruction;

interface ToolDependencyBag {
  getMint: GetMintFn;
  getAssociatedTokenAddressSync: GetAssociatedTokenAddressSyncFn;
  createAssociatedTokenAccountInstruction: CreateAssociatedTokenAccountInstructionFn;
  createTransferCheckedInstruction: CreateTransferCheckedInstructionFn;
  deserializeVersionedTransaction: (bytes: Buffer) => VersionedTransaction;
  deserializeLegacyTransaction: (bytes: Buffer) => Transaction;
}

const defaultToolDeps: ToolDependencyBag = {
  getMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  deserializeVersionedTransaction: (bytes) => VersionedTransaction.deserialize(bytes),
  deserializeLegacyTransaction: (bytes) => Transaction.from(bytes),
};

export const toolDeps: ToolDependencyBag = {
  ...defaultToolDeps,
};

export function resetToolDepsForTests(): void {
  Object.assign(toolDeps, defaultToolDeps);
}

function ok(ctx: ToolContext, data: Record<string, unknown>, extras: Partial<ToolResponse> = {}): ToolResponse {
  return {
    success: true,
    chainFamily: 'svm',
    network: ctx.network,
    data,
    ...extras,
  };
}

function fail(ctx: ToolContext, code: string, message: string, extras: Partial<ToolResponse> = {}): ToolResponse {
  return {
    success: false,
    chainFamily: 'svm',
    network: ctx.network,
    error: {
      code,
      message,
    },
    ...extras,
  };
}

function parseDecimalToUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [whole, fractional = ''] = trimmed.split('.');
  if (fractional.length > decimals) {
    throw new Error(`Too many decimal places for amount: ${value}`);
  }
  const normalizedFractional = (fractional + '0'.repeat(decimals)).slice(0, decimals);
  const wholeUnits = BigInt(whole) * (10n ** BigInt(decimals));
  const fractionalUnits = BigInt(normalizedFractional || '0');
  return wholeUnits + fractionalUnits;
}

function parseUnsignedBigInt(input: unknown, fieldName: string): bigint {
  if (typeof input === 'bigint') {
    return input;
  }

  if (typeof input === 'number' && Number.isFinite(input) && input >= 0) {
    return BigInt(Math.floor(input));
  }

  if (typeof input === 'string' && /^\d+$/.test(input.trim())) {
    return BigInt(input.trim());
  }

  throw new Error(`Invalid unsigned integer for '${fieldName}'`);
}

function assertInstructionAmountSafe(amount: bigint, fieldName: string): void {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Amount for '${fieldName}' exceeds JavaScript safe integer range`);
  }
}

function keypairFromSecret(secret: string): Keypair {
  const trimmed = secret.trim();

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  if (trimmed.startsWith('0x')) {
    const raw = Buffer.from(trimmed.slice(2), 'hex');
    if (raw.length === 32) {
      return Keypair.fromSeed(raw);
    }
    return Keypair.fromSecretKey(raw);
  }

  const decoded = bs58.decode(trimmed);
  if (decoded.length === 32) {
    return Keypair.fromSeed(decoded);
  }
  return Keypair.fromSecretKey(decoded);
}

function toPublicKey(value: unknown, fieldName: string): PublicKey {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing '${fieldName}'`);
  }
  return new PublicKey(value.trim());
}

function normalizeToolResult(result: ToolResponse): ToolResponse {
  if (!result.success && !result.error) {
    return {
      ...result,
      error: {
        code: 'tool_error',
        message: 'Unknown tool error',
      },
    };
  }

  return result;
}

async function resolveTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  try {
    await toolDeps.getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
    return TOKEN_PROGRAM_ID;
  } catch {
    await toolDeps.getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    return TOKEN_2022_PROGRAM_ID;
  }
}

async function parseAnyTransaction(base64Tx: string): Promise<Transaction | VersionedTransaction> {
  const bytes = Buffer.from(base64Tx, 'base64');
  try {
    return toolDeps.deserializeVersionedTransaction(bytes);
  } catch {
    return toolDeps.deserializeLegacyTransaction(bytes);
  }
}

export const canonicalToolHandlers: Record<string, ToolHandler> = {
  'network.status': async (_args, ctx) => {
    try {
      const [slot, blockHeight, version, genesisHash] = await Promise.all([
        ctx.connection.getSlot('confirmed'),
        ctx.connection.getBlockHeight('confirmed'),
        ctx.connection.getVersion(),
        ctx.connection.getGenesisHash(),
      ]);

      return ok(ctx, {
        endpoint: ctx.connection.rpcEndpoint,
        slot,
        blockHeight,
        genesisHash,
        version,
      });
    } catch (error) {
      return fail(ctx, 'network_status_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'wallet.address': async (_args, ctx) => {
    try {
      if (!ctx.privateKey) {
        return fail(ctx, 'wallet_not_configured', 'PRIVATE_KEY is not configured');
      }

      const wallet = keypairFromSecret(ctx.privateKey);
      return ok(ctx, {
        address: wallet.publicKey.toBase58(),
      });
    } catch (error) {
      return fail(ctx, 'wallet_address_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'wallet.native_balance': async (args, ctx) => {
    try {
      let address = args.address;
      if (!address && ctx.privateKey) {
        address = keypairFromSecret(ctx.privateKey).publicKey.toBase58();
      }

      const account = toPublicKey(address, 'address');
      const lamports = await ctx.connection.getBalance(account, 'confirmed');

      return ok(ctx, {
        address: account.toBase58(),
        lamports,
        sol: Number(lamports) / LAMPORTS_PER_SOL,
      });
    } catch (error) {
      return fail(ctx, 'native_balance_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'token.balance': async (args, ctx) => {
    try {
      const mint = toPublicKey(args.mint, 'mint');
      let owner = args.owner;
      if (!owner && ctx.privateKey) {
        owner = keypairFromSecret(ctx.privateKey).publicKey.toBase58();
      }
      const ownerKey = toPublicKey(owner, 'owner');

      const tokenProgram = await resolveTokenProgram(ctx.connection, mint);
      const ata = toolDeps.getAssociatedTokenAddressSync(mint, ownerKey, false, tokenProgram);

      try {
        const tokenBalance = await ctx.connection.getTokenAccountBalance(ata, 'confirmed');
        return ok(ctx, {
          owner: ownerKey.toBase58(),
          mint: mint.toBase58(),
          ata: ata.toBase58(),
          amount: tokenBalance.value.amount,
          decimals: tokenBalance.value.decimals,
          uiAmountString: tokenBalance.value.uiAmountString,
          tokenProgram: tokenProgram.toBase58(),
        });
      } catch {
        return ok(ctx, {
          owner: ownerKey.toBase58(),
          mint: mint.toBase58(),
          ata: ata.toBase58(),
          amount: '0',
          decimals: 0,
          uiAmountString: '0',
          tokenProgram: tokenProgram.toBase58(),
        });
      }
    } catch (error) {
      return fail(ctx, 'token_balance_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'token.transfer': async (args, ctx) => {
    try {
      if (!ctx.privateKey) {
        return fail(ctx, 'wallet_not_configured', 'PRIVATE_KEY is required for transfers');
      }

      const wallet = keypairFromSecret(ctx.privateKey);
      const recipient = toPublicKey(args.to, 'to');
      const commitment = 'confirmed';

      const dryRun = args.dryRun === true;

      if (!args.mint) {
        const lamports = args.lamports !== undefined
          ? parseUnsignedBigInt(args.lamports, 'lamports')
          : parseDecimalToUnits(String(args.amount ?? '0'), 9);
        assertInstructionAmountSafe(lamports, 'lamports');

        const latest = await ctx.connection.getLatestBlockhash(commitment);
        const tx = new Transaction().add(SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: recipient,
          lamports,
        }));
        tx.recentBlockhash = latest.blockhash;
        tx.feePayer = wallet.publicKey;

        if (dryRun) {
          const simulation = await ctx.connection.simulateTransaction(tx, [wallet], true);
          return ok(ctx, {
            mode: 'native',
            simulation,
            from: wallet.publicKey.toBase58(),
            to: recipient.toBase58(),
            lamports: lamports.toString(),
          });
        }

        const signature = await ctx.connection.sendTransaction(tx, [wallet], { skipPreflight: false });
        const confirmation = await ctx.connection.confirmTransaction({
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        }, commitment);

        return ok(ctx, {
          mode: 'native',
          signature,
          from: wallet.publicKey.toBase58(),
          to: recipient.toBase58(),
          lamports: lamports.toString(),
          confirmation,
        }, {
          txHash: signature,
          receipt: {
            signature,
            confirmation,
          },
        });
      }

      const mint = toPublicKey(args.mint, 'mint');
      const tokenProgram = await resolveTokenProgram(ctx.connection, mint);
      const mintInfo = await toolDeps.getMint(ctx.connection, mint, commitment, tokenProgram);
      const decimals = Number(args.decimals ?? mintInfo.decimals);
      const amountBaseUnits = args.amountBaseUnits !== undefined
        ? parseUnsignedBigInt(args.amountBaseUnits, 'amountBaseUnits')
        : parseDecimalToUnits(String(args.amount ?? '0'), decimals);
      assertInstructionAmountSafe(amountBaseUnits, 'amountBaseUnits');

      const senderAta = toolDeps.getAssociatedTokenAddressSync(mint, wallet.publicKey, false, tokenProgram);
      const recipientAta = toolDeps.getAssociatedTokenAddressSync(mint, recipient, false, tokenProgram);

      const latest = await ctx.connection.getLatestBlockhash(commitment);
      const tx = new Transaction();

      const recipientAtaInfo = await ctx.connection.getAccountInfo(recipientAta, commitment);
      if (!recipientAtaInfo) {
        tx.add(toolDeps.createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          recipientAta,
          recipient,
          mint,
          tokenProgram
        ));
      }

      tx.add(toolDeps.createTransferCheckedInstruction(
        senderAta,
        mint,
        recipientAta,
        wallet.publicKey,
        amountBaseUnits,
        decimals,
        [],
        tokenProgram,
      ));

      tx.recentBlockhash = latest.blockhash;
      tx.feePayer = wallet.publicKey;

      if (dryRun) {
        const simulation = await ctx.connection.simulateTransaction(tx, [wallet], true);
        return ok(ctx, {
          mode: 'token',
          simulation,
          mint: mint.toBase58(),
          senderAta: senderAta.toBase58(),
          recipientAta: recipientAta.toBase58(),
          amountBaseUnits: amountBaseUnits.toString(),
          decimals,
        });
      }

      const signature = await ctx.connection.sendTransaction(tx, [wallet], { skipPreflight: false });
      const confirmation = await ctx.connection.confirmTransaction({
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }, commitment);

      return ok(ctx, {
        mode: 'token',
        signature,
        mint: mint.toBase58(),
        senderAta: senderAta.toBase58(),
        recipientAta: recipientAta.toBase58(),
        amountBaseUnits: amountBaseUnits.toString(),
        decimals,
        confirmation,
      }, {
        txHash: signature,
        receipt: {
          signature,
          confirmation,
        },
      });
    } catch (error) {
      return fail(ctx, 'token_transfer_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'tx.simulate': async (args, ctx) => {
    try {
      const transactionBase64 = typeof args.transactionBase64 === 'string'
        ? args.transactionBase64
        : (typeof args.tx === 'string' ? args.tx : undefined);

      if (!transactionBase64) {
        return fail(ctx, 'missing_transaction', 'transactionBase64 (or tx) is required');
      }

      const tx = await parseAnyTransaction(transactionBase64);
      const simulation = tx instanceof VersionedTransaction
        ? await ctx.connection.simulateTransaction(tx, { sigVerify: false })
        : await ctx.connection.simulateTransaction(tx);
      return ok(ctx, {
        simulation,
      });
    } catch (error) {
      return fail(ctx, 'tx_simulate_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'tx.estimate_fee': async (args, ctx) => {
    try {
      const transactionBase64 = typeof args.transactionBase64 === 'string'
        ? args.transactionBase64
        : (typeof args.tx === 'string' ? args.tx : undefined);

      if (transactionBase64) {
        const tx = await parseAnyTransaction(transactionBase64);
        const fee = tx instanceof VersionedTransaction
          ? await ctx.connection.getFeeForMessage(tx.message, 'confirmed')
          : await ctx.connection.getFeeForMessage(tx.compileMessage(), 'confirmed');

        return ok(ctx, {
          feeLamports: fee.value ?? 0,
          basedOn: 'transaction-message',
        }, {
          cost: {
            lamports: fee.value ?? 0,
          },
        });
      }

      const latest = await ctx.connection.getLatestBlockhash('confirmed');
      return ok(ctx, {
        feeLamports: 5000,
        basedOn: 'default-transfer-estimate',
        latestBlockhash: latest.blockhash,
      }, {
        cost: {
          lamports: 5000,
        },
      });
    } catch (error) {
      return fail(ctx, 'tx_estimate_fee_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'contract.read': async (args, ctx) => {
    try {
      const address = toPublicKey(args.address, 'address');
      const accountInfo = await ctx.connection.getAccountInfo(address, 'confirmed');
      if (!accountInfo) {
        return fail(ctx, 'account_not_found', `Account not found: ${address.toBase58()}`);
      }

      return ok(ctx, {
        address: address.toBase58(),
        executable: accountInfo.executable,
        owner: accountInfo.owner.toBase58(),
        lamports: accountInfo.lamports,
        rentEpoch: accountInfo.rentEpoch,
        dataBase64: Buffer.from(accountInfo.data).toString('base64'),
      });
    } catch (error) {
      return fail(ctx, 'contract_read_failed', error instanceof Error ? error.message : String(error));
    }
  },

  'contract.write': async (args, ctx) => {
    try {
      const transactionBase64 = typeof args.transactionBase64 === 'string'
        ? args.transactionBase64
        : (typeof args.tx === 'string' ? args.tx : undefined);

      if (!transactionBase64) {
        return fail(ctx, 'missing_transaction', 'transactionBase64 (or tx) is required');
      }

      const signature = await ctx.connection.sendRawTransaction(Buffer.from(transactionBase64, 'base64'), {
        skipPreflight: args.skipPreflight === true,
      });

      const confirmation = await ctx.connection.confirmTransaction(signature, 'confirmed');

      return ok(ctx, {
        signature,
        confirmation,
      }, {
        txHash: signature,
        receipt: {
          signature,
          confirmation,
        },
      });
    } catch (error) {
      return fail(ctx, 'contract_write_failed', error instanceof Error ? error.message : String(error));
    }
  },
};

export const legacyAliasHandlers: Record<string, ToolHandler> = {
  'get-balance': async (args, ctx) => canonicalToolHandlers['wallet.native_balance'](args, ctx),
  'send-sol': async (args, ctx) => canonicalToolHandlers['token.transfer']({
    to: args.to,
    lamports: args.lamports,
    amount: args.amount,
    dryRun: args.dryRun,
  }, ctx),
  'send-spl-token': async (args, ctx) => canonicalToolHandlers['token.transfer']({
    to: args.to,
    mint: args.mint,
    amount: args.amount,
    amountBaseUnits: args.amountBaseUnits,
    decimals: args.decimals,
    dryRun: args.dryRun,
  }, ctx),
  'read-program-account': async (args, ctx) => canonicalToolHandlers['contract.read']({
    address: args.address,
  }, ctx),
  'simulate-transaction': async (args, ctx) => canonicalToolHandlers['tx.simulate']({
    transactionBase64: args.transactionBase64 ?? args.tx,
  }, ctx),
};

export const supportedTools = [
  ...Object.keys(canonicalToolHandlers),
  ...Object.keys(legacyAliasHandlers),
];

export async function executeTool(toolName: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResponse> {
  const handler = canonicalToolHandlers[toolName] ?? legacyAliasHandlers[toolName];
  if (!handler) {
    return fail(ctx, 'unsupported_tool', `Unsupported SVM tool: ${toolName}`);
  }

  try {
    const result = await handler(args, ctx);
    return normalizeToolResult(result);
  } catch (error) {
    return fail(ctx, 'tool_execution_failed', error instanceof Error ? error.message : String(error));
  }
}
