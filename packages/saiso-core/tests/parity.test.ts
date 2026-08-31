import { describe, expect, it } from 'bun:test';
import {
  resolveEvmToolName,
  resolveSvmToolName,
  getSvmCapabilityTools,
  SVM_LEGACY_ALIAS_TO_CANONICAL,
} from '../src/mcp/parity.js';
import { CANONICAL_PARITY_TOOL_NAMES } from '../src/types/parity.js';

describe('resolveEvmToolName', () => {
  it('maps canonical network.status to get-chain-info', () => {
    expect(resolveEvmToolName('network.status')).toBe('get-chain-info');
  });

  it('maps canonical wallet.address to get-balance', () => {
    expect(resolveEvmToolName('wallet.address')).toBe('get-balance');
  });

  it('maps canonical token.transfer to transfer-token', () => {
    expect(resolveEvmToolName('token.transfer')).toBe('transfer-token');
  });

  it('maps canonical contract.read to read-contract', () => {
    expect(resolveEvmToolName('contract.read')).toBe('read-contract');
  });

  it('passes through non-canonical tool names unchanged', () => {
    expect(resolveEvmToolName('custom-tool')).toBe('custom-tool');
  });

  it('maps every canonical name to a non-empty EVM tool', () => {
    for (const name of CANONICAL_PARITY_TOOL_NAMES) {
      const mapped = resolveEvmToolName(name);
      expect(mapped.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveSvmToolName', () => {
  it('maps legacy get-balance to wallet.native_balance', () => {
    expect(resolveSvmToolName('get-balance')).toBe('wallet.native_balance');
  });

  it('maps legacy send-sol to token.transfer', () => {
    expect(resolveSvmToolName('send-sol')).toBe('token.transfer');
  });

  it('maps legacy send-spl-token to token.transfer', () => {
    expect(resolveSvmToolName('send-spl-token')).toBe('token.transfer');
  });

  it('maps legacy read-program-account to contract.read', () => {
    expect(resolveSvmToolName('read-program-account')).toBe('contract.read');
  });

  it('maps legacy simulate-transaction to tx.simulate', () => {
    expect(resolveSvmToolName('simulate-transaction')).toBe('tx.simulate');
  });

  it('passes through unknown tool names unchanged', () => {
    expect(resolveSvmToolName('unknown-tool')).toBe('unknown-tool');
  });
});

describe('getSvmCapabilityTools', () => {
  it('includes all canonical names and legacy aliases', () => {
    const tools = getSvmCapabilityTools();
    for (const name of CANONICAL_PARITY_TOOL_NAMES) {
      expect(tools).toContain(name);
    }
    for (const alias of Object.keys(SVM_LEGACY_ALIAS_TO_CANONICAL)) {
      expect(tools).toContain(alias);
    }
  });

  it('does not contain duplicates', () => {
    const tools = getSvmCapabilityTools();
    expect(new Set(tools).size).toBe(tools.length);
  });
});